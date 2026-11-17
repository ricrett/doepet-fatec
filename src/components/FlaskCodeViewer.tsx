import React, { useState, useEffect, useCallback } from 'react';
import {
  Code2,
  Copy,
  Check,
  FileText,
  Database,
  Layers,
  Terminal,
  Folder,
  Activity,
  RefreshCw,
  ShieldCheck,
  Server,
} from 'lucide-react';
import { apiClient } from '../services/api';

interface FileEntry {
  path: string;
  category: 'CONFIG' | 'MODELS' | 'ROUTES' | 'SECURITY' | 'DATABASE' | 'DEVOPS';
  language: string;
  content: string;
}

export const FlaskCodeViewer: React.FC = () => {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [viewerTab, setViewerTab] = useState<'FILES' | 'DIAGNOSTICS'>('FILES');
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);
  const [queueData, setQueueData] = useState<Record<string, unknown> | null>(null);
  const [telemetryData, setTelemetryData] = useState<Record<string, unknown> | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [isRefreshingDiag, setIsRefreshingDiag] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setIsRefreshingDiag(true);
    setDiagError(null);
    try {
      const health = await apiClient.getHealth();
      setHealthData(health);
      try {
        const [queue, telemetry] = await Promise.all([
          apiClient.getQueueMetrics(),
          apiClient.getTelemetry(),
        ]);
        setQueueData(queue);
        setTelemetryData(telemetry);
      } catch {
        setQueueData(null);
        setTelemetryData(null);
      }
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Falha ao consultar diagnósticos da API.');
    } finally {
      setIsRefreshingDiag(false);
    }
  }, []);

  useEffect(() => {
    if (viewerTab === 'DIAGNOSTICS') {
      void loadDiagnostics();
    }
  }, [viewerTab, loadDiagnostics]);

  const files: FileEntry[] = [
    {
      path: 'drizzle/0001_initial_postgresql.sql',
      category: 'DATABASE',
      language: 'sql',
      content: `-- DT-02: DDL Físico PostgreSQL 16 (Azure Database for PostgreSQL / Alembic + Drizzle)
-- Constraints: saldo não negativo, validade 40 dias CPDA-1, hematócrito >= 37%

CREATE TABLE IF NOT EXISTS blood_inventories (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    especie especie_enum NOT NULL,
    tipo_sanguineo VARCHAR(80) NOT NULL,
    componente componente_enum NOT NULL DEFAULT 'SANGUE_TOTAL',
    volume_ml INTEGER NOT NULL DEFAULT 0,
    volume_minimo_alerta INTEGER NOT NULL DEFAULT 450,
    CONSTRAINT chk_volume_nao_negativo CHECK (volume_ml >= 0)
);

CREATE TABLE IF NOT EXISTS blood_bags (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES blood_inventories(id) ON DELETE CASCADE,
    lote_codigo VARCHAR(64) NOT NULL UNIQUE,
    volume_ml INTEGER NOT NULL,
    data_coleta DATE NOT NULL,
    data_validade DATE NOT NULL,
    status bag_status_enum NOT NULL DEFAULT 'DISPONIVEL',
    CONSTRAINT chk_bolsa_validade_40_dias CHECK (data_validade = (data_coleta + INTERVAL '40 days')::date)
);`
    },
    {
      path: 'doepet_flask_mysql/security/jwt_auth.py',
      category: 'SECURITY',
      language: 'python',
      content: `# DT-04: JWT RS256 (exp = 15 min) + Refresh Token em Cookie HttpOnly; SameSite=Lax
# Chaves gerenciadas via Azure Key Vault / Environment PEM (rotação sem downtime)

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from flask import request, g
from doepet_flask_mysql.security.key_vault import KeyVaultKeyProvider

ACCESS_TTL_SECONDS = 900  # 15 minutos
REFRESH_COOKIE_NAME = "doepet_refresh_token"

def issue_rs256_access_token(user_claims: dict) -> dict:
    provider = KeyVaultKeyProvider.from_env()
    now = datetime.now(timezone.utc)
    payload = {
        "iss": "doepet-auth",
        "aud": "doepet-api",
        "sub": str(user_claims["id"]),
        "email": user_claims["email"],
        "role": user_claims["role"],
        "institution_id": user_claims.get("institution_id"),
        "tutor_id": user_claims.get("tutor_id"),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ACCESS_TTL_SECONDS)).timestamp()),
    }
    token = jwt.encode(
        payload,
        provider.get_private_key_pem(),
        algorithm="RS256",
        headers={"kid": provider.key_id},
    )
    return {"access_token": token, "expires_in": ACCESS_TTL_SECONDS}`
    },
    {
      path: 'doepet_flask_mysql/messaging/service_bus.py',
      category: 'ROUTES',
      language: 'python',
      content: `# DT-03: Desacoplamento Assíncrono via Azure Service Bus + Worker com Retry e DLQ
# O endpoint /api/v1/needs apenas persiste e enfileira (< 50ms) sem bloquear no push

import os
import json
import time

class AlertQueueAdapter:
    def __init__(self):
        self.connection_str = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING", "")
        self.queue_name = os.getenv("AZURE_SERVICE_BUS_QUEUE", "doepet-alerts")
        self.dlq = []

    def publish_need_alert(self, need_payload: dict, correlation_id: str) -> dict:
        envelope = {
            "event": "BloodNeedCreated",
            "correlation_id": correlation_id,
            "payload": need_payload,
            "attempt": 0,
        }
        if self.connection_str:
            # Envio para Azure Service Bus SDK quando provisionado
            from azure.servicebus import ServiceBusClient, ServiceBusMessage
            with ServiceBusClient.from_connection_string(self.connection_str) as client:
                with client.get_queue_sender(queue_name=self.queue_name) as sender:
                    sender.send_messages(ServiceBusMessage(json.dumps(envelope)))
            return {"broker": "azure-service-bus", "status": "QUEUED"}
        return {"broker": "async-local-worker", "status": "QUEUED"}`
    },
    {
      path: 'doepet_flask_mysql/observability/telemetry.py',
      category: 'CONFIG',
      language: 'python',
      content: `# DT-05: Observabilidade Distribuída OpenTelemetry + W3C traceparent + X-Correlation-ID

import json
import logging
import uuid
from flask import g, request

def register_telemetry_hooks(app):
    @app.before_request
    def start_trace():
        g.correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        g.traceparent = request.headers.get(
            "traceparent",
            f"00-{uuid.uuid4().hex}-{uuid.uuid4().hex[:16]}-01",
        )

    @app.after_request
    def finalize_trace(response):
        response.headers["X-Correlation-ID"] = getattr(g, "correlation_id", "")
        response.headers["traceparent"] = getattr(g, "traceparent", "")
        logging.info(json.dumps({
            "service": "doepet-api",
            "method": request.method,
            "path": request.path,
            "status": response.status_code,
            "correlation_id": getattr(g, "correlation_id", ""),
        }))
        return response`
    },
    {
      path: 'doepet_flask_mysql/notifications/push_service.py',
      category: 'ROUTES',
      language: 'python',
      content: `# DT-06: Web Push (VAPID P-256 ECDSA) + FCM Bridge para tutores com pets compatíveis

import os
import json

class WebPushDispatcher:
    def __init__(self):
        self.vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "")
        self.vapid_subject = os.getenv("VAPID_SUBJECT", "mailto:alertas@doepet.com.br")

    def send_push(self, subscription_info: dict, title: str, body: str, url: str = "/"):
        if not self.vapid_private_key:
            return {"delivered": False, "channel": "sse-fallback"}
        from pywebpush import webpush
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=self.vapid_private_key,
            vapid_claims={"sub": self.vapid_subject},
        )
        return {"delivered": True, "channel": "web-push-vapid"}`
    },
    {
      path: 'docker-compose.yml',
      category: 'DEVOPS',
      language: 'yaml',
      content: `# Orquestração Full-Stack DoePet (PostgreSQL 16 + Flask Gunicorn API + Web SPA)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: doepet_db
      POSTGRES_USER: doepet
      POSTGRES_PASSWORD: \${SQL_PASSWORD:-doepet_dev_2026}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./doepet_flask_mysql/schema_postgres.sql:/docker-entrypoint-initdb.d/01_schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U doepet -d doepet_db"]
      interval: 5s
      retries: 5

  api:
    build:
      context: ./doepet_flask_mysql
      dockerfile: Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "5000:5000"`
    }
  ];

  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const activeFile = files[activeFileIndex];

  const handleCopy = (path: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="p-6 rounded-3xl border bg-gradient-to-r from-emerald-950/20 via-neutral-900/10 to-emerald-950/10 border-emerald-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-neutral-100">
              Arquitetura DoePet • DT-01 a DT-06 Resolvidas
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewerTab('FILES')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                viewerTab === 'FILES'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              Módulos &amp; Contratos
            </button>
            <button
              type="button"
              onClick={() => setViewerTab('DIAGNOSTICS')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                viewerTab === 'DIAGNOSTICS'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Diagnósticos Ao Vivo</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
          Visão exclusiva de engenharia: SPA desacoplada consumindo API REST <code className="font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded text-emerald-600">/api/v1/*</code>, persistência relacional PostgreSQL/Drizzle &amp; Alembic, autenticação RS256 + Cookie <code className="font-mono">HttpOnly</code>, fila assíncrona com DLQ, observabilidade <code className="font-mono">X-Correlation-ID</code>/<code className="font-mono">traceparent</code> e Web Push VAPID.
        </p>

        <div className="flex flex-wrap gap-2 text-[11px] pt-1">
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
            DT-01 REST /api/v1
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20">
            DT-02 PostgreSQL 16 + Drizzle/Alembic
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
            DT-03 Async Queue + DLQ
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20">
            DT-04 JWT RS256 + HttpOnly Cookie
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/20">
            DT-05 OpenTelemetry + Correlation-ID
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/20">
            DT-06 Service Worker + VAPID Web Push
          </span>
        </div>
      </div>

      {viewerTab === 'DIAGNOSTICS' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-600" />
              <span>Telemetria, Saúde e Fila de Mensageria (/api/v1/*)</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadDiagnostics()}
                disabled={isRefreshingDiag}
                className="px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-bold flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDiag ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
              {queueData && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiClient.replayDlq();
                    await loadDiagnostics();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
                >
                  Reprocessar DLQ
                </button>
              )}
            </div>
          </div>

          {diagError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600">
              {diagError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                <ShieldCheck className="w-4 h-4" />
                <span>GET /api/v1/health</span>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 text-neutral-200 font-mono text-[11px] overflow-x-auto max-h-72 overflow-y-auto">
                {JSON.stringify(healthData, null, 2)}
              </pre>
            </div>

            <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                <Terminal className="w-4 h-4" />
                <span>GET /api/v1/messaging/queue</span>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 text-neutral-200 font-mono text-[11px] overflow-x-auto max-h-72 overflow-y-auto">
                {queueData ? JSON.stringify(queueData, null, 2) : 'Faça login no app para inspecionar métricas da fila.'}
              </pre>
            </div>

            <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-600">
                <Activity className="w-4 h-4" />
                <span>GET /api/v1/observability/telemetry</span>
              </div>
              <pre className="p-3 rounded-xl bg-neutral-950 text-neutral-200 font-mono text-[11px] overflow-x-auto max-h-72 overflow-y-auto">
                {telemetryData ? JSON.stringify(telemetryData, null, 2) : 'Faça login no app para inspecionar traces OpenTelemetry.'}
              </pre>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* File List Tree */}
          <div className="p-4 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-2 py-1 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5" />
              <span>Arquivos da Arquitetura</span>
            </div>

            <div className="space-y-1">
              {files.map((file, idx) => (
                <button
                  key={file.path}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                    activeFileIndex === idx
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30'
                      : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {file.category === 'DATABASE' ? (
                      <Database className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    ) : file.category === 'MODELS' ? (
                      <Layers className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                    ) : file.category === 'ROUTES' ? (
                      <Terminal className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    )}
                    <span className="truncate">{file.path}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 uppercase font-mono">{file.language}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-500 px-2 space-y-2">
              <p className="font-bold text-neutral-700 dark:text-neutral-300">Execução Docker Compose:</p>
              <pre className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] overflow-x-auto text-emerald-600 dark:text-emerald-400">
                docker compose up --build
              </pre>
            </div>
          </div>

          {/* Code Content View */}
          <div className="lg:col-span-3 p-5 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-neutral-800 dark:text-neutral-200">
                  {activeFile.path}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                  {activeFile.category}
                </span>
              </div>

              <button
                onClick={() => handleCopy(activeFile.path, activeFile.content)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                {copiedPath === activeFile.path ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Código</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 rounded-2xl bg-neutral-950 text-neutral-200 font-mono text-xs overflow-x-auto leading-relaxed border border-neutral-800 max-h-[600px] overflow-y-auto">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
