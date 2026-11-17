-- =============================================================================
-- DOEPET - Banco de Dados Relacional PostgreSQL 16 (Azure Flexible Server)
-- DT-02: DDL Fisico completo com Constraints de Integridade & Auditoria LGPD
-- =============================================================================

CREATE TYPE user_roles AS ENUM ('TUTOR', 'INSTITUTION_EMPLOYEE', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN');
CREATE TYPE inst_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE pet_especies AS ENUM ('CANINA', 'FELINA');
CREATE TYPE pet_sexo AS ENUM ('MACHO', 'FEMEA');
CREATE TYPE pet_status AS ENUM ('APTO', 'EM_ANALISE', 'INAPTO_TEMPORARIO', 'INAPTO_DEFINITIVO');
CREATE TYPE blood_components AS ENUM ('SANGUE_TOTAL', 'CONCENTRADO_HEMACIAS', 'PLASMA_FRESCO_CONGELADO', 'CRIOPRECIPITADO');
CREATE TYPE bag_status AS ENUM ('DISPONIVEL', 'UTILIZADA', 'DESCARTADA_VENCIMENTO');
CREATE TYPE movement_types AS ENUM ('ENTRADA_DOACAO', 'SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO', 'AJUSTE_AUDITORIA');
CREATE TYPE urgencia_level AS ENUM ('CRITICA', 'ALTA', 'MODERADA');
CREATE TYPE need_status AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');
CREATE TYPE canal_tipo AS ENUM ('PUSH', 'WHATSAPP', 'EMAIL');
CREATE TYPE notif_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPENED');
CREATE TYPE interest_status AS ENUM ('MANIFESTADO', 'SELECIONADO_AGENDAMENTO', 'CANCELADO_TUTOR', 'DISPENSADO');
CREATE TYPE app_status AS ENUM ('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE voucher_status AS ENUM ('ATIVO', 'RESGATADO', 'EXPIRADO', 'CANCELADO');

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_roles NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    family_id VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS institutions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    cnpj VARCHAR(18) NOT NULL UNIQUE,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255) NOT NULL,
    crmv_responsavel VARCHAR(30) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email_contato VARCHAR(255) NOT NULL,
    cep VARCHAR(10) NOT NULL,
    endereco VARCHAR(255) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    estado CHAR(2) NOT NULL,
    capacidade_diaria INTEGER NOT NULL DEFAULT 10,
    status inst_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS institution_employees (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    crmv VARCHAR(30) NULL,
    email VARCHAR(255) NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tutors (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    telefone VARCHAR(20) NOT NULL,
    whatsapp VARCHAR(20) NULL,
    cep VARCHAR(10) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    estado CHAR(2) NOT NULL,
    bairro VARCHAR(100) NOT NULL,
    notif_push BOOLEAN NOT NULL DEFAULT TRUE,
    notif_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tutor_id INTEGER NULL REFERENCES tutors(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh VARCHAR(255) NOT NULL,
    auth_key VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY,
    tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    especie pet_especies NOT NULL,
    raca VARCHAR(100) NOT NULL,
    sexo pet_sexo NOT NULL,
    data_nascimento DATE NOT NULL,
    peso_kg NUMERIC(5,2) NOT NULL,
    tipo_sanguineo VARCHAR(60) NOT NULL DEFAULT 'DESCONHECIDO',
    castrado BOOLEAN NOT NULL DEFAULT TRUE,
    vacinado_em_dia BOOLEAN NOT NULL DEFAULT TRUE,
    vermifugado_em_dia BOOLEAN NOT NULL DEFAULT TRUE,
    status_elegibilidade pet_status NOT NULL DEFAULT 'EM_ANALISE',
    ultima_doacao_em DATE NULL,
    observacoes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_inventories (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    especie pet_especies NOT NULL,
    tipo_sanguineo VARCHAR(80) NOT NULL,
    componente blood_components NOT NULL DEFAULT 'SANGUE_TOTAL',
    volume_ml INTEGER NOT NULL DEFAULT 0,
    volume_minimo_alerta INTEGER NOT NULL DEFAULT 450,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_volume_nao_negativo CHECK (volume_ml >= 0),
    CONSTRAINT uq_inst_esp_tipo_comp UNIQUE (institution_id, especie, tipo_sanguineo, componente)
);

CREATE TABLE IF NOT EXISTS blood_bags (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES blood_inventories(id) ON DELETE CASCADE,
    lote_codigo VARCHAR(64) NOT NULL UNIQUE,
    volume_ml INTEGER NOT NULL,
    data_coleta DATE NOT NULL,
    data_validade DATE NOT NULL,
    status bag_status NOT NULL DEFAULT 'DISPONIVEL',
    doador_nome VARCHAR(100) NULL,
    responsavel_crmv VARCHAR(50) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bolsa_volume_positivo CHECK (volume_ml > 0),
    CONSTRAINT chk_bolsa_validade_40_dias CHECK (data_validade = (data_coleta + INTERVAL '40 days')::date)
);

CREATE TABLE IF NOT EXISTS blood_inventory_movements (
    id SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES blood_inventories(id) ON DELETE CASCADE,
    tipo_movimento movement_types NOT NULL,
    volume_delta_ml INTEGER NOT NULL,
    volume_anterior_ml INTEGER NOT NULL,
    volume_posterior_ml INTEGER NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    lote_codigo VARCHAR(50) NULL,
    realizado_por_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_needs (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    especie pet_especies NOT NULL,
    tipo_sanguineo VARCHAR(80) NOT NULL,
    volume_solicitado_ml INTEGER NOT NULL,
    urgencia urgencia_level NOT NULL DEFAULT 'ALTA',
    status need_status NOT NULL DEFAULT 'ACTIVE',
    descricao TEXT NOT NULL,
    data_limite TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS need_notifications (
    id SERIAL PRIMARY KEY,
    need_id INTEGER NOT NULL REFERENCES blood_needs(id) ON DELETE CASCADE,
    tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    canal canal_tipo NOT NULL DEFAULT 'PUSH',
    status notif_status NOT NULL DEFAULT 'SENT',
    tentativas INTEGER NOT NULL DEFAULT 1,
    mensagem TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS notification_dlq (
    id SERIAL PRIMARY KEY,
    message_id VARCHAR(64) NOT NULL UNIQUE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'DEAD_LETTERED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donor_interests (
    id SERIAL PRIMARY KEY,
    need_id INTEGER NOT NULL REFERENCES blood_needs(id) ON DELETE CASCADE,
    tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    status interest_status NOT NULL DEFAULT 'MANIFESTADO',
    observacao_tutor VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    need_id INTEGER NULL REFERENCES blood_needs(id) ON DELETE SET NULL,
    data_hora TIMESTAMPTZ NOT NULL,
    slot_codigo VARCHAR(50) NOT NULL,
    status app_status NOT NULL DEFAULT 'SCHEDULED',
    motivo_cancelamento VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
    pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    veterinario_responsavel_crmv VARCHAR(50) NOT NULL,
    volume_coletado_ml INTEGER NOT NULL,
    lote_bolsa VARCHAR(50) NOT NULL UNIQUE,
    data_validade_bolsa DATE NOT NULL,
    tipo_sanguineo_confirmado VARCHAR(80) NOT NULL,
    hematocrito_pre_doacao NUMERIC(4,1) NOT NULL,
    peso_aferido_kg NUMERIC(5,2) NOT NULL,
    aprovado_triagem BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes_clinicas TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_hematocrito_seguro CHECK (hematocrito_pre_doacao >= 37.0)
);

CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    donation_id INTEGER NOT NULL REFERENCES donations(id) ON DELETE RESTRICT,
    tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
    institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
    codigo VARCHAR(64) NOT NULL UNIQUE,
    beneficio_descricao VARCHAR(255) NOT NULL,
    data_emissao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_validade TIMESTAMPTZ NOT NULL,
    status voucher_status NOT NULL DEFAULT 'ATIVO',
    resgatado_em TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id INTEGER NULL,
    actor_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    before_data JSONB NULL,
    after_data JSONB NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privacy_consents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    versao_politica VARCHAR(20) NOT NULL DEFAULT 'v1.0-2026',
    aceito BOOLEAN NOT NULL DEFAULT TRUE,
    data_aceite TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS idempotency_records (
    id SERIAL PRIMARY KEY,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    endpoint VARCHAR(128) NOT NULL,
    status_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
