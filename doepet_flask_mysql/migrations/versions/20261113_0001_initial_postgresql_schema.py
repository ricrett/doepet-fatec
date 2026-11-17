"""Initial DoePet PostgreSQL schema (16 relational tables, enums & constraints)

Revision ID: 0001_initial_pg
Revises:
Create Date: 2026-11-13 19:40:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0001_initial_pg'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum(name: str, *values: str, create_type: bool = False) -> sa.Enum:
    return sa.Enum(*values, name=name, create_type=create_type)


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == 'postgresql'

    enum_defs = [
        sa.Enum('TUTOR', 'INSTITUTION_EMPLOYEE', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN', name='user_roles'),
        sa.Enum('PENDING', 'ACTIVE', 'SUSPENDED', name='inst_status'),
        sa.Enum('CANINA', 'FELINA', name='pet_especies'),
        sa.Enum('MACHO', 'FEMEA', name='pet_sexo'),
        sa.Enum('APTO', 'EM_ANALISE', 'INAPTO_TEMPORARIO', 'INAPTO_DEFINITIVO', name='pet_status'),
        sa.Enum('SANGUE_TOTAL', 'CONCENTRADO_HEMACIAS', 'PLASMA_FRESCO_CONGELADO', 'CRIOPRECIPITADO', name='blood_components'),
        sa.Enum('DISPONIVEL', 'UTILIZADA', 'DESCARTADA_VENCIMENTO', name='bag_status'),
        sa.Enum('ENTRADA_DOACAO', 'SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO', 'AJUSTE_AUDITORIA', name='movement_types'),
        sa.Enum('CRITICA', 'ALTA', 'MODERADA', name='urgencia_level'),
        sa.Enum('ACTIVE', 'FULFILLED', 'CANCELLED', name='need_status'),
        sa.Enum('PUSH', 'WHATSAPP', 'EMAIL', name='canal_tipo'),
        sa.Enum('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPENED', name='notif_status'),
        sa.Enum('MANIFESTADO', 'SELECIONADO_AGENDAMENTO', 'CANCELADO_TUTOR', 'DISPENSADO', name='interest_status'),
        sa.Enum('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW', name='app_status'),
        sa.Enum('ATIVO', 'RESGATADO', 'EXPIRADO', 'CANCELADO', name='voucher_status'),
    ]

    if is_pg:
        for enum_type in enum_defs:
            enum_type.create(bind, checkfirst=True)

    # 1. users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', _enum('user_roles', 'TUTOR', 'INSTITUTION_EMPLOYEE', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. institutions
    op.create_table(
        'institutions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('cnpj', sa.String(length=18), nullable=False),
        sa.Column('razao_social', sa.String(length=255), nullable=False),
        sa.Column('nome_fantasia', sa.String(length=255), nullable=False),
        sa.Column('crmv_responsavel', sa.String(length=80), nullable=False),
        sa.Column('telefone', sa.String(length=20), nullable=False),
        sa.Column('email_contato', sa.String(length=255), nullable=False),
        sa.Column('cep', sa.String(length=10), nullable=False),
        sa.Column('endereco', sa.String(length=255), nullable=False),
        sa.Column('cidade', sa.String(length=100), nullable=False),
        sa.Column('estado', sa.String(length=2), nullable=False),
        sa.Column('capacidade_diaria', sa.Integer(), nullable=False),
        sa.Column('status', _enum('inst_status', 'PENDING', 'ACTIVE', 'SUSPENDED'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_institutions_cnpj', 'institutions', ['cnpj'], unique=True)
    op.create_index('ix_institutions_cidade', 'institutions', ['cidade'], unique=False)

    # 3. institution_employees
    op.create_table(
        'institution_employees',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('nome', sa.String(length=255), nullable=False),
        sa.Column('cpf', sa.String(length=14), nullable=False),
        sa.Column('cargo', sa.String(length=100), nullable=False),
        sa.Column('crmv', sa.String(length=30), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('is_admin', sa.Boolean(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_institution_employees_institution_id', 'institution_employees', ['institution_id'], unique=False)

    # 4. tutors
    op.create_table(
        'tutors',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('nome', sa.String(length=255), nullable=False),
        sa.Column('cpf', sa.String(length=14), nullable=False, unique=True),
        sa.Column('telefone', sa.String(length=20), nullable=False),
        sa.Column('whatsapp', sa.String(length=20), nullable=True),
        sa.Column('cep', sa.String(length=10), nullable=False),
        sa.Column('cidade', sa.String(length=100), nullable=False),
        sa.Column('estado', sa.String(length=2), nullable=False),
        sa.Column('bairro', sa.String(length=100), nullable=False),
        sa.Column('notif_push', sa.Boolean(), nullable=False),
        sa.Column('notif_whatsapp', sa.Boolean(), nullable=False),
        sa.Column('lgpd_aceito', sa.Boolean(), nullable=False),
        sa.Column('lgpd_versao', sa.String(length=20), nullable=False),
        sa.Column('data_aceite', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_tutors_cidade', 'tutors', ['cidade'], unique=False)

    # 5. pets
    op.create_table(
        'pets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=False),
        sa.Column('nome', sa.String(length=100), nullable=False),
        sa.Column('especie', _enum('pet_especies', 'CANINA', 'FELINA'), nullable=False),
        sa.Column('raca', sa.String(length=100), nullable=False),
        sa.Column('sexo', _enum('pet_sexo', 'MACHO', 'FEMEA'), nullable=False),
        sa.Column('data_nascimento', sa.Date(), nullable=False),
        sa.Column('peso_kg', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('tipo_sanguineo', sa.String(length=60), nullable=False),
        sa.Column('castrado', sa.Boolean(), nullable=False),
        sa.Column('vacinado_em_dia', sa.Boolean(), nullable=False),
        sa.Column('vermifugado_em_dia', sa.Boolean(), nullable=False),
        sa.Column('status_elegibilidade', _enum('pet_status', 'APTO', 'EM_ANALISE', 'INAPTO_TEMPORARIO', 'INAPTO_DEFINITIVO'), nullable=False),
        sa.Column('ultima_doacao_em', sa.Date(), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_pets_especie', 'pets', ['especie'], unique=False)
    op.create_index('ix_pets_status_elegibilidade', 'pets', ['status_elegibilidade'], unique=False)

    # 6. blood_inventories (RN04: volume_ml >= 0)
    op.create_table(
        'blood_inventories',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('especie', _enum('pet_especies', 'CANINA', 'FELINA'), nullable=False),
        sa.Column('tipo_sanguineo', sa.String(length=60), nullable=False),
        sa.Column('componente', _enum('blood_components', 'SANGUE_TOTAL', 'CONCENTRADO_HEMACIAS', 'PLASMA_FRESCO_CONGELADO', 'CRIOPRECIPITADO'), nullable=False),
        sa.Column('volume_ml', sa.Integer(), nullable=False),
        sa.Column('volume_minimo_alerta', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint('volume_ml >= 0', name='chk_volume_nao_negativo'),
        sa.UniqueConstraint('institution_id', 'especie', 'tipo_sanguineo', 'componente', name='uq_inst_esp_tipo_comp'),
    )
    op.create_index('ix_blood_inventories_institution_id', 'blood_inventories', ['institution_id'], unique=False)

    # 7. blood_bags (CPDA-1: validade <= data_coleta + 40 dias)
    op.create_table(
        'blood_bags',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('inventory_id', sa.Integer(), sa.ForeignKey('blood_inventories.id'), nullable=False),
        sa.Column('lote_codigo', sa.String(length=64), nullable=False),
        sa.Column('volume_ml', sa.Integer(), nullable=False),
        sa.Column('data_coleta', sa.Date(), nullable=False),
        sa.Column('data_validade', sa.Date(), nullable=False),
        sa.Column('status', _enum('bag_status', 'DISPONIVEL', 'UTILIZADA', 'DESCARTADA_VENCIMENTO'), nullable=False),
        sa.Column('doador_nome', sa.String(length=100), nullable=True),
        sa.Column('responsavel_crmv', sa.String(length=60), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint('volume_ml > 0', name='chk_bag_volume_positivo'),
    )
    if is_pg:
        op.execute(
            "ALTER TABLE blood_bags ADD CONSTRAINT chk_bolsa_validade_40_dias "
            "CHECK (data_validade <= (data_coleta + INTERVAL '40 days')::date)"
        )
    op.create_index('ix_blood_bags_inventory_id', 'blood_bags', ['inventory_id'], unique=False)
    op.create_index('ix_blood_bags_lote_codigo', 'blood_bags', ['lote_codigo'], unique=True)
    op.create_index('ix_blood_bags_data_validade', 'blood_bags', ['data_validade'], unique=False)
    op.create_index('ix_blood_bags_status', 'blood_bags', ['status'], unique=False)

    # 8. blood_inventory_movements
    op.create_table(
        'blood_inventory_movements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('inventory_id', sa.Integer(), sa.ForeignKey('blood_inventories.id'), nullable=False),
        sa.Column('tipo_movimento', _enum('movement_types', 'ENTRADA_DOACAO', 'SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO', 'AJUSTE_AUDITORIA'), nullable=False),
        sa.Column('volume_delta_ml', sa.Integer(), nullable=False),
        sa.Column('volume_anterior_ml', sa.Integer(), nullable=False),
        sa.Column('volume_posterior_ml', sa.Integer(), nullable=False),
        sa.Column('motivo', sa.String(length=255), nullable=False),
        sa.Column('lote_codigo', sa.String(length=50), nullable=True),
        sa.Column('realizado_por_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('realizado_por_nome', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_blood_inventory_movements_inventory_id', 'blood_inventory_movements', ['inventory_id'], unique=False)

    # 9. blood_needs
    op.create_table(
        'blood_needs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('especie', _enum('pet_especies', 'CANINA', 'FELINA'), nullable=False),
        sa.Column('tipo_sanguineo', sa.String(length=60), nullable=False),
        sa.Column('volume_solicitado_ml', sa.Integer(), nullable=False),
        sa.Column('urgencia', _enum('urgencia_level', 'CRITICA', 'ALTA', 'MODERADA'), nullable=False),
        sa.Column('status', _enum('need_status', 'ACTIVE', 'FULFILLED', 'CANCELLED'), nullable=False),
        sa.Column('descricao', sa.Text(), nullable=False),
        sa.Column('data_limite', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_blood_needs_especie', 'blood_needs', ['especie'], unique=False)
    op.create_index('ix_blood_needs_status', 'blood_needs', ['status'], unique=False)

    # 10. need_notifications
    op.create_table(
        'need_notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('need_id', sa.Integer(), sa.ForeignKey('blood_needs.id'), nullable=False),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=False),
        sa.Column('pet_id', sa.Integer(), sa.ForeignKey('pets.id'), nullable=False),
        sa.Column('canal', _enum('canal_tipo', 'PUSH', 'WHATSAPP', 'EMAIL'), nullable=False),
        sa.Column('status', _enum('notif_status', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPENED'), nullable=False),
        sa.Column('tentativas', sa.Integer(), nullable=False),
        sa.Column('mensagem', sa.Text(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('opened_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_need_notifications_tutor_id', 'need_notifications', ['tutor_id'], unique=False)

    # 11. donor_interests
    op.create_table(
        'donor_interests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('need_id', sa.Integer(), sa.ForeignKey('blood_needs.id'), nullable=False),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=False),
        sa.Column('pet_id', sa.Integer(), sa.ForeignKey('pets.id'), nullable=False),
        sa.Column('status', _enum('interest_status', 'MANIFESTADO', 'SELECIONADO_AGENDAMENTO', 'CANCELADO_TUTOR', 'DISPENSADO'), nullable=False),
        sa.Column('observacao_tutor', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('need_id', 'pet_id', name='uq_need_pet_interest'),
    )

    # 12. appointments
    op.create_table(
        'appointments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=False),
        sa.Column('pet_id', sa.Integer(), sa.ForeignKey('pets.id'), nullable=False),
        sa.Column('need_id', sa.Integer(), sa.ForeignKey('blood_needs.id'), nullable=True),
        sa.Column('data_hora', sa.DateTime(), nullable=False),
        sa.Column('data_hora_label', sa.String(length=100), nullable=True),
        sa.Column('slot_codigo', sa.String(length=50), nullable=False),
        sa.Column('status', _enum('app_status', 'SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW'), nullable=False),
        sa.Column('motivo_cancelamento', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_appointments_data_hora', 'appointments', ['data_hora'], unique=False)

    # 13. donations
    op.create_table(
        'donations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('appointment_id', sa.Integer(), sa.ForeignKey('appointments.id'), nullable=False, unique=True),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=False),
        sa.Column('pet_id', sa.Integer(), sa.ForeignKey('pets.id'), nullable=False),
        sa.Column('veterinario_responsavel_crmv', sa.String(length=80), nullable=False),
        sa.Column('volume_coletado_ml', sa.Integer(), nullable=False),
        sa.Column('lote_bolsa', sa.String(length=64), nullable=False, unique=True),
        sa.Column('data_validade_bolsa', sa.Date(), nullable=False),
        sa.Column('tipo_sanguineo_confirmado', sa.String(length=60), nullable=False),
        sa.Column('hematocrito_pre_doacao', sa.Numeric(precision=4, scale=1), nullable=False),
        sa.Column('peso_aferido_kg', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('aprovado_triagem', sa.Boolean(), nullable=False),
        sa.Column('observacoes_clinicas', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_donations_institution_id', 'donations', ['institution_id'], unique=False)
    op.create_index('ix_donations_pet_id', 'donations', ['pet_id'], unique=False)

    # 14. vouchers
    op.create_table(
        'vouchers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('donation_id', sa.Integer(), sa.ForeignKey('donations.id'), nullable=True),
        sa.Column('tutor_id', sa.Integer(), sa.ForeignKey('tutors.id'), nullable=False),
        sa.Column('institution_id', sa.Integer(), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('codigo', sa.String(length=64), nullable=False),
        sa.Column('beneficio_descricao', sa.String(length=255), nullable=False),
        sa.Column('data_emissao', sa.DateTime(), nullable=True),
        sa.Column('data_validade', sa.DateTime(), nullable=False),
        sa.Column('status', _enum('voucher_status', 'ATIVO', 'RESGATADO', 'EXPIRADO', 'CANCELADO'), nullable=False),
        sa.Column('resgatado_em', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_vouchers_codigo', 'vouchers', ['codigo'], unique=True)
    op.create_index('ix_vouchers_tutor_id', 'vouchers', ['tutor_id'], unique=False)

    # 15. audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), primary_key=True),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('actor_type', sa.String(length=50), nullable=False),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('resource_type', sa.String(length=100), nullable=False),
        sa.Column('resource_id', sa.String(length=100), nullable=False),
        sa.Column('correlation_id', sa.String(length=100), nullable=False),
        sa.Column('before_data', sa.JSON(), nullable=True),
        sa.Column('after_data', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_audit_logs_action', 'audit_logs', ['action'], unique=False)
    op.create_index('ix_audit_logs_correlation_id', 'audit_logs', ['correlation_id'], unique=False)

    # 16. privacy_consents
    op.create_table(
        'privacy_consents',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('versao_politica', sa.String(length=20), nullable=False),
        sa.Column('aceito', sa.Boolean(), nullable=False),
        sa.Column('data_aceite', sa.DateTime(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
    )
    op.create_index('ix_privacy_consents_user_id', 'privacy_consents', ['user_id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == 'postgresql'

    op.drop_index('ix_privacy_consents_user_id', table_name='privacy_consents')
    op.drop_table('privacy_consents')

    op.drop_index('ix_audit_logs_correlation_id', table_name='audit_logs')
    op.drop_index('ix_audit_logs_action', table_name='audit_logs')
    op.drop_table('audit_logs')

    op.drop_index('ix_vouchers_tutor_id', table_name='vouchers')
    op.drop_index('ix_vouchers_codigo', table_name='vouchers')
    op.drop_table('vouchers')

    op.drop_index('ix_donations_pet_id', table_name='donations')
    op.drop_index('ix_donations_institution_id', table_name='donations')
    op.drop_table('donations')

    op.drop_index('ix_appointments_data_hora', table_name='appointments')
    op.drop_table('appointments')

    op.drop_table('donor_interests')

    op.drop_index('ix_need_notifications_tutor_id', table_name='need_notifications')
    op.drop_table('need_notifications')

    op.drop_index('ix_blood_needs_status', table_name='blood_needs')
    op.drop_index('ix_blood_needs_especie', table_name='blood_needs')
    op.drop_table('blood_needs')

    op.drop_index('ix_blood_inventory_movements_inventory_id', table_name='blood_inventory_movements')
    op.drop_table('blood_inventory_movements')

    op.drop_index('ix_blood_bags_status', table_name='blood_bags')
    op.drop_index('ix_blood_bags_data_validade', table_name='blood_bags')
    op.drop_index('ix_blood_bags_lote_codigo', table_name='blood_bags')
    op.drop_index('ix_blood_bags_inventory_id', table_name='blood_bags')
    op.drop_table('blood_bags')

    op.drop_index('ix_blood_inventories_institution_id', table_name='blood_inventories')
    op.drop_table('blood_inventories')

    op.drop_index('ix_pets_status_elegibilidade', table_name='pets')
    op.drop_index('ix_pets_especie', table_name='pets')
    op.drop_table('pets')

    op.drop_index('ix_tutors_cidade', table_name='tutors')
    op.drop_table('tutors')

    op.drop_index('ix_institution_employees_institution_id', table_name='institution_employees')
    op.drop_table('institution_employees')

    op.drop_index('ix_institutions_cidade', table_name='institutions')
    op.drop_index('ix_institutions_cnpj', table_name='institutions')
    op.drop_table('institutions')

    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')

    if is_pg:
        for enum_name in [
            'voucher_status', 'app_status', 'interest_status', 'notif_status',
            'canal_tipo', 'need_status', 'urgencia_level', 'movement_types',
            'bag_status', 'blood_components', 'pet_status', 'pet_sexo',
            'pet_especies', 'inst_status', 'user_roles',
        ]:
            sa.Enum(name=enum_name).drop(bind, checkfirst=True)
