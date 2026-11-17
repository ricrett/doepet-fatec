import os
from datetime import timedelta
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


def normalize_database_uri(raw_url: str) -> str:
    url = (raw_url or '').strip()
    if not url:
        return ''
    if url.startswith('postgres://'):
        return url.replace('postgres://', 'postgresql+psycopg2://', 1)
    if url.startswith('postgresql://'):
        return url.replace('postgresql://', 'postgresql+psycopg2://', 1)
    return url


def detect_engine_name(uri: str) -> str:
    lower = (uri or '').strip().lower()
    if lower.startswith('postgresql'):
        return 'postgresql'
    if lower.startswith('sqlite'):
        return 'sqlite'
    if lower.startswith('mysql'):
        return 'mysql'
    if '://' in lower:
        return lower.split('://', 1)[0]
    return 'unknown'


def build_database_uri() -> str:
    explicit_url = normalize_database_uri(os.getenv('DATABASE_URL', ''))
    if explicit_url:
        return explicit_url

    sql_host = os.getenv('SQL_HOST', os.getenv('PGHOST', 'localhost'))
    sql_port = os.getenv('SQL_PORT', os.getenv('PGPORT', '5432'))
    sql_db = os.getenv('SQL_DB_NAME', os.getenv('PGDATABASE', 'doepet_db'))
    sql_user = quote_plus(os.getenv('SQL_USER', os.getenv('PGUSER', 'doepet')))
    sql_pass = quote_plus(os.getenv('SQL_PASSWORD', os.getenv('PGPASSWORD', 'doepet_dev_2026')))
    ssl_mode = os.getenv('SQL_SSL', 'prefer')

    return f"postgresql+psycopg2://{sql_user}:{sql_pass}@{sql_host}:{sql_port}/{sql_db}?sslmode={ssl_mode}"


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

    # DT-04: JWT (15m) + Refresh Token Cookie HttpOnly; SameSite=Strict + Double-Submit CSRF + Azure Key Vault
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)
    JWT_REFRESH_SECRET_KEY = os.getenv('JWT_REFRESH_SECRET_KEY', SECRET_KEY)
    JWT_PREVIOUS_SECRET_KEY = os.getenv('JWT_PREVIOUS_SECRET_KEY', '')
    JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
    JWT_ISSUER = os.getenv('JWT_ISSUER', 'doepet-api')
    JWT_AUDIENCE = os.getenv('JWT_AUDIENCE', 'doepet-web-spa')
    JWT_ACCESS_TTL_SECONDS = int(os.getenv('JWT_ACCESS_TTL_SECONDS', '900'))
    JWT_REFRESH_TTL_SECONDS = int(os.getenv('JWT_REFRESH_TTL_SECONDS', '604800'))
    AUTH_COOKIE_SAMESITE = os.getenv('AUTH_COOKIE_SAMESITE', 'Strict')
    AUTH_COOKIE_SECURE = os.getenv('AUTH_COOKIE_SECURE', 'auto')
    AUTH_COOKIE_ACCESS_NAME = 'doepet_access_token'
    AUTH_COOKIE_REFRESH_NAME = 'doepet_refresh_token'
    AUTH_COOKIE_CSRF_NAME = 'doepet_csrf_token'
    AZURE_KEY_VAULT_URL = os.getenv('AZURE_KEY_VAULT_URL', '')
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=4)

    # DT-03: Azure Service Bus / Transactional Outbox
    AZURE_SERVICE_BUS_CONNECTION_STRING = os.getenv('AZURE_SERVICE_BUS_CONNECTION_STRING', '')
    AZURE_SERVICE_BUS_QUEUE = os.getenv('AZURE_SERVICE_BUS_QUEUE', 'doepet-alerts')
    OUTBOX_MAX_ATTEMPTS = int(os.getenv('OUTBOX_MAX_ATTEMPTS', '5'))
    ASYNC_WORKER_ENABLED = os.getenv('ASYNC_WORKER_ENABLED', 'false').lower() == 'true'
    ASYNC_WORKER_POLL_INTERVAL_SECONDS = float(os.getenv('ASYNC_WORKER_POLL_INTERVAL_SECONDS', '2.0'))

    # DT-05: Observabilidade OpenTelemetry
    OTEL_SERVICE_NAME = os.getenv('OTEL_SERVICE_NAME', 'doepet-flask-api')
    OTEL_EXPORTER_OTLP_ENDPOINT = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', '')
    OTEL_TRACE_RING_BUFFER_SIZE = int(os.getenv('OTEL_TRACE_RING_BUFFER_SIZE', '200'))
    APPLICATIONINSIGHTS_CONNECTION_STRING = os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING', '')

    # DT-06: Web Push VAPID / FCM
    PUSH_TRANSPORT_MODE = os.getenv('PUSH_TRANSPORT_MODE', 'live')
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
