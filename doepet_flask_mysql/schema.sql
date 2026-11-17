-- =============================================================================
-- DOEPET - Banco de Dados Relacional MySQL 8.0+
-- Arquitetura e Modelagem de Dados Conforme Especificação DoePet
-- Compliance: LGPD (Lei 13.709/2018), RBAC, Transacionalidade e Auditoria
-- =============================================================================

CREATE DATABASE IF NOT EXISTS doepet_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE doepet_db;

-- 1. TABELA DE USUÁRIOS (Identity & Auth)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('TUTOR', 'INSTITUTION_EMPLOYEE', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_email (email),
    INDEX idx_user_role (role)
) ENGINE=InnoDB;

-- 2. TABELA DE INSTITUIÇÕES (Clínicas Veterinárias & Bancos de Sangue)
-- Regra RN02: Cadastro ativo único para o mesmo CNPJ
CREATE TABLE IF NOT EXISTS institutions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
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
    capacidade_diaria INT NOT NULL DEFAULT 10,
    status ENUM('PENDING', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_inst_cnpj (cnpj),
    INDEX idx_inst_cidade (cidade)
) ENGINE=InnoDB;

-- 3. TABELA DE FUNCIONÁRIOS DA INSTITUIÇÃO
-- Regra RN03: Funcionários somente operam dados da instituição vinculada
CREATE TABLE IF NOT EXISTS institution_employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    institution_id INT NOT NULL,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(14) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    crmv VARCHAR(30) NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    INDEX idx_emp_inst (institution_id)
) ENGINE=InnoDB;

-- 4. TABELA DE TUTORES
CREATE TABLE IF NOT EXISTS tutors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tutor_cidade (cidade)
) ENGINE=InnoDB;

-- 5. TABELA DE ANIMAIS (POTENCIAIS DOADORES)
-- Regra RN05, RN16: Espécie obrigatória, aptidão prévia sujeita a triagem clínica
CREATE TABLE IF NOT EXISTS pets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tutor_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    especie ENUM('CANINA', 'FELINA') NOT NULL,
    raca VARCHAR(100) NOT NULL,
    sexo ENUM('MACHO', 'FEMEA') NOT NULL,
    data_nascimento DATE NOT NULL,
    peso_kg DECIMAL(5,2) NOT NULL,
    tipo_sanguineo VARCHAR(20) NOT NULL DEFAULT 'DESCONHECIDO',
    castrado BOOLEAN NOT NULL DEFAULT TRUE,
    vacinado_em_dia BOOLEAN NOT NULL DEFAULT TRUE,
    vermifugado_em_dia BOOLEAN NOT NULL DEFAULT TRUE,
    status_elegibilidade ENUM('APTO', 'EM_ANALISE', 'INAPTO_TEMPORARIO', 'INAPTO_DEFINITIVO') NOT NULL DEFAULT 'EM_ANALISE',
    ultima_doacao_em DATE NULL,
    observacoes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    INDEX idx_pet_especie (especie),
    INDEX idx_pet_elegibilidade (status_elegibilidade)
) ENGINE=InnoDB;

-- 6. TABELA DE ESTOQUE DE SANGUE
-- Regra RN04: Estoque não pode assumir volume negativo (CHECK constraint)
-- Regra RN05: Toda operação de estoque deve possuir espécie
CREATE TABLE IF NOT EXISTS blood_inventories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    especie ENUM('CANINA', 'FELINA') NOT NULL,
    tipo_sanguineo VARCHAR(20) NOT NULL,
    componente ENUM('SANGUE_TOTAL', 'CONCENTRADO_HEMACIAS', 'PLASMA_FRESCO_CONGELADO', 'CRIOPRECIPITADO') NOT NULL DEFAULT 'SANGUE_TOTAL',
    volume_ml INT NOT NULL DEFAULT 0,
    volume_minimo_alerta INT NOT NULL DEFAULT 450,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    CONSTRAINT chk_volume_nao_negativo CHECK (volume_ml >= 0),
    UNIQUE KEY uq_inst_esp_tipo_comp (institution_id, especie, tipo_sanguineo, componente),
    INDEX idx_stock_inst (institution_id)
) ENGINE=InnoDB;

