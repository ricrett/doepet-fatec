import type {
  Appointment,
  AuditLogItem,
  AuthenticatedUser,
  BloodBag,
  BloodInventoryItem,
  BloodInventoryMovement,
  BloodNeed,
  DonorInterest,
  Especie,
  Institution,
  InstitutionEmployee,
  Pet,
  Tutor,
  UrgenciaLevel,
  Voucher,
} from '../types';

import { staticApi } from './staticApiFallback';

// DT-04: Access token (RS256, 15m TTL) kept strictly in memory — NEVER in localStorage
let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let staticFallbackActive = false;

const API_BASE = ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

class StaticBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaticBackendUnavailableError';
  }
}

function isStaticHostResponse(status: number, contentType: string): boolean {
  if (API_BASE) return false;
  const isJson = contentType.toLowerCase().includes('application/json');
  if (isJson) return false;
  return status === 404 || status === 405 || status === 501 || status === 0 || (status >= 200 && status < 300);
}

export function isStaticModeActive(): boolean {
  return staticFallbackActive;
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `req-${crypto.randomUUID()}`;
  }
  return `req-${Math.random().toString(36).substring(2, 10)}-2026`;
}

export interface ApiAuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthenticatedUser;
  tutor?: Tutor;
  institution?: Institution;
}

export interface BootstrapResponse {
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
}

async function withStaticFallback<T>(
  remoteFn: () => Promise<T>,
  staticFn: () => Promise<T>
): Promise<T> {
  if (staticFallbackActive) {
    return staticFn();
  }
  try {
    return await remoteFn();
  } catch (err) {
    if (err instanceof StaticBackendUnavailableError) {
      staticFallbackActive = true;
      return staticFn();
    }
    throw err;
  }
}

export async function restoreSession(): Promise<ApiAuthResponse | null> {
  if (staticFallbackActive) {
    const staticSession = await staticApi.restoreSession();
    inMemoryAccessToken = staticSession?.accessToken || null;
    return staticSession;
  }
  try {
    const resp = await fetch(resolveApiUrl('/api/v1/auth/session'), {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Correlation-ID': generateCorrelationId(),
      },
    });
    const contentType = resp.headers.get('content-type') || '';
    if (isStaticHostResponse(resp.status, contentType)) {
      staticFallbackActive = true;
      const staticSession = await staticApi.restoreSession();
      inMemoryAccessToken = staticSession?.accessToken || null;
      return staticSession;
    }
    if (!resp.ok || !contentType.includes('application/json')) {
      inMemoryAccessToken = null;
      return null;
    }
    const data = (await resp.json()) as Partial<ApiAuthResponse> & { authenticated?: boolean };
    if (!data.authenticated || !data.accessToken || !data.user) {
      inMemoryAccessToken = null;
      return null;
    }
    inMemoryAccessToken = data.accessToken;
    return data as ApiAuthResponse;
  } catch {
    if (!API_BASE) {
      staticFallbackActive = true;
      const staticSession = await staticApi.restoreSession();
      inMemoryAccessToken = staticSession?.accessToken || null;
      return staticSession;
    }
    inMemoryAccessToken = null;
    return null;
  }
}

export async function refreshSessionToken(): Promise<ApiAuthResponse | null> {
  if (staticFallbackActive) {
    const staticSession = await staticApi.restoreSession();
    inMemoryAccessToken = staticSession?.accessToken || null;
    return staticSession;
  }
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const resp = await fetch(resolveApiUrl('/api/v1/auth/refresh'), {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Correlation-ID': generateCorrelationId(),
          },
        });
        const contentType = resp.headers.get('content-type') || '';
        if (isStaticHostResponse(resp.status, contentType)) {
          staticFallbackActive = true;
          const staticSession = await staticApi.restoreSession();
          inMemoryAccessToken = staticSession?.accessToken || null;
          return staticSession ? JSON.stringify(staticSession) : null;
        }
        if (!resp.ok || !contentType.includes('application/json')) {
          inMemoryAccessToken = null;
          return null;
        }
        const data = (await resp.json()) as ApiAuthResponse;
        inMemoryAccessToken = data.accessToken;
        return JSON.stringify(data);
      } catch {
        if (!API_BASE) {
          staticFallbackActive = true;
          const staticSession = await staticApi.restoreSession();
          inMemoryAccessToken = staticSession?.accessToken || null;
          return staticSession ? JSON.stringify(staticSession) : null;
        }
        inMemoryAccessToken = null;
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  const raw = await refreshPromise;
  return raw ? (JSON.parse(raw) as ApiAuthResponse) : null;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string; skipAuthRefresh?: boolean } = {}
): Promise<T> {
  const { idempotencyKey, skipAuthRefresh, headers: customHeaders, ...fetchOptions } = options;

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-ID': generateCorrelationId(),
    };
    if (inMemoryAccessToken) {
      h['Authorization'] = `Bearer ${inMemoryAccessToken}`;
    }
    if (idempotencyKey) {
      h['Idempotency-Key'] = idempotencyKey;
    }
    if (customHeaders && typeof customHeaders === 'object' && !Array.isArray(customHeaders)) {
      Object.assign(h, customHeaders as Record<string, string>);
    }
    return h;
  };

  const targetUrl = resolveApiUrl(path);
  let resp: Response;
  try {
    resp = await fetch(targetUrl, {
      ...fetchOptions,
      credentials: 'include',
      headers: buildHeaders(),
    });
  } catch (err) {
    if (!API_BASE) {
      throw new StaticBackendUnavailableError('API /api/v1 indisponível neste servidor.');
    }
    throw err;
  }

  if (resp.status === 401 && !skipAuthRefresh) {
    const refreshed = await refreshSessionToken();
    if (refreshed?.accessToken) {
      resp = await fetch(targetUrl, {
        ...fetchOptions,
        credentials: 'include',
        headers: buildHeaders(),
      });
    }
  }

  const contentType = resp.headers.get('content-type') || '';
  if (isStaticHostResponse(resp.status, contentType)) {
    throw new StaticBackendUnavailableError(`API /api/v1 indisponível (HTTP ${resp.status}).`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      `API /api/v1 indisponível neste servidor (HTTP ${resp.status}). Publique com o servidor Node (npm start) ou configure VITE_API_BASE_URL.`
    );
  }

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errMsg = (payload as { error?: string; message?: string }).error ||
      (payload as { message?: string }).message ||
      `Erro HTTP ${resp.status}`;
    throw new Error(errMsg);
  }

  return payload as T;
}

