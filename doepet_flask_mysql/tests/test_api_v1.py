import os
import tempfile
import base64
from datetime import date
from http.cookies import SimpleCookie
import jwt as pyjwt
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from doepet_flask_mysql.app import create_app
from doepet_flask_mysql.config import Config, normalize_database_uri, detect_engine_name
from doepet_flask_mysql.messaging import enqueue_blood_need_alert, process_pending_outbox
from doepet_flask_mysql.migrations_runner import run_alembic_upgrade
from doepet_flask_mysql.models import (
    AlertOutboxMessage,
    AuditLog,
    BloodBag,
    NeedNotification,
    PushSubscription,
    RefreshToken,
    db,
)
from doepet_flask_mysql.observability import clear_recorded_traces
from doepet_flask_mysql.security.jwt_service import generate_access_jwt
from doepet_flask_mysql.security.key_vault import secret_vault
from doepet_flask_mysql.seed import seed_database


@pytest.fixture()
def client():
    test_pg_url = normalize_database_uri(os.getenv('TEST_DATABASE_URL', ''))
    db_path = None

    if test_pg_url:
        class TestConfig(Config):
            TESTING = True
            SQLALCHEMY_DATABASE_URI = test_pg_url
            SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
            SECRET_KEY = 'test-secret-key'
            PUSH_TRANSPORT_MODE = 'dry_run'
            ASYNC_WORKER_ENABLED = False
    else:
        fd, db_path = tempfile.mkstemp(prefix='doepet_test_', suffix='.db')
        os.close(fd)

        class TestConfig(Config):
            TESTING = True
            SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"
            SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"check_same_thread": False}}
            SECRET_KEY = 'test-secret-key'
            PUSH_TRANSPORT_MODE = 'dry_run'
            ASYNC_WORKER_ENABLED = False

    app = create_app(TestConfig, seed_on_startup=False)
    with app.app_context():
        if test_pg_url:
            db.session.execute(text('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'))
            db.session.commit()
            run_alembic_upgrade(db.engine, target_revision='head', database_url=test_pg_url)
        else:
            db.create_all()
        seed_database(force=True)

    secret_vault.clear_cache()
    with app.test_client() as test_client:
        yield test_client
    secret_vault.clear_cache()

    with app.app_context():
        db.session.remove()
        if test_pg_url:
            db.session.execute(text('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'))
            db.session.commit()
        else:
            db.drop_all()
    if db_path and os.path.exists(db_path):
        os.remove(db_path)


def _auth_header(token: str) -> dict:
    return {'Authorization': f'Bearer {token}', 'X-Correlation-ID': 'test-corr-123'}


def test_uri_normalization_and_engine_detection():
    assert normalize_database_uri('postgres://u:p@db:5432/doepet') == 'postgresql+psycopg2://u:p@db:5432/doepet'
    assert normalize_database_uri('postgresql://u:p@db:5432/doepet') == 'postgresql+psycopg2://u:p@db:5432/doepet'
    assert detect_engine_name('postgresql+psycopg2://u:p@db:5432/doepet') == 'postgresql'
    assert detect_engine_name('sqlite:///local.db') == 'sqlite'


def test_health_and_correlation_id(client):
    res = client.get('/api/v1/health', headers={'X-Correlation-ID': 'corr-health-001'})
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'ok'
    assert body['database'] == 'connected'
    assert body['engine'] in ('sqlite', 'postgresql')
    assert res.headers.get('X-Correlation-ID') == 'corr-health-001'


def _login_res(client, email: str, password: str = 'doepet123'):
    return client.post('/api/v1/auth/login', json={'identifier': email, 'password': password})


def _clinic_token(client) -> str:
    res = _login_res(client, 'urgencias@hemovetcentral.com.br', 'doepet123')
    assert res.status_code == 200
    return res.get_json()['token']


