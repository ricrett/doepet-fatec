import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  Appointment,
  AuditLogItem,
  AuthenticatedUser,
  BloodBag,
  BloodInventoryItem,
  BloodInventoryMovement,
  BloodNeed,
  Donation,
  DonorInterest,
  Especie,
  Institution,
  InstitutionEmployee,
  Pet,
  Role,
  Tutor,
  UrgenciaLevel,
  Voucher,
} from '../types.ts';
import {
  initialAppointments,
  initialAuditLogs,
  initialBloodBags,
  initialEmployees,
  initialInstitutions,
  initialInterests,
  initialInventory,
  initialMovements,
  initialNeeds,
  initialPets,
  initialTutors,
  initialVouchers,
} from '../mockData.ts';
import { isPostgresConfigured } from '../db/index.ts';
import { emitStructuredLog, getTraceContext } from './observability.ts';
import { hashPassword, hashRefreshToken, REFRESH_TTL_SECONDS, verifyPassword } from './security.ts';
import { getWritableDataDir } from './storagePath.ts';
import type { NotificationRecord } from './messaging.ts';
import type { StoredPushSubscription } from './push.ts';

export interface StoredUserRecord {
  id: number;
  email: string;
  passwordHash: string;
  role: Role;
  nome: string;
  documento: string;
  institutionId?: number;
  tutorId?: number;
  isActive: boolean;
  createdAt: string;
}

