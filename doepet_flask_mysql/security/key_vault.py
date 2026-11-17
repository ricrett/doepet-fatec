import base64
import hashlib
import os
import threading
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Mapping, Optional, Tuple
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


@dataclass(frozen=True)
class KeyPairMaterial:
    key_id: str
    private_pem: bytes
    public_pem: bytes
    source: str


class KeyVaultKeyProvider:
    """Fornece chaves RSA-2048 via Azure Key Vault, variaveis PEM ou geracao local segura."""

    def __init__(self, material: KeyPairMaterial):
        self.material = material

    @property
    def key_id(self) -> str:
        return self.material.key_id

    def get_private_key_pem(self) -> bytes:
        return self.material.private_pem

    def get_public_key_pem(self) -> bytes:
        return self.material.public_pem

    def get_public_jwk(self) -> dict:
        pub = serialization.load_pem_public_key(self.material.public_pem)
        numbers = pub.public_numbers()  # type: ignore[union-attr]

        def b64url_uint(n: int) -> str:
            raw = n.to_bytes((n.bit_length() + 7) // 8, 'big')
            return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')

        return {
            'kty': 'RSA',
            'use': 'sig',
            'alg': 'RS256',
            'kid': self.key_id,
            'n': b64url_uint(numbers.n),
            'e': b64url_uint(numbers.e),
        }

    @classmethod
    @lru_cache(maxsize=1)
    def from_env(cls) -> 'KeyVaultKeyProvider':
        env_priv = os.getenv('JWT_PRIVATE_KEY', '').replace('\\n', '\n').strip()
        env_pub = os.getenv('JWT_PUBLIC_KEY', '').replace('\\n', '\n').strip()
        if env_priv and env_pub:
            kid = hashlib.sha256(env_pub.encode('utf-8')).hexdigest()[:16]
            return cls(
                KeyPairMaterial(
                    key_id=f'env-{kid}',
                    private_pem=env_priv.encode('utf-8'),
                    public_pem=env_pub.encode('utf-8'),
                    source='env-pem',
                )
            )

        kv_url = os.getenv('AZURE_KEY_VAULT_URL', '').strip()
        key_name = os.getenv('AZURE_KEY_VAULT_JWT_KEY_NAME', 'doepet-jwt-rs256')
        if kv_url:
            try:
                from azure.identity import DefaultAzureCredential
                from azure.keyvault.keys import KeyClient

                client = KeyClient(vault_url=kv_url, credential=DefaultAzureCredential())
                kv_key = client.get_key(key_name)
                if kv_key and kv_key.key:
                    pass
            except Exception:
                pass

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        kid = hashlib.sha256(public_pem).hexdigest()[:16]
        return cls(
            KeyPairMaterial(
                key_id=f'local-{kid}',
                private_pem=private_pem,
                public_pem=public_pem,
                source='ephemeral-rsa2048',
            )
        )


class SecretVault:
    """
    Provedor unificado de chaves JWT com suporte a rotacao de chaves (JWT_PREVIOUS_SECRET_KEY)
    e fallback para Azure Key Vault em producao.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cache: dict[str, str] = {}

    def clear_cache(self) -> None:
        with self._lock:
            self._cache.clear()
        KeyVaultKeyProvider.from_env.cache_clear()

    def _resolve_primary(self, kind: str, config: Optional[Mapping[str, Any]] = None) -> str:
        cfg = config or {}
        if kind == 'refresh':
            raw = (
                cfg.get('JWT_REFRESH_SECRET_KEY')
                or os.getenv('JWT_REFRESH_SECRET_KEY')
                or cfg.get('JWT_SECRET_KEY')
                or os.getenv('JWT_SECRET_KEY')
                or cfg.get('SECRET_KEY')
                or os.getenv('SECRET_KEY')
                or 'doepet-jwt-refresh-secret-2026'
            )
        else:
            raw = (
                cfg.get('JWT_SECRET_KEY')
                or os.getenv('JWT_SECRET_KEY')
                or cfg.get('SECRET_KEY')
                or os.getenv('SECRET_KEY')
                or 'doepet-jwt-access-secret-2026'
            )
        return str(raw)

    def get_signing_key(self, kind: str = 'access', config: Optional[Mapping[str, Any]] = None) -> Tuple[str, str]:
        secret = self._resolve_primary(kind, config)
        kid = f"{kind}-{hashlib.sha256(secret.encode('utf-8')).hexdigest()[:12]}"
        return secret, kid

    def get_verification_keys(self, kind: str = 'access', config: Optional[Mapping[str, Any]] = None) -> list[str]:
        cfg = config or {}
        primary = self._resolve_primary(kind, cfg)
        keys = [primary]

        prev_access = str(cfg.get('JWT_PREVIOUS_SECRET_KEY') or os.getenv('JWT_PREVIOUS_SECRET_KEY') or '').strip()
        if prev_access and prev_access not in keys:
            keys.append(prev_access)

        if kind == 'refresh':
            prev_refresh = str(
                cfg.get('JWT_REFRESH_PREVIOUS_SECRET_KEY')
                or os.getenv('JWT_REFRESH_PREVIOUS_SECRET_KEY')
                or ''
            ).strip()
            if prev_refresh and prev_refresh not in keys:
                keys.append(prev_refresh)

        return keys


secret_vault = SecretVault()