def _tutor_token(client) -> str:
    res = _login_res(client, 'ricardo.santos@doepet.com.br', 'doepet123')
    assert res.status_code == 200
    return res.get_json()['token']


def test_auth_login_and_rbac_isolation(client):
    demo_disabled = client.post('/api/v1/auth/demo-login', json={'role': 'TUTOR'})
    assert demo_disabled.status_code == 404

    unregistered = client.post('/api/v1/auth/login', json={'identifier': 'naoexiste@doepet.com.br', 'password': 'doepet123'})
    assert unregistered.status_code == 401

    bad = client.post('/api/v1/auth/login', json={'identifier': 'ricardo.santos@doepet.com.br', 'password': 'wrong'})
    assert bad.status_code == 401

    ok = client.post('/api/v1/auth/login', json={'identifier': 'ricardo.santos@doepet.com.br', 'password': 'doepet123'})
    assert ok.status_code == 200
    data = ok.get_json()
    assert data['success'] is True
    assert data['user']['role'] == 'TUTOR'
    assert len(data['pets']) == 3  # Apenas Zeus, Luna, Oliver (não Thor da Ana Clara)
    token = data['token']

    # Tutor não pode movimentar estoque da clínica
    forbidden = client.post(
        '/api/v1/inventory/movements',
        headers=_auth_header(token),
        json={'inventoryId': 1, 'tipo': 'SAIDA_TRANSFUSAO', 'delta': 450, 'motivo': 'Teste'},
    )
    assert forbidden.status_code == 403


def test_rn04_negative_stock_block_and_40_day_bag_creation(client):
    token = _clinic_token(client)

    # Inv 1 tem 450mL -> tentar retirar 900mL deve ser bloqueado (RN04)
    neg_res = client.post(
        '/api/v1/inventory/movements',
        headers=_auth_header(token),
        json={'inventoryId': 1, 'tipo': 'SAIDA_TRANSFUSAO', 'delta': 900, 'motivo': 'Urgência'},
    )
    assert neg_res.status_code == 400
    assert 'insuficiente' in neg_res.get_json()['error'].lower()

    # Entrada de 450mL com dataColeta 2026-10-01 deve gerar bolsa com validade 2026-11-10 (40 dias)
    add_res = client.post(
        '/api/v1/inventory/movements',
        headers=_auth_header(token),
        json={
            'inventoryId': 1,
            'tipo': 'ENTRADA_DOACAO',
            'delta': 450,
            'motivo': 'Doação externa',
            'dataColeta': '2026-10-01',
        },
    )
    assert add_res.status_code == 200
    payload = add_res.get_json()
    inv1 = next(i for i in payload['inventory'] if i['id'] == 1)
    assert inv1['volumeMl'] == 900
    assert any(b['dataColeta'] == '2026-10-01' and b['dataValidade'] == '2026-11-10' for b in payload['bloodBags'])


def test_rn15_hematocrit_check_confirm_donation_and_rn12_voucher(client):
    clinic_token = _clinic_token(client)

    # Hematócrito 35.0 (< 37.0) deve bloquear doação (RN15)
    fail_res = client.post(
        '/api/v1/appointments/1/confirm-donation',
        headers=_auth_header(clinic_token),
        json={
            'veterinarioCrmv': 'CRMV-SP 18452',
            'volumeColetado': 450,
            'hematocrito': 35.0,
            'pesoAferido': 32.5,
            'tipoConfirmado': 'DEA 1.1 Negativo',
        },
    )
    assert fail_res.status_code == 400
    assert 'hematócrito' in fail_res.get_json()['error'].lower()

    # Hematócrito 42.0 aprova doação e gera voucher
    ok_res = client.post(
        '/api/v1/appointments/1/confirm-donation',
        headers=_auth_header(clinic_token),
        json={
            'veterinarioCrmv': 'CRMV-SP 18452',
            'volumeColetado': 450,
            'hematocrito': 42.0,
            'pesoAferido': 32.5,
            'tipoConfirmado': 'DEA 1.1 Negativo',
        },
    )
    assert ok_res.status_code == 200
    voucher_code = ok_res.get_json()['voucherCode']
    assert voucher_code.startswith('DOEPET-')

    # Resgatar voucher gerado uma vez funciona
    redeem1 = client.post('/api/v1/vouchers/redeem', headers=_auth_header(clinic_token), json={'codigo': voucher_code})
    assert redeem1.status_code == 200
    assert redeem1.get_json()['success'] is True

    # Resgatar novamente bloqueia (RN12)
    redeem2 = client.post('/api/v1/vouchers/redeem', headers=_auth_header(clinic_token), json={'codigo': voucher_code})
    assert redeem2.status_code == 409
    assert redeem2.get_json()['success'] is False


