from datetime import date, datetime, timedelta, timezone
import uuid
from flask import Blueprint, g, jsonify, make_response, request
from doepet_flask_mysql.models import (
    Appointment,
    AuditLog,
    BloodBag,
    BloodInventory,
    BloodInventoryMovement,
    BloodNeed,
    Donation,
    DonorInterest,
    IdempotencyRecord,
    Institution,
    InstitutionEmployee,
    NeedNotification,
    Pet,
    PrivacyConsent,
    PushSubscription,
    RefreshToken,
    Tutor,
    User,
    Voucher,
    db,
)
from doepet_flask_mysql.messaging.service_bus import (
    enqueue_blood_need_alert,
    get_alert_worker,
    get_queue_metrics,
)
from doepet_flask_mysql.notifications.push_service import WebPushDispatcher, get_vapid_public_key
from doepet_flask_mysql.observability.telemetry import get_telemetry_snapshot
from doepet_flask_mysql.security.jwt_auth import (
    REFRESH_COOKIE_NAME,
    REFRESH_TTL_SECONDS,
    clear_refresh_cookie,
    generate_raw_refresh_token,
    get_jwks_payload,
    hash_refresh_token,
    issue_access_token,
    require_jwt,
    require_roles,
    set_refresh_cookie,
)

api_v1_bp = Blueprint('api_v1', __name__)
SHELF_LIFE_DAYS = 40


def _append_audit(
    action: str,
    resource_type: str,
    resource_id: str,
    actor_id: int | None,
    actor_type: str,
    before_data: dict | None = None,
    after_data: dict | None = None,
) -> None:
    log = AuditLog(
        actor_id=actor_id,
        actor_type=actor_type,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        correlation_id=getattr(g, 'correlation_id', str(uuid.uuid4())),
        before_data=before_data,
        after_data=after_data,
        ip_address=request.remote_addr,
        user_agent=(request.headers.get('User-Agent') or '')[:250],
    )
    db.session.add(log)


def _issue_session_response(user: User, extra: dict | None = None, status_code: int = 200):
    inst = Institution.query.filter_by(user_id=user.id).first()
    emp = InstitutionEmployee.query.filter_by(user_id=user.id).first()
    tutor = Tutor.query.filter_by(user_id=user.id).first()

    institution_id = inst.id if inst else (emp.institution_id if emp else None)
    tutor_id = tutor.id if tutor else None
    nome = inst.nome_fantasia if inst else (emp.nome if emp else (tutor.nome if tutor else user.email))
    documento = inst.cnpj if inst else (emp.cpf if emp else (tutor.cpf if tutor else ''))

    jwt_data = issue_access_token(
        user_id=user.id,
        email=user.email,
        nome=nome,
        role=user.role,
        documento=documento,
        institution_id=institution_id,
        tutor_id=tutor_id,
    )

    raw_refresh = generate_raw_refresh_token()
    rt = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        family_id=str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TTL_SECONDS),
    )
    db.session.add(rt)
    db.session.commit()

    payload = {
        **jwt_data,
        'user': {
            'id': user.id,
            'nome': nome,
            'email': user.email,
            'role': user.role,
            'documento': documento,
            'isLoggedIn': True,
        },
    }
    if extra:
        payload.update(extra)

    resp = make_response(jsonify(payload), status_code)
    set_refresh_cookie(resp, raw_refresh)
    return resp


