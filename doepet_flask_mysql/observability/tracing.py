from collections import deque
from datetime import datetime, timezone
import logging
import os
import threading
import uuid
from typing import Any, Optional, Sequence

from flask import Flask, g, request
from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SimpleSpanProcessor,
    SpanExporter,
    SpanExportResult,
)
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator


_PROPAGATOR = TraceContextTextMapPropagator()
_INIT_LOCK = threading.Lock()
_PROVIDER_INITIALIZED = False
_OTLP_ATTACHED = False
_INSTRUMENTED_ENGINE_IDS: set[int] = set()


class InMemoryRingSpanExporter(SpanExporter):
    """
    Armazena os spans OpenTelemetry mais recentes em ring buffer thread-safe
    para inspeção distribuída ponta a ponta e validação em testes automatizados.
    """

    def __init__(self, maxlen: int = 200) -> None:
        self._lock = threading.Lock()
        self._spans: deque[dict[str, Any]] = deque(maxlen=max(20, maxlen))

    def set_maxlen(self, maxlen: int) -> None:
        with self._lock:
            items = list(self._spans)[-max(20, maxlen):]
            self._spans = deque(items, maxlen=max(20, maxlen))

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        with self._lock:
            for span in spans:
                ctx = span.get_span_context()
                parent = span.parent
                start_ns = span.start_time or 0
                end_ns = span.end_time or start_ns
                attrs = dict(span.attributes or {})
                self._spans.append({
                    'name': span.name,
                    'traceId': format(ctx.trace_id, '032x') if ctx else None,
                    'spanId': format(ctx.span_id, '016x') if ctx else None,
                    'parentSpanId': format(parent.span_id, '016x') if parent else None,
                    'kind': str(span.kind.name) if span.kind else 'INTERNAL',
                    'status': str(span.status.status_code.name) if span.status else 'UNSET',
                    'durationMs': round((end_ns - start_ns) / 1_000_000.0, 3),
                    'correlationId': attrs.get('doepet.correlation_id'),
                    'attributes': {k: _safe_attr(v) for k, v in attrs.items()},
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                })
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        return None

    def get_spans(
        self,
        correlation_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self._spans)
        if correlation_id:
            items = [s for s in items if s.get('correlationId') == correlation_id]
        if trace_id:
            items = [s for s in items if s.get('traceId') == trace_id]
        return list(reversed(items))[:max(1, limit)]

    def clear(self) -> None:
        with self._lock:
            self._spans.clear()


def _safe_attr(val: Any) -> Any:
    if isinstance(val, (str, int, float, bool)) or val is None:
        return val
    return str(val)


_RING_EXPORTER = InMemoryRingSpanExporter(maxlen=200)


class _CorrelationLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.correlation_id = getattr(g, 'correlation_id', '-')
            record.trace_id = getattr(g, 'trace_id', '-')
            record.span_id = getattr(g, 'span_id', '-')
        except RuntimeError:
            span = trace.get_current_span()
            ctx = span.get_span_context() if span else None
            record.correlation_id = '-'
            record.trace_id = format(ctx.trace_id, '032x') if ctx and ctx.is_valid else '-'
            record.span_id = format(ctx.span_id, '016x') if ctx and ctx.is_valid else '-'
        return True


def _ensure_provider(service_name: str, otlp_endpoint: str, ring_size: int) -> None:
    global _PROVIDER_INITIALIZED, _OTLP_ATTACHED

    with _INIT_LOCK:
        _RING_EXPORTER.set_maxlen(ring_size)
        if not _PROVIDER_INITIALIZED:
            resource = Resource.create({
                SERVICE_NAME: service_name,
                'service.namespace': 'doepet',
                'deployment.environment': os.getenv('FLASK_ENV', 'production'),
            })
            provider = TracerProvider(resource=resource)
            provider.add_span_processor(SimpleSpanProcessor(_RING_EXPORTER))
            trace.set_tracer_provider(provider)
            _PROVIDER_INITIALIZED = True

            root_logger = logging.getLogger('doepet')
            if not any(isinstance(f, _CorrelationLogFilter) for f in root_logger.filters):
                root_logger.addFilter(_CorrelationLogFilter())

        if otlp_endpoint and not _OTLP_ATTACHED:
            provider = trace.get_tracer_provider()
            if isinstance(provider, TracerProvider):
                exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
                provider.add_span_processor(BatchSpanProcessor(exporter))
                _OTLP_ATTACHED = True


