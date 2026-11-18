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
} from '../types';
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
} from '../mockData';
import type { ApiAuthResponse, BootstrapResponse } from './api';

interface StaticUserRecord {
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

interface StaticDatabaseState {
  version: number;
  users: StaticUserRecord[];
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
  pushSubscriptions: PushSubscriptionJSON[];
}

interface StaticSessionRecord {
  userId: number;
  token: string;
  issuedAt: string;
}

const DB_STORAGE_KEY = 'doepet_static_db_v1';
const SESSION_STORAGE_KEY = 'doepet_static_session_v1';
const SHELF_LIFE_DAYS = 40;

let memoryDbFallback: StaticDatabaseState | null = null;
let memorySessionFallback: StaticSessionRecord | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = writeQueue.then(() => fn());
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// Pure-TypeScript SHA-256 fallback for environments without crypto.subtle
function sha256FallbackHex(input: string): string {
  const utf8 = unescape(encodeURIComponent(input));
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i += 1) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  const bitLen = utf8.length * 8;
  words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Array<number>(64).fill(0);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, hh] = h;
    for (let j = 0; j < 64; j += 1) {
      if (j < 16) {
        w[j] = words[i + j] || 0;
      } else {
        const s0 = rotr(7, w[j - 15]) ^ rotr(18, w[j - 15]) ^ (w[j - 15] >>> 3);
        const s1 = rotr(17, w[j - 2]) ^ rotr(19, w[j - 2]) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  return h.map((val) => (val >>> 0).toString(16).padStart(8, '0')).join('');
}

function randomHex(byteLength = 16): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(byteLength);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  while (out.length < byteLength * 2) {
    out += Math.random().toString(16).slice(2);
  }
  return out.slice(0, byteLength * 2);
}

async function digestSha256Hex(payload: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const encoded = new TextEncoder().encode(payload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }
  return sha256FallbackHex(payload);
}

async function hashPasswordStatic(password: string, existingSalt?: string): Promise<string> {
  const salt = existingSalt || randomHex(16);
  const digest = await digestSha256Hex(`doepet-v1:${salt}:${password}`);
  return `v1:${salt}:${digest}`;
}

async function verifyPasswordStatic(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const [, salt, expectedDigest] = parts;
  const actualDigest = await digestSha256Hex(`doepet-v1:${salt}:${password}`);
  if (actualDigest.length !== expectedDigest.length) return false;
  let diff = 0;
  for (let i = 0; i < actualDigest.length; i += 1) {
    diff |= actualDigest.charCodeAt(i) ^ expectedDigest.charCodeAt(i);
  }
  return diff === 0;
}

function cloneData<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextId(items: { id: number }[]): number {
  return items.reduce((max, item) => (item.id > max ? item.id : max), 0) + 1;
}

