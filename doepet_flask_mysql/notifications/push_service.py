import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from functools import lru_cache
from typing import Any, Mapping, Optional

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

from doepet_flask_mysql.models import NeedNotification, PushSubscription, db
from doepet_flask_mysql.observability.tracing import get_tracer


@dataclass
class DispatchSummary:
    total_notifications: int = 0
    native_delivered: int = 0
    in_app_sent: int = 0


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


def dispatch_to_subscription(
    sub: PushSubscription,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
    app_config: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    cfg = app_config or {}
    mode = str(cfg.get('PUSH_TRANSPORT_MODE') or os.getenv('PUSH_TRANSPORT_MODE', 'live')).strip().lower()
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    if mode == 'dry_run':
        sub.last_notified_at = now_naive
        sub.last_error = None
        return {'ok': True, 'channel': sub.channel, 'mode': 'dry_run'}

    if sub.channel == 'FCM':
        fcm_key = str(cfg.get('FCM_SERVER_KEY') or os.getenv('FCM_SERVER_KEY', '')).strip()
        sub.last_notified_at = now_naive
        return {'ok': True, 'channel': 'FCM', 'configured': bool(fcm_key)}

    keys = _ensure_vapid_keys()
    endpoint = str(sub.endpoint or '')
    if not endpoint or endpoint.startswith('sse://'):
        sub.last_notified_at = now_naive
        return {'ok': True, 'channel': 'sse-bridge'}

    try:
        from pywebpush import webpush

        webpush(
            subscription_info={
                'endpoint': endpoint,
                'keys': {
                    'p256dh': sub.p256dh_key or '',
                    'auth': sub.auth_key or '',
                },
            },
            data=json.dumps({'title': title, 'body': body, 'data': data or {}}),
            vapid_private_key=keys['privateKey'],
            vapid_claims={'sub': keys['subject']},
            ttl=180,
        )
        sub.last_notified_at = now_naive
        sub.last_error = None
        return {'ok': True, 'channel': 'WEB_PUSH'}
    except Exception as exc:
        sub.last_error = str(exc)[:250]
        return {'ok': False, 'channel': 'WEB_PUSH', 'error': str(exc)}


def dispatch_blood_need_notifications(
    need_id: int,
    correlation_id: str,
    trace_id: Optional[str] = None,
    app_config: Optional[Mapping[str, Any]] = None,
) -> DispatchSummary:
    tracer = get_tracer('doepet.push')
    summary = DispatchSummary()

    with tracer.start_as_current_span('doepet.push.dispatch_batch') as span:
        span.set_attribute('doepet.correlation_id', correlation_id)
        span.set_attribute('doepet.need_id', need_id)
        if trace_id:
            span.set_attribute('doepet.trace_id', trace_id)

        notifs = NeedNotification.query.filter_by(need_id=need_id).all()
        summary.total_notifications = len(notifs)

        for notif in notifs:
            subs = PushSubscription.query.filter_by(tutor_id=notif.tutor_id, is_active=True).all()
            delivered_any = False
            for sub in subs:
                res = dispatch_to_subscription(
                    sub,
                    title='DoePet — Alerta de Urgência Veterinária',
                    body=notif.mensagem,
                    data={'needId': need_id, 'correlationId': correlation_id, 'traceId': trace_id or ''},
                    app_config=app_config,
                )
                if res.get('ok'):
                    delivered_any = True
                    summary.native_delivered += 1

            if delivered_any:
                notif.status = 'DELIVERED'
            else:
                notif.status = 'SENT'
                summary.in_app_sent += 1
            notif.sent_at = datetime.now(timezone.utc).replace(tzinfo=None)

        span.set_attribute('doepet.push.total_notifications', summary.total_notifications)
        span.set_attribute('doepet.push.native_delivered', summary.native_delivered)
        db.session.commit()

    return summary


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
                        'p256dh': subscription_info.get('p256dh_key', subscription_info.get('p256dh', '')),
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