def test_last_active_admin_protection_and_lgpd_export(client):
    clinic_token = _clinic_token(client)

    # Admin ID 1 é a única admin ativa da Clínica 1 -> tentar remover ou desativar deve falhar
    del_admin = client.delete('/api/v1/employees/1', headers=_auth_header(clinic_token))
    assert del_admin.status_code == 400
    deact_admin = client.patch('/api/v1/employees/1', headers=_auth_header(clinic_token), json={'isActive': False})
    assert deact_admin.status_code == 400

    # Exportação LGPD do Tutor
    tutor_token = _tutor_token(client)
    export_res = client.get('/api/v1/tutor/export-lgpd', headers=_auth_header(tutor_token))
    assert export_res.status_code == 200
    assert export_res.mimetype == 'application/json'
    export_json = export_res.get_json()
    assert export_json['titular']['cpf'] == '321.654.987-00'
    assert len(export_json['animaisCadastrados']) == 3


def test_postgresql_physical_check_constraints(client):
    with client.application.app_context():
        if db.engine.dialect.name != 'postgresql':
            pytest.skip('Physical PostgreSQL CHECK constraint validation requires TEST_DATABASE_URL')

        # Regra CPDA-1: bolsa com validade > 40 dias deve ser rejeitada no nível do SGBD PostgreSQL
        invalid_bag = BloodBag(
            inventory_id=1,
            lote_codigo='BOLSA-INVALID-41D',
            volume_ml=450,
            data_coleta=date(2026, 10, 1),
            data_validade=date(2026, 11, 11),  # 41 dias!
            status='DISPONIVEL',
        )
        db.session.add(invalid_bag)
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def _extract_cookies_from_response(res) -> dict[str, dict]:
    parsed: dict[str, dict] = {}
    for raw_header in res.headers.getlist('Set-Cookie'):
        jar = SimpleCookie()
        jar.load(raw_header)
        for name, morsel in jar.items():
            parsed[name] = {
                'value': morsel.value,
                'httponly': bool(morsel['httponly']),
                'samesite': str(morsel['samesite'] or ''),
                'path': str(morsel['path'] or '/'),
                'raw': raw_header,
            }
    return parsed


