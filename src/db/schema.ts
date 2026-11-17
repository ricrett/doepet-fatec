import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_roles', [
  'TUTOR',
  'INSTITUTION_EMPLOYEE',
  'INSTITUTION_ADMIN',
  'PLATFORM_ADMIN',
]);

export const instStatusEnum = pgEnum('inst_status', ['PENDING', 'ACTIVE', 'SUSPENDED']);
export const petEspecieEnum = pgEnum('pet_especies', ['CANINA', 'FELINA']);
export const petSexoEnum = pgEnum('pet_sexo', ['MACHO', 'FEMEA']);
export const petStatusEnum = pgEnum('pet_status', [
  'APTO',
  'EM_ANALISE',
  'INAPTO_TEMPORARIO',
  'INAPTO_DEFINITIVO',
]);
export const bloodComponentEnum = pgEnum('blood_components', [
  'SANGUE_TOTAL',
  'CONCENTRADO_HEMACIAS',
  'PLASMA_FRESCO_CONGELADO',
  'CRIOPRECIPITADO',
]);
export const movementTypeEnum = pgEnum('movement_types', [
  'ENTRADA_DOACAO',
  'SAIDA_TRANSFUSAO',
  'SAIDA_VENCIMENTO',
  'AJUSTE_AUDITORIA',
]);
export const bagStatusEnum = pgEnum('bag_status', [
  'DISPONIVEL',
  'UTILIZADA',
  'DESCARTADA_VENCIMENTO',
]);
export const urgenciaLevelEnum = pgEnum('urgencia_level', ['CRITICA', 'ALTA', 'MODERADA']);
export const needStatusEnum = pgEnum('need_status', ['ACTIVE', 'FULFILLED', 'CANCELLED']);
export const canalTipoEnum = pgEnum('canal_tipo', ['PUSH', 'WHATSAPP', 'EMAIL']);
export const notifStatusEnum = pgEnum('notif_status', [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'OPENED',
  'DLQ',
]);
export const interestStatusEnum = pgEnum('interest_status', [
  'MANIFESTADO',
  'SELECIONADO_AGENDAMENTO',
  'CANCELADO_TUTOR',
  'DISPENSADO',
]);
export const appointmentStatusEnum = pgEnum('app_status', [
  'SCHEDULED',
  'CONFIRMED',
  'ATTENDED',
  'CANCELLED',
  'NO_SHOW',
]);
export const voucherStatusEnum = pgEnum('voucher_status', [
  'ATIVO',
  'RESGATADO',
  'EXPIRADO',
  'CANCELADO',
]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull(),
  nome: varchar('nome', { length: 255 }).notNull(),
  documento: varchar('documento', { length: 32 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const institutions = pgTable('institutions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  cnpj: varchar('cnpj', { length: 18 }).notNull().unique(),
  razaoSocial: varchar('razao_social', { length: 255 }).notNull(),
  nomeFantasia: varchar('nome_fantasia', { length: 255 }).notNull(),
  crmvResponsavel: varchar('crmv_responsavel', { length: 80 }).notNull(),
  telefone: varchar('telefone', { length: 25 }).notNull(),
  emailContato: varchar('email_contato', { length: 255 }).notNull(),
  cep: varchar('cep', { length: 10 }).default('01310-100').notNull(),
  endereco: varchar('endereco', { length: 255 }).default('Endereço institucional').notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  estado: varchar('estado', { length: 2 }).notNull(),
  capacidadeDiaria: integer('capacidade_diaria').default(10).notNull(),
  status: instStatusEnum('status').default('ACTIVE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const institutionEmployees = pgTable('institution_employees', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  institutionId: integer('institution_id')
    .references(() => institutions.id, { onDelete: 'cascade' })
    .notNull(),
  nome: varchar('nome', { length: 255 }).notNull(),
  cpf: varchar('cpf', { length: 14 }).notNull(),
  cargo: varchar('cargo', { length: 100 }).notNull(),
  crmv: varchar('crmv', { length: 30 }),
  email: varchar('email', { length: 255 }),
  isAdmin: boolean('is_admin').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tutors = pgTable('tutors', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  nome: varchar('nome', { length: 255 }).notNull(),
  cpf: varchar('cpf', { length: 14 }).notNull().unique(),
  telefone: varchar('telefone', { length: 25 }).notNull(),
  whatsapp: varchar('whatsapp', { length: 25 }),
  cep: varchar('cep', { length: 10 }).default('04077-000').notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  estado: varchar('estado', { length: 2 }).notNull(),
  bairro: varchar('bairro', { length: 100 }).notNull(),
  notifPush: boolean('notif_push').default(true).notNull(),
  lgpdAceito: boolean('lgpd_aceito').default(true).notNull(),
  lgpdVersao: varchar('lgpd_versao', { length: 20 }).default('v1.0-2026').notNull(),
  dataAceite: timestamp('data_aceite', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pets = pgTable('pets', {
  id: serial('id').primaryKey(),
  tutorId: integer('tutor_id')
    .references(() => tutors.id, { onDelete: 'cascade' })
    .notNull(),
  nome: varchar('nome', { length: 100 }).notNull(),
  especie: petEspecieEnum('especie').notNull(),
  raca: varchar('raca', { length: 100 }).notNull(),
  sexo: petSexoEnum('sexo').notNull(),
  idadeAnos: integer('idade_anos').default(1).notNull(),
  dataNascimento: date('data_nascimento'),
  pesoKg: numeric('peso_kg', { precision: 5, scale: 2 }).notNull(),
  tipoSanguineo: varchar('tipo_sanguineo', { length: 60 }).default('DESCONHECIDO').notNull(),
  castrado: boolean('castrado').default(true).notNull(),
  vacinadoEmDia: boolean('vacinado_em_dia').default(true).notNull(),
  vermifugadoEmDia: boolean('vermifugado_em_dia').default(true).notNull(),
  statusElegibilidade: petStatusEnum('status_elegibilidade').default('EM_ANALISE').notNull(),
  ultimaDoacaoEm: date('ultima_doacao_em'),
  observacoes: text('observacoes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bloodInventories = pgTable(
  'blood_inventories',
  {
    id: serial('id').primaryKey(),
    institutionId: integer('institution_id')
      .references(() => institutions.id, { onDelete: 'cascade' })
      .notNull(),
    especie: petEspecieEnum('especie').notNull(),
    tipoSanguineo: varchar('tipo_sanguineo', { length: 60 }).notNull(),
    componente: bloodComponentEnum('componente').default('SANGUE_TOTAL').notNull(),
    volumeMl: integer('volume_ml').default(0).notNull(),
    volumeMinimoAlerta: integer('volume_minimo_alerta').default(450).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('chk_volume_nao_negativo', sql`${table.volumeMl} >= 0`),
    uniqueIndex('uq_inst_esp_tipo_comp').on(
      table.institutionId,
      table.especie,
      table.tipoSanguineo,
      table.componente
    ),
  ]
);

export const bloodBags = pgTable(
  'blood_bags',
  {
    id: serial('id').primaryKey(),
    inventoryId: integer('inventory_id')
      .references(() => bloodInventories.id, { onDelete: 'cascade' })
      .notNull(),
    loteCodigo: varchar('lote_codigo', { length: 60 }).notNull().unique(),
    volumeMl: integer('volume_ml').notNull(),
    dataColeta: date('data_coleta').notNull(),
    dataValidade: date('data_validade').notNull(),
    status: bagStatusEnum('status').default('DISPONIVEL').notNull(),
    doadorNome: varchar('doador_nome', { length: 100 }),
    responsavelCrmv: varchar('responsavel_crmv', { length: 60 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('chk_bolsa_validade_40_dias', sql`${table.dataValidade} <= (${table.dataColeta} + INTERVAL '40 days')`),
  ]
);

export const bloodInventoryMovements = pgTable('blood_inventory_movements', {
  id: serial('id').primaryKey(),
  inventoryId: integer('inventory_id')
    .references(() => bloodInventories.id, { onDelete: 'cascade' })
    .notNull(),
  tipoMovimento: movementTypeEnum('tipo_movimento').notNull(),
  volumeDeltaMl: integer('volume_delta_ml').notNull(),
  volumeAnteriorMl: integer('volume_anterior_ml').notNull(),
  volumePosteriorMl: integer('volume_posterior_ml').notNull(),
  motivo: varchar('motivo', { length: 255 }).notNull(),
  loteCodigo: varchar('lote_codigo', { length: 60 }),
  realizadoPor: varchar('realizado_por', { length: 120 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const bloodNeeds = pgTable('blood_needs', {
  id: serial('id').primaryKey(),
  institutionId: integer('institution_id')
    .references(() => institutions.id, { onDelete: 'cascade' })
    .notNull(),
  institutionNome: varchar('institution_nome', { length: 255 }).notNull(),
  especie: petEspecieEnum('especie').notNull(),
  tipoSanguineo: varchar('tipo_sanguineo', { length: 60 }).notNull(),
  volumeSolicitadoMl: integer('volume_solicitado_ml').notNull(),
  urgencia: urgenciaLevelEnum('urgencia').default('ALTA').notNull(),
  status: needStatusEnum('status').default('ACTIVE').notNull(),
  descricao: text('descricao').notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  notificadosCount: integer('notificados_count').default(0).notNull(),
  interessadosCount: integer('interessados_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const needNotifications = pgTable('need_notifications', {
  id: serial('id').primaryKey(),
  needId: integer('need_id')
    .references(() => bloodNeeds.id, { onDelete: 'cascade' })
    .notNull(),
  tutorId: integer('tutor_id')
    .references(() => tutors.id, { onDelete: 'cascade' })
    .notNull(),
  petId: integer('pet_id')
    .references(() => pets.id, { onDelete: 'cascade' })
    .notNull(),
  canal: canalTipoEnum('canal').default('PUSH').notNull(),
  status: notifStatusEnum('status').default('QUEUED').notNull(),
  tentativas: integer('tentativas').default(0).notNull(),
  mensagem: text('mensagem').notNull(),
  correlationId: varchar('correlation_id', { length: 100 }),
  errorDetail: text('error_detail'),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});

export const donorInterests = pgTable('donor_interests', {
  id: serial('id').primaryKey(),
  needId: integer('need_id')
    .references(() => bloodNeeds.id, { onDelete: 'cascade' })
    .notNull(),
  tutorId: integer('tutor_id')
    .references(() => tutors.id, { onDelete: 'cascade' })
    .notNull(),
  tutorNome: varchar('tutor_nome', { length: 255 }).notNull(),
  tutorTelefone: varchar('tutor_telefone', { length: 30 }).notNull(),
  petId: integer('pet_id')
    .references(() => pets.id, { onDelete: 'cascade' })
    .notNull(),
  petNome: varchar('pet_nome', { length: 100 }).notNull(),
  petEspecie: petEspecieEnum('pet_especie').notNull(),
  petPesoKg: numeric('pet_peso_kg', { precision: 5, scale: 2 }).notNull(),
  status: interestStatusEnum('status').default('MANIFESTADO').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  institutionId: integer('institution_id')
    .references(() => institutions.id, { onDelete: 'restrict' })
    .notNull(),
  tutorId: integer('tutor_id')
    .references(() => tutors.id, { onDelete: 'restrict' })
    .notNull(),
  tutorNome: varchar('tutor_nome', { length: 255 }).notNull(),
  petId: integer('pet_id')
    .references(() => pets.id, { onDelete: 'restrict' })
    .notNull(),
  petNome: varchar('pet_nome', { length: 100 }).notNull(),
  petEspecie: petEspecieEnum('pet_especie').notNull(),
  petPesoKg: numeric('pet_peso_kg', { precision: 5, scale: 2 }).notNull(),
  tipoSanguineo: varchar('tipo_sanguineo', { length: 60 }).notNull(),
  dataHora: varchar('data_hora', { length: 60 }).notNull(),
  slotCodigo: varchar('slot_codigo', { length: 60 }).notNull(),
  status: appointmentStatusEnum('status').default('SCHEDULED').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const donations = pgTable(
  'donations',
  {
    id: serial('id').primaryKey(),
    appointmentId: integer('appointment_id')
      .references(() => appointments.id, { onDelete: 'restrict' })
      .notNull()
      .unique(),
    institutionId: integer('institution_id')
      .references(() => institutions.id, { onDelete: 'restrict' })
      .notNull(),
    tutorId: integer('tutor_id')
      .references(() => tutors.id, { onDelete: 'restrict' })
      .notNull(),
    petId: integer('pet_id')
      .references(() => pets.id, { onDelete: 'restrict' })
      .notNull(),
    veterinarioCrmv: varchar('veterinario_crmv', { length: 60 }).notNull(),
    volumeColetadoMl: integer('volume_coletado_ml').notNull(),
    loteBolsa: varchar('lote_bolsa', { length: 60 }).notNull().unique(),
    dataValidadeBolsa: date('data_validade_bolsa').notNull(),
    tipoSanguineoConfirmado: varchar('tipo_sanguineo_confirmado', { length: 60 }).notNull(),
    hematocritoPreDoacao: numeric('hematocrito_pre_doacao', { precision: 4, scale: 1 }).notNull(),
    pesoAferidoKg: numeric('peso_aferido_kg', { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('chk_hematocrito_seguro', sql`${table.hematocritoPreDoacao} >= 37.0`)]
);

export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),
  donationId: integer('donation_id').notNull(),
  tutorId: integer('tutor_id')
    .references(() => tutors.id, { onDelete: 'restrict' })
    .notNull(),
  tutorNome: varchar('tutor_nome', { length: 255 }).notNull(),
  institutionId: integer('institution_id')
    .references(() => institutions.id, { onDelete: 'restrict' })
    .notNull(),
  institutionNome: varchar('institution_nome', { length: 255 }).notNull(),
  codigo: varchar('codigo', { length: 64 }).notNull().unique(),
  beneficioDescricao: varchar('beneficio_descricao', { length: 255 }).notNull(),
  dataValidade: varchar('data_validade', { length: 40 }).notNull(),
  status: voucherStatusEnum('status').default('ATIVO').notNull(),
  resgatadoEm: varchar('resgatado_em', { length: 60 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id'),
  actorType: varchar('actor_type', { length: 50 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 100 }).notNull(),
  correlationId: varchar('correlation_id', { length: 100 }).notNull(),
  beforeData: jsonb('before_data'),
  afterData: jsonb('after_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const privacyConsents = pgTable('privacy_consents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  versaoPolitica: varchar('versao_politica', { length: 20 }).default('v1.0-2026').notNull(),
  aceito: boolean('aceito').default(true).notNull(),
  dataAceite: timestamp('data_aceite', { withTimezone: true }).defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  familyId: varchar('family_id', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  tutorId: integer('tutor_id').references(() => tutors.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const idempotencyRecords = pgTable('idempotency_records', {
  id: serial('id').primaryKey(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
  endpoint: varchar('endpoint', { length: 160 }).notNull(),
  statusCode: integer('status_code').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
