from datetime import date, datetime, timedelta, timezone
from http.cookies import SimpleCookie
import pytest
from doepet_flask_mysql.app import create_app
from doepet_flask_mysql.config import Config
from doepet_flask_mysql.messaging.service_bus import AlertQueueWorker
from doepet_flask_mysql.models import (
    Appointment,
    BloodInventory,
    Institution,
    Pet,
    Tutor,
    User,
    db,
)


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_ENGINE_OPTIONS = {}
    SECRET_KEY = 'core-test-secret-key'


@pytest.fixture()
def app_ctx():
    app = create_app(TestConfig, seed_on_startup=False)
    with app.app_context():
        db.create_all()
        admin = User(email='clinica@hemovet.com.br', role='INSTITUTION_ADMIN', is_active=True)
        admin.set_password('doepet2026')
        db.session.add(admin)
        db.session.flush()

        inst = Institution(
            user_id=admin.id,
            cnpj='12.345.678/0001-90',
            razao_social='Hemovet Central LTDA',
            nome_fantasia='Hemovet Central 24h',
            crmv_responsavel='CRMV-SP 18452',
            telefone='(11) 3000-0000',
            email_contato='clinica@hemovet.com.br',
            cep='01310-100',
            endereco='Av. Paulista, 1000',
            cidade='Sao Paulo',
            estado='SP',
            capacidade_diaria=2,
            status='ACTIVE',
        )
        db.session.add(inst)
        db.session.flush()

        inv = BloodInventory(
            institution_id=inst.id,
            especie='CANINA',
            tipo_sanguineo='DEA 1.1 Negativo',
            componente='SANGUE_TOTAL',
            volume_ml=450,
            volume_minimo_alerta=450,
        )
        db.session.add(inv)

        tutor_user = User(email='tutor@doepet.com.br', role='TUTOR', is_active=True)
        tutor_user.set_password('doepet2026')
        db.session.add(tutor_user)
        db.session.flush()

        tutor = Tutor(
            user_id=tutor_user.id,
            nome='Ricardo Santos',
            cpf='321.654.987-00',
            telefone='(11) 99999-9999',
            cep='01310-100',
            cidade='Sao Paulo',
            estado='SP',
            bairro='Bela Vista',
        )
        db.session.add(tutor)
        db.session.flush()

        pet = Pet(
            tutor_id=tutor.id,
            nome='Thor',
            especie='CANINA',
            raca='Golden Retriever',
            sexo='MACHO',
            data_nascimento=date(2022, 5, 1),
            peso_kg=32.5,
            tipo_sanguineo='DEA 1.1 Negativo',
            status_elegibilidade='APTO',
        )
        db.session.add(pet)
        db.session.flush()

        app_obj = Appointment(
            institution_id=inst.id,
            tutor_id=tutor.id,
            pet_id=pet.id,
            data_hora=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1),
            slot_codigo='SLOT-CAN-001',
            status='SCHEDULED',
        )
        db.session.add(app_obj)
        db.session.commit()

        yield app, {'inv_id': inv.id, 'app_id': app_obj.id}
        db.session.remove()
        db.drop_all()


def test_jwt_login_and_refresh_cookie_rotation(app_ctx):
    app, _ = app_ctx
    client = app.test_client()

    login_resp = client.post(
        '/api/v1/auth/login',
        json={'identifier': 'clinica@hemovet.com.br', 'password': 'doepet2026'},
    )
    assert login_resp.status_code == 200
    assert login_resp.headers.get('X-Correlation-ID')
    assert login_resp.headers.get('traceparent')
    data = login_resp.get_json()
    assert data['accessToken']
    assert data['expiresIn'] == 900

    csrf_token = ''
    for raw_header in login_resp.headers.getlist('Set-Cookie'):
        jar = SimpleCookie()
        jar.load(raw_header)
        if 'doepet_csrf_token' in jar:
            csrf_token = jar['doepet_csrf_token'].value

    refresh_resp = client.post('/api/v1/auth/refresh', headers={'X-CSRF-Token': csrf_token})
    assert refresh_resp.status_code == 200
    assert refresh_resp.get_json()['accessToken']


def test_rn04_negative_stock_blocked(app_ctx):
    app, ids = app_ctx
    client = app.test_client()
    token = client.post(
        '/api/v1/auth/login',
        json={'identifier': 'clinica@hemovet.com.br', 'password': 'doepet2026'},
    ).get_json()['accessToken']

    resp = client.post(
        '/api/v1/inventory/movements',
        headers={'Authorization': f'Bearer {token}'},
        json={
            'inventoryId': ids['inv_id'],
            'tipo': 'SAIDA_TRANSFUSAO',
            'delta': 900,
            'motivo': 'Teste saldo negativo',
        },
    )
    assert resp.status_code == 400


def test_rn15_hematocrit_threshold_rejected(app_ctx):
    app, ids = app_ctx
    client = app.test_client()
    token = client.post(
        '/api/v1/auth/login',
        json={'identifier': 'clinica@hemovet.com.br', 'password': 'doepet2026'},
    ).get_json()['accessToken']

    bad_resp = client.post(
        f"/api/v1/appointments/{ids['app_id']}/confirm-donation",
        headers={'Authorization': f'Bearer {token}', 'Idempotency-Key': 'idem-test-1'},
        json={
            'veterinarioCrmv': 'CRMV-SP 18452',
            'volumeColetado': 450,
            'hematocrito': 34.5,
            'pesoAferido': 32.5,
            'tipoConfirmado': 'DEA 1.1 Negativo',
        },
    )
    assert bad_resp.status_code == 400

    ok_resp = client.post(
        f"/api/v1/appointments/{ids['app_id']}/confirm-donation",
        headers={'Authorization': f'Bearer {token}', 'Idempotency-Key': 'idem-test-2'},
        json={
            'veterinarioCrmv': 'CRMV-SP 18452',
            'volumeColetado': 450,
            'hematocrito': 42.0,
            'pesoAferido': 32.5,
            'tipoConfirmado': 'DEA 1.1 Negativo',
        },
    )
    assert ok_resp.status_code == 200
    assert ok_resp.get_json()['voucherCode'].startswith('DOEPET-')


def test_dlq_retries_and_dead_letter():
    worker = AlertQueueWorker(max_attempts=2)

    def failing_handler(_envelope):
        raise RuntimeError('Simulated push gateway timeout')

    worker.set_handler(failing_handler)
    ok = worker.process_envelope(
        {'message_id': 'm1', 'event_type': 'BloodNeedCreated', 'correlation_id': 'c1', 'payload': {}, 'attempts': 0}
    )
    assert ok is False
    assert worker.metrics()['dlqCount'] == 1
