import type {
  Institution,
  InstitutionEmployee,
  Tutor,
  Pet,
  BloodInventoryItem,
  BloodInventoryMovement,
  BloodNeed,
  DonorInterest,
  Appointment,
  Voucher,
  AuditLogItem,
  BloodBag,
} from './types.ts';

export const initialInstitutions: Institution[] = [
  {
    id: 1,
    cnpj: '12.345.678/0001-90',
    razaoSocial: 'Hospital e Hemocentro Veterinário São Paulo LTDA',
    nomeFantasia: 'Hemovet Central 24h',
    crmvResponsavel: 'CRMV-SP 18452 (Dra. Camila Nogueira)',
    telefone: '(11) 3456-7890',
    emailContato: 'urgencias@hemovetcentral.com.br',
    cidade: 'São Paulo',
    estado: 'SP',
    capacidadeDiaria: 12,
    status: 'ACTIVE'
  },
  {
    id: 2,
    cnpj: '98.765.432/0001-11',
    razaoSocial: 'Clínica e Banco de Sangue Animal Rio LTDA',
    nomeFantasia: 'PetLife Hemoterapia',
    crmvResponsavel: 'CRMV-RJ 09321 (Dr. Marcos Vinicius)',
    telefone: '(21) 2233-4455',
    emailContato: 'contato@petlifehemo.com.br',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    capacidadeDiaria: 8,
    status: 'ACTIVE'
  }
];

export const initialEmployees: InstitutionEmployee[] = [
  {
    id: 1,
    institutionId: 1,
    nome: 'Dra. Camila Nogueira',
    cpf: '123.456.789-00',
    cargo: 'Diretora Clínica & Hemoterapeuta',
    crmv: 'CRMV-SP 18452',
    isAdmin: true,
    isActive: true
  },
  {
    id: 2,
    institutionId: 1,
    nome: 'Dr. Leonardo Braga',
    cpf: '234.567.890-11',
    cargo: 'Médico Veterinário Coletor',
    crmv: 'CRMV-SP 23114',
    isAdmin: false,
    isActive: true
  },
  {
    id: 3,
    institutionId: 1,
    nome: 'Juliana Prado',
    cpf: '345.678.901-22',
    cargo: 'Enfermeira Veterinária / Triagem',
    isAdmin: false,
    isActive: true
  }
];

export const initialTutors: Tutor[] = [
  {
    id: 1,
    userId: 10,
    nome: 'Ricardo Santos (Você)',
    cpf: '321.654.987-00',
    telefone: '(11) 98765-4321',
    whatsapp: '(11) 98765-4321',
    cidade: 'São Paulo',
    estado: 'SP',
    bairro: 'Moema',
    notifPush: true,
    lgpdAceito: true,
    lgpdVersao: 'v1.0-2026',
    dataAceite: '2026-03-15T10:30:00Z'
  },
  {
    id: 2,
    userId: 11,
    nome: 'Ana Clara Albuquerque',
    cpf: '456.789.123-44',
    telefone: '(11) 97654-3210',
    cidade: 'São Paulo',
    estado: 'SP',
    bairro: 'Pinheiros',
    notifPush: true,
    lgpdAceito: true,
    lgpdVersao: 'v1.0-2026',
    dataAceite: '2026-03-18T14:22:00Z'
  }
];