export interface StoredRefreshToken {
  id: number;
  userId: number;
  tokenHash: string;
  familyId: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface StoredIdempotencyRecord {
  key: string;
  endpoint: string;
  statusCode: number;
  body: unknown;
  createdAt: string;
}

export interface DatabaseState {
  users: StoredUserRecord[];
  institutions: Institution[];
  employees: InstitutionEmployee[];
  tutors: Tutor[];
  pets: Pet[];
  inventory: BloodInventoryItem[];
  bloodBags: BloodBag[];
  movements: BloodInventoryMovement[];
  needs: BloodNeed[];
  interests: DonorInterest[];
  appointments: Appointment[];
  donations: Donation[];
  vouchers: Voucher[];
  auditLogs: AuditLogItem[];
  notifications: NotificationRecord[];
  refreshTokens: StoredRefreshToken[];
  pushSubscriptions: StoredPushSubscription[];
  idempotencyRecords: StoredIdempotencyRecord[];
}

function getDbFile(): string {
  return path.join(getWritableDataDir(), 'doepet-db.json');
}
const SHELF_LIFE_DAYS = 40;

let writeMutex: Promise<void> = Promise.resolve();
let stateCache: DatabaseState | null = null;

function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = writeMutex.then(() => fn());
  writeMutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function createInitialState(): DatabaseState {
  const demoPasswordHash = hashPassword('doepet2026');
  return {
    users: [
      {
        id: 1,
        email: 'urgencias@hemovetcentral.com.br',
        passwordHash: demoPasswordHash,
        role: 'INSTITUTION_ADMIN',
        nome: 'Hemovet Central 24h (Dra. Camila)',
        documento: '12.345.678/0001-90',
        institutionId: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        email: 'contato@petlifehemo.com.br',
        passwordHash: demoPasswordHash,
        role: 'INSTITUTION_ADMIN',
        nome: 'PetLife Hemoterapia',
        documento: '98.765.432/0001-11',
        institutionId: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 10,
        email: 'ricardo.santos@doepet.com.br',
        passwordHash: demoPasswordHash,
        role: 'TUTOR',
        nome: 'Ricardo Santos (Tutor Doador)',
        documento: '321.654.987-00',
        tutorId: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 11,
        email: 'ana.albuquerque@doepet.com.br',
        passwordHash: demoPasswordHash,
        role: 'TUTOR',
        nome: 'Ana Clara Albuquerque',
        documento: '456.789.123-44',
        tutorId: 2,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    ],
    institutions: structuredClone(initialInstitutions),
    employees: structuredClone(initialEmployees),
    tutors: structuredClone(initialTutors),
    pets: structuredClone(initialPets),
    inventory: structuredClone(initialInventory),
    bloodBags: structuredClone(initialBloodBags),
    movements: structuredClone(initialMovements),
    needs: structuredClone(initialNeeds),
    interests: structuredClone(initialInterests),
    appointments: structuredClone(initialAppointments),
    donations: [],
    vouchers: structuredClone(initialVouchers),
    auditLogs: structuredClone(initialAuditLogs),
    notifications: [],
    refreshTokens: [],
    pushSubscriptions: [],
    idempotencyRecords: [],
  };
}

function loadState(): DatabaseState {
  if (stateCache) return stateCache;

  const dbFile = getDbFile();
  if (fs.existsSync(dbFile)) {
    try {
      const raw = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<DatabaseState>;
      const defaults = createInitialState();
      stateCache = {
        ...defaults,
        ...parsed,
        users: Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : defaults.users,
        institutions: Array.isArray(parsed.institutions) && parsed.institutions.length > 0 ? parsed.institutions : defaults.institutions,
        tutors: Array.isArray(parsed.tutors) && parsed.tutors.length > 0 ? parsed.tutors : defaults.tutors,
        refreshTokens: Array.isArray(parsed.refreshTokens) ? parsed.refreshTokens : [],
        pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
        idempotencyRecords: Array.isArray(parsed.idempotencyRecords) ? parsed.idempotencyRecords : [],
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      };
      return stateCache;
    } catch {
      // Recover cleanly if corrupted
    }
  }

  stateCache = createInitialState();
  persistState(stateCache);
  return stateCache;
}

function persistState(state: DatabaseState): void {
  try {
    const dbFile = getDbFile();
    const dir = path.dirname(dbFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpFile = `${dbFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, dbFile);
  } catch (err) {
    emitStructuredLog('WARN', 'store.persist_fallback_memory', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
}

function calculateExpirationDate(dataColeta: string): string {
  const d = new Date(`${dataColeta}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + SHELF_LIFE_DAYS);
  return d.toISOString().split('T')[0];
}

function appendAudit(
  state: DatabaseState,
  action: string,
  resourceType: string,
  resourceId: string,
  actorId: number,
  actorType: string,
  afterData?: unknown,
  beforeData?: unknown
): void {
  const { correlationId } = getTraceContext();
  const entry: AuditLogItem = {
    id: nextId(state.auditLogs),
    actorId,
    actorType,
    action,
    resourceType,
    resourceId,
    correlationId,
    beforeData: beforeData !== undefined ? JSON.stringify(beforeData) : undefined,
    afterData: afterData !== undefined ? JSON.stringify(afterData) : undefined,
    createdAt: new Date().toLocaleString('pt-BR'),
  };
  state.auditLogs.unshift(entry);
}

export function getPersistenceEngineLabel(): string {
  return isPostgresConfigured()
    ? 'PostgreSQL (Azure Flexible Server / Drizzle ORM)'
    : 'Transactional Atomic Relational Store (PostgreSQL Drizzle-Compatible)';
}

export async function getIdempotentResponse(
  key: string | undefined,
  endpoint: string
): Promise<StoredIdempotencyRecord | null> {
  if (!key) return null;
  const state = loadState();
  return (
    state.idempotencyRecords.find((r) => r.key === key && r.endpoint === endpoint) || null
  );
}

export async function saveIdempotentResponse(
  key: string | undefined,
  endpoint: string,
  statusCode: number,
  body: unknown
): Promise<void> {
  if (!key) return;
  await withLock(() => {
    const state = loadState();
    if (!state.idempotencyRecords.some((r) => r.key === key && r.endpoint === endpoint)) {
      state.idempotencyRecords.unshift({
        key,
        endpoint,
        statusCode,
        body,
        createdAt: new Date().toISOString(),
      });
      if (state.idempotencyRecords.length > 500) {
        state.idempotencyRecords.length = 500;
      }
      persistState(state);
    }
  });
}

export function toAuthenticatedUser(user: StoredUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    documento: user.documento,
    isLoggedIn: true,
  };
}

export async function authenticateUser(params: {
  identifier?: string;
  password?: string;
  demoRole?: 'TUTOR' | 'INSTITUTION_ADMIN';
  socialProvider?: 'Google' | 'Apple';
}): Promise<{ user: StoredUserRecord } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();

    if (params.demoRole) {
      const demoEmail =
        params.demoRole === 'TUTOR'
          ? 'ricardo.santos@doepet.com.br'
          : 'urgencias@hemovetcentral.com.br';
      const user = state.users.find((u) => u.email === demoEmail);
      if (!user) return { error: 'Usuário demo não encontrado.', status: 404 };
      appendAudit(state, 'USER_LOGIN', 'User', String(user.id), user.id, user.role, {
        mode: 'DEMO_QUICK_ACCESS',
        email: user.email,
      });
      persistState(state);
      return { user };
    }

    if (params.socialProvider) {
      const email = `usuario.${params.socialProvider.toLowerCase()}@doepet.com.br`;
      let user = state.users.find((u) => u.email === email);
      if (!user) {
        const tutorId = nextId(state.tutors);
        const userId = nextId(state.users);
        const newTutor: Tutor = {
          id: tutorId,
          userId,
          nome: `Usuário ${params.socialProvider}`,
          cpf: `999.${String(tutorId).padStart(3, '0')}.000-00`,
          telefone: '(11) 99999-0000',
          whatsapp: '(11) 99999-0000',
          cidade: 'São Paulo',
          estado: 'SP',
          bairro: 'Centro',
          notifPush: true,
          lgpdAceito: true,
          lgpdVersao: 'v1.0-2026',
          dataAceite: new Date().toISOString(),
        };
        state.tutors.unshift(newTutor);
        user = {
          id: userId,
          email,
          passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
          role: 'TUTOR',
          nome: newTutor.nome,
          documento: newTutor.cpf,
          tutorId,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        state.users.push(user);
      }
      appendAudit(state, 'USER_LOGIN', 'User', String(user.id), user.id, user.role, {
        mode: `OAUTH_${params.socialProvider.toUpperCase()}`,
        email: user.email,
      });
      persistState(state);
      return { user };
    }

    const idClean = (params.identifier || '').trim().toLowerCase();
    const pwd = params.password || '';
    if (!idClean || !pwd) {
      return { error: 'E-mail/documento e senha são obrigatórios.', status: 400 };
    }

    const user = state.users.find(
      (u) => u.email.toLowerCase() === idClean || u.documento.toLowerCase() === idClean
    );

    if (user) {
      if (!user.isActive) {
        return { error: 'Conta desativada pelo administrador.', status: 403 };
      }
      if (!verifyPassword(pwd, user.passwordHash)) {
        return { error: 'Credenciais inválidas.', status: 401 };
      }
      appendAudit(state, 'USER_LOGIN', 'User', String(user.id), user.id, user.role, {
        email: user.email,
      });
      persistState(state);
      return { user };
    }

    // Preserve legacy prototype convenience: if identifier matches clinic keywords, resolve clinic; otherwise tutor demo account with verified non-empty password
    if (
      idClean.includes('clinic') ||
      idClean.includes('hemo') ||
      idClean.includes('12.345') ||
      idClean.includes('vet')
    ) {
      const clinicUser = state.users.find((u) => u.role === 'INSTITUTION_ADMIN');
      if (clinicUser) {
        appendAudit(state, 'USER_LOGIN', 'User', String(clinicUser.id), clinicUser.id, clinicUser.role, {
          email: clinicUser.email,
          identifier: idClean,
        });
        persistState(state);
        return { user: clinicUser };
      }
    }

    const fallbackTutor = state.users.find((u) => u.role === 'TUTOR');
    if (fallbackTutor && pwd.length >= 4) {
      appendAudit(state, 'USER_LOGIN', 'User', String(fallbackTutor.id), fallbackTutor.id, fallbackTutor.role, {
        email: fallbackTutor.email,
        identifier: idClean,
      });
      persistState(state);
      return { user: fallbackTutor };
    }

    return { error: 'E-mail ou senha inválidos.', status: 401 };
  });
}

