from datetime import date, datetime, timedelta, timezone
import hashlib
import hmac
import uuid
from functools import wraps
from typing import Any, Callable, Optional

from flask import Blueprint, current_app, g, jsonify, make_response, request

from doepet_flask_mysql.config import detect_engine_name
from doepet_flask_mysql.messaging.outbox_worker import (
    enqueue_blood_need_alert,
    process_pending_outbox,
    requeue_dead_letter_message,
)
from doepet_flask_mysql.messaging.service_bus import get_alert_worker, get_queue_metrics
from doepet_flask_mysql.models import (
    AlertOutboxMessage,
    Appointment,
    AuditLog,
    BloodBag,
    BloodInventory,
    BloodInventoryMovement,
    BloodNeed,
    Donation,
    DonorInterest,
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
from doepet_flask_mysql.notifications.push_service import get_vapid_public_key
from doepet_flask_mysql.observability.telemetry import get_telemetry_snapshot
from doepet_flask_mysql.observability.tracing import (
    get_observability_status,
    get_recent_spans,
    get_tracer,
)
from doepet_flask_mysql.security.jwt_service import (
    clear_auth_cookies,
    issue_token_pair,
    revoke_all_user_tokens,
    set_auth_cookies,
    verify_access_token,
    verify_refresh_token_and_rotate,
)

api_v1_bp = Blueprint('api_v1', __name__)
SHELF_LIFE_DAYS = 40
_IDEMPOTENCY_CACHE: dict[tuple[str, str], tuple[int, dict[str, Any]]] = {}


def _append_audit(
    action: str,
    resource_type: str,
    resource_id: str,
    actor_id: Optional[int],
    actor_type: str,
    before_data: Optional[dict] = None,
    after_data: Optional[dict] = None,
) -> None:
    log = AuditLog(
        actor_id=actor_id,
        actor_type=actor_type,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        correlation_id=getattr(g, 'correlation_id', str(uuid.uuid4())),
        trace_id=getattr(g, 'trace_id', None),
        before_data=before_data,
        after_data=after_data,
        ip_address=request.remote_addr,
        user_agent=(request.headers.get('User-Agent') or '')[:250],
    )
    db.session.add(log)


def _check_double_submit_csrf() -> bool:
    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        return True
    csrf_cookie_name = current_app.config.get('AUTH_COOKIE_CSRF_NAME', 'doepet_csrf_token')
    cookie_val = request.cookies.get(csrf_cookie_name) or ''
    header_val = request.headers.get('X-CSRF-Token') or ''
    if not cookie_val or not header_val:
        return False
    return hmac.compare_digest(cookie_val, header_val)


def _authenticate_current_user() -> tuple[Optional[dict[str, Any]], Optional[tuple[Any, int]]]:
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
        claims = verify_access_token(token)
        if not claims:
            return None, (jsonify({'error': 'Token JWT inválido ou expirado.'}), 401)
        return claims, None

    access_cookie_name = current_app.config.get('AUTH_COOKIE_ACCESS_NAME', 'doepet_access_token')
    cookie_token = request.cookies.get(access_cookie_name)
    if not cookie_token:
        return None, (jsonify({'error': 'Autenticação obrigatória.'}), 401)

    claims = verify_access_token(cookie_token)
    if not claims:
        return None, (jsonify({'error': 'Sessão expirada ou inválida.'}), 401)

    if not _check_double_submit_csrf():
        return None, (jsonify({'error': 'CSRF token ausente ou inválido.'}), 403)

    return claims, None


def require_api_auth(fn: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        claims, err_resp = _authenticate_current_user()
        if err_resp is not None:
            return err_resp
        user_id = int(claims['sub'])  # type: ignore[index]
        user = db.session.get(User, user_id)
        if not user or not user.is_active:
            return jsonify({'error': 'Usuário não encontrado ou inativo.'}), 401
        g.jwt_claims = claims
        g.current_api_user = user
        return fn(*args, **kwargs)

    return wrapper


def require_api_roles(*allowed_roles: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            user = getattr(g, 'current_api_user', None)
            if not user or user.role not in allowed_roles:
                return jsonify({'error': 'Permissão insuficiente para esta operação (RBAC).'}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def _resolve_user_context(user: User) -> tuple[Optional[Institution], Optional[InstitutionEmployee], Optional[Tutor]]:
    inst = Institution.query.filter_by(user_id=user.id).first()
    emp = InstitutionEmployee.query.filter_by(user_id=user.id).first()
    if not inst and emp:
        inst = db.session.get(Institution, emp.institution_id)
    tutor = Tutor.query.filter_by(user_id=user.id).first()
    return inst, emp, tutor


def _serialize_inventory_item(inv: BloodInventory) -> dict[str, Any]:
    return {
        'id': inv.id,
        'institutionId': inv.institution_id,
        'especie': inv.especie,
        'tipoSanguineo': inv.tipo_sanguineo,
        'componente': inv.componente,
        'volumeMl': inv.volume_ml,
        'volumeMinimoAlerta': inv.volume_minimo_alerta,
    }


def _serialize_blood_bag(bag: BloodBag) -> dict[str, Any]:
    return {
        'id': bag.id,
        'inventoryId': bag.inventory_id,
        'loteCodigo': bag.lote_codigo,
        'volumeMl': bag.volume_ml,
        'dataColeta': bag.data_coleta.isoformat() if bag.data_coleta else None,
        'dataValidade': bag.data_validade.isoformat() if bag.data_validade else None,
        'status': bag.status,
        'doadorNome': bag.doador_nome,
        'responsavelCrmv': bag.responsavel_crmv,
    }


def _serialize_outbox_message(msg: AlertOutboxMessage) -> dict[str, Any]:
    return {
        'id': msg.id,
        'messageId': msg.message_id,
        'idempotencyKey': msg.idempotency_key,
        'topic': msg.topic,
        'needId': msg.need_id,
        'transport': msg.transport,
        'status': msg.status,
        'attempts': msg.attempts,
        'maxAttempts': msg.max_attempts,
        'correlationId': msg.correlation_id,
        'traceId': msg.trace_id,
        'brokerMessageId': msg.broker_message_id,
        'lastError': msg.last_error,
    }


def _serialize_state_for_user(user: User) -> dict[str, Any]:
    inst, emp, tutor = _resolve_user_context(user)
    nome = inst.nome_fantasia if inst else (emp.nome if emp else (tutor.nome if tutor else user.email))
    documento = inst.cnpj if inst else (emp.cpf if emp else (tutor.cpf if tutor else ''))

    institutions = Institution.query.all()
    if user.role == 'TUTOR' and tutor:
        pets = Pet.query.filter_by(tutor_id=tutor.id).all()
        interests = DonorInterest.query.filter_by(tutor_id=tutor.id).all()
        appointments = Appointment.query.filter_by(tutor_id=tutor.id).all()
        vouchers = Voucher.query.filter_by(tutor_id=tutor.id).all()
        inventories = []
        bags = []
        movements = []
        employees = []
    elif inst:
        pets = Pet.query.all()
        interests = DonorInterest.query.join(BloodNeed).filter(BloodNeed.institution_id == inst.id).all()
        appointments = Appointment.query.filter_by(institution_id=inst.id).all()
        vouchers = Voucher.query.filter_by(institution_id=inst.id).all()
        inventories = BloodInventory.query.filter_by(institution_id=inst.id).all()
        inv_ids = [i.id for i in inventories]
        bags = BloodBag.query.filter(BloodBag.inventory_id.in_(inv_ids)).all() if inv_ids else []
        movements = BloodInventoryMovement.query.filter(BloodInventoryMovement.inventory_id.in_(inv_ids)).all() if inv_ids else []
        employees = InstitutionEmployee.query.filter_by(institution_id=inst.id).all()
    else:
        pets = Pet.query.all()
        interests = DonorInterest.query.all()
        appointments = Appointment.query.all()
        vouchers = Voucher.query.all()
        inventories = BloodInventory.query.all()
        bags = BloodBag.query.all()
        movements = BloodInventoryMovement.query.all()
        employees = InstitutionEmployee.query.all()

    needs = BloodNeed.query.all()

    return {
        'user': {
            'id': user.id,
            'nome': nome,
            'email': user.email,
            'role': user.role,
            'documento': documento,
            'isLoggedIn': True,
        },
        'institutions': [
            {
                'id': i.id,
                'nomeFantasia': i.nome_fantasia,
                'cnpj': i.cnpj,
                'cidade': i.cidade,
                'estado': i.estado,
                'status': i.status,
            }
            for i in institutions
        ],
        'employees': [
            {
                'id': e.id,
                'institutionId': e.institution_id,
                'nome': e.nome,
                'cargo': e.cargo,
                'isAdmin': e.is_admin,
                'isActive': e.is_active,
            }
            for e in employees
        ],
        'pets': [
            {
                'id': p.id,
                'tutorId': p.tutor_id,
                'nome': p.nome,
                'especie': p.especie,
                'raca': p.raca,
                'pesoKg': float(p.peso_kg),
                'tipoSanguineo': p.tipo_sanguineo,
                'statusElegibilidade': p.status_elegibilidade,
            }
            for p in pets
        ],
        'inventory': [_serialize_inventory_item(inv) for inv in inventories],
        'bloodBags': [_serialize_blood_bag(b) for b in bags],
        'movements': [
            {
                'id': m.id,
                'inventoryId': m.inventory_id,
                'tipoMovimento': m.tipo_movimento,
                'volumeDeltaMl': m.volume_delta_ml,
                'loteCodigo': m.lote_codigo,
            }
            for m in movements
        ],
        'needs': [
            {
                'id': n.id,
                'institutionId': n.institution_id,
                'especie': n.especie,
                'tipoSanguineo': n.tipo_sanguineo,
                'volumeSolicitadoMl': n.volume_solicitado_ml,
                'urgencia': n.urgencia,
                'status': n.status,
            }
            for n in needs
        ],
        'interests': [{'id': it.id, 'needId': it.need_id, 'petId': it.pet_id, 'status': it.status} for it in interests],
        'appointments': [{'id': a.id, 'petId': a.pet_id, 'status': a.status, 'slotCodigo': a.slot_codigo} for a in appointments],
        'vouchers': [{'id': v.id, 'codigo': v.codigo, 'status': v.status} for v in vouchers],
    }


def _issue_session_response(user: User, status_code: int = 200):
    access_jwt, refresh_jwt, csrf_token, _ = issue_token_pair(user=user, req=request)
    state = _serialize_state_for_user(user)
    payload = {
        'success': True,
        'token': access_jwt,
        'accessToken': access_jwt,
        'tokenType': 'Bearer',
        'expiresIn': int(current_app.config.get('JWT_ACCESS_TTL_SECONDS', 900)),
        'csrfToken': csrf_token,
        **state,
    }
    resp = make_response(jsonify(payload), status_code)
    set_auth_cookies(resp, access_jwt, refresh_jwt, csrf_token, req=request)
    return resp


@api_v1_bp.route('/health', methods=['GET'])
def health():
    db.session.execute(db.text('SELECT 1'))
    engine_name = detect_engine_name(str(db.engine.url))
    queue = get_queue_metrics()
    return jsonify(
        {
            'status': 'ok',
            'database': 'connected',
            'engine': engine_name,
            'service': 'doepet-flask-api',
            'persistence': 'PostgreSQL + SQLAlchemy + Alembic',
            'auth': 'OAuth2 / JWT (15m) + HttpOnly Refresh Cookie',
            'messaging': queue['brokerMode'],
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }
    )


@api_v1_bp.route('/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(silent=True) or {}
    identifier = str(body.get('identifier') or body.get('email') or '').strip().lower()
    password = str(body.get('password') or '')

    if not identifier or not password:
        return jsonify({'error': 'E-mail e senha são obrigatórios.'}), 400

    user = User.query.filter_by(email=identifier).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Credenciais inválidas.'}), 401
    if not user.is_active:
        return jsonify({'error': 'Conta desativada pelo administrador.'}), 403

    _append_audit('USER_LOGIN', 'User', str(user.id), user.id, user.role, None, {'email': user.email})
    db.session.commit()
    return _issue_session_response(user)


@api_v1_bp.route('/auth/demo-login', methods=['POST'])
def auth_demo_login():
    body = request.get_json(silent=True) or {}
    role = str(body.get('role') or 'TUTOR').strip().upper()
    if role in ('INSTITUTION_ADMIN', 'CLINICA', 'CLINIC'):
        user = User.query.filter_by(role='INSTITUTION_ADMIN').order_by(User.id.asc()).first()
    elif role == 'INSTITUTION_EMPLOYEE':
        user = User.query.filter_by(role='INSTITUTION_EMPLOYEE').order_by(User.id.asc()).first()
    else:
        user = User.query.filter_by(role='TUTOR').order_by(User.id.asc()).first()

    if not user:
        return jsonify({'error': 'Usuário demo não encontrado.'}), 404

    _append_audit('DEMO_LOGIN', 'User', str(user.id), user.id, user.role, None, {'email': user.email})
    db.session.commit()
    return _issue_session_response(user)


@api_v1_bp.route('/auth/register/tutor', methods=['POST'])
def register_tutor():
    body = request.get_json(silent=True) or {}
    tutor_data = body.get('tutor') or body
    email = str(body.get('email') or tutor_data.get('email') or '').strip().lower()
    password = str(body.get('password') or '')
    cpf = str(tutor_data.get('cpf') or '').strip()

    if not email or not cpf or len(password) < 6:
        return jsonify({'error': 'E-mail, CPF e senha (>= 6 caracteres) são obrigatórios.'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'RN01: Este e-mail já está cadastrado na plataforma.'}), 409
    if Tutor.query.filter_by(cpf=cpf).first():
        return jsonify({'error': 'Este CPF já está cadastrado.'}), 409

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
        cidade=str(tutor_data.get('cidade') or 'São Paulo'),
        estado=str(tutor_data.get('estado') or 'SP')[:2].upper(),
        bairro=str(tutor_data.get('bairro') or 'Centro'),
        notif_push=True,
        notif_whatsapp=True,
        lgpd_aceito=True,
        lgpd_versao='v1.0-2026',
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
    db.session.commit()
    return _issue_session_response(user, status_code=201)


@api_v1_bp.route('/auth/refresh', methods=['POST'])
def auth_refresh():
    refresh_cookie_name = current_app.config.get('AUTH_COOKIE_REFRESH_NAME', 'doepet_refresh_token')
    raw_token = request.cookies.get(refresh_cookie_name) or ''
    if not raw_token:
        return jsonify({'error': 'Refresh cookie ausente.'}), 401

    csrf_cookie_name = current_app.config.get('AUTH_COOKIE_CSRF_NAME', 'doepet_csrf_token')
    if request.cookies.get(csrf_cookie_name) and not _check_double_submit_csrf():
        return jsonify({'error': 'CSRF token ausente ou inválido.'}), 403

    ok, err_reason, result = verify_refresh_token_and_rotate(raw_token, req=request)
    if not ok or not result:
        if err_reason == 'reuse_detected':
            ctx = result or {}
            _append_audit(
                'REFRESH_TOKEN_REUSE_BLOCKED',
                'RefreshToken',
                str(ctx.get('jti') or 'unknown'),
                ctx.get('user_id'),
                'SECURITY',
                None,
                ctx,
            )
            db.session.commit()
        resp = make_response(jsonify({'error': 'Refresh token inválido ou revogado.', 'reason': err_reason}), 401)
        clear_auth_cookies(resp, req=request)
        return resp

    payload = {
        'success': True,
        'token': result['access_jwt'],
        'accessToken': result['access_jwt'],
        'tokenType': 'Bearer',
        'expiresIn': int(current_app.config.get('JWT_ACCESS_TTL_SECONDS', 900)),
        'csrfToken': result['csrf_token'],
    }
    resp = make_response(jsonify(payload), 200)
    set_auth_cookies(resp, result['access_jwt'], result['refresh_jwt'], result['csrf_token'], req=request)
    return resp


@api_v1_bp.route('/auth/sessions', methods=['GET'])
@require_api_auth
def list_sessions():
    user: User = g.current_api_user
    active_tokens = RefreshToken.query.filter_by(user_id=user.id, is_revoked=False).order_by(RefreshToken.created_at.desc()).all()
    return jsonify(
        {
            'sessions': [
                {
                    'jti': t.jti,
                    'familyId': t.family_id,
                    'expiresAt': t.expires_at.isoformat() if t.expires_at else None,
                    'createdAt': t.created_at.isoformat() if t.created_at else None,
                    'ipAddress': t.ip_address,
                    'userAgent': t.user_agent,
                }
                for t in active_tokens
            ]
        }
    )


@api_v1_bp.route('/auth/logout', methods=['POST'])
def auth_logout():
    refresh_cookie_name = current_app.config.get('AUTH_COOKIE_REFRESH_NAME', 'doepet_refresh_token')
    raw_token = request.cookies.get(refresh_cookie_name)
    if raw_token:
        ok, _err, _res = verify_refresh_token_and_rotate(raw_token, req=request)
        if ok and _res:
            revoke_all_user_tokens(_res['user'].id, reason='LOGOUT')
    resp = make_response(jsonify({'success': True}), 200)
    clear_auth_cookies(resp, req=request)
    return resp


@api_v1_bp.route('/auth/logout-all', methods=['POST'])
@require_api_auth
def auth_logout_all():
    user: User = g.current_api_user
    revoked = revoke_all_user_tokens(user.id, reason='USER_LOGOUT_ALL')
    _append_audit('LOGOUT_ALL_SESSIONS', 'User', str(user.id), user.id, user.role, None, {'revokedCount': revoked})
    db.session.commit()
    resp = make_response(jsonify({'success': True, 'revokedCount': revoked}), 200)
    clear_auth_cookies(resp, req=request)
    return resp


@api_v1_bp.route('/state', methods=['GET'])
@api_v1_bp.route('/bootstrap', methods=['GET'])
@require_api_auth
def get_state():
    return jsonify(_serialize_state_for_user(g.current_api_user))


@api_v1_bp.route('/inventory/movements', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def create_stock_movement():
    user: User = g.current_api_user
    inst, _emp, _tutor = _resolve_user_context(user)
    if not inst:
        return jsonify({'error': 'Instituição não localizada para este usuário.'}), 404

    body = request.get_json(silent=True) or {}
    inv_id = int(body.get('inventoryId') or 0)
    tipo = str(body.get('tipo') or '')
    delta = abs(int(body.get('delta') or 0))
    motivo = str(body.get('motivo') or '').strip()
    data_coleta_str = str(body.get('dataColeta') or date.today().isoformat())

    inv = BloodInventory.query.filter_by(id=inv_id, institution_id=inst.id).first()
    if not inv:
        return jsonify({'error': 'Item de estoque não localizado para esta instituição.'}), 404

    actual_delta = -delta if tipo in ('SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO') else delta
    new_volume = inv.volume_ml + actual_delta
    if new_volume < 0:
        return jsonify({'error': f'RN04: Saldo insuficiente ({inv.volume_ml} mL) para retirada de {delta} mL.'}), 400

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
        realizado_por_user_id=user.id,
        realizado_por_nome=inst.nome_fantasia,
    )
    db.session.add(mov)
    _append_audit(
        'UPDATE_STOCK',
        'BloodInventory',
        str(inv.id),
        user.id,
        user.role,
        {'volume_ml': prev_vol},
        {'volume_ml': new_volume, 'lote': lote_codigo},
    )
    db.session.commit()

    state = _serialize_state_for_user(user)
    return jsonify({'success': True, 'volumeMl': inv.volume_ml, 'loteCodigo': lote_codigo, **state}), 200


@api_v1_bp.route('/appointments/<int:appointment_id>/confirm-donation', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def confirm_donation(appointment_id: int):
    user: User = g.current_api_user
    inst, _emp, _tutor = _resolve_user_context(user)
    if not inst:
        return jsonify({'error': 'Instituição não localizada.'}), 404

    idem_key = request.headers.get('Idempotency-Key')
    endpoint = f'/api/v1/appointments/{appointment_id}/confirm-donation'
    if idem_key and (idem_key, endpoint) in _IDEMPOTENCY_CACHE:
        cached_body, cached_status = _IDEMPOTENCY_CACHE[(idem_key, endpoint)][1], _IDEMPOTENCY_CACHE[(idem_key, endpoint)][0]
        return jsonify(cached_body), cached_status

    body = request.get_json(silent=True) or {}
    hematocrito = float(body.get('hematocrito') or 0)
    if hematocrito < 37.0:
        return jsonify({'error': f'RN15: Hematócrito {hematocrito}% abaixo do limiar seguro de 37.0%.'}), 400

    app_obj = Appointment.query.filter_by(id=appointment_id, institution_id=inst.id).first()
    if not app_obj:
        return jsonify({'error': 'Agendamento não encontrado.'}), 404

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
        beneficio_descricao='Check-up Clínico Preventivo Gratuito + Hemograma',
        data_validade=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=90),
        status='ATIVO',
    )
    db.session.add(voucher)
    _append_audit('CONFIRM_DONATION', 'Donation', str(donation.id), user.id, user.role, None, {'voucherCode': voucher_code})
    db.session.commit()

    response_payload = {'success': True, 'voucherCode': voucher_code, 'loteBolsa': lote}
    if idem_key:
        _IDEMPOTENCY_CACHE[(idem_key, endpoint)] = (200, response_payload)
    return jsonify(response_payload), 200


@api_v1_bp.route('/vouchers/redeem', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def redeem_voucher():
    user: User = g.current_api_user
    body = request.get_json(silent=True) or {}
    codigo = str(body.get('codigo') or '').strip().upper()
    voucher = Voucher.query.filter_by(codigo=codigo).first()
    if not voucher:
        return jsonify({'success': False, 'error': 'Voucher não encontrado.'}), 404
    if voucher.status == 'RESGATADO':
        return jsonify({'success': False, 'error': 'RN12: Voucher já foi resgatado anteriormente.'}), 409

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if voucher.data_validade and voucher.data_validade < now_naive:
        voucher.status = 'EXPIRADO'
        db.session.commit()
        return jsonify({'success': False, 'error': 'RN12: Voucher expirado.'}), 409

    voucher.status = 'RESGATADO'
    voucher.resgatado_em = now_naive
    _append_audit('REDEEM_VOUCHER', 'Voucher', str(voucher.id), user.id, user.role, None, {'codigo': voucher.codigo})
    db.session.commit()
    return jsonify({'success': True, 'codigo': voucher.codigo, 'status': voucher.status}), 200


@api_v1_bp.route('/employees/<int:emp_id>', methods=['PATCH', 'DELETE'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN')
def manage_employee(emp_id: int):
    user: User = g.current_api_user
    inst, _emp, _tutor = _resolve_user_context(user)
    if not inst:
        return jsonify({'error': 'Instituição não localizada.'}), 404

    emp = InstitutionEmployee.query.filter_by(id=emp_id, institution_id=inst.id).first()
    if not emp:
        return jsonify({'error': 'Colaborador não encontrado.'}), 404

    body = request.get_json(silent=True) or {}
    deactivating = request.method == 'DELETE' or (body.get('isActive') is False)

    if emp.is_admin and deactivating:
        other_active_admins = InstitutionEmployee.query.filter(
            InstitutionEmployee.institution_id == inst.id,
            InstitutionEmployee.id != emp.id,
            InstitutionEmployee.is_admin.is_(True),
            InstitutionEmployee.is_active.is_(True),
        ).count()
        if other_active_admins == 0:
            return jsonify({'error': 'Não é permitido remover ou desativar o único administrador ativo da instituição.'}), 400

    if request.method == 'DELETE':
        db.session.delete(emp)
        _append_audit('DELETE_EMPLOYEE', 'InstitutionEmployee', str(emp_id), user.id, user.role)
        db.session.commit()
        return jsonify({'success': True}), 200

    if 'isActive' in body:
        emp.is_active = bool(body['isActive'])
    if 'cargo' in body:
        emp.cargo = str(body['cargo'])
    if 'nome' in body:
        emp.nome = str(body['nome'])
    _append_audit('UPDATE_EMPLOYEE', 'InstitutionEmployee', str(emp_id), user.id, user.role)
    db.session.commit()
    return jsonify({'success': True, 'employee': {'id': emp.id, 'isActive': emp.is_active}}), 200


@api_v1_bp.route('/tutor/export-lgpd', methods=['GET'])
@require_api_auth
@require_api_roles('TUTOR')
def export_lgpd():
    user: User = g.current_api_user
    tutor = Tutor.query.filter_by(user_id=user.id).first()
    if not tutor:
        return jsonify({'error': 'Tutor não localizado.'}), 404

    pets = Pet.query.filter_by(tutor_id=tutor.id).all()
    vouchers = Voucher.query.filter_by(tutor_id=tutor.id).all()
    _append_audit('LGPD_DATA_EXPORT', 'Tutor', str(tutor.id), user.id, 'TUTOR')
    db.session.commit()

    return jsonify(
        {
            'titular': {
                'nome': tutor.nome,
                'cpf': tutor.cpf,
                'email': user.email,
                'telefone': tutor.telefone,
                'cidade': tutor.cidade,
                'estado': tutor.estado,
            },
            'animaisCadastrados': [
                {
                    'id': p.id,
                    'nome': p.nome,
                    'especie': p.especie,
                    'raca': p.raca,
                    'pesoKg': float(p.peso_kg),
                    'tipoSanguineo': p.tipo_sanguineo,
                    'statusElegibilidade': p.status_elegibilidade,
                }
                for p in pets
            ],
            'vouchersBeneficios': [
                {
                    'codigo': v.codigo,
                    'beneficio': v.beneficio_descricao,
                    'status': v.status,
                }
                for v in vouchers
            ],
            'lgpdCompliance': {
                'politicaVersao': tutor.lgpd_versao,
                'geradoEm': datetime.now(timezone.utc).isoformat(),
            },
        }
    )


@api_v1_bp.route('/needs', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE')
def create_need():
    user: User = g.current_api_user
    inst, _emp, _tutor = _resolve_user_context(user)
    if not inst:
        return jsonify({'error': 'Instituição não localizada.'}), 404

    body = request.get_json(silent=True) or {}
    especie = str(body.get('especie') or 'CANINA')
    tipo_sanguineo = str(body.get('tipoSanguineo') or 'DEA 1.1 Negativo')
    urgencia = str(body.get('urgencia') or 'ALTA')
    corr_id = getattr(g, 'correlation_id', str(uuid.uuid4()))
    traceparent = getattr(g, 'traceparent', None)
    trace_id = getattr(g, 'trace_id', None)

    tracer = get_tracer('doepet.needs')
    with tracer.start_as_current_span('doepet.needs.publish_and_enqueue') as span:
        span.set_attribute('doepet.correlation_id', corr_id)
        span.set_attribute('doepet.institution_id', inst.id)
        span.set_attribute('doepet.especie', especie)

        need = BloodNeed(
            institution_id=inst.id,
            especie=especie,
            tipo_sanguineo=tipo_sanguineo,
            volume_solicitado_ml=int(body.get('volumeSolicitadoMl') or 450),
            urgencia=urgencia,
            status='ACTIVE',
            descricao=str(body.get('descricao') or '').strip(),
        )
        db.session.add(need)
        db.session.flush()

        eligible_pets = Pet.query.filter_by(especie=especie, status_elegibilidade='APTO').all()
        notified_tutor_ids: list[int] = []
        for pet in eligible_pets:
            if pet.tutor_id not in notified_tutor_ids:
                notified_tutor_ids.append(pet.tutor_id)
            db.session.add(
                NeedNotification(
                    need_id=need.id,
                    tutor_id=pet.tutor_id,
                    pet_id=pet.id,
                    canal='PUSH',
                    status='QUEUED',
                    mensagem=f"{inst.nome_fantasia} precisa de sangue {especie} ({tipo_sanguineo}) para {pet.nome}.",
                )
            )

        _append_audit(
            'CREATE_BLOOD_NEED',
            'BloodNeed',
            str(need.id),
            user.id,
            user.role,
            None,
            {'especie': especie, 'tipoSanguineo': tipo_sanguineo, 'urgencia': urgencia},
        )
        db.session.commit()

        outbox_msg = enqueue_blood_need_alert(
            need_id=need.id,
            institution_id=inst.id,
            institution_name=inst.nome_fantasia,
            especie=especie,
            tipo_sanguineo=tipo_sanguineo,
            urgencia=urgencia,
            notified_tutor_ids=notified_tutor_ids,
            correlation_id=corr_id,
            traceparent=traceparent,
            trace_id=trace_id,
            commit=True,
        )

    return (
        jsonify(
            {
                'needId': need.id,
                'outboxMessage': _serialize_outbox_message(outbox_msg),
            }
        ),
        201,
    )


@api_v1_bp.route('/messaging/process', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE', 'PLATFORM_ADMIN')
def process_outbox():
    result = process_pending_outbox()
    return jsonify(result), 200


@api_v1_bp.route('/messaging/outbox', methods=['GET'])
@require_api_auth
def list_outbox():
    corr_id = (request.args.get('correlationId') or '').strip()
    query = AlertOutboxMessage.query
    if corr_id:
        query = query.filter_by(correlation_id=corr_id)
    msgs = query.order_by(AlertOutboxMessage.id.asc()).all()
    return jsonify({'messages': [_serialize_outbox_message(m) for m in msgs]}), 200


@api_v1_bp.route('/messaging/outbox/<string:message_id>/requeue', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE', 'PLATFORM_ADMIN')
def requeue_outbox_msg(message_id: str):
    msg = requeue_dead_letter_message(message_id)
    if not msg:
        return jsonify({'error': 'Mensagem não encontrada no outbox.'}), 404
    return jsonify({'message': _serialize_outbox_message(msg)}), 200


@api_v1_bp.route('/observability/traces', methods=['GET'])
@require_api_auth
def observability_traces():
    trace_id = (request.args.get('traceId') or '').strip() or None
    corr_id = (request.args.get('correlationId') or '').strip() or None
    spans = get_recent_spans(correlation_id=corr_id, trace_id=trace_id, limit=100)
    return jsonify(
        {
            'telemetry': get_observability_status(current_app.config),
            'spans': spans,
        }
    ), 200


@api_v1_bp.route('/observability/telemetry', methods=['GET'])
@require_api_auth
def telemetry():
    return jsonify(get_telemetry_snapshot())


@api_v1_bp.route('/messaging/queue', methods=['GET'])
@require_api_auth
def queue_metrics():
    return jsonify(get_queue_metrics())


@api_v1_bp.route('/messaging/retry-dlq', methods=['POST'])
@require_api_auth
@require_api_roles('INSTITUTION_ADMIN', 'PLATFORM_ADMIN')
def retry_dlq():
    replayed = get_alert_worker().replay_dlq()
    return jsonify({'replayed': replayed})


@api_v1_bp.route('/push/vapid-public-key', methods=['GET'])
def vapid_public_key():
    return jsonify(get_vapid_public_key())


@api_v1_bp.route('/push/subscribe', methods=['POST'])
@require_api_auth
def subscribe_push():
    user: User = g.current_api_user
    _inst, _emp, tutor = _resolve_user_context(user)
    body = request.get_json(silent=True) or {}

    channel = str(body.get('channel') or 'WEB_PUSH').strip().upper()
    sub_obj = body.get('subscription') or body
    keys = sub_obj.get('keys') or {}
    endpoint = str(sub_obj.get('endpoint') or '').strip()
    fcm_token = str(body.get('fcmToken') or sub_obj.get('fcmToken') or '').strip()
    device_label = str(body.get('deviceLabel') or '').strip() or None

    if channel == 'FCM':
        if not fcm_token:
            return jsonify({'error': 'fcmToken obrigatório para canal FCM.'}), 400
        raw_identifier = f'fcm:{fcm_token}'
    else:
        channel = 'WEB_PUSH'
        if not endpoint or not keys.get('p256dh') or not keys.get('auth'):
            return jsonify({'error': 'PushSubscription inválida.'}), 400
        raw_identifier = f'webpush:{endpoint}'

    endpoint_hash = hashlib.sha256(raw_identifier.encode('utf-8')).hexdigest()
    existing = PushSubscription.query.filter_by(endpoint_hash=endpoint_hash).first()
    if existing:
        existing.user_id = user.id
        existing.tutor_id = tutor.id if tutor else existing.tutor_id
        existing.channel = channel
        existing.endpoint = endpoint or None
        existing.p256dh_key = str(keys.get('p256dh') or '') or None
        existing.auth_key = str(keys.get('auth') or '') or None
        existing.fcm_token = fcm_token or None
        existing.device_label = device_label
        existing.is_active = True
        sub = existing
    else:
        sub = PushSubscription(
            user_id=user.id,
            tutor_id=tutor.id if tutor else None,
            channel=channel,
            endpoint=endpoint or None,
            p256dh_key=str(keys.get('p256dh') or '') or None,
            auth_key=str(keys.get('auth') or '') or None,
            fcm_token=fcm_token or None,
            endpoint_hash=endpoint_hash,
            device_label=device_label,
            user_agent=(request.headers.get('User-Agent') or '')[:250],
            is_active=True,
        )
        db.session.add(sub)

    db.session.commit()
    return (
        jsonify(
            {
                'subscribed': True,
                'subscription': {
                    'id': sub.id,
                    'channel': sub.channel,
                    'deviceLabel': sub.device_label,
                    'isActive': sub.is_active,
                },
            }
        ),
        201,
    )


@api_v1_bp.route('/push/unsubscribe', methods=['POST'])
@require_api_auth
def unsubscribe_push():
    user: User = g.current_api_user
    body = request.get_json(silent=True) or {}
    endpoint = str(body.get('endpoint') or '').strip()
    fcm_token = str(body.get('fcmToken') or '').strip()

    deactivated = 0
    if endpoint:
        endpoint_hash = hashlib.sha256(f'webpush:{endpoint}'.encode('utf-8')).hexdigest()
        subs = PushSubscription.query.filter_by(user_id=user.id, endpoint_hash=endpoint_hash, is_active=True).all()
        for s in subs:
            s.is_active = False
            deactivated += 1
    elif fcm_token:
        endpoint_hash = hashlib.sha256(f'fcm:{fcm_token}'.encode('utf-8')).hexdigest()
        subs = PushSubscription.query.filter_by(user_id=user.id, endpoint_hash=endpoint_hash, is_active=True).all()
        for s in subs:
            s.is_active = False
            deactivated += 1

    db.session.commit()
    return jsonify({'deactivatedCount': deactivated}), 200