def configure_observability(app: Flask, db_obj: Any = None) -> None:
    """
    Inicializa OpenTelemetry (W3C TraceContext + OTLP + SQLAlchemy + Flask + X-Correlation-ID).
    """
    service_name = app.config.get('OTEL_SERVICE_NAME') or 'doepet-flask-api'
    otlp_endpoint = app.config.get('OTEL_EXPORTER_OTLP_ENDPOINT') or ''
    ring_size = int(app.config.get('OTEL_TRACE_RING_BUFFER_SIZE') or 200)

    _ensure_provider(service_name, otlp_endpoint, ring_size)

    if not getattr(app, '_doepet_otel_flask', False):
        FlaskInstrumentor().instrument_app(
            app,
            excluded_urls='static/.*',
        )
        app._doepet_otel_flask = True

    if db_obj is not None:
        with app.app_context():
            engine = db_obj.engine
            eng_id = id(engine)
            if eng_id not in _INSTRUMENTED_ENGINE_IDS:
                SQLAlchemyInstrumentor().instrument(engine=engine, enable_commenter=False)
                _INSTRUMENTED_ENGINE_IDS.add(eng_id)

    @app.before_request
    def _bind_trace_and_correlation():
        corr_id = (request.headers.get('X-Correlation-ID') or '').strip() or str(uuid.uuid4())
        g.correlation_id = corr_id

        span = trace.get_current_span()
        ctx = span.get_span_context() if span else None
        if not ctx or not ctx.is_valid:
            parent_ctx = _PROPAGATOR.extract(carrier=dict(request.headers))
            token = otel_context.attach(parent_ctx)
            g._otel_fallback_token = token
            span = trace.get_current_span()
            ctx = span.get_span_context() if span else None

        if span and span.is_recording():
            span.set_attribute('doepet.correlation_id', corr_id)
            span.set_attribute('http.target_path', request.path)

        if ctx and ctx.is_valid:
            trace_id_hex = format(ctx.trace_id, '032x')
            span_id_hex = format(ctx.span_id, '016x')
            g.trace_id = trace_id_hex
            g.span_id = span_id_hex
            g.traceparent = f"00-{trace_id_hex}-{span_id_hex}-01"
        else:
            g.trace_id = uuid.uuid4().hex
            g.span_id = uuid.uuid4().hex[:16]
            g.traceparent = f"00-{g.trace_id}-{g.span_id}-01"

    @app.after_request
    def _inject_response_trace_headers(response):
        response.headers['X-Correlation-ID'] = getattr(g, 'correlation_id', 'unknown')
        if getattr(g, 'trace_id', None):
            response.headers['X-Trace-ID'] = g.trace_id
        if getattr(g, 'traceparent', None):
            response.headers['traceparent'] = g.traceparent
        token = getattr(g, '_otel_fallback_token', None)
        if token is not None:
            otel_context.detach(token)
            g._otel_fallback_token = None
        return response


def get_tracer(name: str = 'doepet.api'):
    return trace.get_tracer(name)


def get_current_trace_headers() -> dict[str, str]:
    carrier: dict[str, str] = {}
    _PROPAGATOR.inject(carrier)
    span = trace.get_current_span()
    ctx = span.get_span_context() if span else None
    if ctx and ctx.is_valid:
        carrier.setdefault('traceparent', f"00-{format(ctx.trace_id, '032x')}-{format(ctx.span_id, '016x')}-01")
    return carrier


def inject_trace_headers(headers: dict[str, str]) -> dict[str, str]:
    _PROPAGATOR.inject(headers)
    return headers


def extract_context_from_traceparent(traceparent: Optional[str]):
    if not traceparent:
        return otel_context.get_current()
    return _PROPAGATOR.extract({'traceparent': traceparent})


def get_recent_spans(
    correlation_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    return _RING_EXPORTER.get_spans(correlation_id=correlation_id, trace_id=trace_id, limit=limit)


def clear_recorded_traces() -> None:
    _RING_EXPORTER.clear()


def get_observability_status(app_config: Optional[dict] = None) -> dict[str, Any]:
    cfg = app_config or {}
    return {
        'serviceName': cfg.get('OTEL_SERVICE_NAME', 'doepet-flask-api'),
        'w3cTraceContextEnabled': True,
        'otlpEndpointConfigured': bool(cfg.get('OTEL_EXPORTER_OTLP_ENDPOINT')),
        'azureAppInsightsConfigured': bool(cfg.get('APPLICATIONINSIGHTS_CONNECTION_STRING')),
        'bufferedSpansCount': len(_RING_EXPORTER.get_spans(limit=1000)),
    }