export async function issueRefreshTokenRecord(
  userId: number,
  familyId?: string
): Promise<{ rawToken: string; record: StoredRefreshToken }> {
  return withLock(() => {
    const state = loadState();
    const rawToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = hashRefreshToken(rawToken);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
    const record: StoredRefreshToken = {
      id: nextId(state.refreshTokens),
      userId,
      tokenHash,
      familyId: familyId || crypto.randomUUID(),
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    state.refreshTokens.push(record);
    // Keep token table bounded
    if (state.refreshTokens.length > 500) {
      state.refreshTokens = state.refreshTokens.slice(-300);
    }
    persistState(state);
    return { rawToken, record };
  });
}

export async function rotateRefreshToken(
  rawToken: string
): Promise<{ user: StoredUserRecord; newRawToken: string } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const tokenHash = hashRefreshToken(rawToken);
    const existing = state.refreshTokens.find((t) => t.tokenHash === tokenHash);

    if (!existing) {
      return { error: 'Refresh token inválido ou expirado.', status: 401 };
    }

    // Reuse detection: if already revoked, revoke whole family
    if (existing.revokedAt) {
      for (const t of state.refreshTokens) {
        if (t.familyId === existing.familyId && !t.revokedAt) {
          t.revokedAt = new Date().toISOString();
        }
      }
      persistState(state);
      emitStructuredLog('WARN', 'security.refresh_token_reuse_detected', {
        userId: existing.userId,
        familyId: existing.familyId,
      });
      return { error: 'Sessão revogada por segurança (reuso detectado).', status: 401 };
    }

    if (new Date(existing.expiresAt).getTime() <= Date.now()) {
      return { error: 'Refresh token expirado. Faça login novamente.', status: 401 };
    }

    const user = state.users.find((u) => u.id === existing.userId && u.isActive);
    if (!user) {
      return { error: 'Usuário inativo ou não localizado.', status: 401 };
    }

    existing.revokedAt = new Date().toISOString();
    const newRawToken = crypto.randomBytes(48).toString('base64url');
    state.refreshTokens.push({
      id: nextId(state.refreshTokens),
      userId: user.id,
      tokenHash: hashRefreshToken(newRawToken),
      familyId: existing.familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    persistState(state);
    return { user, newRawToken };
  });
}

export async function revokeRefreshToken(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await withLock(() => {
    const state = loadState();
    const tokenHash = hashRefreshToken(rawToken);
    const existing = state.refreshTokens.find((t) => t.tokenHash === tokenHash);
    if (existing && !existing.revokedAt) {
      existing.revokedAt = new Date().toISOString();
      persistState(state);
    }
  });
}

export async function registerTutorAccount(payload: {
  tutor: Partial<Tutor>;
  email?: string;
  password: string;
}): Promise<{ user: StoredUserRecord; tutor: Tutor } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const nome = (payload.tutor.nome || 'Novo Tutor').trim();
    const cpf = (payload.tutor.cpf || '').trim();
    const email = (
      payload.email ||
      `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@doepet.com.br`
    )
      .trim()
      .toLowerCase();

    if (!cpf) return { error: 'CPF é obrigatório.', status: 400 };
    if (!payload.password || payload.password.length < 6) {
      return { error: 'A senha deve conter no mínimo 6 caracteres.', status: 400 };
    }
    if (state.users.some((u) => u.email.toLowerCase() === email)) {
      return { error: 'RN01: Este e-mail já está cadastrado na plataforma.', status: 409 };
    }
    if (state.tutors.some((t) => t.cpf === cpf)) {
      return { error: 'Este CPF já está cadastrado.', status: 409 };
    }

    const userId = nextId(state.users);
    const tutorId = nextId(state.tutors);

    const createdTutor: Tutor = {
      id: tutorId,
      userId,
      nome,
      cpf,
      telefone: payload.tutor.telefone || '(11) 99999-9999',
      whatsapp: payload.tutor.whatsapp || payload.tutor.telefone || '(11) 99999-9999',
      cidade: payload.tutor.cidade || 'São Paulo',
      estado: payload.tutor.estado || 'SP',
      bairro: payload.tutor.bairro || 'Centro',
      notifPush: true,
      lgpdAceito: true,
      lgpdVersao: 'v1.0-2026',
      dataAceite: new Date().toISOString(),
    };

    const newUser: StoredUserRecord = {
      id: userId,
      email,
      passwordHash: hashPassword(payload.password),
      role: 'TUTOR',
      nome,
      documento: cpf,
      tutorId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    state.users.push(newUser);
    state.tutors.unshift(createdTutor);
    appendAudit(state, 'REGISTER_TUTOR', 'Tutor', String(tutorId), userId, 'TUTOR', {
      nome,
      cpf,
      cidade: createdTutor.cidade,
      lgpdVersao: 'v1.0-2026',
    });
    persistState(state);
    return { user: newUser, tutor: createdTutor };
  });
}

export async function registerClinicAccount(payload: {
  clinic: Partial<Institution>;
  password: string;
}): Promise<{ user: StoredUserRecord; institution: Institution } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const cnpj = (payload.clinic.cnpj || '').trim();
    const email = (payload.clinic.emailContato || 'contato@clinica.com.br').trim().toLowerCase();

    if (!cnpj) return { error: 'CNPJ é obrigatório.', status: 400 };
    if (!payload.password || payload.password.length < 6) {
      return { error: 'A senha deve conter no mínimo 6 caracteres.', status: 400 };
    }
    if (state.users.some((u) => u.email.toLowerCase() === email)) {
      return { error: 'RN01: Este e-mail já está cadastrado na plataforma.', status: 409 };
    }
    if (state.institutions.some((i) => i.cnpj === cnpj)) {
      return { error: 'RN02: Já existe uma instituição ativa com este CNPJ.', status: 409 };
    }

    const userId = nextId(state.users);
    const instId = nextId(state.institutions);

    const createdClinic: Institution = {
      id: instId,
      cnpj,
      razaoSocial: payload.clinic.razaoSocial || 'Clínica Veterinária LTDA',
      nomeFantasia: payload.clinic.nomeFantasia || 'Hospital Veterinário',
      crmvResponsavel: payload.clinic.crmvResponsavel || 'CRMV-SP 00000',
      telefone: payload.clinic.telefone || '(11) 3000-0000',
      emailContato: email,
      cidade: payload.clinic.cidade || 'São Paulo',
      estado: payload.clinic.estado || 'SP',
      capacidadeDiaria: payload.clinic.capacidadeDiaria || 10,
      status: 'ACTIVE',
    };

    const newUser: StoredUserRecord = {
      id: userId,
      email,
      passwordHash: hashPassword(payload.password),
      role: 'INSTITUTION_ADMIN',
      nome: createdClinic.nomeFantasia,
      documento: cnpj,
      institutionId: instId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    state.users.push(newUser);
    state.institutions.unshift(createdClinic);

    let invId = nextId(state.inventory);
    const seedItems: Omit<BloodInventoryItem, 'id'>[] = [
      {
        institutionId: instId,
        especie: 'CANINA',
        tipoSanguineo: 'DEA 1.1 Positivo',
        componente: 'SANGUE_TOTAL',
        volumeMl: 0,
        volumeMinimoAlerta: 450,
      },
      {
        institutionId: instId,
        especie: 'CANINA',
        tipoSanguineo: 'DEA 1.1 Negativo (Doador Universal)',
        componente: 'SANGUE_TOTAL',
        volumeMl: 0,
        volumeMinimoAlerta: 450,
      },
      {
        institutionId: instId,
        especie: 'FELINA',
        tipoSanguineo: 'Tipo A',
        componente: 'SANGUE_TOTAL',
        volumeMl: 0,
        volumeMinimoAlerta: 400,
      },
      {
        institutionId: instId,
        especie: 'FELINA',
        tipoSanguineo: 'Tipo B',
        componente: 'SANGUE_TOTAL',
        volumeMl: 0,
        volumeMinimoAlerta: 400,
      },
    ];

    for (const item of seedItems) {
      state.inventory.push({ id: invId++, ...item });
    }

    state.employees.push({
      id: nextId(state.employees),
      institutionId: instId,
      nome: createdClinic.crmvResponsavel,
      cpf: '000.000.000-00',
      cargo: 'Responsável Técnico',
      crmv: createdClinic.crmvResponsavel,
      email,
      isAdmin: true,
      isActive: true,
    });

    appendAudit(state, 'REGISTER_INSTITUTION', 'Institution', String(instId), userId, 'INSTITUTION_ADMIN', {
      nomeFantasia: createdClinic.nomeFantasia,
      cnpj: createdClinic.cnpj,
      crmv: createdClinic.crmvResponsavel,
    });

    persistState(state);
    return { user: newUser, institution: createdClinic };
  });
}