export const initialPets: Pet[] = [
  {
    id: 1,
    tutorId: 1,
    nome: 'Zeus',
    especie: 'CANINA',
    raca: 'Golden Retriever',
    sexo: 'MACHO',
    idadeAnos: 3,
    dataNascimento: '2023-04-15',
    pesoKg: 32.5,
    tipoSanguineo: 'DEA 1.1 Negativo (Doador Universal)',
    castrado: true,
    vacinadoEmDia: true,
    vermifugadoEmDia: true,
    statusElegibilidade: 'APTO',
    ultimaDoacaoEm: '2026-01-10',
    observacoes: 'Excelente temperamento dócil, jugular bem acessível.'
  },
  {
    id: 2,
    tutorId: 1,
    nome: 'Luna',
    especie: 'CANINA',
    raca: 'Pastor Alemão',
    sexo: 'FEMEA',
    idadeAnos: 4,
    dataNascimento: '2022-08-10',
    pesoKg: 28.0,
    tipoSanguineo: 'DEA 1.1 Positivo',
    castrado: true,
    vacinadoEmDia: true,
    vermifugadoEmDia: true,
    statusElegibilidade: 'APTO',
    ultimaDoacaoEm: '2025-11-04'
  },
  {
    id: 3,
    tutorId: 1,
    nome: 'Oliver',
    especie: 'FELINA',
    raca: 'Siamês',
    sexo: 'MACHO',
    idadeAnos: 2,
    dataNascimento: '2024-02-20',
    pesoKg: 4.8,
    tipoSanguineo: 'Tipo A',
    castrado: true,
    vacinadoEmDia: true,
    vermifugadoEmDia: true,
    statusElegibilidade: 'APTO',
    observacoes: 'FIV/FeLV negativo em teste PCR.'
  },
  {
    id: 4,
    tutorId: 2,
    nome: 'Thor',
    especie: 'CANINA',
    raca: 'Rottweiler',
    sexo: 'MACHO',
    idadeAnos: 5,
    dataNascimento: '2021-06-05',
    pesoKg: 44.0,
    tipoSanguineo: 'DEA 1.1 Negativo (Doador Universal)',
    castrado: true,
    vacinadoEmDia: true,
    vermifugadoEmDia: true,
    statusElegibilidade: 'APTO'
  }
];

export const initialInventory: BloodInventoryItem[] = [
  {
    id: 1,
    institutionId: 1,
    especie: 'CANINA',
    tipoSanguineo: 'DEA 1.1 Negativo',
    componente: 'SANGUE_TOTAL',
    volumeMl: 450,
    volumeMinimoAlerta: 900
  },
  {
    id: 2,
    institutionId: 1,
    especie: 'CANINA',
    tipoSanguineo: 'DEA 1.1 Positivo',
    componente: 'SANGUE_TOTAL',
    volumeMl: 1350,
    volumeMinimoAlerta: 900
  },
  {
    id: 3,
    institutionId: 1,
    especie: 'CANINA',
    tipoSanguineo: 'DEA 1.1 Negativo',
    componente: 'CONCENTRADO_HEMACIAS',
    volumeMl: 600,
    volumeMinimoAlerta: 500
  },
  {
    id: 4,
    institutionId: 1,
    especie: 'FELINA',
    tipoSanguineo: 'Tipo A',
    componente: 'SANGUE_TOTAL',
    volumeMl: 150,
    volumeMinimoAlerta: 250
  },
  {
    id: 5,
    institutionId: 1,
    especie: 'FELINA',
    tipoSanguineo: 'Tipo B (Raro)',
    componente: 'SANGUE_TOTAL',
    volumeMl: 50,
    volumeMinimoAlerta: 100
  }
];

