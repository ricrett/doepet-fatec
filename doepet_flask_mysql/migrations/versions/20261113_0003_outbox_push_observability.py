"""Add alert_outbox_messages, push_subscriptions, and audit_logs.trace_id for DT-03, DT-05, DT-06

Revision ID: 0003_outbox_push_otel
Revises: 0002_jwt_refresh_tokens
Create Date: 2026-11-13 20:15:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0003_outbox_push_otel'
down_revision: Union[str, None] = '0002_jwt_refresh_tokens'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('trace_id', sa.String(length=64), nullable=True))
    op.create_index('ix_audit_logs_trace_id', 'audit_logs', ['trace_id'], unique=False)

    op.create_table(
        'alert_outbox_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('message_id', sa.String(length=64), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=False),
        sa.Column('topic', sa.String(length=80), nullable=False),
        sa.Column('need_id', sa.Integer(), sa.ForeignKey('blood_needs.id'), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=False),
        sa.Column('transport', sa.String(length=40), nullable=False, server_default=sa.text("'POSTGRES_OUTBOX_WORKER'")),
        sa.Column('status', sa.String(length=32), nullable=False, server_default=sa.text("'PENDING'")),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default=sa.text('5')),
        sa.Column('correlation_id', sa.String(length=100), nullable=False),
        sa.Column('traceparent', sa.String(length=128), nullable=True),
        sa.Column('trace_id', sa.String(length=64), nullable=True),
        sa.Column('broker_message_id', sa.String(length=128), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('dispatched_at', sa.DateTime(), nullable=True),
        sa.Column('next_retry_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('idempotency_key', name='uq_alert_outbox_idempotency_key'),
    )
    op.create_index('ix_alert_outbox_messages_message_id', 'alert_outbox_messages', ['message_id'], unique=True)
    op.create_index('ix_alert_outbox_messages_topic', 'alert_outbox_messages', ['topic'], unique=False)
    op.create_index('ix_alert_outbox_messages_need_id', 'alert_outbox_messages', ['need_id'], unique=False)
    op.create_index('ix_alert_outbox_messages_status', 'alert_outbox_messages', ['status'], unique=False)
    op.create_index('ix_alert_outbox_messages_correlation_id', 'alert_outbox_messages', ['correlation_id'], unique=False)
    op.create_index('ix_alert_outbox_messages_trace_id', 'alert_outbox_messages', ['trace_id'], unique=False)
    op.create_index('ix_alert_outbox_messages_next_retry_at', 'alert_outbox_messages', ['next_retry_at'], unique=False)

    op.create_table(
        'push_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=True),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('endpoint', sa.String(length=512), nullable=True),
        sa.Column('p256dh_key', sa.String(length=255), nullable=True),
        sa.Column('auth_key', sa.String(length=128), nullable=True),
        sa.Column('fcm_token', sa.String(length=512), nullable=True),
        sa.Column('endpoint_hash', sa.String(length=64), nullable=False),
        sa.Column('device_label', sa.String(length=120), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('last_error', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('last_notified_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('endpoint_hash', name='uq_push_subscriptions_endpoint_hash'),
    )
    op.create_index('ix_push_subscriptions_user_id', 'push_subscriptions', ['user_id'], unique=False)
    op.create_index('ix_push_subscriptions_tutor_id', 'push_subscriptions', ['tutor_id'], unique=False)
    op.create_index('ix_push_subscriptions_channel', 'push_subscriptions', ['channel'], unique=False)
    op.create_index('ix_push_subscriptions_is_active', 'push_subscriptions', ['is_active'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_push_subscriptions_is_active', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_channel', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_tutor_id', table_name='push_subscriptions')
    op.drop_index('ix_push_subscriptions_user_id', table_name='push_subscriptions')
    op.drop_table('push_subscriptions')

    op.drop_index('ix_alert_outbox_messages_next_retry_at', table_name='alert_outbox_messages')
    op.drop_index('ix_alert_outbox_messages_trace_id', table_name='alert_outbox_messages')
    op.drop_index('ix_alert_outbox_messages_correlation_id', table_name='alert_outbox_messages')
    op.drop_index('ix_alert_outbox_messages_status', table_name='alert_outbox_messages')
    op.drop_index('ix_alert_outbox_messages_need_id', table_name='alert_outbox_messages')
    op.drop_index('ix_alert_outbox_messages_topic', table_name='alert_outbox_messages')
    op.drop_index('ix_alert_outbox_messages_message_id', table_name='alert_outbox_messages')
    op.drop_table('alert_outbox_messages')

    op.drop_index('ix_audit_logs_trace_id', table_name='audit_logs')
    op.drop_column('audit_logs', 'trace_id')