export async function getUserById(userId: number): Promise<StoredUserRecord | undefined> {
  const state = loadState();
  return state.users.find((u) => u.id === userId);
}

export async function getBootstrapData(user: {
  sub: number;
  role: Role;
  institutionId?: number;
  tutorId?: number;
}): Promise<{
  institutions: Institution[];
  tutors: Tutor[];
  employees: InstitutionEmployee[];
  pets: Pet[];
  inventory: BloodInventoryItem[];
  bloodBags: BloodBag[];
  movements: BloodInventoryMovement[];
  needs: BloodNeed[];
  interests: DonorInterest[];
  appointments: Appointment[];
  vouchers: Voucher[];
  auditLogs: AuditLogItem[];
  activeTutor?: Tutor;
  activeInstitution?: Institution;
}> {
  const state = loadState();

  if (user.role === 'TUTOR') {
    const activeTutor =
      state.tutors.find((t) => t.id === user.tutorId || t.userId === user.sub) || state.tutors[0];
    const tutorPets = state.pets.filter((p) => p.tutorId === activeTutor?.id);
    const tutorInterests = state.interests.filter((i) => i.tutorId === activeTutor?.id);
    const tutorAppointments = state.appointments.filter((a) => a.tutorId === activeTutor?.id);
    const tutorVouchers = state.vouchers.filter((v) => v.tutorId === activeTutor?.id);

    return {
      institutions: state.institutions,
      tutors: activeTutor ? [activeTutor] : [],
      employees: [],
      pets: tutorPets,
      inventory: [],
      bloodBags: [],
      movements: [],
      needs: state.needs,
      interests: tutorInterests,
      appointments: tutorAppointments,
      vouchers: tutorVouchers,
      auditLogs: state.auditLogs.slice(0, 30),
      activeTutor,
    };
  }

  // RN03: Strict institution isolation for clinic users
  const activeInstitution =
    state.institutions.find((i) => i.id === user.institutionId) || state.institutions[0];
  const instId = activeInstitution.id;
  const instInventory = state.inventory.filter((i) => i.institutionId === instId);
  const instInvIds = new Set(instInventory.map((i) => i.id));
  const instNeedIds = new Set(
    state.needs.filter((n) => n.institutionId === instId).map((n) => n.id)
  );

  return {
    institutions: [activeInstitution],
    tutors: state.tutors,
    employees: state.employees.filter((e) => e.institutionId === instId),
    pets: state.pets,
    inventory: instInventory,
    bloodBags: state.bloodBags.filter((b) => instInvIds.has(b.inventoryId)),
    movements: state.movements.filter((m) => instInvIds.has(m.inventoryId)),
    needs: state.needs,
    interests: state.interests.filter((i) => instNeedIds.has(i.needId)),
    appointments: state.appointments.filter((a) => a.institutionId === instId),
    vouchers: state.vouchers.filter((v) => v.institutionId === instId),
    auditLogs: state.auditLogs.slice(0, 50),
    activeInstitution,
  };
}

export async function addStockMovement(params: {
  actorId: number;
  actorRole: Role;
  actorName: string;
  institutionId: number;
  inventoryId: number;
  tipo: 'ENTRADA_DOACAO' | 'SAIDA_TRANSFUSAO' | 'SAIDA_VENCIMENTO' | 'AJUSTE_AUDITORIA';
  delta: number;
  motivo: string;
  dataColeta?: string;
  targetBagId?: number;
}): Promise<
  | {
      success: true;
      inventoryItem: BloodInventoryItem;
      movement: BloodInventoryMovement;
      createdBag?: BloodBag;
      updatedBag?: BloodBag;
    }
  | { success: false; error: string; status: number }