def test_dt04_httponly_cookies_and_double_submit_csrf(client):
    login_res = _login_res(client, 'urgencias@hemovetcentral.com.br', 'doepet123')
    assert login_res.status_code == 200
    cookies = _extract_cookies_from_response(login_res)

    assert 'doepet_access_token' in cookies
    assert cookies['doepet_access_token']['httponly'] is True
    assert cookies['doepet_access_token']['samesite'].lower() == 'strict'
    assert cookies['doepet_access_token']['path'] == '/'

    assert 'doepet_refresh_token' in cookies
    assert cookies['doepet_refresh_token']['httponly'] is True
    assert cookies['doepet_refresh_token']['samesite'].lower() == 'strict'
    assert cookies['doepet_refresh_token']['path'] == '/api/v1/auth'

    assert 'doepet_csrf_token' in cookies
    assert cookies['doepet_csrf_token']['httponly'] is False
    assert cookies['doepet_csrf_token']['samesite'].lower() == 'strict'

    csrf_token = cookies['doepet_csrf_token']['value']

    # GET autenticado apenas via cookie HttpOnly (sem Authorization: Bearer)
    state_res = client.get('/api/v1/state')
    assert state_res.status_code == 200
    assert state_res.get_json()['user']['role'] == 'INSTITUTION_ADMIN'

    # Mutação via cookie SEM X-CSRF-Token deve ser bloqueada com 403
    no_csrf = client.post(
        '/api/v1/needs',
        json={
            'especie': 'CANINA',
            'tipoSanguineo': 'DEA 1.1 Positivo',
            'volumeSolicitadoMl': 450,
            'urgencia': 'ALTA',
            'descricao': 'Teste sem CSRF',
        },
    )
    assert no_csrf.status_code == 403

    # Mutação via cookie COM X-CSRF-Token deve suceder
    with_csrf = client.post(
        '/api/v1/needs',
        headers={'X-CSRF-Token': csrf_token},
        json={
            'especie': 'CANINA',
            'tipoSanguineo': 'DEA 1.1 Positivo',
            'volumeSolicitadoMl': 450,
            'urgencia': 'ALTA',
            'descricao': 'Teste com CSRF válido',
        },
    )
    assert with_csrf.status_code == 201


def test_dt04_refresh_rotation_and_reuse_attack_detection(client):
    login_res = _login_res(client, 'ricardo.santos@doepet.com.br', 'doepet123')
    assert login_res.status_code == 200
    cookies1 = _extract_cookies_from_response(login_res)
    old_refresh = cookies1['doepet_refresh_token']['value']
    csrf1 = cookies1['doepet_csrf_token']['value']

    old_claims = pyjwt.decode(old_refresh, options={'verify_signature': False})
    old_jti = old_claims['jti']
    family_id = old_claims['family_id']

    # Rotação legítima via cookie HttpOnly + X-CSRF-Token
    refresh_res = client.post('/api/v1/auth/refresh', headers={'X-CSRF-Token': csrf1})
    assert refresh_res.status_code == 200
    cookies2 = _extract_cookies_from_response(refresh_res)
    new_refresh = cookies2['doepet_refresh_token']['value']
    csrf2 = cookies2['doepet_csrf_token']['value']
    assert new_refresh != old_refresh

    new_jti = pyjwt.decode(new_refresh, options={'verify_signature': False})['jti']
    with client.application.app_context():
        old_row = RefreshToken.query.filter_by(jti=old_jti).first()
        new_row = RefreshToken.query.filter_by(jti=new_jti).first()
        assert old_row is not None and old_row.is_revoked is True
        assert old_row.revoked_reason == 'ROTATED'
        assert old_row.replaced_by_jti == new_jti
        assert new_row is not None and new_row.is_revoked is False

    # Simula atacante tentando reutilizar o Refresh Token antigo já rotacionado
    with client.application.test_client(use_cookies=False) as attacker:
        replay_res = attacker.post(
            '/api/v1/auth/refresh',
            headers={
                'Cookie': f'doepet_refresh_token={old_refresh}; doepet_csrf_token={csrf1}',
                'X-CSRF-Token': csrf1,
            },
        )
        assert replay_res.status_code == 401
        assert replay_res.get_json()['reason'] == 'reuse_detected'

    # Toda a família do token deve ter sido revogada e auditada
    with client.application.app_context():
        family_rows = RefreshToken.query.filter_by(family_id=family_id).all()
        assert len(family_rows) >= 2
        assert all(row.is_revoked is True for row in family_rows)
        new_row_after = RefreshToken.query.filter_by(jti=new_jti).first()
        assert new_row_after.revoked_reason == 'TOKEN_REUSE_DETECTED'
        audit = AuditLog.query.filter_by(action='REFRESH_TOKEN_REUSE_BLOCKED').first()
        assert audit is not None

    # O novo refresh token legítimo da mesma família comprometida também não funciona mais
    blocked_legit = client.post('/api/v1/auth/refresh', headers={'X-CSRF-Token': csrf2})
    assert blocked_legit.status_code == 401


