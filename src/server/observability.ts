import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestTraceContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  actorId?: number;
  actorRole?: string;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  service: string;
  correlationId: string;
  traceId: string;
  spanId: string;
  event: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  actorId?: number;
  actorRole?: string;
  meta?: Record<string, unknown>;
}

const traceStorage = new AsyncLocalStorage<RequestTraceContext>();
const RECENT_LOGS_LIMIT = 150;
const recentLogs: StructuredLogEntry[] = [];

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'doepet-api';

export function getTraceContext(): RequestTraceContext {
  return (
    traceStorage.getStore() || {
      correlationId: `sys-${crypto.randomUUID()}`,
      traceId: crypto.randomBytes(16).toString('hex'),
      spanId: crypto.randomBytes(8).toString('hex'),
    }
  );
}

export function setTraceActor(actorId: number, actorRole: string): void {
  const ctx = traceStorage.getStore();
  if (ctx) {
    ctx.actorId = actorId;
    ctx.actorRole = actorRole;
  }
}

function redactSensitive(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redactSensitive);
  const sensitiveKeys = new Set([
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'privateKey',
    'secret',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (sensitiveKeys.has(key)) {
      out[key] = '[REDACTED]';
    } else if (key === 'cpf' && typeof val === 'string' && val.length >= 6) {
      out[key] = `***.***.${val.slice(-6)}`;
    } else if (val && typeof val === 'object') {
      out[key] = redactSensitive(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function emitStructuredLog(
  level: 'INFO' | 'WARN' | 'ERROR',
  event: string,
  meta?: Record<string, unknown>
): void {
  const ctx = getTraceContext();
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    correlationId: ctx.correlationId,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    event,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    meta: meta ? (redactSensitive(meta) as Record<string, unknown>) : undefined,
  };

  recentLogs.unshift(entry);
  if (recentLogs.length > RECENT_LOGS_LIMIT) {
    recentLogs.length = RECENT_LOGS_LIMIT;
  }

  // JSON structured stdout for Azure Monitor / Application Insights / Grafana Loki
  const line = JSON.stringify(entry);
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

async function exportSpanToOtlp(entry: StructuredLogEntry): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: SERVICE_NAME } }],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: entry.traceId,
                    spanId: entry.spanId,
                    name: `${entry.method || 'INTERNAL'} ${entry.path || entry.event}`,
                    startTimeUnixNano: String(Date.now() * 1_000_000),
                    endTimeUnixNano: String((Date.now() + (entry.durationMs || 1)) * 1_000_000),
                    attributes: [
                      { key: 'correlation_id', value: { stringValue: entry.correlationId } },
                      { key: 'http.status_code', value: { intValue: entry.statusCode || 200 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Non-blocking telemetry export
  }
}

export function parseTraceparent(header?: string): { traceId: string; spanId: string } {
  if (header) {
    const parts = header.split('-');
    if (parts.length === 4 && /^[0-9a-f]{32}$/i.test(parts[1])) {
      return {
        traceId: parts[1].toLowerCase(),
        spanId: crypto.randomBytes(8).toString('hex'),
      };
    }
  }
  return {
    traceId: crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex'),
  };
}

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId =
    (req.header('X-Correlation-ID') || req.header('x-correlation-id') || '').trim() ||
    `req-${crypto.randomUUID()}`;
  const { traceId, spanId } = parseTraceparent(req.header('traceparent') || undefined);
  const start = process.hrtime.bigint();

  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);

  traceStorage.run({ correlationId, traceId, spanId }, () => {
    res.on('finish', () => {
      if (!req.path.startsWith('/api/')) return;
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const ctx = getTraceContext();
      const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
      const entry: StructuredLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        service: SERVICE_NAME,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        event: 'http.request.completed',
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
      };
      recentLogs.unshift(entry);
      if (recentLogs.length > RECENT_LOGS_LIMIT) {
        recentLogs.length = RECENT_LOGS_LIMIT;
      }
      console.log(JSON.stringify(entry));
      void exportSpanToOtlp(entry);
    });
    next();
  });
}

export function getTelemetrySnapshot(): {
  service: string;
  otlpEndpointConfigured: boolean;
  recentLogs: StructuredLogEntry[];
} {
  return {
    service: SERVICE_NAME,
    otlpEndpointConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    recentLogs: recentLogs.slice(0, 60),
  };
}