function calculateExpirationDate(dataColeta: string): string {
  const d = new Date(`${dataColeta}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + SHELF_LIFE_DAYS);
  return d.toISOString().split('T')[0];
}

function toAuthenticatedUser(user: StaticUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    documento: user.documento,
    isLoggedIn: true,
  };
}

function appendAudit(
  state: StaticDatabaseState,
  action: string,
  resourceType: string,
  resourceId: string,
  actorId: number,
  actorType: string,
  afterData?: unknown,
  beforeData?: unknown
): void {
  const entry: AuditLogItem = {
    id: nextId(state.auditLogs),
    actorId,
    actorType,
    action,
    resourceType,
    resourceId,
    correlationId: `static-${randomHex(8)}`,
    beforeData: beforeData !== undefined ? JSON.stringify(beforeData) : undefined,
    afterData: afterData !== undefined ? JSON.stringify(afterData) : undefined,
    createdAt: new Date().toLocaleString('pt-BR'),
  };
  state.auditLogs.unshift(entry);
}

async function createInitialStaticDb(): Promise<StaticDatabaseState> {
  const nowIso = new Date().toISOString();
  const [h1, h2, h10, h11] = await Promise.all([
    hashPasswordStatic('doepet2026'),
    hashPasswordStatic('doepet2026'),
    hashPasswordStatic('doepet2026'),
    hashPasswordStatic('doepet2026'),
  ]);

  return {
    version: 1,
    users: [
      {
        id: 1,
        email: 'urgencias@hemovetcentral.com.br',
        passwordHash: h1,
        role: 'INSTITUTION_ADMIN',
        nome: 'Hemovet Central 24h (Dra. Camila)',
        documento: '12.345.678/0001-90',
        institutionId: 1,
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 2,
        email: 'contato@petlifehemo.com.br',
        passwordHash: h2,
        role: 'INSTITUTION_ADMIN',
        nome: 'PetLife Hemoterapia',
        documento: '98.765.432/0001-11',
        institutionId: 2,
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 10,
        email: 'ricardo.santos@doepet.com.br',
        passwordHash: h10,
        role: 'TUTOR',
        nome: 'Ricardo Santos (Tutor Doador)',
        documento: '321.654.987-00',
        tutorId: 1,
        isActive: true,
        createdAt: nowIso,
      },
      {
        id: 11,
        email: 'ana.albuquerque@doepet.com.br',
        passwordHash: h11,
        role: 'TUTOR',
        nome: 'Ana Clara Albuquerque',
        documento: '456.789.123-44',
        tutorId: 2,
        isActive: true,
        createdAt: nowIso,
      },
    ],
    institutions: cloneData(initialInstitutions),
    employees: cloneData(initialEmployees),
    tutors: cloneData(initialTutors),
    pets: cloneData(initialPets),
    inventory: cloneData(initialInventory),
    bloodBags: cloneData(initialBloodBags),
    movements: cloneData(initialMovements),
    needs: cloneData(initialNeeds),
    interests: cloneData(initialInterests),
    appointments: cloneData(initialAppointments),
    donations: [],
    vouchers: cloneData(initialVouchers),
    auditLogs: cloneData(initialAuditLogs),
    pushSubscriptions: [],
  };
}

function readLocalStorageDb(): StaticDatabaseState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaticDatabaseState>;
    if (!Array.isArray(parsed.users) || parsed.users.length === 0) return null;
    return parsed as StaticDatabaseState;
  } catch {
    return null;
  }
}

function saveDb(state: StaticDatabaseState): void {
  memoryDbFallback = state;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Keep memoryDbFallback if localStorage quota exceeded or unavailable
  }
}

async function loadDb(): Promise<StaticDatabaseState> {
  if (memoryDbFallback) return memoryDbFallback;
  const persisted = readLocalStorageDb();
  if (persisted) {
    memoryDbFallback = persisted;
    return persisted;
  }
  const initial = await createInitialStaticDb();
  saveDb(initial);
  return initial;
}

function readSession(): StaticSessionRecord | null {
  if (memorySessionFallback) return memorySessionFallback;
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaticSessionRecord;
    if (!parsed || typeof parsed.userId !== 'number' || !parsed.token) return null;
    memorySessionFallback = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(userId: number): StaticSessionRecord {
  const session: StaticSessionRecord = {
    userId,
    token: `static-${randomHex(24)}`,
    issuedAt: new Date().toISOString(),
  };
  memorySessionFallback = session;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Keep in memory
  }
  return session;
}

function clearSession(): void {
  memorySessionFallback = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

async function requireActiveUser(state: StaticDatabaseState): Promise<StaticUserRecord> {
  const session = readSession();
  if (!session) {
    throw new Error('Sessão não autenticada. Faça login para continuar.');
  }
  const user = state.users.find((u) => u.id === session.userId && u.isActive);
  if (!user) {
    clearSession();
    throw new Error('Sessão expirada ou usuário inativo.');
  }
  return user;
}

function buildAuthResponse(
  state: StaticDatabaseState,
  user: StaticUserRecord,
  token: string
): ApiAuthResponse {
  const tutor = user.tutorId ? state.tutors.find((t) => t.id === user.tutorId) : undefined;
  const institution = user.institutionId
    ? state.institutions.find((i) => i.id === user.institutionId)
    : undefined;

  return {
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn: 900,
    user: toAuthenticatedUser(user),
    tutor,
    institution,
  };
}

export const staticApi = {
  restoreSession: async (): Promise<ApiAuthResponse | null> => {
    const session = readSession();
    if (!session) return null;
    const state = await loadDb();
    const user = state.users.find((u) => u.id === session.userId && u.isActive);
    if (!user) {
      clearSession();
      return null;
    }
    return buildAuthResponse(state, user, session.token);
  },

  login: async (params: { identifier: string; password: string }): Promise<ApiAuthResponse> =>
    withLock(async () => {
      const state = await loadDb();
      const idClean = (params.identifier || '').trim().toLowerCase();
      const idDigits = idClean.replace(/\D/g, '');
      const pwd = params.password || '';

      if (!idClean || !pwd) {
        throw new Error('E-mail/documento e senha são obrigatórios.');
      }

      const user = state.users.find((u) => {
        if (u.email.toLowerCase() === idClean || u.documento.toLowerCase() === idClean) {
          return true;
        }
        if (idDigits.length >= 11 && u.documento.replace(/\D/g, '') === idDigits) {
          return true;
        }
        return false;
      });

      if (!user) {
        throw new Error('E-mail/documento ou senha inválidos.');
      }
      if (!user.isActive) {
        throw new Error('Conta desativada pelo administrador.');
      }

      const validPassword = await verifyPasswordStatic(pwd, user.passwordHash);
      if (!validPassword) {
        throw new Error('E-mail/documento ou senha inválidos.');
      }

      appendAudit(state, 'USER_LOGIN', 'User', String(user.id), user.id, user.role, {
        email: user.email,
      });
      saveDb(state);

      const session = writeSession(user.id);
      return buildAuthResponse(state, user, session.token);
    }),

  registerTutor: async (
    tutor: Partial<Tutor>,
    password: string,
    emailInput?: string
  ): Promise<ApiAuthResponse> =>
    withLock(async () => {
      const state = await loadDb();
      const nome = (tutor.nome || 'Novo Tutor').trim();
      const cpf = (tutor.cpf || '').trim();
      const email = (
        emailInput || `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@doepet.com.br`
      )
        .trim()
        .toLowerCase();

      if (!cpf) throw new Error('CPF é obrigatório.');
      if (!password || password.length < 6) {
        throw new Error('A senha deve conter no mínimo 6 caracteres.');
      }
      if (state.users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error('RN01: Este e-mail já está cadastrado na plataforma.');
      }
      if (state.tutors.some((t) => t.cpf === cpf)) {
        throw new Error('Este CPF já está cadastrado.');
      }

      const userId = nextId(state.users);
      const tutorId = nextId(state.tutors);
      const passwordHash = await hashPasswordStatic(password);

      const createdTutor: Tutor = {
        id: tutorId,
        userId,
        nome,
        cpf,
        telefone: tutor.telefone || '(11) 99999-9999',
        whatsapp: tutor.whatsapp || tutor.telefone || '(11) 99999-9999',
        cidade: tutor.cidade || 'São Paulo',
        estado: tutor.estado || 'SP',
        bairro: tutor.bairro || 'Centro',
        notifPush: true,
        lgpdAceito: true,
        lgpdVersao: 'v1.0-2026',
        dataAceite: new Date().toISOString(),
      };

      const newUser: StaticUserRecord = {
        id: userId,
        email,
        passwordHash,
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
      saveDb(state);

      const session = writeSession(newUser.id);
      return buildAuthResponse(state, newUser, session.token);
    }),

  registerClinic: async (
    clinic: Partial<Institution>,
    password: string
  ): Promise<ApiAuthResponse> =>
    withLock(async () => {
      const state = await loadDb();
      const cnpj = (clinic.cnpj || '').trim();
      const email = (clinic.emailContato || 'contato@clinica.com.br').trim().toLowerCase();

      if (!cnpj) throw new Error('CNPJ é obrigatório.');
      if (!password || password.length < 6) {
        throw new Error('A senha deve conter no mínimo 6 caracteres.');
      }
      if (state.users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error('RN01: Este e-mail já está cadastrado na plataforma.');
      }
      if (state.institutions.some((i) => i.cnpj === cnpj)) {
        throw new Error('RN02: Já existe uma instituição ativa com este CNPJ.');
      }

      const userId = nextId(state.users);
      const instId = nextId(state.institutions);
      const passwordHash = await hashPasswordStatic(password);

      const createdClinic: Institution = {
        id: instId,
        cnpj,
        razaoSocial: clinic.razaoSocial || 'Clínica Veterinária LTDA',
        nomeFantasia: clinic.nomeFantasia || 'Hospital Veterinário',
        crmvResponsavel: clinic.crmvResponsavel || 'CRMV-SP 00000',
        telefone: clinic.telefone || '(11) 3000-0000',
        emailContato: email,
        cidade: clinic.cidade || 'São Paulo',
        estado: clinic.estado || 'SP',
        capacidadeDiaria: clinic.capacidadeDiaria || 10,
        status: 'ACTIVE',
      };

      const newUser: StaticUserRecord = {
        id: userId,
        email,
        passwordHash,
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

      appendAudit(
        state,
        'REGISTER_INSTITUTION',
        'Institution',
        String(instId),
        userId,
        'INSTITUTION_ADMIN',
        {
          nomeFantasia: createdClinic.nomeFantasia,
          cnpj: createdClinic.cnpj,
          crmv: createdClinic.crmvResponsavel,
        }
      );
      saveDb(state);

      const session = writeSession(newUser.id);
      return buildAuthResponse(state, newUser, session.token);
    }),

  logout: async (): Promise<void> => {
    clearSession();
  },

  forgotPassword: async (email: string): Promise<{ success: boolean; message: string }> =>
    withLock(async () => {
      const state = await loadDb();
      appendAudit(state, 'PASSWORD_RESET_REQUEST', 'User', '0', 0, 'ANONYMOUS', { email });
      saveDb(state);
      return {
        success: true,
        message: 'Se o e-mail estiver cadastrado, enviaremos instruções de recuperação em instantes.',
      };
    }),

  bootstrap: async (): Promise<BootstrapResponse> => {
    const state = await loadDb();
    const user = await requireActiveUser(state);

    if (user.role === 'TUTOR') {
      const activeTutor =
        state.tutors.find((t) => t.id === user.tutorId || t.userId === user.id) || state.tutors[0];
      return {
        institutions: cloneData(state.institutions),
        tutors: activeTutor ? [cloneData(activeTutor)] : [],
        employees: [],
        pets: cloneData(state.pets.filter((p) => p.tutorId === activeTutor?.id)),
        inventory: [],
        bloodBags: [],
        movements: [],
        needs: cloneData(state.needs),
        interests: cloneData(state.interests.filter((i) => i.tutorId === activeTutor?.id)),
        appointments: cloneData(state.appointments.filter((a) => a.tutorId === activeTutor?.id)),
        vouchers: cloneData(state.vouchers.filter((v) => v.tutorId === activeTutor?.id)),
        auditLogs: cloneData(state.auditLogs.slice(0, 30)),
        activeTutor: activeTutor ? cloneData(activeTutor) : undefined,
      };
    }

    const activeInstitution =
      state.institutions.find((i) => i.id === user.institutionId) || state.institutions[0];
    const instId = activeInstitution.id;
    const instInventory = state.inventory.filter((i) => i.institutionId === instId);
    const instInvIds = new Set(instInventory.map((i) => i.id));
    const instNeedIds = new Set(state.needs.filter((n) => n.institutionId === instId).map((n) => n.id));

    return {
      institutions: [cloneData(activeInstitution)],
      tutors: cloneData(state.tutors),
      employees: cloneData(state.employees.filter((e) => e.institutionId === instId)),
      pets: cloneData(state.pets),
      inventory: cloneData(instInventory),
      bloodBags: cloneData(state.bloodBags.filter((b) => instInvIds.has(b.inventoryId))),
      movements: cloneData(state.movements.filter((m) => instInvIds.has(m.inventoryId))),
      needs: cloneData(state.needs),
      interests: cloneData(state.interests.filter((i) => instNeedIds.has(i.needId))),
      appointments: cloneData(state.appointments.filter((a) => a.institutionId === instId)),
      vouchers: cloneData(state.vouchers.filter((v) => v.institutionId === instId)),
      auditLogs: cloneData(state.auditLogs.slice(0, 50)),
      activeInstitution: cloneData(activeInstitution),
    };
  },

  addMovement: async (params: {
    inventoryId: number;
    tipo: string;
    delta: number;
    motivo: string;
    dataColeta?: string;
    targetBagId?: number;
  }) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (user.role === 'TUTOR' || !user.institutionId) {
        throw new Error('Acesso restrito a instituições veterinárias.');
      }

      const item = state.inventory.find(
        (i) => i.id === params.inventoryId && i.institutionId === user.institutionId
      );
      if (!item) {
        throw new Error('Item de estoque não localizado para esta instituição.');
      }
      if (item.especie !== 'CANINA' && item.especie !== 'FELINA') {
        throw new Error('RN05: Espécie obrigatória (CANINA ou FELINA).');
      }

      const tipoMovimento = params.tipo as BloodInventoryMovement['tipoMovimento'];
      const actualDelta =
        tipoMovimento === 'SAIDA_TRANSFUSAO' || tipoMovimento === 'SAIDA_VENCIMENTO'
          ? -Math.abs(params.delta)
          : Math.abs(params.delta);

      const previousVolume = item.volumeMl;
      const newVolume = previousVolume + actualDelta;
      if (newVolume < 0) {
        throw new Error(
          `Volume de estoque insuficiente: Saldo atual é de ${previousVolume}mL. Não é possível realizar uma retirada de ${Math.abs(params.delta)}mL.`
        );
      }

      item.volumeMl = newVolume;
      let loteCodigoGerado = `BOLSA-${item.especie.substring(0, 3)}-${Date.now().toString().slice(-4)}`;
      let createdBag: BloodBag | undefined;
      let updatedBag: BloodBag | undefined;

      if (tipoMovimento === 'ENTRADA_DOACAO') {
        const colDate = params.dataColeta || new Date().toISOString().split('T')[0];
        createdBag = {
          id: nextId(state.bloodBags),
          inventoryId: item.id,
          loteCodigo: loteCodigoGerado,
          volumeMl: Math.abs(params.delta),
          dataColeta: colDate,
          dataValidade: calculateExpirationDate(colDate),
          status: 'DISPONIVEL',
          responsavelCrmv: 'CRMV-SP 18452',
        };
        state.bloodBags.unshift(createdBag);
      } else if (tipoMovimento === 'SAIDA_VENCIMENTO' || tipoMovimento === 'SAIDA_TRANSFUSAO') {
        const targetStatus =
          tipoMovimento === 'SAIDA_VENCIMENTO' ? 'DESCARTADA_VENCIMENTO' : 'UTILIZADA';
        let bag = params.targetBagId
          ? state.bloodBags.find((b) => b.id === params.targetBagId && b.inventoryId === item.id)
          : undefined;
        if (!bag) {
          const available = state.bloodBags.filter(
            (b) => b.inventoryId === item.id && b.status === 'DISPONIVEL'
          );
          if (available.length > 0) {
            bag = [...available].sort(
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
        tipoMovimento,
        volumeDeltaMl: actualDelta,
        volumeAnteriorMl: previousVolume,
        volumePosteriorMl: newVolume,
        motivo: params.motivo || 'Movimentação clínica',
        loteCodigo: loteCodigoGerado,
        realizadoPor: user.nome,
        createdAt: new Date().toLocaleString('pt-BR'),
      };
      state.movements.unshift(movement);

      appendAudit(
        state,
        'UPDATE_STOCK',
        'BloodInventory',
        String(item.id),
        user.id,
        user.role,
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
      saveDb(state);

      return {
        success: true,
        inventoryItem: cloneData(item),
        movement: cloneData(movement),
        createdBag: createdBag ? cloneData(createdBag) : undefined,
        updatedBag: updatedBag ? cloneData(updatedBag) : undefined,
      };
    }),

  discardBag: async (bagId: number) => {
    const state = await loadDb();
    const bag = state.bloodBags.find((b) => b.id === bagId);
    if (!bag) {
      throw new Error('Bolsa não encontrada no acervo.');
    }
    return staticApi.addMovement({
      inventoryId: bag.inventoryId,
      tipo: 'SAIDA_VENCIMENTO',
      delta: bag.volumeMl,
      motivo: `Descarte técnico: validade máxima de 40 dias excedida (Lote ${bag.loteCodigo})`,
      targetBagId: bag.id,
    });
  },

  createNeed: async (params: {
    especie: Especie;
    tipoSanguineo: string;
    volumeSolicitadoMl: number;
    urgencia: UrgenciaLevel;
    descricao: string;
  }) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      const inst = state.institutions.find((i) => i.id === user.institutionId);
      if (!inst) throw new Error('Instituição não encontrada.');
      if (!params.tipoSanguineo || !params.volumeSolicitadoMl || params.volumeSolicitadoMl <= 0) {
        throw new Error('RN06: Tipo sanguíneo e volume válido são obrigatórios.');
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
      appendAudit(state, 'CREATE_BLOOD_NEED', 'BloodNeed', String(newNeed.id), user.id, user.role, {
        especie: params.especie,
        tipo: params.tipoSanguineo,
        volume: params.volumeSolicitadoMl,
        urgencia: params.urgencia,
        queuedAsyncDispatch: true,
      });
      saveDb(state);

      return {
        need: cloneData(newNeed),
        asyncDispatch: {
          messageId: `msg-static-${newNeed.id}`,
          status: 'DISPATCHED_LOCAL',
        },
      };
    }),

  expressInterest: async (needId: number, petId: number) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.tutorId) throw new Error('Apenas tutores autenticados podem manifestar interesse.');

      const need = state.needs.find((n) => n.id === needId && n.status === 'ACTIVE');
      if (!need) throw new Error('Alerta de necessidade não encontrado ou encerrado.');

      const tutor = state.tutors.find((t) => t.id === user.tutorId);
      const pet = state.pets.find((p) => p.id === petId && p.tutorId === user.tutorId);
      if (!tutor || !pet) throw new Error('Pet não encontrado para este tutor.');
      if (pet.especie !== need.especie) {
        throw new Error(`Espécie do pet (${pet.especie}) incompatível com a necessidade (${need.especie}).`);
      }

      const existing = state.interests.find((i) => i.needId === need.id && i.petId === pet.id);
      if (existing) return { interest: cloneData(existing) };

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
      appendAudit(
        state,
        'EXPRESS_DONOR_INTEREST',
        'DonorInterest',
        String(interest.id),
        user.id,
        'TUTOR',
        { needId: need.id, petId: pet.id, petNome: pet.nome, tutor: tutor.nome }
      );
      saveDb(state);

      return { interest: cloneData(interest) };
    }),

  scheduleInterest: async (interestId: number, slotHora: string) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      const inst = state.institutions.find((i) => i.id === user.institutionId);
      if (!inst) throw new Error('Instituição não encontrada.');

      const interest = state.interests.find((i) => i.id === interestId);
      if (!interest) throw new Error('Interesse não encontrado.');

      const activeAppointments = state.appointments.filter(
        (a) =>
          a.institutionId === inst.id && (a.status === 'SCHEDULED' || a.status === 'CONFIRMED')
      );
      if (activeAppointments.length >= inst.capacidadeDiaria) {
        throw new Error(
          `RN08: Capacidade diária máxima (${inst.capacidadeDiaria} atendimentos) atingida para esta clínica.`
        );
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
        dataHora: slotHora,
        slotCodigo: slotCode,
        status: 'SCHEDULED',
      };

      state.appointments.unshift(appointment);
      interest.status = 'SELECIONADO_AGENDAMENTO';
      appendAudit(
        state,
        'CREATE_APPOINTMENT',
        'Appointment',
        String(appointment.id),
        user.id,
        user.role,
        { slotCodigo: slotCode, tutor: interest.tutorNome, pet: interest.petNome }
      );
      saveDb(state);

      return { appointment: cloneData(appointment) };
    }),

  confirmDonation: async (
    appointmentId: number,
    params: {
      veterinarioCrmv: string;
      volumeColetado: number;
      hematocrito: number;
      pesoAferido: number;
      tipoConfirmado: string;
    }
  ) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      const inst = state.institutions.find((i) => i.id === user.institutionId);
      const app = state.appointments.find(
        (a) => a.id === appointmentId && a.institutionId === user.institutionId
      );
      if (!inst || !app) {
        throw new Error('Agendamento não encontrado para esta instituição.');
      }
      if (app.status === 'ATTENDED') {
        throw new Error('Esta doação já foi confirmada anteriormente.');
      }
      if (!params.veterinarioCrmv || !params.veterinarioCrmv.trim()) {
        throw new Error('RN09: CRMV do veterinário responsável é obrigatório.');
      }
      if (params.hematocrito < 37.0) {
        throw new Error(
          `Triagem Clínica Reprovada: Hematócrito do animal está em ${params.hematocrito}% (abaixo do limiar seguro de 37.0%). Coleta suspensa para proteger o pet.`
        );
      }

      app.status = 'ATTENDED';

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
          realizadoPor: user.nome,
          createdAt: new Date().toLocaleString('pt-BR'),
        });
      }

      const voucherCode = `DOEPET-${app.petEspecie.substring(0, 3)}-${randomHex(2).toUpperCase()}-${
        app.petNome.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'PET'
      }`;
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

      appendAudit(state, 'CONFIRM_DONATION', 'Donation', String(donationId), user.id, user.role, {
        appointmentId: app.id,
        volumeColetado: params.volumeColetado,
        hematocrito: params.hematocrito,
        veterinarioCrmv: params.veterinarioCrmv,
        voucherGerado: voucherCode,
        loteBolsa: loteCodigo,
      });
      saveDb(state);

      return {
        success: true,
        voucher: cloneData(newVoucher),
        appointment: cloneData(app),
      };
    }),

  redeemVoucher: async (codigo: string) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.institutionId) throw new Error('Acesso restrito a instituições veterinárias.');

      const normalized = codigo.trim().toUpperCase();
      const voucher = state.vouchers.find((v) => v.codigo === normalized);
      if (!voucher) {
        throw new Error('Código de voucher não localizado no sistema.');
      }
      if (voucher.institutionId !== user.institutionId) {
        throw new Error('RN03: Este voucher pertence a outra instituição credenciada.');
      }
      if (voucher.status === 'RESGATADO') {
        throw new Error('Aviso: Este voucher já foi utilizado anteriormente.');
      }
      if (voucher.status === 'EXPIRADO') {
        throw new Error('Este voucher ultrapassou a data limite de validade e não pode ser resgatado.');
      }

      voucher.status = 'RESGATADO';
      voucher.resgatadoEm = new Date().toLocaleString('pt-BR');
      appendAudit(state, 'REDEEM_VOUCHER', 'Voucher', String(voucher.id), user.id, user.role, {
        codigo: voucher.codigo,
        beneficio: voucher.beneficioDescricao,
        tutor: voucher.tutorNome,
      });
      saveDb(state);

      return {
        success: true,
        message: `Sucesso! Benefício resgatado: "${voucher.beneficioDescricao}" para ${voucher.tutorNome}.`,
        voucher: cloneData(voucher),
      };
    }),

  registerPet: async (petData: Omit<Pet, 'id' | 'tutorId' | 'statusElegibilidade'>) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.tutorId) throw new Error('Apenas tutores podem cadastrar pets.');

      let elegibilidade: Pet['statusElegibilidade'] = 'EM_ANALISE';
      if (petData.especie === 'CANINA') {
        if (petData.pesoKg >= 25 && petData.vacinadoEmDia && petData.idadeAnos >= 1 && petData.idadeAnos <= 8) {
          elegibilidade = 'APTO';
        } else if (petData.idadeAnos > 8) {
          elegibilidade = 'INAPTO_DEFINITIVO';
        } else {
          elegibilidade = 'INAPTO_TEMPORARIO';
        }
      } else if (petData.especie === 'FELINA') {
        if (petData.pesoKg >= 4 && petData.vacinadoEmDia && petData.idadeAnos >= 1 && petData.idadeAnos <= 7) {
          elegibilidade = 'APTO';
        } else if (petData.idadeAnos > 7) {
          elegibilidade = 'INAPTO_DEFINITIVO';
        } else {
          elegibilidade = 'INAPTO_TEMPORARIO';
        }
      }

      const createdPet: Pet = {
        ...petData,
        id: nextId(state.pets),
        tutorId: user.tutorId,
        statusElegibilidade: elegibilidade,
      };
      state.pets.unshift(createdPet);
      appendAudit(state, 'REGISTER_PET', 'Pet', String(createdPet.id), user.id, 'TUTOR', {
        nome: createdPet.nome,
        especie: createdPet.especie,
        dataNascimento: createdPet.dataNascimento,
        idadeAnos: createdPet.idadeAnos,
        pesoKg: createdPet.pesoKg,
        elegibilidadeCalculada: elegibilidade,
      });
      saveDb(state);

      return { pet: cloneData(createdPet) };
    }),

  deletePet: async (petId: number) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.tutorId) throw new Error('Apenas tutores podem remover pets.');

      const target = state.pets.find((p) => p.id === petId && p.tutorId === user.tutorId);
      if (!target) throw new Error('Pet não encontrado para este tutor.');

      state.pets = state.pets.filter((p) => p.id !== petId);
      state.interests = state.interests.filter((i) => i.petId !== petId);
      appendAudit(state, 'DELETE_PET', 'Pet', String(petId), user.id, 'TUTOR', undefined, {
        nome: target.nome,
        especie: target.especie,
        raca: target.raca,
      });
      saveDb(state);

      return { success: true };
    }),

  addEmployee: async (params: {
    nome: string;
    cpf: string;
    cargo: string;
    crmv?: string;
    email?: string;
  }) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.institutionId) throw new Error('Acesso restrito a administradores de clínica.');

      const employee: InstitutionEmployee = {
        id: nextId(state.employees),
        institutionId: user.institutionId,
        nome: params.nome,
        cpf: params.cpf,
        cargo: params.cargo,
        crmv: params.crmv || undefined,
        email: params.email || undefined,
        isAdmin: false,
        isActive: true,
      };
      state.employees.push(employee);
      appendAudit(
        state,
        'CREATE_EMPLOYEE',
        'InstitutionEmployee',
        String(employee.id),
        user.id,
        user.role,
        { nome: employee.nome, cargo: employee.cargo, cpf: employee.cpf, email: employee.email }
      );
      saveDb(state);

      return { employee: cloneData(employee) };
    }),

  updateEmployee: async (
    employeeId: number,
    data: Partial<Omit<InstitutionEmployee, 'id' | 'institutionId'>>
  ) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.institutionId) throw new Error('Acesso restrito a administradores de clínica.');

      const existing = state.employees.find(
        (e) => e.id === employeeId && e.institutionId === user.institutionId
      );
      if (!existing) throw new Error('Colaborador não localizado no cadastro.');

      if (existing.isAdmin && (data.isActive === false || data.isAdmin === false)) {
        const otherAdmins = state.employees.filter(
          (e) =>
            e.institutionId === user.institutionId && e.id !== employeeId && e.isAdmin && e.isActive
        );
        if (otherAdmins.length === 0) {
          throw new Error(
            'A clínica deve possuir obrigatoriamente ao menos um Administrador ativo com acesso.'
          );
        }
      }

      const before = { ...existing };
      Object.assign(existing, data);
      appendAudit(
        state,
        'UPDATE_EMPLOYEE',
        'InstitutionEmployee',
        String(existing.id),
        user.id,
        user.role,
        data,
        before
      );
      saveDb(state);

      return { success: true, employee: cloneData(existing) };
    }),

  removeEmployee: async (employeeId: number) =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      if (!user.institutionId) throw new Error('Acesso restrito a administradores de clínica.');

      const existing = state.employees.find(
        (e) => e.id === employeeId && e.institutionId === user.institutionId
      );
      if (!existing) throw new Error('Colaborador não localizado no cadastro.');

      if (existing.isAdmin) {
        const otherAdmins = state.employees.filter(
          (e) =>
            e.institutionId === user.institutionId && e.id !== employeeId && e.isAdmin && e.isActive
        );
        if (otherAdmins.length === 0) {
          throw new Error(
            'Não é permitido remover o único Administrador ativo responsável pela instituição.'
          );
        }
      }

      state.employees = state.employees.filter((e) => e.id !== employeeId);
      appendAudit(
        state,
        'DELETE_EMPLOYEE',
        'InstitutionEmployee',
        String(employeeId),
        user.id,
        user.role,
        undefined,
        existing
      );
      saveDb(state);

      return { success: true };
    }),

  exportLgpd: async (): Promise<unknown> =>
    withLock(async () => {
      const state = await loadDb();
      const user = await requireActiveUser(state);
      const tutor = state.tutors.find((t) => t.id === user.tutorId);
      if (!tutor) throw new Error('Perfil de tutor não localizado.');

      const tutorPets = state.pets.filter((p) => p.tutorId === tutor.id);
      const tutorVouchers = state.vouchers.filter((v) => v.tutorId === tutor.id);
      const tutorAppointments = state.appointments.filter((a) => a.tutorId === tutor.id);

      appendAudit(state, 'LGPD_DATA_EXPORT', 'Tutor', String(tutor.id), user.id, 'TUTOR', {
        petsCount: tutorPets.length,
      });
      saveDb(state);

      return {
        titular: {
          nome: tutor.nome,
          cpf: tutor.cpf,
          email: user.email,
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
    }),

  getVapidPublicKey: async () => ({
    publicKey: '',
    source: 'static-browser-mode',
  }),

  subscribePush: async (subscription: PushSubscriptionJSON) =>
    withLock(async () => {
      const state = await loadDb();
      await requireActiveUser(state);
      state.pushSubscriptions.push(subscription);
      saveDb(state);
      return { subscription };
    }),

  sendTestPush: async () => ({
    dispatched: true,
    subscriptionCount: 1,
  }),

  getHealth: async () => ({
    status: 'ok',
    service: 'doepet-static-runtime',
    persistence: 'Browser LocalStorage (Offline / Static Hosting Mode)',
    timestamp: new Date().toISOString(),
  }),

  getTelemetry: async () => {
    const state = await loadDb();
    return {
      mode: 'static-browser-mode',
      usersCount: state.users.length,
      petsCount: state.pets.length,
      needsCount: state.needs.length,
      auditLogsCount: state.auditLogs.length,
      timestamp: new Date().toISOString(),
    };
  },

  getQueueMetrics: async () => {
    const state = await loadDb();
    return {
      mode: 'static-browser-queue',
      pending: 0,
      dlq: 0,
      processed: state.needs.length,
    };
  },

  replayDlq: async () => ({ replayed: 0 }),
};