def test_dt04_sessions_logout_all_and_key_rotation(client):
    login_res = _login_res(client, 'ricardo.santos@doepet.com.br', 'doepet123')
    assert login_res.status_code == 200
    cookies = _extract_cookies_from_response(login_res)
    csrf_token = cookies['doepet_csrf_token']['value']

    # Listar sessões ativas
    sessions_res = client.get('/api/v1/auth/sessions')
    assert sessions_res.status_code == 200
    assert len(sessions_res.get_json()['sessions']) >= 1

    # Rotação de chave (JWT_PREVIOUS_SECRET_KEY): token emitido antes da rotação continua válido na janela de transição
    with client.application.app_context():
        from doepet_flask_mysql.models import User
        tutor_user = User.query.filter_by(email='ricardo.santos@doepet.com.br').first()
        old_secret = client.application.config['JWT_SECRET_KEY']
        legacy_access = generate_access_jwt(tutor_user)

    try:
        client.application.config['JWT_PREVIOUS_SECRET_KEY'] = old_secret
        client.application.config['JWT_SECRET_KEY'] = 'rotated-secret-key-2026-v2'
        secret_vault.clear_cache()
        rotated_state = client.get('/api/v1/state', headers=_auth_header(legacy_access))
        assert rotated_state.status_code == 200
    finally:
        client.application.config['JWT_SECRET_KEY'] = old_secret
        client.application.config['JWT_PREVIOUS_SECRET_KEY'] = ''
        secret_vault.clear_cache()

    # Revogar todas as sessões e limpar cookies
    logout_all = client.post('/api/v1/auth/logout-all', headers={'X-CSRF-Token': csrf_token})
    assert logout_all.status_code == 200
    assert logout_all.get_json()['revokedCount'] >= 1

    # Após logout-all, cookies foram limpos e GET /state retorna 401
    after_logout = client.get('/api/v1/state')
    assert after_logout.status_code == 401


