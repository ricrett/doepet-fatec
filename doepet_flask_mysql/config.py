import os
from datetime import timedelta
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


def build_database_uri() -> str:
    explicit_url = os.getenv('DATABASE_URL', '').strip()
    if explicit_url:
        if explicit_url.startswith('postgres://'):
            return explicit_url.replace('postgres://', 'postgresql+psycopg://', 1)
        if explicit_url.startswith('postgresql://'):
            return explicit_url.replace('postgresql://', 'postgresql+psycopg://', 1)
        return explicit_url

    sql_host = os.getenv('SQL_HOST', os.getenv('PGHOST', 'localhost'))
    sql_port = os.getenv('SQL_PORT', os.getenv('PGPORT', '5432'))
    sql_db = os.getenv('SQL_DB_NAME', os.getenv('PGDATABASE', 'doepet_db'))
    sql_user = quote_plus(os.getenv('SQL_USER', os.getenv('PGUSER', 'doepet')))
    sql_pass = quote_plus(os.getenv('SQL_PASSWORD', os.getenv('PGPASSWORD', 'doepet_dev_2026')))
    ssl_mode = os.getenv('SQL_SSL', 'prefer')

    return f"postgresql+psycopg://{sql_user}:{sql_pass}@{sql_host}:{sql_port}/{sql_db}?sslmode={ssl_mode}"


class Config:
    """Configuracao Base da Aplicacao DoePet Flask (PostgreSQL + Azure Cloud Ready)"""

    SECRET_KEY = os.getenv('SECRET_KEY', 'doepet-super-secret-key-lgpd-2026-safe')

    # DT-02: PostgreSQL Principal (Azure Database for PostgreSQL Flexible Server)
    SQLALCHEMY_DATABASE_URI = build_database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_recycle': 280,
        'pool_pre_ping': True,
        'pool_size': 10,
        'max_overflow': 20,
    }

    # DT-04: JWT RS256 (15m) + Refresh Token Cookie HttpOnly; SameSite=Lax + Azure Key Vault
    JWT_ACCESS_TTL_SECONDS = int(os.getenv('JWT_ACCESS_TTL_SECONDS', '900'))
    JWT_REFRESH_TTL_SECONDS = int(os.getenv('JWT_REFRESH_TTL_SECONDS', '604800'))
    AZURE_KEY_VAULT_URL = os.getenv('AZURE_KEY_VAULT_URL', '')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=4)

    # DT-03: Azure Service Bus / Async Messaging
    AZURE_SERVICE_BUS_CONNECTION_STRING = os.getenv('AZURE_SERVICE_BUS_CONNECTION_STRING', '')
    AZURE_SERVICE_BUS_QUEUE = os.getenv('AZURE_SERVICE_BUS_QUEUE', 'doepet-alerts')

    # DT-05: Observabilidade OpenTelemetry
    OTEL_SERVICE_NAME = os.getenv('OTEL_SERVICE_NAME', 'doepet-api')
    OTEL_EXPORTER_OTLP_ENDPOINT = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', '')

    # DT-06: Web Push VAPID / FCM
    VAPID_SUBJECT = os.getenv('VAPID_SUBJECT', 'mailto:alertas@doepet.com.br')
    VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY', '')
    VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY', '')
    FCM_SERVER_KEY = os.getenv('FCM_SERVER_KEY', '')

    # Regras Clinicas & LGPD (RN01-RN20)
    POLICY_VERSION = 'v1.0-2026'
    SHELF_LIFE_DAYS = 40
    MIN_HEMATOCRIT_PCT = 37.0
    MIN_DOG_WEIGHT_KG = 25.0
    MIN_CAT_WEIGHT_KG = 4.0
    DONATION_COOLDOWN_DAYS = 60
