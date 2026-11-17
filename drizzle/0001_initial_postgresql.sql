-- =============================================================================
-- DOEPET - Migration 0001: Schema Inicial PostgreSQL 16+ / Azure Flexible Server
-- DT-02: Persistencia Relacional, Constraints Transacionais, LGPD, JWT & Push
-- =============================================================================

CREATE TYPE user_roles AS ENUM ('TUTOR', 'INSTITUTION_EMPLOYEE', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN');
CREATE TYPE inst_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE pet_especies AS ENUM ('CANINA', 'FELINA');
CREATE TYPE pet_sexo AS ENUM ('MACHO', 'FEMEA');
CREATE TYPE pet_status AS ENUM ('APTO', 'EM_ANALISE', 'INAPTO_TEMPORARIO', 'INAPTO_DEFINITIVO');
CREATE TYPE blood_components AS ENUM ('SANGUE_TOTAL', 'CONCENTRADO_HEMACIAS', 'PLASMA_FRESCO_CONGELADO', 'CRIOPRECIPITADO');
CREATE TYPE movement_types AS ENUM ('ENTRADA_DOACAO', 'SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO', 'AJUSTE_AUDITORIA');
CREATE TYPE bag_status AS ENUM ('DISPONIVEL', 'UTILIZADA', 'DESCARTADA_VENCIMENTO');
CREATE TYPE urgencia_level AS ENUM ('CRITICA', 'ALTA', 'MODERADA');
CREATE TYPE need_status AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED');
CREATE TYPE canal_tipo AS ENUM ('PUSH', 'WHATSAPP', 'EMAIL');
CREATE TYPE notif_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPENED', 'DLQ');
CREATE TYPE interest_status AS ENUM ('MANIFESTADO', 'SELECIONADO_AGENDAMENTO', 'CANCELADO_TUTOR', 'DISPENSADO');
CREATE TYPE app_status AS ENUM ('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE voucher_status AS ENUM ('ATIVO', 'RESGATADO', 'EXPIRADO', 'CANCELADO');

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_roles NOT NULL,
  nome VARCHAR(255) NOT NULL,
  documento VARCHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  razao_social VARCHAR(255) NOT NULL,
  nome_fantasia VARCHAR(255) NOT NULL,
  crmv_responsavel VARCHAR(80) NOT NULL,
  telefone VARCHAR(25) NOT NULL,
  email_contato VARCHAR(255) NOT NULL,
  cep VARCHAR(10) NOT NULL DEFAULT '01310-100',
  endereco VARCHAR(255) NOT NULL DEFAULT 'Endereço institucional',
  cidade VARCHAR(100) NOT NULL,
  estado VARCHAR(2) NOT NULL,
  capacidade_diaria INTEGER NOT NULL DEFAULT 10,
  status inst_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS institution_employees (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) NOT NULL,
  cargo VARCHAR(100) NOT NULL,
  crmv VARCHAR(30),
  email VARCHAR(255),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tutors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) NOT NULL UNIQUE,
  telefone VARCHAR(25) NOT NULL,
  whatsapp VARCHAR(25),
  cep VARCHAR(10) NOT NULL DEFAULT '04077-000',
  cidade VARCHAR(100) NOT NULL,
  estado VARCHAR(2) NOT NULL,
  bairro VARCHAR(100) NOT NULL,
  notif_push BOOLEAN NOT NULL DEFAULT TRUE,
  lgpd_aceito BOOLEAN NOT NULL DEFAULT TRUE,
  lgpd_versao VARCHAR(20) NOT NULL DEFAULT 'v1.0-2026',
  data_aceite TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  especie pet_especies NOT NULL,
  raca VARCHAR(100) NOT NULL,
  sexo pet_sexo NOT NULL,
  idade_anos INTEGER NOT NULL DEFAULT 1,
  data_nascimento DATE,
  peso_kg NUMERIC(5, 2) NOT NULL,
  tipo_sanguineo VARCHAR(60) NOT NULL DEFAULT 'DESCONHECIDO',
  castrado BOOLEAN NOT NULL DEFAULT TRUE,
  vacinado_em_dia BOOLEAN NOT NULL DEFAULT TRUE,
  vermifugado_em_dia BOOLEAN NOT NULL DEFAULT TRUE,
  status_elegibilidade pet_status NOT NULL DEFAULT 'EM_ANALISE',
  ultima_doacao_em DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_inventories (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  especie pet_especies NOT NULL,
  tipo_sanguineo VARCHAR(60) NOT NULL,
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
  lote_codigo VARCHAR(60) NOT NULL UNIQUE,
  volume_ml INTEGER NOT NULL,
  data_coleta DATE NOT NULL,
  data_validade DATE NOT NULL,
  status bag_status NOT NULL DEFAULT 'DISPONIVEL',
  doador_nome VARCHAR(100),
  responsavel_crmv VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bolsa_validade_40_dias CHECK (data_validade <= (data_coleta + INTERVAL '40 days'))
);

CREATE TABLE IF NOT EXISTS blood_inventory_movements (
  id SERIAL PRIMARY KEY,
  inventory_id INTEGER NOT NULL REFERENCES blood_inventories(id) ON DELETE CASCADE,
  tipo_movimento movement_types NOT NULL,
  volume_delta_ml INTEGER NOT NULL,
  volume_anterior_ml INTEGER NOT NULL,
  volume_posterior_ml INTEGER NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  lote_codigo VARCHAR(60),
  realizado_por VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blood_needs (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  institution_nome VARCHAR(255) NOT NULL,
  especie pet_especies NOT NULL,
  tipo_sanguineo VARCHAR(60) NOT NULL,
  volume_solicitado_ml INTEGER NOT NULL,
  urgencia urgencia_level NOT NULL DEFAULT 'ALTA',
  status need_status NOT NULL DEFAULT 'ACTIVE',
  descricao TEXT NOT NULL,
  cidade VARCHAR(100) NOT NULL,
  notificados_count INTEGER NOT NULL DEFAULT 0,
  interessados_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS need_notifications (
  id SERIAL PRIMARY KEY,
  need_id INTEGER NOT NULL REFERENCES blood_needs(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  canal canal_tipo NOT NULL DEFAULT 'PUSH',
  status notif_status NOT NULL DEFAULT 'QUEUED',
  tentativas INTEGER NOT NULL DEFAULT 0,
  mensagem TEXT NOT NULL,
  correlation_id VARCHAR(100),
  error_detail TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donor_interests (
  id SERIAL PRIMARY KEY,
  need_id INTEGER NOT NULL REFERENCES blood_needs(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  tutor_nome VARCHAR(255) NOT NULL,
  tutor_telefone VARCHAR(30) NOT NULL,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  pet_nome VARCHAR(100) NOT NULL,
  pet_especie pet_especies NOT NULL,
  pet_peso_kg NUMERIC(5, 2) NOT NULL,
  status interest_status NOT NULL DEFAULT 'MANIFESTADO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
  tutor_nome VARCHAR(255) NOT NULL,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
  pet_nome VARCHAR(100) NOT NULL,
  pet_especie pet_especies NOT NULL,
  pet_peso_kg NUMERIC(5, 2) NOT NULL,
  tipo_sanguineo VARCHAR(60) NOT NULL,
  data_hora VARCHAR(60) NOT NULL,
  slot_codigo VARCHAR(60) NOT NULL,
  status app_status NOT NULL DEFAULT 'SCHEDULED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
  pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
  veterinario_crmv VARCHAR(60) NOT NULL,
  volume_coletado_ml INTEGER NOT NULL,
  lote_bolsa VARCHAR(60) NOT NULL UNIQUE,
  data_validade_bolsa DATE NOT NULL,
  tipo_sanguineo_confirmado VARCHAR(60) NOT NULL,
  hematocrito_pre_doacao NUMERIC(4, 1) NOT NULL,
  peso_aferido_kg NUMERIC(5, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_hematocrito_seguro CHECK (hematocrito_pre_doacao >= 37.0)
);

CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  donation_id INTEGER NOT NULL,
  tutor_id INTEGER NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
  tutor_nome VARCHAR(255) NOT NULL,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  institution_nome VARCHAR(255) NOT NULL,
  codigo VARCHAR(64) NOT NULL UNIQUE,
  beneficio_descricao VARCHAR(255) NOT NULL,
  data_validade VARCHAR(40) NOT NULL,
  status voucher_status NOT NULL DEFAULT 'ATIVO',
  resgatado_em VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER,
  actor_type VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100) NOT NULL,
  correlation_id VARCHAR(100) NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privacy_consents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  versao_politica VARCHAR(20) NOT NULL DEFAULT 'v1.0-2026',
  aceito BOOLEAN NOT NULL DEFAULT TRUE,
  data_aceite TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  family_id VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id INTEGER REFERENCES tutors(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id SERIAL PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  endpoint VARCHAR(160) NOT NULL,
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_corr ON audit_logs (correlation_id);
CREATE INDEX IF NOT EXISTS idx_blood_bags_exp ON blood_bags (data_validade, status);
CREATE INDEX IF NOT EXISTS idx_needs_active ON blood_needs (status, especie);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens (user_id);
