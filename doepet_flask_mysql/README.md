# DOEPET — Backend Python / Flask + PostgreSQL 15 + Alembic + Jinja2

Plataforma digital para gestão e mobilização de doadores de sangue animal.
Desenvolvido em conformidade estrita com o **Plano Executivo, Especificação de Requisitos e Arquitetura de Software**.

---

## 📌 Tecnologias Empregadas
- **Linguagem & Backend**: Python 3.11+ com Flask & Gunicorn
- **Banco de Dados Principal**: **PostgreSQL 15+** (`psycopg2-binary`) com pool SQLAlchemy (`pool_pre_ping=True`, `pool_size=10`, `max_overflow=20`)
- **Migrations & Versionamento**: **Alembic 1.13+** (`doepet_flask_mysql/migrations/`) integrado ao pipeline CI/CD e inicialização segura com `pg_advisory_lock`
- **ORM & Integridade**: Flask-SQLAlchemy 3.1+ com `CHECK` constraints (`volume_ml >= 0`, `volume_ml > 0` por bolsa, validade máxima de 40 dias CPDA-1) e `UNIQUE` constraints
- **Segurança & Compliance**: LGPD (Lei 13.709/2018), RBAC (`TUTOR`, `INSTITUTION_EMPLOYEE`, `INSTITUTION_ADMIN`), hashing seguro Werkzeug, e rastreabilidade ponta a ponta via `X-Correlation-ID`.

---

## 🚀 Como Executar Localmente com PostgreSQL + Alembic

### 1. Instalação de Dependências Python
```bash
pip install -r doepet_flask_mysql/requirements.txt
```

### 2. Variáveis de Ambiente
Configure no `.env` ou ambiente:
```ini
SECRET_KEY="sua-chave-super-secreta-lgpd"
USE_POSTGRES="true"
POSTGRES_HOST="127.0.0.1"
POSTGRES_PORT="5432"
POSTGRES_DB="doepet_db"
POSTGRES_USER="doepet"
POSTGRES_PASSWORD="sua_senha_postgres"
# Ou forneça diretamente:
# DATABASE_URL="postgresql+psycopg2://doepet:sua_senha_postgres@127.0.0.1:5432/doepet_db"
```

### 3. Executar Migrations (Alembic) e Carga Inicial Idempotente
```bash
# Aplicar todas as migrations até head
PYTHONPATH=. alembic -c doepet_flask_mysql/alembic.ini upgrade head

# Verificar ausência de drift entre models.py e PostgreSQL
PYTHONPATH=. alembic -c doepet_flask_mysql/alembic.ini check

# Popular dados iniciais idempotentes
PYTHONPATH=. python3 -m doepet_flask_mysql.seed
```

### 4. Inicialização do Servidor Flask (Standalone REST API v1 + SSR)
```bash
# Modo desenvolvimento
FLASK_PORT=5000 python3 -m doepet_flask_mysql.app

# Modo produção standalone (Gunicorn)
gunicorn --workers 2 --bind 0.0.0.0:5000 doepet_flask_mysql.wsgi:app
```
- Endpoints REST JSON desacoplados disponíveis em `/api/v1/*` (`health`, `auth/*`, `state`, `pets`, `inventory/*`, `needs`, `interests`, `appointments/*`, `vouchers/redeem`, `employees`, `tutor/export-lgpd`, `audit-logs`).

### 5. Testes Automatizados (`pytest`)
```bash
# Executa contra PostgreSQL quando TEST_DATABASE_URL / DATABASE_URL está definida, ou SQLite temporário
PYTHONPATH=. pytest -v doepet_flask_mysql/tests/test_api_v1.py
```

---

## 🏗️ Estrutura de Diretórios
```
doepet_flask_mysql/
├── alembic.ini                # Configuração Alembic
├── migrations/
│   ├── env.py                 # Environment Alembic vinculado a db.metadata + Config PostgreSQL
│   ├── script.py.mako         # Template de revisões
│   └── versions/
│       └── 20261113_0001_initial_postgresql_schema.py  # Schema inicial (16 tabelas + ENUMs + CHECKs)
├── migrations_runner.py       # Executor seguro com pg_advisory_lock no startup
├── app.py                     # Application Factory, CORS, X-Correlation-ID e Auto-Migration
├── config.py                  # URI SQLAlchemy (PostgreSQL primário, normalização postgres://, pool)
├── models.py                  # Modelos SQLAlchemy + Shared Enums + BloodBag (40 dias)
├── seed.py                    # Carga inicial idempotente com pg_advisory_lock
├── schema_postgres.sql        # DDL PostgreSQL de referência
├── wsgi.py                    # Entrypoint WSGI para Gunicorn
├── Dockerfile                 # Container standalone (alembic upgrade head + seed + gunicorn)
├── requirements.txt           # Dependências Python/Flask + psycopg2-binary + alembic
└── tests/
    └── test_api_v1.py         # Suíte de testes REST, migrations Alembic e regras RN04/RN12/RN15
```