def test_dt03_async_outbox_idempotency_and_dead_letter(client):
    clinic_token = _clinic_token(client)

    create_res = client.post(
        '/api/v1/needs',
        headers={**_auth_header(clinic_token), 'X-Correlation-ID': 'corr-outbox-001'},
        json={
            'especie': 'CANINA',
            'tipoSanguineo': 'DEA 1.1 Positivo',
            'volumeSolicitadoMl': 450,
            'urgencia': 'CRITICA',
            'descricao': 'Paciente canino politraumatizado aguardando bolsa urgente.',
        },
    )
    assert create_res.status_code == 201
    outbox_dto = create_res.get_json()['outboxMessage']
    assert outbox_dto['status'] == 'PENDING'
    assert outbox_dto['correlationId'] == 'corr-outbox-001'
    need_id = outbox_dto['needId']

    # Idempotência RN19: novo enfileiramento para mesmo need_id retorna o mesmo registro
    with client.application.app_context():
        dup = enqueue_blood_need_alert(
            need_id=need_id,
            institution_id=1,
            institution_name='HemoVet',
            especie='CANINA',
            tipo_sanguineo='DEA 1.1 Positivo',
            urgencia='CRITICA',
            notified_tutor_ids=[1],
            correlation_id='corr-outbox-001',
            commit=True,
        )
        assert dup.message_id == outbox_dto['messageId']
        assert AlertOutboxMessage.query.filter_by(need_id=need_id).count() == 1
        queued_notifs = NeedNotification.query.filter_by(need_id=need_id).all()
        assert len(queued_notifs) >= 1
        assert all(n.status == 'QUEUED' for n in queued_notifs)

    # Worker processa fila pendente -> mensagem vira DISPATCHED e notificações saem de QUEUED
    proc_res = client.post('/api/v1/messaging/process', headers=_auth_header(clinic_token))
    assert proc_res.status_code == 200
    assert proc_res.get_json()['dispatched'] >= 1

    outbox_list = client.get('/api/v1/messaging/outbox?correlationId=corr-outbox-001', headers=_auth_header(clinic_token))
    assert outbox_list.status_code == 200
    msgs = outbox_list.get_json()['messages']
    assert len(msgs) == 1
    assert msgs[0]['status'] == 'DISPATCHED'

    # Simula falha recorrente e transição automática para Dead-Letter Queue + Requeue
    with client.application.app_context():
        dlq_msg = AlertOutboxMessage(
            message_id='msg-dlq-test-01',
            idempotency_key='dlq-test-01',
            topic='push-test',
            payload={'userId': 1},
            status='PENDING',
            attempts=0,
            max_attempts=2,
            correlation_id='corr-dlq-test',
        )
        db.session.add(dlq_msg)
        db.session.commit()

        def _always_fail(_m):
            raise RuntimeError('Simulated transient Service Bus outage')

        process_pending_outbox(handler_override=_always_fail)
        refreshed = AlertOutboxMessage.query.filter_by(message_id='msg-dlq-test-01').first()
        assert refreshed.status == 'PENDING'
        assert refreshed.attempts == 1

        # Força retry imediato para segunda falha atingir max_attempts -> DEAD_LETTERED
        refreshed.next_retry_at = None
        db.session.commit()
        process_pending_outbox(handler_override=_always_fail)
        refreshed2 = AlertOutboxMessage.query.filter_by(message_id='msg-dlq-test-01').first()
        assert refreshed2.status == 'DEAD_LETTERED'
        assert 'Simulated transient Service Bus outage' in (refreshed2.last_error or '')

    requeue_res = client.post('/api/v1/messaging/outbox/msg-dlq-test-01/requeue', headers=_auth_header(clinic_token))
    assert requeue_res.status_code == 200
    assert requeue_res.get_json()['message']['status'] == 'PENDING'


def test_dt05_opentelemetry_distributed_tracing_and_correlation(client):
    clear_recorded_traces()
    clinic_token = _clinic_token(client)

    trace_id_in = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    parent_span_in = '1122334455667788'
    traceparent_in = f'00-{trace_id_in}-{parent_span_in}-01'
    corr_id_in = 'corr-otel-trace-e2e'

    res = client.post(
        '/api/v1/needs',
        headers={
            **_auth_header(clinic_token),
            'X-Correlation-ID': corr_id_in,
            'traceparent': traceparent_in,
        },
        json={
            'especie': 'FELINA',
            'tipoSanguineo': 'Tipo A',
            'volumeSolicitadoMl': 60,
            'urgencia': 'ALTA',
            'descricao': 'Felino com anemia hemolítica precisando de Tipagem A.',
        },
    )
    assert res.status_code == 201
    assert res.headers.get('X-Correlation-ID') == corr_id_in
    assert res.headers.get('X-Trace-ID') == trace_id_in
    assert (res.headers.get('traceparent') or '').startswith(f'00-{trace_id_in}-')

    # Processa outbox: worker deve restaurar o trace_id original no span assíncrono!
    proc = client.post('/api/v1/messaging/process', headers=_auth_header(clinic_token))
    assert proc.status_code == 200

    traces_res = client.get(f'/api/v1/observability/traces?traceId={trace_id_in}', headers=_auth_header(clinic_token))
    assert traces_res.status_code == 200
    traces_body = traces_res.get_json()
    assert traces_body['telemetry']['w3cTraceContextEnabled'] is True

    span_names = {s['name'] for s in traces_body['spans']}
    assert 'doepet.needs.publish_and_enqueue' in span_names
    assert 'doepet.worker.process_outbox_message' in span_names
    assert 'doepet.push.dispatch_batch' in span_names

    # Verifica vínculo imutável no AuditLog do PostgreSQL
    with client.application.app_context():
        audit = AuditLog.query.filter_by(correlation_id=corr_id_in, action='CREATE_BLOOD_NEED').first()
        assert audit is not None
        assert audit.trace_id == trace_id_in