@api_v1_bp.route('/health', methods=['GET'])
def health():
    queue = get_queue_metrics()
    return jsonify(
        {
            'status': 'healthy',
            'service': 'doepet-flask-api',
            'persistence': 'PostgreSQL + SQLAlchemy + Alembic',
            'auth': 'OAuth2 / JWT RS256 (15m) + HttpOnly Refresh Cookie',
            'messaging': queue['brokerMode'],
            'queuePending': queue['pendingCount'],
            'queueProcessed': queue['processedCount'],
            'queueDlq': queue['dlqCount'],
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
    )


@api_v1_bp.route('/auth/jwks.json', methods=['GET'])
def jwks():
    return jsonify(get_jwks_payload())


@api_v1_bp.route('/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(silent=True) or {}
    identifier = str(body.get('identifier') or body.get('email') or '').strip().lower()
    password = str(body.get('password') or '')

    if not identifier or not password:
        return jsonify({'error': 'E-mail e senha sao obrigatorios.'}), 400

    user = User.query.filter_by(email=identifier).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Credenciais invalidas.'}), 401
    if not user.is_active:
        return jsonify({'error': 'Conta desativada pelo administrador.'}), 403

    _append_audit('USER_LOGIN', 'User', str(user.id), user.id, user.role, None, {'email': user.email})
    return _issue_session_response(user)


@api_v1_bp.route('/auth/register/tutor', methods=['POST'])
def register_tutor():
    body = request.get_json(silent=True) or {}
    tutor_data = body.get('tutor') or body
    email = str(body.get('email') or tutor_data.get('email') or '').strip().lower()
    password = str(body.get('password') or '')
    cpf = str(tutor_data.get('cpf') or '').strip()

    if not email or not cpf or len(password) < 6:
        return jsonify({'error': 'E-mail, CPF e senha (>= 6 caracteres) sao obrigatorios.'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'RN01: Este e-mail ja esta cadastrado na plataforma.'}), 409
    if Tutor.query.filter_by(cpf=cpf).first():
        return jsonify({'error': 'Este CPF ja esta cadastrado.'}), 409

    user = User(email=email, role='TUTOR', is_active=True)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    tutor = Tutor(
        user_id=user.id,
        nome=str(tutor_data.get('nome') or 'Novo Tutor'),
        cpf=cpf,
        telefone=str(tutor_data.get('telefone') or '(11) 99999-9999'),
        whatsapp=str(tutor_data.get('whatsapp') or tutor_data.get('telefone') or ''),
        cep=str(tutor_data.get('cep') or '01000-000'),
        cidade=str(tutor_data.get('cidade') or 'Sao Paulo'),
        estado=str(tutor_data.get('estado') or 'SP')[:2].upper(),
        bairro=str(tutor_data.get('bairro') or 'Centro'),
        notif_push=True,
        notif_whatsapp=True,
    )
    db.session.add(tutor)
    db.session.add(
        PrivacyConsent(
            user_id=user.id,
            versao_politica='v1.0-2026',
            aceito=True,
            ip_address=request.remote_addr,
            user_agent=(request.headers.get('User-Agent') or '')[:250],
        )
    )
    db.session.flush()
    _append_audit('REGISTER_TUTOR', 'Tutor', str(tutor.id), user.id, 'TUTOR', None, {'cpf': cpf})
    return _issue_session_response(user, status_code=201)


@api_v1_bp.route('/auth/refresh', methods=['POST'])
def auth_refresh():
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not raw_token:
        return jsonify({'error': 'Refresh cookie ausente.'}), 401

    token_hash = hash_refresh_token(raw_token)
    existing = RefreshToken.query.filter_by(token_hash=token_hash).first()
    if not existing:
        resp = make_response(jsonify({'error': 'Refresh token invalido.'}), 401)
        clear_refresh_cookie(resp)
        return resp

    if existing.revoked_at is not None:
        RefreshToken.query.filter_by(family_id=existing.family_id, revoked_at=None).update(
            {'revoked_at': datetime.now(timezone.utc)}
        )
        db.session.commit()
        resp = make_response(jsonify({'error': 'Sessao revogada por reuso detectado.'}), 401)
        clear_refresh_cookie(resp)
        return resp

    expires_at = existing.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        resp = make_response(jsonify({'error': 'Refresh token expirado.'}), 401)
        clear_refresh_cookie(resp)
        return resp

    user = db.session.get(User, existing.user_id)
    if not user or not user.is_active:
        return jsonify({'error': 'Usuario inativo.'}), 401

    existing.revoked_at = datetime.now(timezone.utc)
    new_raw = generate_raw_refresh_token()
    rotated = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(new_raw),
        family_id=existing.family_id,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TTL_SECONDS),
    )
    db.session.add(rotated)
    db.session.commit()

    inst = Institution.query.filter_by(user_id=user.id).first()
    tutor = Tutor.query.filter_by(user_id=user.id).first()
    jwt_data = issue_access_token(
        user_id=user.id,
        email=user.email,
        nome=inst.nome_fantasia if inst else (tutor.nome if tutor else user.email),
        role=user.role,
        documento=inst.cnpj if inst else (tutor.cpf if tutor else ''),
        institution_id=inst.id if inst else None,
        tutor_id=tutor.id if tutor else None,
    )
    resp = make_response(jsonify({**jwt_data}), 200)
    set_refresh_cookie(resp, new_raw)
    return resp


@api_v1_bp.route('/auth/logout', methods=['POST'])
def auth_logout():
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if raw_token:
        existing = RefreshToken.query.filter_by(token_hash=hash_refresh_token(raw_token)).first()
        if existing and existing.revoked_at is None:
            existing.revoked_at = datetime.now(timezone.utc)
            db.session.commit()
    resp = make_response(jsonify({'success': True}), 200)
    clear_refresh_cookie(resp)
    return resp


