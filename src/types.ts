export type Role = 'INSTITUTION_ADMIN' | 'INSTITUTION_EMPLOYEE' | 'TUTOR' | 'PLATFORM_ADMIN';

export type AuthMode = 'LOGIN' | 'SELECT_PROFILE' | 'REGISTER_TUTOR' | 'REGISTER_CLINIC' | 'FORGOT_PASSWORD';

export interface AuthenticatedUser {
  id: number;
  nome: string;
  email: string;
  role: Role;
  documento: string; // CPF or CNPJ
  avatarUrl?: string;
  isLoggedIn: boolean;
}

export type Especie = 'CANINA' | 'FELINA';

export type BloodComponent = 'SANGUE_TOTAL' | 'CONCENTRADO_HEMACIAS' | 'PLASMA_FRESCO_CONGELADO' | 'CRIOPRECIPITADO';

export type UrgenciaLevel = 'CRITICA' | 'ALTA' | 'MODERADA';

export type PetElegibilidade = 'APTO' | 'EM_ANALISE' | 'INAPTO_TEMPORARIO' | 'INAPTO_DEFINITIVO';

export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'ATTENDED' | 'CANCELLED' | 'NO_SHOW';

export type VoucherStatus = 'ATIVO' | 'RESGATADO' | 'EXPIRADO';

export interface User {
  id: number;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface Institution {
  id: number;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  crmvResponsavel: string;
  telefone: string;
  emailContato: string;
  cidade: string;
  estado: string;
  capacidadeDiaria: number;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}

export interface InstitutionEmployee {
  id: number;
  institutionId: number;
  nome: string;
  cpf: string;
  cargo: string;
  crmv?: string;
  email?: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface Tutor {
  id: number;
  userId: number;
  nome: string;
  cpf: string;
  telefone: string;
  whatsapp?: string;
  cidade: string;
  estado: string;
  bairro: string;
  notifPush: boolean;
  lgpdAceito: boolean;
  lgpdVersao: string;
  dataAceite: string;
}

export interface Pet {
  id: number;
  tutorId: number;
  nome: string;
  especie: Especie;
  raca: string;
  sexo: 'MACHO' | 'FEMEA';
  idadeAnos: number;
  dataNascimento?: string; // Formato YYYY-MM-DD (real ou estimada para o banco de dados SQL)
  pesoKg: number;
  tipoSanguineo: string;
  castrado: boolean;
  vacinadoEmDia: boolean;
  vermifugadoEmDia: boolean;
  statusElegibilidade: PetElegibilidade;
  ultimaDoacaoEm?: string;
  observacoes?: string;
}

export interface BloodInventoryItem {
  id: number;
  institutionId: number;
  especie: Especie;
  tipoSanguineo: string;
  componente: BloodComponent;
  volumeMl: number;
  volumeMinimoAlerta: number;
}

export interface BloodBag {
  id: number;
  inventoryId: number;
  loteCodigo: string;
  volumeMl: number;
  dataColeta: string; // Formato YYYY-MM-DD
  dataValidade: string; // Formato YYYY-MM-DD (limite estrito de 40 dias pós-coleta)
  status: 'DISPONIVEL' | 'UTILIZADA' | 'DESCARTADA_VENCIMENTO';
  doadorNome?: string;
  responsavelCrmv?: string;
}

export interface BloodInventoryMovement {
  id: number;
  inventoryId: number;
  tipoMovimento: 'ENTRADA_DOACAO' | 'SAIDA_TRANSFUSAO' | 'SAIDA_VENCIMENTO' | 'AJUSTE_AUDITORIA';
  volumeDeltaMl: number;
  volumeAnteriorMl: number;
  volumePosteriorMl: number;
  motivo: string;
  loteCodigo?: string;
  realizadoPor: string;
  createdAt: string;
}

export interface BloodNeed {
  id: number;
  institutionId: number;
  institutionNome: string;
  especie: Especie;
  tipoSanguineo: string;
  volumeSolicitadoMl: number;
  urgencia: UrgenciaLevel;
  status: 'ACTIVE' | 'FULFILLED' | 'CANCELLED';
  descricao: string;
  cidade: string;
  notificadosCount: number;
  interessadosCount: number;
  createdAt: string;
}

export interface DonorInterest {
  id: number;
  needId: number;
  tutorId: number;
  tutorNome: string;
  tutorTelefone: string;
  petId: number;
  petNome: string;
  petEspecie: Especie;
  petPesoKg: number;
  status: 'MANIFESTADO' | 'SELECIONADO_AGENDAMENTO' | 'CANCELADO_TUTOR' | 'DISPENSADO';
  createdAt: string;
}

export interface Appointment {
  id: number;
  institutionId: number;
  tutorId: number;
  tutorNome: string;
  petId: number;
  petNome: string;
  petEspecie: Especie;
  petPesoKg: number;
  tipoSanguineo: string;
  dataHora: string;
  slotCodigo: string;
  status: AppointmentStatus;
}

export interface Donation {
  id: number;
  appointmentId: number;
  institutionId: number;
  tutorId: number;
  petId: number;
  petNome: string;
  veterinarioCrmv: string;
  volumeColetadoMl: number;
  loteBolsa: string;
  dataValidadeBolsa: string;
  tipoSanguineoConfirmado: string;
  hematocrito: number;
  pesoAferidoKg: number;
  voucherCodigo: string;
  createdAt: string;
}

export interface Voucher {
  id: number;
  donationId: number;
  tutorId: number;
  tutorNome: string;
  institutionId: number;
  institutionNome: string;
  codigo: string;
  beneficioDescricao: string;
  dataValidade: string;
  status: VoucherStatus;
  resgatadoEm?: string;
}

export interface AuditLogItem {
  id: number;
  actorId: number;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  beforeData?: string;
  afterData?: string;
  createdAt: string;
}