def test_dt06_vapid_web_push_and_fcm_end_to_end(client):
    # 1. VAPID public key deve ser ponto ECDSA P-256 não comprimido (65 bytes começando por 0x04)
    vapid_res = client.get('/api/v1/push/vapid-public-key')
    assert vapid_res.status_code == 200
    pub_b64 = vapid_res.get_json()['publicKey']
    padded = pub_b64 + '=' * (-len(pub_b64) % 4)
    raw_pub = base64.urlsafe_b64decode(padded)
    assert len(raw_pub) == 65 and raw_pub[0] == 4

    # 2. Tutor registra assinatura Web Push nativa e FCM token
    tutor_token = _tutor_token(client)
    fake_p256dh = base64.urlsafe_b64encode(b'\x04' + os.urandom(64)).rstrip(b'=').decode('ascii')
    fake_auth = base64.urlsafe_b64encode(os.urandom(16)).rstrip(b'=').decode('ascii')

    sub_wp = client.post(
        '/api/v1/push/subscribe',
        headers=_auth_header(tutor_token),
        json={
            'channel': 'WEB_PUSH',
            'endpoint': 'https://updates.push.services.mozilla.com/wpush/v2/doepet-e2e-sub',
            'keys': {'p256dh': fake_p256dh, 'auth': fake_auth},
            'deviceLabel': 'Chrome Desktop Tutor',
        },
    )
    assert sub_wp.status_code == 201
    assert sub_wp.get_json()['subscription']['channel'] == 'WEB_PUSH'

    sub_fcm = client.post(
        '/api/v1/push/subscribe',
        headers=_auth_header(tutor_token),
        json={
            'channel': 'FCM',
            'fcmToken': 'fcm-token-doepet-android-e2e-2026',
            'deviceLabel': 'Android App Tutor',
        },
    )
    assert sub_fcm.status_code == 201
    assert sub_fcm.get_json()['subscription']['channel'] == 'FCM'

    # 3. Clínica cria urgência CANINA -> Worker dispara Push VAPID + FCM e marca NeedNotification DELIVERED
    clinic_token = _clinic_token(client)
    need_res = client.post(
        '/api/v1/needs',
        headers=_auth_header(clinic_token),
        json={
            'especie': 'CANINA',
            'tipoSanguineo': 'DEA 1.1 Negativo (Doador Universal)',
            'volumeSolicitadoMl': 450,
            'urgencia': 'CRITICA',
            'descricao': 'Cirurgia ortopédica emergencial em cão.',
        },
    )
    assert need_res.status_code == 201
    need_id = need_res.get_json()['outboxMessage']['needId']

    proc_res = client.post('/api/v1/messaging/process', headers=_auth_header(clinic_token))
    assert proc_res.status_code == 200

    with client.application.app_context():
        tutor_notifs = NeedNotification.query.filter_by(need_id=need_id, tutor_id=1).all()
        assert len(tutor_notifs) >= 1
        assert all(n.status == 'DELIVERED' for n in tutor_notifs)

        active_subs = PushSubscription.query.filter_by(tutor_id=1, is_active=True).all()
        assert len(active_subs) == 2
        assert all(s.last_notified_at is not None for s in active_subs)

    # 4. Tutor remove inscrição push de um endpoint
    unsub_res = client.post(
        '/api/v1/push/unsubscribe',
        headers=_auth_header(tutor_token),
        json={'endpoint': 'https://updates.push.services.mozilla.com/wpush/v2/doepet-e2e-sub'},
    )
    assert unsub_res.status_code == 200
    assert unsub_res.get_json()['deactivatedCount'] == 1



