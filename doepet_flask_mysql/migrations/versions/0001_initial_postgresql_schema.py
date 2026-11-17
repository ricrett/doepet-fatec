"""Initial PostgreSQL schema with clinical constraints (DT-02)

Revision ID: 0001_initial_postgresql
Revises:
Create Date: 2026-10-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial_postgresql'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=32), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=128), nullable=False, unique=True),
        sa.Column('family_id', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        'blood_inventories',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('institution_id', sa.Integer(), nullable=False),
        sa.Column('especie', sa.String(length=16), nullable=False),
        sa.Column('tipo_sanguineo', sa.String(length=80), nullable=False),
        sa.Column('componente', sa.String(length=40), nullable=False),
        sa.Column('volume_ml', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('volume_minimo_alerta', sa.Integer(), nullable=False, server_default='450'),
        sa.CheckConstraint('volume_ml >= 0', name='chk_volume_nao_negativo'),
    )
    op.create_table(
        'blood_bags',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('inventory_id', sa.Integer(), sa.ForeignKey('blood_inventories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lote_codigo', sa.String(length=64), nullable=False, unique=True),
        sa.Column('volume_ml', sa.Integer(), nullable=False),
        sa.Column('data_coleta', sa.Date(), nullable=False),
        sa.Column('data_validade', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='DISPONIVEL'),
        sa.CheckConstraint('volume_ml > 0', name='chk_bolsa_volume_positivo'),
    )


def downgrade() -> None:
    op.drop_table('blood_bags')
    op.drop_table('blood_inventories')
    op.drop_table('refresh_tokens')
    op.drop_table('users')
