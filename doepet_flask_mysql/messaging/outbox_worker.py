from datetime import datetime, timedelta, timezone
import threading
import uuid
from typing import Any, Callable, Optional

from flask import Flask, current_app
from opentelemetry import context as otel_context

from doepet_flask_mysql.messaging.service_bus import AzureServiceBusPublisher
from doepet_flask_mysql.models import AlertOutboxMessage, PushSubscription, db
from doepet_flask_mysql.notifications.push_service import (
    dispatch_blood_need_notifications,
    dispatch_to_subscription,
)
from doepet_flask_mysql.observability.tracing import (
    extract_context_from_traceparent,
    get_tracer,
)


_WAKE_EVENT = threading.Event()
_WORKER_LOCK = threading.Lock()
_STARTED_APPS: set[int] = set()


def wake_outbox_worker() -> None:
    _WAKE_EVENT.set()


def enqueue_outbox_event(
    topic: str,
    payload: dict[str, Any],
    idempotency_key: str,
    correlation_id: str,
    traceparent: Optional[str] = None,
    trace_id: Optional[str] = None,
    need_id: Optional[int] = None,
    max_attempts: Optional[int] = None,
    commit: bool = False,
) -> AlertOutboxMessage:
    """
    Persiste mensagem no Transactional Outbox do PostgreSQL com garantia de idempotência (RN19).
    """
    existing = AlertOutboxMessage.query.filter_by(idempotency_key=idempotency_key).first()
    if existing:
        return existing

    pub = AzureServiceBusPublisher(current_app.config if current_app else {})
    attempts_limit = int(
        max_attempts
        or (current_app.config.get('OUTBOX_MAX_ATTEMPTS', 5) if current_app else 5)
    )
    msg = AlertOutboxMessage(
        message_id=uuid.uuid4().hex,
        idempotency_key=idempotency_key,
        topic=topic,
        need_id=need_id,
        payload=payload,
        transport=pub.active_transport,
        status='PENDING',
        attempts=0,
        max_attempts=attempts_limit,
        correlation_id=correlation_id,
        traceparent=traceparent,
        trace_id=trace_id,
        next_retry_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.session.add(msg)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return msg


def enqueue_blood_need_alert(
    need_id: int,
    institution_id: int,
    institution_name: str,
    especie: str,
    tipo_sanguineo: str,
    urgencia: str,
    notified_tutor_ids: list[int],
    correlation_id: str,
    traceparent: Optional[str] = None,
    trace_id: Optional[str] = None,
    commit: bool = False,
) -> AlertOutboxMessage:
    payload = {
        'eventType': 'BloodNeedPublished',
        'needId': need_id,
        'institutionId': institution_id,
        'institutionNome': institution_name,
        'especie': especie,
        'tipoSanguineo': tipo_sanguineo,
        'urgencia': urgencia,
        'notifiedTutorIds': notified_tutor_ids,
        'queuedAt': datetime.now(timezone.utc).isoformat(),
    }
    return enqueue_outbox_event(
        topic='blood-need-alerts',
        payload=payload,
        idempotency_key=f'blood-need:{need_id}',
        correlation_id=correlation_id,
        traceparent=traceparent,
        trace_id=trace_id,
        need_id=need_id,
        commit=commit,
    )


def _execute_message_handler(
    msg: AlertOutboxMessage,
    app_config: dict[str, Any],
    handler_override: Optional[Callable[[AlertOutboxMessage], None]] = None,
) -> dict[str, Any]:
    pub = AzureServiceBusPublisher(app_config=app_config)
    pub_info = pub.publish(
        message_id=msg.message_id,
        topic=msg.topic,
        payload=msg.payload or {},
        correlation_id=msg.correlation_id,
        traceparent=msg.traceparent,
    )
    msg.transport = pub_info['transport']
    msg.broker_message_id = pub_info['brokerMessageId']

    if handler_override is not None:
        handler_override(msg)
        return {'handledBy': 'override'}

    if msg.topic == 'blood-need-alerts' and msg.need_id:
        summary = dispatch_blood_need_notifications(
            need_id=msg.need_id,
            correlation_id=msg.correlation_id,
            trace_id=msg.trace_id,
            app_config=app_config,
        )
        return {
            'totalNotifications': summary.total_notifications,
            'nativeDelivered': summary.native_delivered,
            'inAppSent': summary.in_app_sent,
        }

    if msg.topic == 'push-test':
        user_id = int((msg.payload or {}).get('userId') or 0)
        title = str((msg.payload or {}).get('title') or 'DoePet Notificações')
        body = str((msg.payload or {}).get('body') or 'Teste de alerta push ativo neste dispositivo.')
        subs = PushSubscription.query.filter_by(user_id=user_id, is_active=True).all()
        delivered = 0
        for sub in subs:
            res = dispatch_to_subscription(
                sub,
                title=title,
                body=body,
                data={'correlationId': msg.correlation_id, 'traceId': msg.trace_id or '', 'type': 'PUSH_TEST'},
                app_config=app_config,
            )
            if res.get('ok'):
                delivered += 1
        db.session.commit()
        return {'devicesNotified': delivered}

    return {'handledBy': 'noop'}


def process_pending_outbox(
    app: Optional[Flask] = None,
    limit: int = 25,
    handler_override: Optional[Callable[[AlertOutboxMessage], None]] = None,
) -> dict[str, Any]:
    """
    Processa mensagens pendentes na fila assíncrona com retentativa exponencial e Dead-Letter Queue.
    Mantém o trace_id OpenTelemetry original da requisição produtora.
    """
    ctx_manager = app.app_context() if app is not None else None
    if ctx_manager is not None:
        ctx_manager.__enter__()

    processed = 0
    dispatched = 0
    retried = 0
    dead_lettered = 0

    try:
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        pending = (
            AlertOutboxMessage.query.filter(
                AlertOutboxMessage.status == 'PENDING',
                (AlertOutboxMessage.next_retry_at.is_(None)) | (AlertOutboxMessage.next_retry_at <= now_naive),
            )
            .order_by(AlertOutboxMessage.id.asc())
            .limit(limit)
            .all()
        )

        tracer = get_tracer('doepet.worker')
        app_config = dict(current_app.config)

        for msg in pending:
            processed += 1
            msg.status = 'PROCESSING'
            msg.attempts = int(msg.attempts or 0) + 1
            db.session.commit()

            parent_ctx = extract_context_from_traceparent(msg.traceparent)
            token = otel_context.attach(parent_ctx)
            try:
                with tracer.start_as_current_span('doepet.worker.process_outbox_message') as span:
                    span.set_attribute('messaging.message.id', msg.message_id)
                    span.set_attribute('doepet.correlation_id', msg.correlation_id)
                    span.set_attribute('doepet.topic', msg.topic)
                    span.set_attribute('doepet.attempt', msg.attempts)

                    _execute_message_handler(msg, app_config=app_config, handler_override=handler_override)

                    msg.status = 'DISPATCHED'
                    msg.dispatched_at = datetime.now(timezone.utc)
                    msg.last_error = None
                    db.session.commit()
                    dispatched += 1
            except Exception as exc:
                db.session.rollback()
                refetched = db.session.get(AlertOutboxMessage, msg.id)
                if refetched:
                    refetched.last_error = str(exc)[:500]
                    if refetched.attempts >= refetched.max_attempts:
                        refetched.status = 'DEAD_LETTERED'
                        dead_lettered += 1
                    else:
                        backoff = min(60, 2 ** int(refetched.attempts))
                        refetched.status = 'PENDING'
                        refetched.next_retry_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=backoff)
                        retried += 1
                    db.session.commit()
            finally:
                otel_context.detach(token)
    finally:
        if ctx_manager is not None:
            ctx_manager.__exit__(None, None, None)

    return {
        'processed': processed,
        'dispatched': dispatched,
        'retried': retried,
        'deadLettered': dead_lettered,
    }


def requeue_dead_letter_message(message_id: str) -> Optional[AlertOutboxMessage]:
    msg = AlertOutboxMessage.query.filter_by(message_id=message_id).first()
    if not msg:
        return None
    msg.status = 'PENDING'
    msg.attempts = 0
    msg.last_error = None
    msg.next_retry_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()
    wake_outbox_worker()
    return msg


def start_background_worker(app: Flask) -> None:
    if app.config.get('TESTING', False) or not app.config.get('ASYNC_WORKER_ENABLED', True):
        return

    with _WORKER_LOCK:
        app_id = id(app)
        if app_id in _STARTED_APPS:
            return
        _STARTED_APPS.add(app_id)

        poll_interval = max(0.5, float(app.config.get('ASYNC_WORKER_POLL_INTERVAL_SECONDS', 2.0)))

        def _worker_loop() -> None:
            while True:
                try:
                    process_pending_outbox(app=app, limit=25)
                except Exception:
                    pass
                _WAKE_EVENT.wait(timeout=poll_interval)
                _WAKE_EVENT.clear()

        thread = threading.Thread(target=_worker_loop, name='doepet-outbox-worker', daemon=True)
        thread.start()
