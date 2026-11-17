from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import uuid
from typing import Any, Optional, Tuple

import jwt
from flask import Request, Response, current_app, request

from doepet_flask_mysql.models import RefreshToken, User, db
from doepet_flask_mysql.security.key_vault import secret_vault


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()


def _is_secure_cookie_mode(req: Optional[Request] = None) -> bool:
    cfg_val = str(current_app.config.get('AUTH_COOKIE_SECURE', 'auto')).strip().lower()
    if cfg_val in ('1', 'true', 'yes'):
        return True
    if cfg_val in ('0', 'false', 'no'):
        return False
    r = req or request
    forwarded_proto = (r.headers.get('X-Forwarded-Proto') or '').split(',')[0].strip().lower()
    return bool(r.is_secure or forwarded_proto == 'https')


def _jwt_settings() -> dict[str, Any]:
    return {
        'algorithm': current_app.config.get('JWT_ALGORITHM', 'HS256'),
        'issuer': current_app.config.get('JWT_ISSUER', 'doepet-api'),
        'audience': current_app.config.get('JWT_AUDIENCE', 'doepet-web-spa'),
        'access_ttl': int(current_app.config.get('JWT_ACCESS_TTL_SECONDS', 900)),
        'refresh_ttl': int(current_app.config.get('JWT_REFRESH_TTL_SECONDS', 604800)),
    }


def generate_access_jwt(user: User) -> str:
    settings = _jwt_settings()
    signing_key, kid = secret_vault.get_signing_key('access', current_app.config)
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(user.id),
        'role': user.role,
        'email': user.email,
        'type': 'access',
        'jti': uuid.uuid4().hex,
        'iss': settings['issuer'],
        'aud': settings['audience'],
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(seconds=settings['access_ttl'])).timestamp()),
    }
    return jwt.encode(payload, signing_key, algorithm=settings['algorithm'], headers={'kid': kid})


def issue_token_pair(
    user: User,
    family_id: Optional[str] = None,
    parent_jti: Optional[str] = None,
    req: Optional[Request] = None,
) -> Tuple[str, str, str, RefreshToken]:
    """
    Emite par Access JWT (curta duração) + Refresh JWT (rotativo, persistido em hash no PostgreSQL)
    e gera token CSRF criptográfico.
    """
    settings = _jwt_settings()
    now = datetime.now(timezone.utc)
    refresh_jti = uuid.uuid4().hex
    active_family = family_id or uuid.uuid4().hex
    refresh_exp = now + timedelta(seconds=settings['refresh_ttl'])

    access_jwt = generate_access_jwt(user)

    refresh_key, refresh_kid = secret_vault.get_signing_key('refresh', current_app.config)
    refresh_payload = {
        'sub': str(user.id),
        'type': 'refresh',
        'jti': refresh_jti,
        'family_id': active_family,
        'iss': settings['issuer'],
        'aud': settings['audience'],
        'iat': int(now.timestamp()),
        'exp': int(refresh_exp.timestamp()),
    }
    refresh_jwt = jwt.encode(
        refresh_payload,
        refresh_key,
        algorithm=settings['algorithm'],
        headers={'kid': refresh_kid},
    )

    r = req or request
    ip_addr = (r.headers.get('X-Forwarded-For') or r.remote_addr or '')[:45] or None
    ua = r.user_agent.string[:250] if r and r.user_agent else None

    rt_record = RefreshToken(
        user_id=user.id,
        jti=refresh_jti,
        family_id=active_family,
        token_hash=_hash_token(refresh_jwt),
        parent_jti=parent_jti,
        is_revoked=False,
        expires_at=refresh_exp.replace(tzinfo=None),
        ip_address=ip_addr,
        user_agent=ua,
    )
    db.session.add(rt_record)
    db.session.commit()

    csrf_token = secrets.token_urlsafe(32)
    return access_jwt, refresh_jwt, csrf_token, rt_record


def _decode_jwt(raw_token: str, expected_type: str) -> Optional[dict]:
    settings = _jwt_settings()
    key_kind = 'refresh' if expected_type == 'refresh' else 'access'
    candidate_keys = secret_vault.get_verification_keys(key_kind, current_app.config)

    for key in candidate_keys:
        try:
            claims = jwt.decode(
                raw_token,
                key,
                algorithms=[settings['algorithm']],
                issuer=settings['issuer'],
                audience=settings['audience'],
                options={'require': ['sub', 'exp', 'iat', 'jti', 'type']},
            )
            if claims.get('type') != expected_type:
                return None
            return claims
        except jwt.InvalidSignatureError:
            continue
        except jwt.PyJWTError:
            return None
    return None


def verify_access_token(raw_token: str) -> Optional[dict]:
    return _decode_jwt(raw_token, expected_type='access')


def revoke_refresh_token_family(family_id: str, reason: str = 'LOGOUT') -> int:
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    tokens = RefreshToken.query.filter_by(family_id=family_id, is_revoked=False).all()
    for t in tokens:
        t.is_revoked = True
        t.revoked_at = now_naive
        t.revoked_reason = reason
    db.session.commit()
    return len(tokens)


