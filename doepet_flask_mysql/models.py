from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(
        db.Enum('TUTOR', 'INSTITUTION_EMPLOYEE', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN', name='user_roles'),
        nullable=False,
    )
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    tutor_profile = db.relationship('Tutor', backref='user', uselist=False, cascade='all, delete-orphan')
    employee_profile = db.relationship('InstitutionEmployee', backref='user', uselist=False, cascade='all, delete-orphan')
    institution = db.relationship('Institution', backref='admin_user', uselist=False)
    refresh_tokens = db.relationship('RefreshToken', backref='user', lazy=True, cascade='all, delete-orphan')
    push_subscriptions = db.relationship('PushSubscription', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class RefreshToken(db.Model):
    __tablename__ = 'refresh_tokens'
    __table_args__ = (
        db.UniqueConstraint('token_hash', name='uq_refresh_tokens_token_hash'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    jti = db.Column(db.String(64), unique=True, nullable=False, index=True)
    family_id = db.Column(db.String(64), nullable=False, index=True)
    token_hash = db.Column(db.String(128), nullable=False)
    parent_jti = db.Column(db.String(64), nullable=True)
    replaced_by_jti = db.Column(db.String(64), nullable=True)
    is_revoked = db.Column(db.Boolean, default=False, server_default=db.text('false'), nullable=False, index=True)
    revoked_reason = db.Column(db.String(120), nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    revoked_at = db.Column(db.DateTime, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)


class AlertOutboxMessage(db.Model):
    __tablename__ = 'alert_outbox_messages'
    __table_args__ = (
        db.UniqueConstraint('idempotency_key', name='uq_alert_outbox_idempotency_key'),
    )

    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    idempotency_key = db.Column(db.String(128), nullable=False)
    topic = db.Column(db.String(80), nullable=False, index=True)
    need_id = db.Column(db.Integer, db.ForeignKey('blood_needs.id'), nullable=True, index=True)
    payload = db.Column(db.JSON, nullable=False)
    transport = db.Column(
        db.String(40),
        default='POSTGRES_OUTBOX_WORKER',
        server_default=db.text("'POSTGRES_OUTBOX_WORKER'"),
        nullable=False,
    )
    status = db.Column(
        db.String(32),
        default='PENDING',
        server_default=db.text("'PENDING'"),
        nullable=False,
        index=True,
    )
    attempts = db.Column(db.Integer, default=0, server_default=db.text('0'), nullable=False)
    max_attempts = db.Column(db.Integer, default=5, server_default=db.text('5'), nullable=False)
    correlation_id = db.Column(db.String(100), nullable=False, index=True)
    traceparent = db.Column(db.String(128), nullable=True)
    trace_id = db.Column(db.String(64), nullable=True, index=True)
    broker_message_id = db.Column(db.String(128), nullable=True)
    last_error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    dispatched_at = db.Column(db.DateTime, nullable=True)
    next_retry_at = db.Column(db.DateTime, nullable=True, index=True)


class PushSubscription(db.Model):
    __tablename__ = 'push_subscriptions'
    __table_args__ = (
        db.UniqueConstraint('endpoint_hash', name='uq_push_subscriptions_endpoint_hash'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=True, index=True)
    channel = db.Column(db.String(20), nullable=False, index=True)
    endpoint = db.Column(db.String(512), nullable=True)
    p256dh_key = db.Column(db.String(255), nullable=True)
    auth_key = db.Column(db.String(128), nullable=True)
    fcm_token = db.Column(db.String(512), nullable=True)
    endpoint_hash = db.Column(db.String(64), nullable=False)
    device_label = db.Column(db.String(120), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, default=True, server_default=db.text('true'), nullable=False, index=True)
    last_error = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
    last_notified_at = db.Column(db.DateTime, nullable=True)


class Institution(db.Model):
    __tablename__ = 'institutions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    cnpj = db.Column(db.String(18), unique=True, nullable=False, index=True)
    razao_social = db.Column(db.String(255), nullable=False)
    nome_fantasia = db.Column(db.String(255), nullable=False)
    crmv_responsavel = db.Column(db.String(80), nullable=False)
    telefone = db.Column(db.String(20), nullable=False)
    email_contato = db.Column(db.String(255), nullable=False)
    cep = db.Column(db.String(10), nullable=False)
    endereco = db.Column(db.String(255), nullable=False)
    cidade = db.Column(db.String(100), nullable=False, index=True)
    estado = db.Column(db.String(2), nullable=False)
    capacidade_diaria = db.Column(db.Integer, default=10, nullable=False)
    status = db.Column(db.Enum('PENDING', 'ACTIVE', 'SUSPENDED', name='inst_status'), default='ACTIVE', nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    employees = db.relationship('InstitutionEmployee', backref='institution', lazy=True, cascade='all, delete-orphan')
    inventories = db.relationship('BloodInventory', backref='institution', lazy=True, cascade='all, delete-orphan')
    needs = db.relationship('BloodNeed', backref='institution', lazy=True, cascade='all, delete-orphan')
    appointments = db.relationship('Appointment', backref='institution', lazy=True)


class InstitutionEmployee(db.Model):
    __tablename__ = 'institution_employees'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    institution_id = db.Column(db.Integer, db.ForeignKey('institutions.id'), nullable=False, index=True)
    nome = db.Column(db.String(255), nullable=False)
    cpf = db.Column(db.String(14), nullable=False)
    cargo = db.Column(db.String(100), nullable=False)
    crmv = db.Column(db.String(30), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Tutor(db.Model):
    __tablename__ = 'tutors'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    nome = db.Column(db.String(255), nullable=False)
    cpf = db.Column(db.String(14), unique=True, nullable=False)
    telefone = db.Column(db.String(20), nullable=False)
    whatsapp = db.Column(db.String(20), nullable=True)
    cep = db.Column(db.String(10), nullable=False)
    cidade = db.Column(db.String(100), nullable=False, index=True)
    estado = db.Column(db.String(2), nullable=False)
    bairro = db.Column(db.String(100), nullable=False)
    notif_push = db.Column(db.Boolean, default=True, nullable=False)
    notif_whatsapp = db.Column(db.Boolean, default=True, nullable=False)
    lgpd_aceito = db.Column(db.Boolean, default=True, nullable=False)
    lgpd_versao = db.Column(db.String(20), default='v1.0-2026', nullable=False)
    data_aceite = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    pets = db.relationship('Pet', backref='tutor', lazy=True, cascade='all, delete-orphan')


class Pet(db.Model):
    __tablename__ = 'pets'
    id = db.Column(db.Integer, primary_key=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=False)
    nome = db.Column(db.String(100), nullable=False)
    especie = db.Column(db.Enum('CANINA', 'FELINA', name='pet_especies'), nullable=False, index=True)
    raca = db.Column(db.String(100), nullable=False)
    sexo = db.Column(db.Enum('MACHO', 'FEMEA', name='pet_sexo'), nullable=False)
    data_nascimento = db.Column(db.Date, nullable=False)
    peso_kg = db.Column(db.Numeric(5, 2), nullable=False)
    tipo_sanguineo = db.Column(db.String(60), default='DESCONHECIDO', nullable=False)
    castrado = db.Column(db.Boolean, default=True, nullable=False)
    vacinado_em_dia = db.Column(db.Boolean, default=True, nullable=False)
    vermifugado_em_dia = db.Column(db.Boolean, default=True, nullable=False)
    status_elegibilidade = db.Column(
        db.Enum('APTO', 'EM_ANALISE', 'INAPTO_TEMPORARIO', 'INAPTO_DEFINITIVO', name='pet_status'),
        default='EM_ANALISE',
        nullable=False,
        index=True,
    )
    ultima_doacao_em = db.Column(db.Date, nullable=True)
    observacoes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )


class BloodInventory(db.Model):
    __tablename__ = 'blood_inventories'
    __table_args__ = (
        db.CheckConstraint('volume_ml >= 0', name='chk_volume_nao_negativo'),
        db.UniqueConstraint('institution_id', 'especie', 'tipo_sanguineo', 'componente', name='uq_inst_esp_tipo_comp'),
    )

    id = db.Column(db.Integer, primary_key=True)
    institution_id = db.Column(db.Integer, db.ForeignKey('institutions.id'), nullable=False, index=True)
    especie = db.Column(db.Enum('CANINA', 'FELINA', name='pet_especies'), nullable=False)
    tipo_sanguineo = db.Column(db.String(60), nullable=False)
    componente = db.Column(
        db.Enum('SANGUE_TOTAL', 'CONCENTRADO_HEMACIAS', 'PLASMA_FRESCO_CONGELADO', 'CRIOPRECIPITADO', name='blood_components'),
        default='SANGUE_TOTAL',
        nullable=False,
    )
    volume_ml = db.Column(db.Integer, default=0, nullable=False)
    volume_minimo_alerta = db.Column(db.Integer, default=450, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    movements = db.relationship('BloodInventoryMovement', backref='inventory', lazy=True, cascade='all, delete-orphan')
    bags = db.relationship('BloodBag', backref='inventory', lazy=True, cascade='all, delete-orphan')


class BloodBag(db.Model):
    __tablename__ = 'blood_bags'
    __table_args__ = (
        db.CheckConstraint('volume_ml > 0', name='chk_bag_volume_positivo'),
    )

    id = db.Column(db.Integer, primary_key=True)
    inventory_id = db.Column(db.Integer, db.ForeignKey('blood_inventories.id'), nullable=False, index=True)
    lote_codigo = db.Column(db.String(64), unique=True, nullable=False, index=True)
    volume_ml = db.Column(db.Integer, nullable=False)
    data_coleta = db.Column(db.Date, nullable=False)
    data_validade = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(
        db.Enum('DISPONIVEL', 'UTILIZADA', 'DESCARTADA_VENCIMENTO', name='bag_status'),
        default='DISPONIVEL',
        nullable=False,
        index=True,
    )
    doador_nome = db.Column(db.String(100), nullable=True)
    responsavel_crmv = db.Column(db.String(60), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class BloodInventoryMovement(db.Model):
    __tablename__ = 'blood_inventory_movements'
    id = db.Column(db.Integer, primary_key=True)
    inventory_id = db.Column(db.Integer, db.ForeignKey('blood_inventories.id'), nullable=False, index=True)
    tipo_movimento = db.Column(
        db.Enum('ENTRADA_DOACAO', 'SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO', 'AJUSTE_AUDITORIA', name='movement_types'),
        nullable=False,
    )
    volume_delta_ml = db.Column(db.Integer, nullable=False)
    volume_anterior_ml = db.Column(db.Integer, nullable=False)
    volume_posterior_ml = db.Column(db.Integer, nullable=False)
    motivo = db.Column(db.String(255), nullable=False)
    lote_codigo = db.Column(db.String(50), nullable=True)
    realizado_por_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    realizado_por_nome = db.Column(db.String(120), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class BloodNeed(db.Model):
    __tablename__ = 'blood_needs'
    id = db.Column(db.Integer, primary_key=True)
    institution_id = db.Column(db.Integer, db.ForeignKey('institutions.id'), nullable=False)
    especie = db.Column(db.Enum('CANINA', 'FELINA', name='pet_especies'), nullable=False, index=True)
    tipo_sanguineo = db.Column(db.String(60), nullable=False)
    volume_solicitado_ml = db.Column(db.Integer, nullable=False)
    urgencia = db.Column(db.Enum('CRITICA', 'ALTA', 'MODERADA', name='urgencia_level'), default='ALTA', nullable=False)
    status = db.Column(db.Enum('ACTIVE', 'FULFILLED', 'CANCELLED', name='need_status'), default='ACTIVE', nullable=False, index=True)
    descricao = db.Column(db.Text, nullable=False)
    data_limite = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    notifications = db.relationship('NeedNotification', backref='need', lazy=True, cascade='all, delete-orphan')
    interests = db.relationship('DonorInterest', backref='need', lazy=True, cascade='all, delete-orphan')


class NeedNotification(db.Model):
    __tablename__ = 'need_notifications'
    id = db.Column(db.Integer, primary_key=True)
    need_id = db.Column(db.Integer, db.ForeignKey('blood_needs.id'), nullable=False)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=False, index=True)
    pet_id = db.Column(db.Integer, db.ForeignKey('pets.id'), nullable=False)
    canal = db.Column(db.Enum('PUSH', 'WHATSAPP', 'EMAIL', name='canal_tipo'), default='PUSH', nullable=False)
    status = db.Column(db.Enum('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPENED', name='notif_status'), default='SENT', nullable=False)
    tentativas = db.Column(db.Integer, default=1, nullable=False)
    mensagem = db.Column(db.Text, nullable=False)
    sent_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    opened_at = db.Column(db.DateTime, nullable=True)


class DonorInterest(db.Model):
    __tablename__ = 'donor_interests'
    __table_args__ = (
        db.UniqueConstraint('need_id', 'pet_id', name='uq_need_pet_interest'),
    )

    id = db.Column(db.Integer, primary_key=True)
    need_id = db.Column(db.Integer, db.ForeignKey('blood_needs.id'), nullable=False)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=False)
    pet_id = db.Column(db.Integer, db.ForeignKey('pets.id'), nullable=False)
    status = db.Column(
        db.Enum('MANIFESTADO', 'SELECIONADO_AGENDAMENTO', 'CANCELADO_TUTOR', 'DISPENSADO', name='interest_status'),
        default='MANIFESTADO',
        nullable=False,
    )
    observacao_tutor = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    pet = db.relationship('Pet', backref='interests')
    tutor = db.relationship('Tutor', backref='interests')


class Appointment(db.Model):
    __tablename__ = 'appointments'
    id = db.Column(db.Integer, primary_key=True)
    institution_id = db.Column(db.Integer, db.ForeignKey('institutions.id'), nullable=False)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=False)
    pet_id = db.Column(db.Integer, db.ForeignKey('pets.id'), nullable=False)
    need_id = db.Column(db.Integer, db.ForeignKey('blood_needs.id'), nullable=True)
    data_hora = db.Column(db.DateTime, nullable=False, index=True)
    data_hora_label = db.Column(db.String(100), nullable=True)
    slot_codigo = db.Column(db.String(50), nullable=False)
    status = db.Column(
        db.Enum('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW', name='app_status'),
        default='SCHEDULED',
        nullable=False,
    )
    motivo_cancelamento = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )

    tutor = db.relationship('Tutor', backref='appointments')
    pet = db.relationship('Pet', backref='appointments')
    donation = db.relationship('Donation', backref='appointment', uselist=False)


class Donation(db.Model):
    __tablename__ = 'donations'
    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointments.id'), unique=True, nullable=False)
    institution_id = db.Column(db.Integer, db.ForeignKey('institutions.id'), nullable=False, index=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=False)
    pet_id = db.Column(db.Integer, db.ForeignKey('pets.id'), nullable=False, index=True)
    veterinario_responsavel_crmv = db.Column(db.String(80), nullable=False)
    volume_coletado_ml = db.Column(db.Integer, nullable=False)
    lote_bolsa = db.Column(db.String(64), unique=True, nullable=False)
    data_validade_bolsa = db.Column(db.Date, nullable=False)
    tipo_sanguineo_confirmado = db.Column(db.String(60), nullable=False)
    hematocrito_pre_doacao = db.Column(db.Numeric(4, 1), nullable=False)
    peso_aferido_kg = db.Column(db.Numeric(5, 2), nullable=False)
    aprovado_triagem = db.Column(db.Boolean, default=True, nullable=False)
    observacoes_clinicas = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    voucher = db.relationship('Voucher', backref='donation', uselist=False)


class Voucher(db.Model):
    __tablename__ = 'vouchers'
    id = db.Column(db.Integer, primary_key=True)
    donation_id = db.Column(db.Integer, db.ForeignKey('donations.id'), nullable=True)
    tutor_id = db.Column(db.Integer, db.ForeignKey('tutors.id'), nullable=False, index=True)
    institution_id = db.Column(db.Integer, db.ForeignKey('institutions.id'), nullable=False)
    codigo = db.Column(db.String(64), unique=True, nullable=False, index=True)
    beneficio_descricao = db.Column(db.String(255), nullable=False)
    data_emissao = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    data_validade = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.Enum('ATIVO', 'RESGATADO', 'EXPIRADO', 'CANCELADO', name='voucher_status'), default='ATIVO', nullable=False)
    resgatado_em = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    tutor = db.relationship('Tutor', backref='vouchers')
    institution = db.relationship('Institution', backref='vouchers')


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.BigInteger().with_variant(db.Integer(), 'sqlite'), primary_key=True)
    actor_id = db.Column(db.Integer, nullable=True)
    actor_type = db.Column(db.String(50), nullable=False)
    action = db.Column(db.String(100), nullable=False, index=True)
    resource_type = db.Column(db.String(100), nullable=False)
    resource_id = db.Column(db.String(100), nullable=False)
    correlation_id = db.Column(db.String(100), nullable=False, index=True)
    trace_id = db.Column(db.String(64), nullable=True, index=True)
    before_data = db.Column(db.JSON, nullable=True)
    after_data = db.Column(db.JSON, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class PrivacyConsent(db.Model):
    __tablename__ = 'privacy_consents'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    versao_politica = db.Column(db.String(20), default='v1.0-2026', nullable=False)
    aceito = db.Column(db.Boolean, default=True, nullable=False)
    data_aceite = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