// Rastreamento estrito de bolsas de sangue individuais com regra máxima de 40 dias
export const initialBloodBags: BloodBag[] = [
  {
    id: 1,
    inventoryId: 1,
    loteCodigo: 'BOLSA-CAN-20260923-01',
    volumeMl: 450,
    dataColeta: '2026-09-23',
    dataValidade: '2026-11-02', // 40 dias de conservação
    status: 'DISPONIVEL',
    doadorNome: 'Zeus',
    responsavelCrmv: 'CRMV-SP 18452'
  },
  {
    id: 2,
    inventoryId: 2,
    loteCodigo: 'BOLSA-CAN-20260921-02',
    volumeMl: 450,
    dataColeta: '2026-09-21',
    dataValidade: '2026-10-31', // 40 dias de conservação (Vence em breve)
    status: 'DISPONIVEL',
    doadorNome: 'Thor',
    responsavelCrmv: 'CRMV-SP 18452'
  },
  {
    id: 3,
    inventoryId: 2,
    loteCodigo: 'BOLSA-CAN-20261015-03',
    volumeMl: 450,
    dataColeta: '2026-10-15',
    dataValidade: '2026-11-24',
    status: 'DISPONIVEL',
    doadorNome: 'Luna',
    responsavelCrmv: 'CRMV-SP 21098'
  },
  {
    id: 4,
    inventoryId: 2,
    loteCodigo: 'BOLSA-CAN-20261025-04',
    volumeMl: 450,
    dataColeta: '2026-10-25',
    dataValidade: '2026-12-04',
    status: 'DISPONIVEL',
    doadorNome: 'Apolo',
    responsavelCrmv: 'CRMV-SP 18452'
  },
  {
    id: 5,
    inventoryId: 3,
    loteCodigo: 'BOLSA-CH-20261010-05',
    volumeMl: 300,
    dataColeta: '2026-10-10',
    dataValidade: '2026-11-19',
    status: 'DISPONIVEL',
    doadorNome: 'Zeus',
    responsavelCrmv: 'CRMV-SP 18452'
  },
  {
    id: 6,
    inventoryId: 3,
    loteCodigo: 'BOLSA-CH-20261018-06',
    volumeMl: 300,
    dataColeta: '2026-10-18',
    dataValidade: '2026-11-27',
    status: 'DISPONIVEL',
    doadorNome: 'Max',
    responsavelCrmv: 'CRMV-SP 21098'
  },
  {
    id: 7,
    inventoryId: 4,
    loteCodigo: 'BOLSA-FEL-20260922-07',
    volumeMl: 50,
    dataColeta: '2026-09-22',
    dataValidade: '2026-11-01', // 40 dias de conservação (Vence em breve)
    status: 'DISPONIVEL',
    doadorNome: 'Oliver',
    responsavelCrmv: 'CRMV-SP 18452'
  },
  {
    id: 8,
    inventoryId: 4,
    loteCodigo: 'BOLSA-FEL-20261012-08',
    volumeMl: 50,
    dataColeta: '2026-10-12',
    dataValidade: '2026-11-21',
    status: 'DISPONIVEL',
    doadorNome: 'Milo',
    responsavelCrmv: 'CRMV-SP 18452'
  },
  {
    id: 9,
    inventoryId: 4,
    loteCodigo: 'BOLSA-FEL-20261022-09',
    volumeMl: 50,
    dataColeta: '2026-10-22',
    dataValidade: '2026-12-01',
    status: 'DISPONIVEL',
    doadorNome: 'Simba',
    responsavelCrmv: 'CRMV-SP 21098'
  },
  {
    id: 10,
    inventoryId: 5,
    loteCodigo: 'BOLSA-FEL-20261020-10',
    volumeMl: 50,
    dataColeta: '2026-10-20',
    dataValidade: '2026-11-29',
    status: 'DISPONIVEL',
    doadorNome: 'Luna Gata',
    responsavelCrmv: 'CRMV-SP 18452'
  }
];

export const initialMovements: BloodInventoryMovement[] = [
  {
    id: 1,
    inventoryId: 1,
    tipoMovimento: 'SAIDA_TRANSFUSAO',
    volumeDeltaMl: -450,
    volumeAnteriorMl: 900,
    volumePosteriorMl: 450,
    motivo: 'Transfusão de emergência - Paciente atropelado (Hospital Veterinário)',
    loteCodigo: 'BOLSA-CAN-20260301-A',
    realizadoPor: 'Dra. Camila Nogueira',
    createdAt: '2026-03-22 09:15'
  },
  {
    id: 2,
    inventoryId: 2,
    tipoMovimento: 'ENTRADA_DOACAO',
    volumeDeltaMl: 450,
    volumeAnteriorMl: 900,
    volumePosteriorMl: 1350,
    motivo: 'Doação de sangue voluntária do pet Thor (Tutor: Ana Clara)',
    loteCodigo: 'BOLSA-CAN-20260318-B',
    realizadoPor: 'Dr. Leonardo Braga',
    createdAt: '2026-03-18 16:30'
  }
];

export const initialNeeds: BloodNeed[] = [
  {
    id: 1,
    institutionId: 1,
    institutionNome: 'Hemovet Central 24h',
    especie: 'CANINA',
    tipoSanguineo: 'DEA 1.1 Negativo (Universal)',
    volumeSolicitadoMl: 900,
    urgencia: 'CRITICA',
    status: 'ACTIVE',
    descricao: 'Estoque de DEA 1.1 negativo em nível crítico de segurança. Dois pacientes em UTI cirúrgica necessitando de transfusão imediata.',
    cidade: 'São Paulo',
    notificadosCount: 28,
    interessadosCount: 4,
    createdAt: 'Hoje às 08:30'
  },
  {
    id: 2,
    institutionId: 1,
    institutionNome: 'Hemovet Central 24h',
    especie: 'FELINA',
    tipoSanguineo: 'Tipo A',
    volumeSolicitadoMl: 200,
    urgencia: 'ALTA',
    status: 'ACTIVE',
    descricao: 'Reposição preventiva para procedimento de colectomia felina agendado.',
    cidade: 'São Paulo',
    notificadosCount: 12,
    interessadosCount: 2,
    createdAt: 'Ontem às 14:00'
  }
];

