import json
import logging
import os
import re
import time
import uuid
from collections import deque
from typing import Any
from flask import Flask, g, request

_logger = logging.getLogger('doepet.telemetry')
_recent_traces: deque[dict[str, Any]] = deque(maxlen=100)


def redact_pii(text: str) -> str:
    text = re.sub(r'\d{3}\.\d{3}\.\d{3}-\d{2}', '***.***.***-**', text)
    text = re.sub(r'([a-zA-Z0-9._%+-]{2})[a-zA-Z0-9._%+-]*@', r'\1***@', text)
    return text


def register_telemetry_hooks(app: Flask) -> None:
    service_name = os.getenv('OTEL_SERVICE_NAME', 'doepet-api')

    @app.before_request
    def _start_trace() -> None:
        corr_id = request.headers.get('X-Correlation-ID') or f'req-{uuid.uuid4()}'
        trace_id = uuid.uuid4().hex
        span_id = uuid.uuid4().hex[:16]
        traceparent = request.headers.get('traceparent') or f'00-{trace_id}-{span_id}-01'
        g.correlation_id = corr_id
        g.traceparent = traceparent
        g.request_start_ns = time.perf_counter_ns()

    @app.after_request
    def _finish_trace(response: Any) -> Any:
        corr_id = getattr(g, 'correlation_id', f'req-{uuid.uuid4()}')
        traceparent = getattr(g, 'traceparent', '')
        start_ns = getattr(g, 'request_start_ns', time.perf_counter_ns())
        duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000, 2)

        response.headers['X-Correlation-ID'] = corr_id
        if traceparent:
            response.headers['traceparent'] = traceparent

        entry = {
            'service': service_name,
            'method': request.method,
            'path': request.path,
            'status': response.status_code,
            'durationMs': duration_ms,
            'correlationId': corr_id,
            'traceparent': traceparent,
        }
        _recent_traces.appendleft(entry)
        _logger.info(redact_pii(json.dumps(entry)))
        return response


def get_telemetry_snapshot() -> dict[str, Any]:
    return {
        'service': os.getenv('OTEL_SERVICE_NAME', 'doepet-api'),
        'otlpConfigured': bool(os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', '').strip()),
        'recentSpans': list(_recent_traces)[:25],
    }