export const apiClient = {
  login: async (params: {
    identifier: string;
    password: string;
  }): Promise<ApiAuthResponse> => {
    const res = await withStaticFallback(
      () =>
        apiRequest<ApiAuthResponse>('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(params),
          skipAuthRefresh: true,
        }),
      () => staticApi.login(params)
    );
    inMemoryAccessToken = res.accessToken;
    return res;
  },

  registerTutor: async (
    tutor: Partial<Tutor>,
    password: string,
    email?: string
  ): Promise<ApiAuthResponse> => {
    const res = await withStaticFallback(
      () =>
        apiRequest<ApiAuthResponse>('/api/v1/auth/register/tutor', {
          method: 'POST',
          body: JSON.stringify({ tutor, password, email }),
          skipAuthRefresh: true,
        }),
      () => staticApi.registerTutor(tutor, password, email)
    );
    inMemoryAccessToken = res.accessToken;
    return res;
  },

  registerClinic: async (
    clinic: Partial<Institution>,
    password: string
  ): Promise<ApiAuthResponse> => {
    const res = await withStaticFallback(
      () =>
        apiRequest<ApiAuthResponse>('/api/v1/auth/register/clinic', {
          method: 'POST',
          body: JSON.stringify({ clinic, password }),
          skipAuthRefresh: true,
        }),
      () => staticApi.registerClinic(clinic, password)
    );
    inMemoryAccessToken = res.accessToken;
    return res;
  },

  logout: async (): Promise<void> => {
    try {
      await withStaticFallback(
        () => apiRequest('/api/v1/auth/logout', { method: 'POST', skipAuthRefresh: true }),
        () => staticApi.logout()
      );
    } finally {
      await staticApi.logout();
      inMemoryAccessToken = null;
    }
  },

  forgotPassword: (email: string) =>
    withStaticFallback(
      () =>
        apiRequest<{ success: boolean; message: string }>('/api/v1/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
          skipAuthRefresh: true,
        }),
      () => staticApi.forgotPassword(email)
    ),

  bootstrap: () =>
    withStaticFallback(
      () => apiRequest<BootstrapResponse>('/api/v1/bootstrap'),
      () => staticApi.bootstrap()
    ),

  addMovement: (params: {
    inventoryId: number;
    tipo: string;
    delta: number;
    motivo: string;
    dataColeta?: string;
    targetBagId?: number;
  }) =>
    withStaticFallback(
      () =>
        apiRequest<{
          success: boolean;
          inventoryItem: BloodInventoryItem;
          movement: BloodInventoryMovement;
          createdBag?: BloodBag;
          updatedBag?: BloodBag;
        }>('/api/v1/inventory/movements', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      () => staticApi.addMovement(params)
    ),

  discardBag: (bagId: number) =>
    withStaticFallback(
      () =>
        apiRequest<{
          success: boolean;
          inventoryItem: BloodInventoryItem;
          movement: BloodInventoryMovement;
          updatedBag?: BloodBag;
        }>(`/api/v1/blood-bags/${bagId}/discard`, {
          method: 'POST',
        }),
      () => staticApi.discardBag(bagId)
    ),

  createNeed: (params: {
    especie: Especie;
    tipoSanguineo: string;
    volumeSolicitadoMl: number;
    urgencia: UrgenciaLevel;
    descricao: string;
  }) =>
    withStaticFallback(
      () =>
        apiRequest<{
          need: BloodNeed;
          asyncDispatch: { messageId: string; status: string };
        }>('/api/v1/needs', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      () => staticApi.createNeed(params)
    ),

  expressInterest: (needId: number, petId: number) =>
    withStaticFallback(
      () =>
        apiRequest<{ interest: DonorInterest }>(`/api/v1/needs/${needId}/interest`, {
          method: 'POST',
          body: JSON.stringify({ petId }),
        }),
      () => staticApi.expressInterest(needId, petId)
    ),

  scheduleInterest: (interestId: number, slotHora: string) =>
    withStaticFallback(
      () =>
        apiRequest<{ appointment: Appointment }>('/api/v1/appointments/schedule', {
          method: 'POST',
          body: JSON.stringify({ interestId, slotHora }),
        }),
      () => staticApi.scheduleInterest(interestId, slotHora)
    ),

  confirmDonation: (
    appointmentId: number,
    params: {
      veterinarioCrmv: string;
      volumeColetado: number;
      hematocrito: number;
      pesoAferido: number;
      tipoConfirmado: string;
    }
  ) =>
    withStaticFallback(
      () =>
        apiRequest<{ success: boolean; voucher: Voucher; appointment: Appointment }>(
          `/api/v1/appointments/${appointmentId}/confirm-donation`,
          {
            method: 'POST',
            body: JSON.stringify(params),
            idempotencyKey: `confirm-donation-${appointmentId}-${params.veterinarioCrmv}`,
          }
        ),
      () => staticApi.confirmDonation(appointmentId, params)
    ),

  redeemVoucher: (codigo: string) =>
    withStaticFallback(
      () =>
        apiRequest<{ success: boolean; message: string; voucher?: Voucher }>(
          '/api/v1/vouchers/redeem',
          {
            method: 'POST',
            body: JSON.stringify({ codigo }),
            idempotencyKey: `redeem-voucher-${codigo.trim().toUpperCase()}`,
          }
        ),
      () => staticApi.redeemVoucher(codigo)
    ),

  registerPet: (petData: Omit<Pet, 'id' | 'tutorId' | 'statusElegibilidade'>) =>
    withStaticFallback(
      () =>
        apiRequest<{ pet: Pet }>('/api/v1/pets', {
          method: 'POST',
          body: JSON.stringify(petData),
        }),
      () => staticApi.registerPet(petData)
    ),

  deletePet: (petId: number) =>
    withStaticFallback(
      () =>
        apiRequest<{ success: boolean }>(`/api/v1/pets/${petId}`, {
          method: 'DELETE',
        }),
      () => staticApi.deletePet(petId)
    ),

  addEmployee: (params: {
    nome: string;
    cpf: string;
    cargo: string;
    crmv?: string;
    email?: string;
  }) =>
    withStaticFallback(
      () =>
        apiRequest<{ employee: InstitutionEmployee }>('/api/v1/employees', {
          method: 'POST',
          body: JSON.stringify(params),
        }),
      () => staticApi.addEmployee(params)
    ),

  updateEmployee: (
    employeeId: number,
    data: Partial<Omit<InstitutionEmployee, 'id' | 'institutionId'>>
  ) =>
    withStaticFallback(
      () =>
        apiRequest<{ success: boolean; employee: InstitutionEmployee }>(
          `/api/v1/employees/${employeeId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(data),
          }
        ),
      () => staticApi.updateEmployee(employeeId, data)
    ),

  removeEmployee: (employeeId: number) =>
    withStaticFallback(
      () =>
        apiRequest<{ success: boolean }>(`/api/v1/employees/${employeeId}`, {
          method: 'DELETE',
        }),
      () => staticApi.removeEmployee(employeeId)
    ),

  exportLgpd: () =>
    withStaticFallback(
      () => apiRequest<unknown>('/api/v1/tutor/export-lgpd'),
      () => staticApi.exportLgpd()
    ),

  getVapidPublicKey: () =>
    withStaticFallback(
      () =>
        apiRequest<{ publicKey: string; source: string }>('/api/v1/push/vapid-public-key', {
          skipAuthRefresh: true,
        }),
      () => staticApi.getVapidPublicKey()
    ),

  subscribePush: (subscription: PushSubscriptionJSON) =>
    withStaticFallback(
      () =>
        apiRequest<{ subscription: unknown }>('/api/v1/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({ subscription }),
        }),
      () => staticApi.subscribePush(subscription)
    ),

  sendTestPush: () =>
    withStaticFallback(
      () =>
        apiRequest<{ dispatched: boolean; subscriptionCount: number }>('/api/v1/push/test', {
          method: 'POST',
        }),
      () => staticApi.sendTestPush()
    ),

  getHealth: () =>
    withStaticFallback(
      () => apiRequest<Record<string, unknown>>('/api/v1/health', { skipAuthRefresh: true }),
      () => staticApi.getHealth()
    ),
  getTelemetry: () =>
    withStaticFallback(
      () => apiRequest<Record<string, unknown>>('/api/v1/observability/telemetry'),
      () => staticApi.getTelemetry()
    ),
  getQueueMetrics: () =>
    withStaticFallback(
      () => apiRequest<Record<string, unknown>>('/api/v1/messaging/queue'),
      () => staticApi.getQueueMetrics()
    ),
  replayDlq: () =>
    withStaticFallback(
      () => apiRequest<{ replayed: number }>('/api/v1/messaging/retry-dlq', { method: 'POST' }),
      () => staticApi.replayDlq()
    ),
};