export const initialInterests: DonorInterest[] = [
  {
    id: 1,
    needId: 1,
    tutorId: 1,
    tutorNome: 'Ricardo Santos',
    tutorTelefone: '(11) 98765-4321',
    petId: 1,
    petNome: 'Zeus',
    petEspecie: 'CANINA',
    petPesoKg: 32.5,
    status: 'MANIFESTADO',
    createdAt: 'Hoje às 09:10'
  },
  {
    id: 2,
    needId: 1,
    tutorId: 2,
    tutorNome: 'Ana Clara Albuquerque',
    tutorTelefone: '(11) 97654-3210',
    petId: 4,
    petNome: 'Thor',
    petEspecie: 'CANINA',
    petPesoKg: 44.0,
    status: 'SELECIONADO_AGENDAMENTO',
    createdAt: 'Hoje às 09:40'
  }
];

export const initialAppointments: Appointment[] = [
  {
    id: 1,
    institutionId: 1,
    tutorId: 1,
    tutorNome: 'Ricardo Santos',
    petId: 1,
    petNome: 'Zeus',
    petEspecie: 'CANINA',
    petPesoKg: 32.5,
    tipoSanguineo: 'DEA 1.1 Negativo',
    dataHora: '2026-10-10 10:30',
    slotCodigo: 'SLOT-HEMOVET-MANHA-01',
    status: 'SCHEDULED'
  },
  {
    id: 2,
    institutionId: 1,
    tutorId: 2,
    tutorNome: 'Ana Clara Albuquerque',
    petId: 4,
    petNome: 'Thor',
    petEspecie: 'CANINA',
    petPesoKg: 44.0,
    tipoSanguineo: 'DEA 1.1 Negativo',
    dataHora: '2026-10-10 14:00',
    slotCodigo: 'SLOT-HEMOVET-TARDE-01',
    status: 'CONFIRMED'
  }
];

export const initialVouchers: Voucher[] = [
  {
    id: 1,
    donationId: 101,
    tutorId: 1,
    tutorNome: 'Ricardo Santos',
    institutionId: 1,
    institutionNome: 'Hemovet Central 24h',
    codigo: 'DOEPET-CAN-9812-ZEUS',
    beneficioDescricao: 'Check-up Clínico Preventivo Completo + Hemograma Gratuito + Isenção em Vacina Antirrábica',
    dataValidade: '2026-12-31',
    status: 'ATIVO'
  }
];

export const initialAuditLogs: AuditLogItem[] = [
  {
    id: 1,
    actorId: 1,
    actorType: 'INSTITUTION_ADMIN',
    action: 'CREATE_BLOOD_NEED',
    resourceType: 'BloodNeed',
    resourceId: '1',
    correlationId: 'req-c7a829f0-2026-0322-001',
    beforeData: undefined,
    afterData: JSON.stringify({ especie: 'CANINA', tipo: 'DEA 1.1 Negativo', volumeMl: 900, urgencia: 'CRITICA' }),
    createdAt: '2026-03-22 08:30:12'
  },
  {
    id: 2,
    actorId: 1,
    actorType: 'SYSTEM_NOTIFICATION',
    action: 'DISPATCH_PUSH_ALERTS',
    resourceType: 'NeedNotification',
    resourceId: '28_DESTINATARIOS',
    correlationId: 'req-c7a829f0-2026-0322-002',
    afterData: JSON.stringify({ totalEnviados: 28, taxaEntrega: '98.4%', canal: 'PUSH' }),
    createdAt: '2026-03-22 08:30:15'
  },
  {
    id: 3,
    actorId: 10,
    actorType: 'TUTOR',
    action: 'EXPRESS_DONOR_INTEREST',
    resourceType: 'DonorInterest',
    resourceId: '1',
    correlationId: 'req-e54911d3-2026-0322-003',
    afterData: JSON.stringify({ needId: 1, tutor: 'Ricardo Santos', pet: 'Zeus (Golden Retriever)' }),
    createdAt: '2026-03-22 09:10:04'
  }
];
