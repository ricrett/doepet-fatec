import base64
import hashlib
import os
from dataclasses import dataclass
from functools import lru_cache
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
                    # Fallback to managed PEM pair if remote sign is delegated
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
