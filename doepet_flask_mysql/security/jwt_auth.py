import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable, Optional
import jwt
from flask import g, jsonify, request
from doepet_flask_mysql.security.key_vault import KeyVaultKeyProvider

ACCESS_TTL_SECONDS = int(os.getenv('JWT_ACCESS_TTL_SECONDS', '900'))  # 15 min
REFRESH_TTL_SECONDS = int(os.getenv('JWT_REFRESH_TTL_SECONDS', '604800'))  # 7 days
REFRESH_COOKIE_NAME = 'doepet_refresh_token'


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()


def generate_raw_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def issue_access_token(
    *,
    user_id: int,
    email: str,
    nome: str,
    role: str,
    documento: str = '',
    institution_id: Optional[int] = None,
    tutor_id: Optional[int] = None,
) -> dict[str, Any]:
    provider = KeyVaultKeyProvider.from_env()
    now = datetime.now(timezone.utc)
    payload = {
        'iss': 'doepet-auth',
        'aud': 'doepet-api',
        'sub': str(user_id),
        'email': email,
        'nome': nome,
        'role': role,
        'documento': documento,
        'institutionId': institution_id,
        'tutorId': tutor_id,
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(seconds=ACCESS_TTL_SECONDS)).timestamp()),
    }
    token = jwt.encode(
        payload,
        provider.get_private_key_pem(),
        algorithm='RS256',
        headers={'kid': provider.key_id},
    )
    return {
        'accessToken': token,
        'tokenType': 'Bearer',
        'expiresIn': ACCESS_TTL_SECONDS,
    }


def verify_access_token(token: str) -> Optional[dict[str, Any]]:
    try:
        provider = KeyVaultKeyProvider.from_env()
        decoded = jwt.decode(
            token,
            provider.get_public_key_pem(),
            algorithms=['RS256'],
            audience='doepet-api',
            issuer='doepet-auth',
        )
        return decoded
    except Exception:
        return None


def get_jwks_payload() -> dict[str, Any]:
    provider = KeyVaultKeyProvider.from_env()
    return {'keys': [provider.get_public_jwk()]}


def set_refresh_cookie(response: Any, raw_token: str) -> None:
    is_secure = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=REFRESH_TTL_SECONDS,
        httponly=True,
        samesite='Lax',
        secure=is_secure,
        path='/api/v1/auth',
    )


def clear_refresh_cookie(response: Any) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path='/api/v1/auth')


def require_jwt(fn: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Token JWT RS256 ausente.'}), 401
        token = auth_header[7:].strip()
        claims = verify_access_token(token)
        if not claims:
            return jsonify({'error': 'Token JWT invalido ou expirado.'}), 401
        g.jwt_claims = claims
        return fn(*args, **kwargs)

    return wrapper


def require_roles(*allowed_roles: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            claims = getattr(g, 'jwt_claims', None)
            if not claims or claims.get('role') not in allowed_roles:
                return jsonify({'error': 'Permissao insuficiente para esta operacao (RBAC).'}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