-- 7. TABELA DE HISTÓRICO / MOVIMENTAÇÃO DE ESTOQUE
CREATE TABLE IF NOT EXISTS blood_inventory_movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NOT NULL,
    tipo_movimento ENUM('ENTRADA_DOACAO', 'SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO', 'AJUSTE_AUDITORIA') NOT NULL,
    volume_delta_ml INT NOT NULL,
    volume_anterior_ml INT NOT NULL,
    volume_posterior_ml INT NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    lote_codigo VARCHAR(50) NULL,
    realizado_por_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES blood_inventories(id) ON DELETE CASCADE,
    FOREIGN KEY (realizado_por_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_mov_inv (inventory_id)
) ENGINE=InnoDB;

-- 8. TABELA DE ALERTAS DE NECESSIDADE
-- Regra RN06: Alerta deve possuir instituição, espécie, necessidade e status
CREATE TABLE IF NOT EXISTS blood_needs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    especie ENUM('CANINA', 'FELINA') NOT NULL,
    tipo_sanguineo VARCHAR(20) NOT NULL,
    volume_solicitado_ml INT NOT NULL,
    urgencia ENUM('CRITICA', 'ALTA', 'MODERADA') NOT NULL DEFAULT 'ALTA',
    status ENUM('ACTIVE', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    descricao TEXT NOT NULL,
    data_limite DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
    INDEX idx_need_status (status),
    INDEX idx_need_especie (especie)
) ENGINE=InnoDB;

-- 9. TABELA DE NOTIFICAÇÕES AOS TUTORES ELEGÍVEIS
-- Regra RN07: Somente usuários elegíveis recebem determinado alerta
-- Regra RN18: Envio de notificação não significa visualização ou aceitação
CREATE TABLE IF NOT EXISTS need_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    need_id INT NOT NULL,
    tutor_id INT NOT NULL,
    pet_id INT NOT NULL,
    canal ENUM('PUSH', 'WHATSAPP', 'EMAIL') NOT NULL DEFAULT 'PUSH',
    status ENUM('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPENED') NOT NULL DEFAULT 'SENT',
    tentativas INT NOT NULL DEFAULT 1,
    mensagem TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    opened_at TIMESTAMP NULL,
    FOREIGN KEY (need_id) REFERENCES blood_needs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    INDEX idx_notif_tutor (tutor_id)
) ENGINE=InnoDB;

-- 10. TABELA DE MANIFESTAÇÃO DE INTERESSE DO TUTOR (US07)
CREATE TABLE IF NOT EXISTS donor_interests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    need_id INT NOT NULL,
    tutor_id INT NOT NULL,
    pet_id INT NOT NULL,
    status ENUM('MANIFESTADO', 'SELECIONADO_AGENDAMENTO', 'CANCELADO_TUTOR', 'DISPENSADO') NOT NULL DEFAULT 'MANIFESTADO',
    observacao_tutor VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (need_id) REFERENCES blood_needs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    UNIQUE KEY uq_need_pet_interest (need_id, pet_id)
) ENGINE=InnoDB;

-- 11. TABELA DE AGENDAMENTOS
-- Regra RN08: Não pode haver overbooking além da capacidade configurada
-- Regra RN20: Operações transacionais com locking
CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    institution_id INT NOT NULL,
    tutor_id INT NOT NULL,
    pet_id INT NOT NULL,
    need_id INT NULL,
    data_hora DATETIME NOT NULL,
    slot_codigo VARCHAR(50) NOT NULL,
    status ENUM('SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
    motivo_cancelamento VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE RESTRICT,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE RESTRICT,
    FOREIGN KEY (need_id) REFERENCES blood_needs(id) ON DELETE SET NULL,
    INDEX idx_app_inst_date (institution_id, data_hora)
) ENGINE=InnoDB;