@api_v1_bp.route('/inventory/movements', methods=['POST'])
@require_jwt
@require_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def create_stock_movement():
    body = request.get_json(silent=True) or {}
    inst_id = g.jwt_claims.get('institutionId')
    inv_id = int(body.get('inventoryId') or 0)
    tipo = str(body.get('tipo') or '')
    delta = abs(int(body.get('delta') or 0))
    motivo = str(body.get('motivo') or '').strip()
    data_coleta_str = str(body.get('dataColeta') or date.today().isoformat())

    inv = BloodInventory.query.filter_by(id=inv_id, institution_id=inst_id).first()
    if not inv:
        return jsonify({'error': 'Item de estoque nao localizado para esta instituicao.'}), 404

    actual_delta = -delta if tipo in ('SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO') else delta
    new_volume = inv.volume_ml + actual_delta
    if new_volume < 0:
        return jsonify({'error': f'RN04: Saldo insuficiente ({inv.volume_ml} mL) para retirada de {delta} mL.'}), 422

    prev_vol = inv.volume_ml
    inv.volume_ml = new_volume
    lote_codigo = f"BOLSA-{inv.especie[:3]}-{uuid.uuid4().hex[:6].upper()}"

    if tipo == 'ENTRADA_DOACAO':
        col_date = date.fromisoformat(data_coleta_str)
        exp_date = col_date + timedelta(days=SHELF_LIFE_DAYS)
        bag = BloodBag(
            inventory_id=inv.id,
            lote_codigo=lote_codigo,
            volume_ml=delta,
            data_coleta=col_date,
            data_validade=exp_date,
            status='DISPONIVEL',
        )
        db.session.add(bag)
    elif tipo in ('SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO'):
        oldest = (
            BloodBag.query.filter_by(inventory_id=inv.id, status='DISPONIVEL')
            .order_by(BloodBag.data_validade.asc())
            .first()
        )
        if oldest:
            oldest.status = 'UTILIZADA' if tipo == 'SAIDA_TRANSFUSAO' else 'DESCARTADA_VENCIMENTO'
            lote_codigo = oldest.lote_codigo

    mov = BloodInventoryMovement(
        inventory_id=inv.id,
        tipo_movimento=tipo,
        volume_delta_ml=actual_delta,
        volume_anterior_ml=prev_vol,
        volume_posterior_ml=new_volume,
        motivo=motivo or tipo,
        lote_codigo=lote_codigo,
        realizado_por_user_id=int(g.jwt_claims['sub']),
    )
    db.session.add(mov)
    _append_audit(
        'UPDATE_STOCK',
        'BloodInventory',
        str(inv.id),
        int(g.jwt_claims['sub']),
        g.jwt_claims['role'],
        {'volume_ml': prev_vol},
        {'volume_ml': new_volume, 'lote': lote_codigo},
    )
    db.session.commit()
    return jsonify({'success': True, 'volumeMl': inv.volume_ml, 'loteCodigo': lote_codigo}), 201


@api_v1_bp.route('/needs', methods=['POST'])
@require_jwt
@require_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def create_need():
    body = request.get_json(silent=True) or {}
    inst_id = g.jwt_claims.get('institutionId')
    need = BloodNeed(
        institution_id=inst_id,
        especie=body.get('especie', 'CANINA'),
        tipo_sanguineo=str(body.get('tipoSanguineo') or 'DEA 1.1 Negativo'),
        volume_solicitado_ml=int(body.get('volumeSolicitadoMl') or 450),
        urgencia=body.get('urgencia', 'ALTA'),
        status='ACTIVE',
        descricao=str(body.get('descricao') or '').strip(),
    )
    db.session.add(need)
    db.session.commit()

    dispatch = enqueue_blood_need_alert(
        {'needId': need.id, 'especie': need.especie, 'urgencia': need.urgencia},
        getattr(g, 'correlation_id', ''),
    )
    return jsonify({'needId': need.id, 'asyncDispatch': dispatch}), 201