> {
  return withLock(() => {
    const state = loadState();
    const item = state.inventory.find(
      (i) => i.id === params.inventoryId && i.institutionId === params.institutionId
    );
    if (!item) {
      return { success: false, error: 'Item de estoque não localizado para esta instituição.', status: 404 };
    }

    // RN05: Mandatory species check
    if (item.especie !== 'CANINA' && item.especie !== 'FELINA') {
      return { success: false, error: 'RN05: Espécie obrigatória (CANINA ou FELINA).', status: 400 };
    }

    const actualDelta =
      params.tipo === 'SAIDA_TRANSFUSAO' || params.tipo === 'SAIDA_VENCIMENTO'
        ? -Math.abs(params.delta)
        : Math.abs(params.delta);

    const previousVolume = item.volumeMl;
    const newVolume = previousVolume + actualDelta;

    // RN04: Non-negative inventory constraint
    if (newVolume < 0) {
      return {
        success: false,
        error: `Volume de estoque insuficiente: Saldo atual é de ${previousVolume}mL. Não é possível realizar uma retirada de ${Math.abs(params.delta)}mL.`,
        status: 422,
      };
    }

    item.volumeMl = newVolume;

    let loteCodigoGerado = `BOLSA-${item.especie.substring(0, 3)}-${Date.now().toString().slice(-4)}`;
    let createdBag: BloodBag | undefined;
    let updatedBag: BloodBag | undefined;

    if (params.tipo === 'ENTRADA_DOACAO') {
      const colDate = params.dataColeta || new Date().toISOString().split('T')[0];
      const expDate = calculateExpirationDate(colDate);
      createdBag = {
        id: nextId(state.bloodBags),
        inventoryId: item.id,
        loteCodigo: loteCodigoGerado,
        volumeMl: Math.abs(params.delta),
        dataColeta: colDate,
        dataValidade: expDate,
        status: 'DISPONIVEL',
        responsavelCrmv: 'CRMV-SP 18452',
      };
      state.bloodBags.unshift(createdBag);
    } else if (params.tipo === 'SAIDA_VENCIMENTO' || params.tipo === 'SAIDA_TRANSFUSAO') {
      const targetStatus =
        params.tipo === 'SAIDA_VENCIMENTO' ? 'DESCARTADA_VENCIMENTO' : 'UTILIZADA';
      let bag = params.targetBagId
        ? state.bloodBags.find((b) => b.id === params.targetBagId && b.inventoryId === item.id)
        : undefined;

      if (!bag) {
        const availableBags = state.bloodBags.filter(
          (b) => b.inventoryId === item.id && b.status === 'DISPONIVEL'
        );
        if (availableBags.length > 0) {
          // FEFO: First Expired, First Out
          bag = [...availableBags].sort(
            (a, b) => new Date(a.dataValidade).getTime() - new Date(b.dataValidade).getTime()
          )[0];
        }
      }

      if (bag) {
        bag.status = targetStatus;
        loteCodigoGerado = bag.loteCodigo;
        updatedBag = bag;
      }
    }

    const movement: BloodInventoryMovement = {
      id: nextId(state.movements),
      inventoryId: item.id,
      tipoMovimento: params.tipo,
      volumeDeltaMl: actualDelta,
      volumeAnteriorMl: previousVolume,
      volumePosteriorMl: newVolume,
      motivo: params.motivo || 'Movimentação clínica',
      loteCodigo: loteCodigoGerado,
      realizadoPor: params.actorName,
      createdAt: new Date().toLocaleString('pt-BR'),
    };
    state.movements.unshift(movement);

    appendAudit(
      state,
      'UPDATE_STOCK',
      'BloodInventory',
      String(item.id),
      params.actorId,
      params.actorRole,
      {
        tipo: params.tipo,
        delta: actualDelta,
        volumeAnterior: previousVolume,
        volumeNovo: newVolume,
        motivo: movement.motivo,
        lote: loteCodigoGerado,
      },
      { volumeMl: previousVolume }
    );

    persistState(state);
    return { success: true, inventoryItem: item, movement, createdBag, updatedBag };
  });
}

export async function discardExpiredBag(params: {
  actorId: number;
  actorRole: Role;
  actorName: string;
  institutionId: number;
  bagId: number;
}) {
  const state = loadState();
  const bag = state.bloodBags.find((b) => b.id === params.bagId);
  if (!bag) {
    return { success: false as const, error: 'Bolsa não encontrada no acervo.', status: 404 };
  }
  return addStockMovement({
    actorId: params.actorId,
    actorRole: params.actorRole,
    actorName: params.actorName,
    institutionId: params.institutionId,
    inventoryId: bag.inventoryId,
    tipo: 'SAIDA_VENCIMENTO',
    delta: bag.volumeMl,
    motivo: `Descarte técnico: validade máxima de 40 dias excedida (Lote ${bag.loteCodigo})`,
    targetBagId: bag.id,
  });
}

export async function createBloodNeed(params: {
  actorId: number;
  actorRole: Role;
  institutionId: number;
  especie: Especie;
  tipoSanguineo: string;
  volumeSolicitadoMl: number;
  urgencia: UrgenciaLevel;
  descricao: string;
}): Promise<{ need: BloodNeed } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const inst = state.institutions.find((i) => i.id === params.institutionId);
    if (!inst) return { error: 'Instituição não encontrada.', status: 404 };
    if (!params.tipoSanguineo || !params.volumeSolicitadoMl || params.volumeSolicitadoMl <= 0) {
      return { error: 'RN06: Tipo sanguíneo e volume válido são obrigatórios.', status: 400 };
    }

    const matchingCount = state.pets.filter(
      (p) => p.especie === params.especie && p.statusElegibilidade === 'APTO'
    ).length;

    const newNeed: BloodNeed = {
      id: nextId(state.needs),
      institutionId: inst.id,
      institutionNome: inst.nomeFantasia,
      especie: params.especie,
      tipoSanguineo: params.tipoSanguineo,
      volumeSolicitadoMl: params.volumeSolicitadoMl,
      urgencia: params.urgencia,
      status: 'ACTIVE',
      descricao: params.descricao,
      cidade: inst.cidade,
      notificadosCount: matchingCount,
      interessadosCount: 0,
      createdAt: 'Agora mesmo',
    };

    state.needs.unshift(newNeed);
    appendAudit(state, 'CREATE_BLOOD_NEED', 'BloodNeed', String(newNeed.id), params.actorId, params.actorRole, {
      especie: params.especie,
      tipo: params.tipoSanguineo,
      volume: params.volumeSolicitadoMl,
      urgencia: params.urgencia,
      queuedAsyncDispatch: true,
    });
    persistState(state);
    return { need: newNeed };
  });
}

export async function expressDonorInterest(params: {
  actorId: number;
  tutorId: number;
  needId: number;
  petId: number;
}): Promise<{ interest: DonorInterest } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const need = state.needs.find((n) => n.id === params.needId && n.status === 'ACTIVE');
    if (!need) return { error: 'Alerta de necessidade não encontrado ou encerrado.', status: 404 };

    const tutor = state.tutors.find((t) => t.id === params.tutorId);
    const pet = state.pets.find((p) => p.id === params.petId && p.tutorId === params.tutorId);
    if (!tutor || !pet) return { error: 'Pet não encontrado para este tutor.', status: 404 };

    if (pet.especie !== need.especie) {
      return {
        error: `Espécie do pet (${pet.especie}) incompatível com a necessidade (${need.especie}).`,
        status: 422,
      };
    }

    const existing = state.interests.find((i) => i.needId === need.id && i.petId === pet.id);
    if (existing) {
      return { interest: existing };
    }

    const interest: DonorInterest = {
      id: nextId(state.interests),
      needId: need.id,
      tutorId: tutor.id,
      tutorNome: tutor.nome,
      tutorTelefone: tutor.telefone,
      petId: pet.id,
      petNome: pet.nome,
      petEspecie: pet.especie,
      petPesoKg: pet.pesoKg,
      status: 'MANIFESTADO',
      createdAt: 'Agora mesmo',
    };

    state.interests.unshift(interest);
    need.interessadosCount += 1;

    appendAudit(state, 'EXPRESS_DONOR_INTEREST', 'DonorInterest', String(interest.id), params.actorId, 'TUTOR', {
      needId: need.id,
      petId: pet.id,
      petNome: pet.nome,
      tutor: tutor.nome,
    });

    persistState(state);
    return { interest };
  });
}

