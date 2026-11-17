import json
import os
import queue
import threading
import time
import uuid
from typing import Any, Callable, Optional


class AlertQueueWorker:
    """DT-03: Fila assincrona compatível com Azure Service Bus + Worker com Retry e DLQ."""

    def __init__(self, max_attempts: int = 3):
        self.max_attempts = max_attempts
        self.connection_str = os.getenv('AZURE_SERVICE_BUS_CONNECTION_STRING', '').strip()
        self.queue_name = os.getenv('AZURE_SERVICE_BUS_QUEUE', 'doepet-alerts')
        self._queue: queue.Queue[dict[str, Any]] = queue.Queue()
        self._dlq: list[dict[str, Any]] = []
        self._processed_count = 0
        self._lock = threading.Lock()
        self._handler: Optional[Callable[[dict[str, Any]], None]] = None
        self._worker_started = False

    def set_handler(self, handler: Callable[[dict[str, Any]], None]) -> None:
        self._handler = handler
        if not self._worker_started and not self.connection_str:
            self._worker_started = True
            t = threading.Thread(target=self._run_loop, daemon=True, name='doepet-alert-worker')
            t.start()

    def enqueue(self, payload: dict[str, Any], correlation_id: str) -> dict[str, Any]:
        envelope = {
            'message_id': f'msg-{uuid.uuid4()}',
            'event_type': 'BloodNeedCreated',
            'correlation_id': correlation_id,
            'payload': payload,
            'attempts': 0,
            'created_at': time.time(),
        }

        if self.connection_str:
            try:
                from azure.servicebus import ServiceBusClient, ServiceBusMessage

                with ServiceBusClient.from_connection_string(self.connection_str) as client:
                    with client.get_queue_sender(queue_name=self.queue_name) as sender:
                        sender.send_messages(ServiceBusMessage(json.dumps(envelope)))
                return {'messageId': envelope['message_id'], 'broker': 'azure-service-bus', 'status': 'QUEUED'}
            except Exception as exc:
                envelope['broker_fallback_reason'] = str(exc)

        self._queue.put(envelope)
        return {'messageId': envelope['message_id'], 'broker': 'async-worker', 'status': 'QUEUED'}

    def _run_loop(self) -> None:
        while True:
            envelope = self._queue.get()
            try:
                self.process_envelope(envelope)
            finally:
                self._queue.task_done()

    def process_envelope(self, envelope: dict[str, Any]) -> bool:
        while envelope['attempts'] < self.max_attempts:
            envelope['attempts'] += 1
            try:
                if self._handler:
                    self._handler(envelope)
                with self._lock:
                    self._processed_count += 1
                return True
            except Exception as exc:
                envelope['last_error'] = str(exc)
                if envelope['attempts'] >= self.max_attempts:
                    with self._lock:
                        self._dlq.append({**envelope, 'status': 'DEAD_LETTERED'})
                    return False
                time.sleep(min(0.2 * envelope['attempts'], 1.0))
        return False

    def replay_dlq(self) -> int:
        with self._lock:
            items = list(self._dlq)
            self._dlq.clear()
        for item in items:
            item['attempts'] = 0
            self._queue.put(item)
        return len(items)

    def metrics(self) -> dict[str, Any]:
        with self._lock:
            return {
                'brokerMode': 'azure-service-bus' if self.connection_str else 'async-local-worker',
                'queueName': self.queue_name,
                'pendingCount': self._queue.qsize(),
                'processedCount': self._processed_count,
                'dlqCount': len(self._dlq),
                'dlqMessages': list(self._dlq[-20:]),
            }


_global_worker = AlertQueueWorker()


def enqueue_blood_need_alert(payload: dict[str, Any], correlation_id: str) -> dict[str, Any]:
    return _global_worker.enqueue(payload, correlation_id)


def get_queue_metrics() -> dict[str, Any]:
    return _global_worker.metrics()


def get_alert_worker() -> AlertQueueWorker:
    return _global_worker