-- 12. TABELA DE DOAÇÕES CONFIRMADAS
-- Regra RN09: Somente instituição autorizada confirma uma doação
-- Regra RN10, RN17: Doações confirmadas devem permanecer auditáveis
CREATE TABLE IF NOT EXISTS donations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL UNIQUE,
    institution_id INT NOT NULL,
    tutor_id INT NOT NULL,
    pet_id INT NOT NULL,
    veterinario_responsavel_crmv VARCHAR(50) NOT NULL,
    volume_coletado_ml INT NOT NULL,
    lote_bolsa VARCHAR(50) NOT NULL UNIQUE,
    data_coleta DATE NOT NULL,
    data_validade_bolsa DATE NOT NULL, -- Regra CPDA-1: Validade estrita máxima de 40 dias a partir da coleta
    tipo_sanguineo_confirmado VARCHAR(20) NOT NULL,
    hematocrito_pre_doacao DECIMAL(4,1) NOT NULL, -- Ex: 42.5%
    peso_aferido_kg DECIMAL(5,2) NOT NULL,
    aprovado_triagem BOOLEAN NOT NULL DEFAULT TRUE,
    observacoes_clinicas TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE RESTRICT,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE RESTRICT,
    CONSTRAINT chk_validade_40_dias CHECK (data_validade_bolsa <= DATE_ADD(data_coleta, INTERVAL 40 DAY)),
    INDEX idx_don_inst (institution_id),
    INDEX idx_don_pet (pet_id)
) ENGINE=InnoDB;

-- 12.1 TABELA DE BOLSAS INDIVIDUAIS DE ESTOQUE (RASTREAMENTO DE LOTES E VALIDADE)
-- Regra de qualidade veterinária: máximo 40 dias de estocagem sob refrigeração
CREATE TABLE IF NOT EXISTS blood_bags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NOT NULL,
    lote_codigo VARCHAR(50) NOT NULL UNIQUE,
    volume_ml INT NOT NULL,
    data_coleta DATE NOT NULL,
    data_validade DATE NOT NULL,
    status ENUM('DISPONIVEL', 'RESERVADO', 'TRANSFUNDIDO', 'DESCARTADO_VENCIDO') NOT NULL DEFAULT 'DISPONIVEL',
    doador_nome VARCHAR(100) NULL,
    responsavel_crmv VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inventory_id) REFERENCES blood_inventories(id) ON DELETE CASCADE,
    CONSTRAINT chk_bolsa_validade_40_dias CHECK (data_validade <= DATE_ADD(data_coleta, INTERVAL 40 DAY)),
    INDEX idx_bag_inv (inventory_id),
    INDEX idx_bag_validade (data_validade),
    INDEX idx_bag_status (status)
) ENGINE=InnoDB;

-- 13. TABELA DE VOUCHERS DE BENEFÍCIO
-- Regra RN11: Cada voucher possui código único
-- Regra RN12: Voucher expirado não pode ser utilizado
CREATE TABLE IF NOT EXISTS vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    donation_id INT NOT NULL,
    tutor_id INT NOT NULL,
    institution_id INT NOT NULL,
    codigo VARCHAR(64) NOT NULL UNIQUE,
    beneficio_descricao VARCHAR(255) NOT NULL,
    data_emissao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_validade DATETIME NOT NULL,
    status ENUM('ATIVO', 'RESGATADO', 'EXPIRADO', 'CANCELADO') NOT NULL DEFAULT 'ATIVO',
    resgatado_em DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donation_id) REFERENCES donations(id) ON DELETE RESTRICT,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE RESTRICT,
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT,
    INDEX idx_vouch_cod (codigo),
    INDEX idx_vouch_tutor (tutor_id)
) ENGINE=InnoDB;

-- 14. TABELA DE AUDITORIA (LGPD & Rastreabilidade)
-- Requisito 3.10: actor_id, actor_type, action, resource_type, resource_id, correlation_id
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_type VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    correlation_id VARCHAR(100) NOT NULL,
    before_data JSON NULL,
    after_data JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_corr (correlation_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_resource (resource_type, resource_id)
) ENGINE=InnoDB;

-- 15. TABELA DE CONSENTIMENTO LGPD (Termos de Privacidade e Proteção de Dados)
CREATE TABLE IF NOT EXISTS privacy_consents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    versao_politica VARCHAR(20) NOT NULL DEFAULT 'v1.0-2026',
    aceito BOOLEAN NOT NULL DEFAULT TRUE,
    data_aceite TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_consent_user (user_id)
) ENGINE=InnoDB;