def revoke_all_user_tokens(user_id: int, reason: str = 'USER_LOGOUT_ALL') -> int:
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    tokens = RefreshToken.query.filter_by(user_id=user_id, is_revoked=False).all()
    for t in tokens:
        t.is_revoked = True
        t.revoked_at = now_naive
        t.revoked_reason = reason
    db.session.commit()
    return len(tokens)


def verify_refresh_token_and_rotate(
    raw_refresh_token: str,
    req: Optional[Request] = None,
) -> Tuple[bool, Optional[str], Optional[dict]]:
    """
    Valida Refresh Token JWT, detecta reuso de token já rotacionado (Token Reuse Detection)
    revogando toda a família em caso de replay, e emite novo par Access + Refresh rotacionado.
    """
    if not raw_refresh_token:
        return False, 'missing_refresh_token', None

    claims = _decode_jwt(raw_refresh_token, expected_type='refresh')
    if not claims:
        return False, 'invalid_or_expired_refresh_token', None

    jti = str(claims.get('jti') or '')
    family_id = str(claims.get('family_id') or '')
    user_id = int(claims['sub'])

    record = RefreshToken.query.filter_by(jti=jti).first()
    if not record or record.user_id != user_id:
        return False, 'unknown_refresh_token', None

    if not hmac.compare_digest(record.token_hash, _hash_token(raw_refresh_token)):
        return False, 'token_hash_mismatch', None

    # Reuse Attack Detection: token já foi revogado anteriormente -> comprometeu a família!
    if record.is_revoked:
        revoke_refresh_token_family(record.family_id or family_id, reason='TOKEN_REUSE_DETECTED')
        return False, 'reuse_detected', {'user_id': user_id, 'family_id': record.family_id, 'jti': jti}

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if record.expires_at < now_naive:
        record.is_revoked = True
        record.revoked_at = now_naive
        record.revoked_reason = 'EXPIRED'
        db.session.commit()
        return False, 'refresh_token_expired', None

    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        revoke_refresh_token_family(record.family_id, reason='USER_INACTIVE')
        return False, 'user_inactive', None

    # Marca o refresh token atual como consumido/rotacionado e gera sucessor na mesma família
    new_access, new_refresh, csrf_token, new_record = issue_token_pair(
        user=user,
        family_id=record.family_id,
        parent_jti=record.jti,
        req=req,
    )
    record.is_revoked = True
    record.revoked_at = now_naive
    record.revoked_reason = 'ROTATED'
    record.replaced_by_jti = new_record.jti
    db.session.commit()

    return True, None, {
        'user': user,
        'access_jwt': new_access,
        'refresh_jwt': new_refresh,
        'csrf_token': csrf_token,
        'family_id': new_record.family_id,
        'jti': new_record.jti,
    }


def set_auth_cookies(
    response: Response,
    access_jwt: str,
    refresh_jwt: str,
    csrf_token: str,
    req: Optional[Request] = None,
) -> Response:
    secure_flag = _is_secure_cookie_mode(req)
    samesite = current_app.config.get('AUTH_COOKIE_SAMESITE', 'Strict')
    access_ttl = int(current_app.config.get('JWT_ACCESS_TTL_SECONDS', 900))
    refresh_ttl = int(current_app.config.get('JWT_REFRESH_TTL_SECONDS', 604800))

    access_cookie_name = current_app.config.get('AUTH_COOKIE_ACCESS_NAME', 'doepet_access_token')
    refresh_cookie_name = current_app.config.get('AUTH_COOKIE_REFRESH_NAME', 'doepet_refresh_token')
    csrf_cookie_name = current_app.config.get('AUTH_COOKIE_CSRF_NAME', 'doepet_csrf_token')

    response.set_cookie(
        access_cookie_name,
        value=access_jwt,
        max_age=access_ttl,
        httponly=True,
        secure=secure_flag,
        samesite=samesite,
        path='/',
    )
    response.set_cookie(
        refresh_cookie_name,
        value=refresh_jwt,
        max_age=refresh_ttl,
        httponly=True,
        secure=secure_flag,
        samesite=samesite,
        path='/api/v1/auth',
    )
    response.set_cookie(
        csrf_cookie_name,
        value=csrf_token,
        max_age=refresh_ttl,
        httponly=False,
        secure=secure_flag,
        samesite=samesite,
        path='/',
    )
    return response


def clear_auth_cookies(response: Response, req: Optional[Request] = None) -> Response:
    secure_flag = _is_secure_cookie_mode(req)
    samesite = current_app.config.get('AUTH_COOKIE_SAMESITE', 'Strict')
    access_cookie_name = current_app.config.get('AUTH_COOKIE_ACCESS_NAME', 'doepet_access_token')
    refresh_cookie_name = current_app.config.get('AUTH_COOKIE_REFRESH_NAME', 'doepet_refresh_token')
    csrf_cookie_name = current_app.config.get('AUTH_COOKIE_CSRF_NAME', 'doepet_csrf_token')

    response.set_cookie(access_cookie_name, value='', max_age=0, expires=0, httponly=True, secure=secure_flag, samesite=samesite, path='/')
    response.set_cookie(refresh_cookie_name, value='', max_age=0, expires=0, httponly=True, secure=secure_flag, samesite=samesite, path='/api/v1/auth')
    response.set_cookie(csrf_cookie_name, value='', max_age=0, expires=0, httponly=False, secure=secure_flag, samesite=samesite, path='/')
    return response
