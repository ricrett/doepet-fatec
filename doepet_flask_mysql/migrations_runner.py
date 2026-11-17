import os
from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import text

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
ALEMBIC_INI_PATH = os.path.join(BASE_DIR, 'alembic.ini')
MIGRATIONS_DIR = os.path.join(BASE_DIR, 'migrations')

_MIGRATION_LOCK_KEY = 8421001


def build_alembic_config(database_url: str | None = None) -> AlembicConfig:
    cfg = AlembicConfig(ALEMBIC_INI_PATH)
    cfg.set_main_option('script_location', MIGRATIONS_DIR)
    if database_url:
        cfg.set_main_option('sqlalchemy.url', database_url)
    return cfg


def run_alembic_upgrade(db_engine, target_revision: str = 'head', database_url: str | None = None) -> None:
    """Executa Alembic migrations até head com advisory lock no PostgreSQL para evitar race entre workers."""
    cfg = build_alembic_config(database_url=database_url)
    is_pg = db_engine.dialect.name == 'postgresql'

    with db_engine.connect() as connection:
        if is_pg:
            connection.execute(text('SELECT pg_advisory_lock(:lock_id)'), {'lock_id': _MIGRATION_LOCK_KEY})
            connection.commit()
        try:
            cfg.attributes['connection'] = connection
            command.upgrade(cfg, target_revision)
        finally:
            if is_pg:
                try:
                    connection.rollback()
                except Exception:
                    pass
                connection.execute(text('SELECT pg_advisory_unlock(:lock_id)'), {'lock_id': _MIGRATION_LOCK_KEY})
                connection.commit()