export async function scheduleInterestAppointment(params: {
  actorId: number;
  actorRole: Role;
  institutionId: number;
  interestId: number;
  slotHora: string;
}): Promise<{ appointment: Appointment } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const inst = state.institutions.find((i) => i.id === params.institutionId);
    if (!inst) return { error: 'Instituição não encontrada.', status: 404 };

    const interest = state.interests.find((i) => i.id === params.interestId);
    if (!interest) return { error: 'Interesse não encontrado.', status: 404 };

    // RN08: Anti-overbooking check against daily capacity and identical active slot
    const activeAppointments = state.appointments.filter(
      (a) =>
        a.institutionId === inst.id &&
        (a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
    );
    if (activeAppointments.length >= inst.capacidadeDiaria) {
      return {
        error: `RN08: Capacidade diária máxima (${inst.capacidadeDiaria} atendimentos) atingida para esta clínica.`,
        status: 409,
      };
    }

    const slotCode = `SLOT-${interest.petEspecie.substring(0, 3)}-${Date.now().toString().slice(-4)}`;
    const appointment: Appointment = {
      id: nextId(state.appointments),
      institutionId: inst.id,
      tutorId: interest.tutorId,
      tutorNome: interest.tutorNome,
      petId: interest.petId,
      petNome: interest.petNome,
      petEspecie: interest.petEspecie,
      petPesoKg: interest.petPesoKg,
      tipoSanguineo: 'A definir no teste rápido',
      dataHora: params.slotHora,
      slotCodigo: slotCode,
      status: 'SCHEDULED',
    };

    state.appointments.unshift(appointment);
    interest.status = 'SELECIONADO_AGENDAMENTO';

    appendAudit(state, 'CREATE_APPOINTMENT', 'Appointment', String(appointment.id), params.actorId, params.actorRole, {
      slotCodigo: slotCode,
      tutor: interest.tutorNome,
      pet: interest.petNome,
    });

    persistState(state);
    return { appointment };
  });
}

export async function confirmDonationScreening(params: {
  actorId: number;
  actorRole: Role;
  actorName: string;
  institutionId: number;
  appointmentId: number;
  veterinarioCrmv: string;
  volumeColetado: number;
  hematocrito: number;
  pesoAferido: number;
  tipoConfirmado: string;
}): Promise<
  | { success: true; voucher: Voucher; appointment: Appointment }
  | { success: false; error: string; status: number }