@api_v1_bp.route('/appointments/<int:appointment_id>/confirm-donation', methods=['POST'])
@require_jwt
@require_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def confirm_donation(appointment_id: int):
    idem_key = request.headers.get('Idempotency-Key')
    endpoint = f'/api/v1/appointments/{appointment_id}/confirm-donation'
    if idem_key:
        cached = IdempotencyRecord.query.filter_by(idempotency_key=idem_key, endpoint=endpoint).first()
        if cached:
            return jsonify(cached.response_body), cached.status_code

    body = request.get_json(silent=True) or {}
    hematocrito = float(body.get('hematocrito') or 0)
    if hematocrito < 37.0:
        return jsonify({'error': f'RN15: Hematocrito {hematocrito}% abaixo do limiar seguro de 37.0%.'}), 422

    app_obj = Appointment.query.filter_by(
        id=appointment_id, institution_id=g.jwt_claims.get('institutionId')
    ).first()
    if not app_obj:
        return jsonify({'error': 'Agendamento nao encontrado.'}), 404

    pet = db.session.get(Pet, app_obj.pet_id)
    volume = int(body.get('volumeColetado') or 450)
    col_date = date.today()
    exp_date = col_date + timedelta(days=SHELF_LIFE_DAYS)
    lote = f"LOT-{col_date.strftime('%Y%m%d')}-{uuid.uuid4().hex[:5].upper()}"

    app_obj.status = 'ATTENDED'
    donation = Donation(
        appointment_id=app_obj.id,
        institution_id=app_obj.institution_id,
        tutor_id=app_obj.tutor_id,
        pet_id=app_obj.pet_id,
        veterinario_responsavel_crmv=str(body.get('veterinarioCrmv') or 'CRMV-SP 00000'),
        volume_coletado_ml=volume,
        lote_bolsa=lote,
        data_validade_bolsa=exp_date,
        tipo_sanguineo_confirmado=str(body.get('tipoConfirmado') or 'DEA 1.1 Negativo'),
        hematocrito_pre_doacao=hematocrito,
        peso_aferido_kg=float(body.get('pesoAferido') or (pet.peso_kg if pet else 25.0)),
        aprovado_triagem=True,
    )
    db.session.add(donation)
    db.session.flush()

    voucher_code = f"DOEPET-{(pet.especie[:3] if pet else 'PET')}-{uuid.uuid4().hex[:6].upper()}"
    voucher = Voucher(
        donation_id=donation.id,
        tutor_id=app_obj.tutor_id,
        institution_id=app_obj.institution_id,
        codigo=voucher_code,
        beneficio_descricao='Check-up Clinico Preventivo Gratuito + Hemograma',
        data_validade=datetime.now(timezone.utc) + timedelta(days=90),
        status='ATIVO',
    )
    db.session.add(voucher)

    response_payload = {'success': True, 'voucherCode': voucher_code, 'loteBolsa': lote}
    if idem_key:
        db.session.add(
            IdempotencyRecord(
                idempotency_key=idem_key,
                endpoint=endpoint,
                status_code=200,
                response_body=response_payload,
            )
        )
    db.session.commit()
    return jsonify(response_payload), 200


@api_v1_bp.route('/push/vapid-public-key', methods=['GET'])
def vapid_public_key():
    return jsonify(get_vapid_public_key())


@api_v1_bp.route('/push/subscribe', methods=['POST'])
@require_jwt
def subscribe_push():
    body = request.get_json(silent=True) or {}
    sub = body.get('subscription') or {}
    keys = sub.get('keys') or {}
    endpoint = str(sub.get('endpoint') or '').strip()
    if not endpoint or not keys.get('p256dh') or not keys.get('auth'):
        return jsonify({'error': 'PushSubscription invalida.'}), 400

    existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if not existing:
        existing = PushSubscription(
            user_id=int(g.jwt_claims['sub']),
            tutor_id=g.jwt_claims.get('tutorId'),
            endpoint=endpoint,
            p256dh=str(keys['p256dh']),
            auth_key=str(keys['auth']),
            user_agent=(request.headers.get('User-Agent') or '')[:250],
        )
        db.session.add(existing)
        db.session.commit()
    return jsonify({'subscribed': True}), 201


@api_v1_bp.route('/observability/telemetry', methods=['GET'])
@require_jwt
def telemetry():
    return jsonify(get_telemetry_snapshot())


@api_v1_bp.route('/messaging/queue', methods=['GET'])
@require_jwt
def queue_metrics():
    return jsonify(get_queue_metrics())


@api_v1_bp.route('/messaging/retry-dlq', methods=['POST'])
@require_jwt
@require_roles('INSTITUTION_ADMIN', 'PLATFORM_ADMIN')
def retry_dlq():
    replayed = get_alert_worker().replay_dlq()
    return jsonify({'replayed': replayed})
