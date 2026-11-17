import base64
import json
import os
from functools import lru_cache
from typing import Any
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


@lru_cache(maxsize=1)
def _ensure_vapid_keys() -> dict[str, str]:
    pub = os.getenv('VAPID_PUBLIC_KEY', '').strip()
    priv = os.getenv('VAPID_PRIVATE_KEY', '').strip()
    subject = os.getenv('VAPID_SUBJECT', 'mailto:alertas@doepet.com.br')
    if pub and priv:
        return {'publicKey': pub, 'privateKey': priv, 'subject': subject, 'source': 'env'}

    private_key = ec.generate_private_key(ec.SECP256R1())
    raw_priv = private_key.private_numbers().private_value.to_bytes(32, 'big')
    raw_pub = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    return {
        'publicKey': base64.urlsafe_b64encode(raw_pub).rstrip(b'=').decode('ascii'),
        'privateKey': base64.urlsafe_b64encode(raw_priv).rstrip(b'=').decode('ascii'),
        'subject': subject,
        'source': 'generated-p256',
    }


def get_vapid_public_key() -> dict[str, str]:
    keys = _ensure_vapid_keys()
    return {'publicKey': keys['publicKey'], 'source': keys['source']}


class WebPushDispatcher:
    """DT-06: Dispatcher Web Push (VAPID P-256) com fallback FCM/SSE."""

    @staticmethod
    def send_push(subscription_info: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        keys = _ensure_vapid_keys()
        endpoint = str(subscription_info.get('endpoint', ''))
        if not endpoint or endpoint.startswith('sse://'):
            return {'delivered': True, 'channel': 'sse-bridge'}

        try:
            from pywebpush import webpush

            webpush(
                subscription_info={
                    'endpoint': endpoint,
                    'keys': {
                        'p256dh': subscription_info.get('p256dh', ''),
                        'auth': subscription_info.get('auth_key', subscription_info.get('auth', '')),
                    },
                },
                data=json.dumps(payload),
                vapid_private_key=keys['privateKey'],
                vapid_claims={'sub': keys['subject']},
                ttl=180,
            )
            return {'delivered': True, 'channel': 'web-push-vapid'}
        except Exception as exc:
            return {'delivered': False, 'channel': 'web-push-error', 'error': str(exc)}