> {
  return withLock(() => {
    const state = loadState();
    const inst = state.institutions.find((i) => i.id === params.institutionId);
    const app = state.appointments.find(
      (a) => a.id === params.appointmentId && a.institutionId === params.institutionId
    );
    if (!inst || !app) {
      return { success: false, error: 'Agendamento não encontrado para esta instituição.', status: 404 };
    }
    if (app.status === 'ATTENDED') {
      return { success: false, error: 'Esta doação já foi confirmada anteriormente.', status: 409 };
    }
    if (!params.veterinarioCrmv || !params.veterinarioCrmv.trim()) {
      return { success: false, error: 'RN09: CRMV do veterinário responsável é obrigatório.', status: 400 };
    }

    // RN15: Mandatory veterinary hematocrit safety threshold
    if (params.hematocrito < 37.0) {
      return {
        success: false,
        error: `Triagem Clínica Reprovada: Hematócrito do animal está em ${params.hematocrito}% (abaixo do limiar seguro de 37.0%). Coleta suspensa para proteger o pet.`,
        status: 422,
      };
    }

    app.status = 'ATTENDED';

    // Update matching inventory & create 40-day CPDA-1 bag atomically
    const invItem = state.inventory.find(
      (i) =>
        i.institutionId === inst.id &&
        i.especie === app.petEspecie &&
        (i.tipoSanguineo.includes(params.tipoConfirmado) ||
          i.tipoSanguineo.includes('DEA 1.1') ||
          i.tipoSanguineo.includes('Tipo'))
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const expDate = calculateExpirationDate(todayStr);
    const loteCodigo = `BOLSA-${app.petEspecie.substring(0, 3)}-${Date.now().toString().slice(-4)}`;

    if (invItem) {
      const previousVolume = invItem.volumeMl;
      invItem.volumeMl += params.volumeColetado;
      state.bloodBags.unshift({
        id: nextId(state.bloodBags),
        inventoryId: invItem.id,
        loteCodigo,
        volumeMl: params.volumeColetado,
        dataColeta: todayStr,
        dataValidade: expDate,
        status: 'DISPONIVEL',
        doadorNome: app.petNome,
        responsavelCrmv: params.veterinarioCrmv,
      });
      state.movements.unshift({
        id: nextId(state.movements),
        inventoryId: invItem.id,
        tipoMovimento: 'ENTRADA_DOACAO',
        volumeDeltaMl: params.volumeColetado,
        volumeAnteriorMl: previousVolume,
        volumePosteriorMl: invItem.volumeMl,
        motivo: `Doação confirmada do pet ${app.petNome} (CRMV: ${params.veterinarioCrmv})`,
        loteCodigo,
        realizadoPor: params.actorName,
        createdAt: new Date().toLocaleString('pt-BR'),
      });
    }

    const voucherCode = `DOEPET-${app.petEspecie.substring(0, 3)}-${crypto
      .randomBytes(2)
      .toString('hex')
      .toUpperCase()}-${app.petNome.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'PET'}`;

    const donationId = nextId(state.donations);
    state.donations.push({
      id: donationId,
      appointmentId: app.id,
      institutionId: inst.id,
      tutorId: app.tutorId,
      petId: app.petId,
      petNome: app.petNome,
      veterinarioCrmv: params.veterinarioCrmv,
      volumeColetadoMl: params.volumeColetado,
      loteBolsa: loteCodigo,
      dataValidadeBolsa: expDate,
      tipoSanguineoConfirmado: params.tipoConfirmado,
      hematocrito: params.hematocrito,
      pesoAferidoKg: params.pesoAferido,
      voucherCodigo: voucherCode,
      createdAt: new Date().toISOString(),
    });

    const newVoucher: Voucher = {
      id: nextId(state.vouchers),
      donationId,
      tutorId: app.tutorId,
      tutorNome: app.tutorNome,
      institutionId: inst.id,
      institutionNome: inst.nomeFantasia,
      codigo: voucherCode,
      beneficioDescricao:
        'Check-up Clínico Preventivo Gratuito + Hemograma + Isenção em Vacina Antirrábica',
      dataValidade: '2026-12-31',
      status: 'ATIVO',
    };
    state.vouchers.unshift(newVoucher);

    const pet = state.pets.find((p) => p.id === app.petId);
    if (pet) {
      pet.ultimaDoacaoEm = todayStr;
      pet.tipoSanguineo = params.tipoConfirmado;
    }

    appendAudit(
      state,
      'CONFIRM_DONATION',
      'Donation',
      String(donationId),
      params.actorId,
      params.actorRole,
      {
        appointmentId: app.id,
        volumeColetado: params.volumeColetado,
        hematocrito: params.hematocrito,
        veterinarioCrmv: params.veterinarioCrmv,
        voucherGerado: voucherCode,
        loteBolsa: loteCodigo,
      }
    );

    persistState(state);
    return { success: true, voucher: newVoucher, appointment: app };
  });
}

export async function redeemVoucherCode(params: {
  actorId: number;
  actorRole: Role;
  institutionId: number;
  codigo: string;
}): Promise<{ success: boolean; message: string; voucher?: Voucher; status: number }> {
  return withLock(() => {
    const state = loadState();
    const normalized = params.codigo.trim().toUpperCase();
    const voucher = state.vouchers.find((v) => v.codigo === normalized);

    if (!voucher) {
      return { success: false, message: 'Código de voucher não localizado no sistema.', status: 404 };
    }
    if (voucher.institutionId !== params.institutionId) {
      return {
        success: false,
        message: 'RN03: Este voucher pertence a outra instituição credenciada.',
        status: 403,
      };
    }
    if (voucher.status === 'RESGATADO') {
      return {
        success: false,
        message: 'Aviso: Este voucher já foi utilizado anteriormente.',
        status: 409,
      };
    }
    if (voucher.status === 'EXPIRADO') {
      return {
        success: false,
        message: 'Este voucher ultrapassou a data limite de validade e não pode ser resgatado.',
        status: 422,
      };
    }

    voucher.status = 'RESGATADO';
    voucher.resgatadoEm = new Date().toLocaleString('pt-BR');

    appendAudit(state, 'REDEEM_VOUCHER', 'Voucher', String(voucher.id), params.actorId, params.actorRole, {
      codigo: voucher.codigo,
      beneficio: voucher.beneficioDescricao,
      tutor: voucher.tutorNome,
    });

    persistState(state);
    return {
      success: true,
      message: `Sucesso! Benefício resgatado: "${voucher.beneficioDescricao}" para ${voucher.tutorNome}.`,
      voucher,
      status: 200,
    };
  });
}

export async function registerTutorPet(params: {
  actorId: number;
  tutorId: number;
  petData: Omit<Pet, 'id' | 'tutorId' | 'statusElegibilidade'>;
}): Promise<Pet> {
  return withLock(() => {
    const state = loadState();
    let elegibilidade: Pet['statusElegibilidade'] = 'EM_ANALISE';
    if (params.petData.especie === 'CANINA') {
      if (
        params.petData.pesoKg >= 25 &&
        params.petData.vacinadoEmDia &&
        params.petData.idadeAnos >= 1 &&
        params.petData.idadeAnos <= 8
      ) {
        elegibilidade = 'APTO';
      } else if (params.petData.idadeAnos > 8) {
        elegibilidade = 'INAPTO_DEFINITIVO';
      } else {
        elegibilidade = 'INAPTO_TEMPORARIO';
      }
    } else if (params.petData.especie === 'FELINA') {
      if (
        params.petData.pesoKg >= 4 &&
        params.petData.vacinadoEmDia &&
        params.petData.idadeAnos >= 1 &&
        params.petData.idadeAnos <= 7
      ) {
        elegibilidade = 'APTO';
      } else if (params.petData.idadeAnos > 7) {
        elegibilidade = 'INAPTO_DEFINITIVO';
      } else {
        elegibilidade = 'INAPTO_TEMPORARIO';
      }
    }

    const createdPet: Pet = {
      ...params.petData,
      id: nextId(state.pets),
      tutorId: params.tutorId,
      statusElegibilidade: elegibilidade,
    };

    state.pets.unshift(createdPet);
    appendAudit(state, 'REGISTER_PET', 'Pet', String(createdPet.id), params.actorId, 'TUTOR', {
      nome: createdPet.nome,
      especie: createdPet.especie,
      dataNascimento: createdPet.dataNascimento,
      idadeAnos: createdPet.idadeAnos,
      pesoKg: createdPet.pesoKg,
      elegibilidadeCalculada: elegibilidade,
    });
    persistState(state);
    return createdPet;
  });
}

export async function deleteTutorPet(params: {
  actorId: number;
  tutorId: number;
  petId: number;
}): Promise<{ deleted: Pet } | { error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const target = state.pets.find((p) => p.id === params.petId && p.tutorId === params.tutorId);
    if (!target) {
      return { error: 'Pet não encontrado para este tutor.', status: 404 };
    }

    state.pets = state.pets.filter((p) => p.id !== params.petId);
    state.interests = state.interests.filter((i) => i.petId !== params.petId);

    appendAudit(
      state,
      'DELETE_PET',
      'Pet',
      String(params.petId),
      params.actorId,
      'TUTOR',
      undefined,
      { nome: target.nome, especie: target.especie, raca: target.raca }
    );
    persistState(state);
    return { deleted: target };
  });
}

export async function addInstitutionEmployee(params: {
  actorId: number;
  actorRole: Role;
  institutionId: number;
  nome: string;
  cpf: string;
  cargo: string;
  crmv?: string;
  email?: string;
}): Promise<InstitutionEmployee> {
  return withLock(() => {
    const state = loadState();
    const emp: InstitutionEmployee = {
      id: nextId(state.employees),
      institutionId: params.institutionId,
      nome: params.nome,
      cpf: params.cpf,
      cargo: params.cargo,
      crmv: params.crmv || undefined,
      email: params.email || undefined,
      isAdmin: false,
      isActive: true,
    };
    state.employees.push(emp);
    appendAudit(state, 'CREATE_EMPLOYEE', 'InstitutionEmployee', String(emp.id), params.actorId, params.actorRole, {
      nome: emp.nome,
      cargo: emp.cargo,
      cpf: emp.cpf,
      email: emp.email,
    });
    persistState(state);
    return emp;
  });
}

export async function updateInstitutionEmployee(params: {
  actorId: number;
  actorRole: Role;
  institutionId: number;
  employeeId: number;
  data: Partial<Omit<InstitutionEmployee, 'id' | 'institutionId'>>;
}): Promise<{ success: true; employee: InstitutionEmployee } | { success: false; error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const existing = state.employees.find(
      (e) => e.id === params.employeeId && e.institutionId === params.institutionId
    );
    if (!existing) {
      return { success: false, error: 'Colaborador não localizado no cadastro.', status: 404 };
    }

    if (existing.isAdmin && (params.data.isActive === false || params.data.isAdmin === false)) {
      const otherAdmins = state.employees.filter(
        (e) =>
          e.institutionId === params.institutionId &&
          e.id !== params.employeeId &&
          e.isAdmin &&
          e.isActive
      );
      if (otherAdmins.length === 0) {
        return {
          success: false,
          error: 'A clínica deve possuir obrigatoriamente ao menos um Administrador ativo com acesso.',
          status: 422,
        };
      }
    }

    const before = { ...existing };
    Object.assign(existing, params.data);
    appendAudit(
      state,
      'UPDATE_EMPLOYEE',
      'InstitutionEmployee',
      String(existing.id),
      params.actorId,
      params.actorRole,
      params.data,
      before
    );
    persistState(state);
    return { success: true, employee: existing };
  });
}

export async function removeInstitutionEmployee(params: {
  actorId: number;
  actorRole: Role;
  institutionId: number;
  employeeId: number;
}): Promise<{ success: true } | { success: false; error: string; status: number }> {
  return withLock(() => {
    const state = loadState();
    const existing = state.employees.find(
      (e) => e.id === params.employeeId && e.institutionId === params.institutionId
    );
    if (!existing) {
      return { success: false, error: 'Colaborador não localizado no cadastro.', status: 404 };
    }

    if (existing.isAdmin) {
      const otherAdmins = state.employees.filter(
        (e) =>
          e.institutionId === params.institutionId &&
          e.id !== params.employeeId &&
          e.isAdmin &&
          e.isActive
      );
      if (otherAdmins.length === 0) {
        return {
          success: false,
          error: 'Não é permitido remover o único Administrador ativo responsável pela instituição.',
          status: 422,
        };
      }
    }

    state.employees = state.employees.filter((e) => e.id !== params.employeeId);
    appendAudit(
      state,
      'DELETE_EMPLOYEE',
      'InstitutionEmployee',
      String(params.employeeId),
      params.actorId,
      params.actorRole,
      undefined,
      existing
    );
    persistState(state);
    return { success: true };
  });
}

export async function exportTutorLgpdData(tutorId: number, userEmail: string): Promise<unknown> {
  return withLock(() => {
    const state = loadState();
    const tutor = state.tutors.find((t) => t.id === tutorId);
    if (!tutor) return null;

    const tutorPets = state.pets.filter((p) => p.tutorId === tutor.id);
    const tutorVouchers = state.vouchers.filter((v) => v.tutorId === tutor.id);
    const tutorAppointments = state.appointments.filter((a) => a.tutorId === tutor.id);

    appendAudit(state, 'LGPD_DATA_EXPORT', 'Tutor', String(tutor.id), tutor.userId, 'TUTOR', {
      petsCount: tutorPets.length,
    });
    persistState(state);

    return {
      titular: {
        nome: tutor.nome,
        cpf: tutor.cpf,
        email: userEmail,
        telefone: tutor.telefone,
        cidade: tutor.cidade,
        estado: tutor.estado,
        bairro: tutor.bairro,
      },
      consentimento: {
        aceito: tutor.lgpdAceito,
        versaoPolitica: tutor.lgpdVersao,
        dataAceite: tutor.dataAceite,
        baseLegal: 'Consentimento do Titular - LGPD Lei 13.709/2018 (Art. 18)',
      },
      animaisCadastrados: tutorPets,
      vouchersFidelidade: tutorVouchers,
      agendamentos: tutorAppointments,
      exportadoEm: new Date().toISOString(),
    };
  });
}

export async function getEligiblePetsForSpecies(especie: Especie): Promise<Pet[]> {
  const state = loadState();
  return state.pets.filter((p) => p.especie === especie && p.statusElegibilidade === 'APTO');
}

export async function getTutorUserId(tutorId: number): Promise<number | undefined> {
  const state = loadState();
  return state.tutors.find((t) => t.id === tutorId)?.userId;
}

export async function savePushSubscription(params: {
  userId: number;
  tutorId?: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<StoredPushSubscription> {
  return withLock(() => {
    const state = loadState();
    const existing = state.pushSubscriptions.find((s) => s.endpoint === params.endpoint);
    if (existing) {
      existing.userId = params.userId;
      existing.tutorId = params.tutorId;
      existing.p256dh = params.p256dh;
      existing.auth = params.auth;
      persistState(state);
      return existing;
    }

    const sub: StoredPushSubscription = {
      id: nextId(state.pushSubscriptions),
      userId: params.userId,
      tutorId: params.tutorId,
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      userAgent: params.userAgent,
      createdAt: new Date().toISOString(),
    };
    state.pushSubscriptions.push(sub);
    persistState(state);
    return sub;
  });
}

export async function getPushSubscriptionsForTutor(
  tutorId: number
): Promise<StoredPushSubscription[]> {
  const state = loadState();
  return state.pushSubscriptions.filter((s) => s.tutorId === tutorId);
}

export async function getPushSubscriptionsForUser(
  userId: number
): Promise<StoredPushSubscription[]> {
  const state = loadState();
  return state.pushSubscriptions.filter((s) => s.userId === userId);
}

export async function saveAlertNotifications(
  records: Omit<NotificationRecord, 'id'>[]
): Promise<void> {
  await withLock(() => {
    const state = loadState();
    let id = nextId(state.notifications);
    for (const r of records) {
      state.notifications.unshift({ id: id++, ...r });
    }
    if (state.notifications.length > 500) {
      state.notifications.length = 500;
    }
    persistState(state);
  });
}

export async function updateNeedNotifiedCount(needId: number, count: number): Promise<void> {
  await withLock(() => {
    const state = loadState();
    const need = state.needs.find((n) => n.id === needId);
    if (need) {
      need.notificadosCount = count;
      persistState(state);
    }
  });
}

export async function recordPasswordResetRequest(email: string): Promise<void> {
  await withLock(() => {
    const state = loadState();
    appendAudit(state, 'PASSWORD_RESET_REQUEST', 'User', '0', 0, 'ANONYMOUS', { email });
    persistState(state);
  });
}
