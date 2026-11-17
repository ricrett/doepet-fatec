import React, { useState } from 'react';
import {
  BloodInventoryItem,
  BloodBag,
  BloodInventoryMovement,
  BloodNeed,
  DonorInterest,
  Appointment,
  Institution,
  InstitutionEmployee,
  Voucher,
  Pet,
  Especie,
  UrgenciaLevel
} from '../types';
import {
  HeartPulse,
  AlertTriangle,
  Calendar,
  Users,
  Ticket,
  PlusCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Stethoscope,
  Clock,
  Sparkles,
  ShieldAlert,
  Send,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Pencil,
  Trash2,
  Search,
  AlertCircle,
  UserX,
  UserCheck,
  Shield,
  Package,
  Layers,
  Timer,
  ShieldCheck,
  Activity,
  ChevronDown,
  ChevronUp,
  CalendarCheck
} from 'lucide-react';

interface InstitutionViewProps {
  institution: Institution;
  inventory: BloodInventoryItem[];
  movements: BloodInventoryMovement[];
  bloodBags?: BloodBag[];
  needs: BloodNeed[];
  interests: DonorInterest[];
  appointments: Appointment[];
  employees: InstitutionEmployee[];
  vouchers: Voucher[];
  allPets: Pet[];
  onAddMovement: (
    inventoryId: number,
    tipo: any,
    delta: number,
    motivo: string,
    dataColeta?: string,
    targetBagId?: number
  ) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onDiscardBag?: (bagId: number) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onCreateNeed: (
    especie: Especie,
    tipo: string,
    volume: number,
    urgencia: UrgenciaLevel,
    descricao: string
  ) => Promise<{ success: boolean; error?: string } | void> | { success: boolean; error?: string } | void;
  onConfirmDonation: (
    appointmentId: number,
    veterinarioCrmv: string,
    volumeColetado: number,
    hematocrito: number,
    pesoAferido: number,
    tipoConfirmado: string
  ) => Promise<{ success: boolean; voucherCode?: string; error?: string }> | { success: boolean; voucherCode?: string; error?: string };
  onRedeemVoucher: (codigo: string) => Promise<{ success: boolean; message: string }> | { success: boolean; message: string };
  onAddEmployee: (
    nome: string,
    cpf: string,
    cargo: string,
    crmv: string,
    email: string
  ) => Promise<{ success: boolean; error?: string } | void> | { success: boolean; error?: string } | void;
  onUpdateEmployee: (
    id: number,
    data: Partial<Omit<InstitutionEmployee, 'id' | 'institutionId'>>
  ) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onRemoveEmployee: (id: number) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
  onScheduleInterest: (interest: DonorInterest, slotHora: string) => Promise<void> | void;
}

export const InstitutionView: React.FC<InstitutionViewProps> = ({
  institution,
  inventory,
  movements,
  bloodBags = [],
  needs,
  interests,
  appointments,
  employees,
  vouchers,
  allPets,
  onAddMovement,
  onDiscardBag,
  onCreateNeed,
  onConfirmDonation,
  onRedeemVoucher,
  onAddEmployee,
  onUpdateEmployee,
  onRemoveEmployee,
  onScheduleInterest
}) => {
  const [activeTab, setActiveTab] = useState<'HOME' | 'ESTOQUE' | 'ALERTAS' | 'AGENDAMENTOS' | 'FUNCIONARIOS' | 'VOUCHERS'>('HOME');
  const [isKpisOpen, setIsKpisOpen] = useState(false);

  // Form states
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedInvId, setSelectedInvId] = useState<number>(inventory[0]?.id || 1);
  const [movTipo, setMovTipo] = useState<'SAIDA_TRANSFUSAO' | 'ENTRADA_DOACAO' | 'SAIDA_VENCIMENTO'>('SAIDA_TRANSFUSAO');
  const [movVolume, setMovVolume] = useState<number>(450);
  const [movMotivo, setMovMotivo] = useState<string>('');
  const [movDataColeta, setMovDataColeta] = useState<string>('2026-10-28');
  const [stockError, setStockError] = useState<string | null>(null);

  // Modal para detalhamento e inspeção de bolsas/lotes do estoque com regra de 40 dias
  const [selectedInvBagsModal, setSelectedInvBagsModal] = useState<BloodInventoryItem | null>(null);
  const [confirmDiscardBagId, setConfirmDiscardBagId] = useState<number | null>(null);
  const [discardBagError, setDiscardBagError] = useState<string | null>(null);

  // Validade máxima de 40 dias sob refrigeração
  const SHELF_LIFE_DAYS = 40;

  const calculateBagExpiration = (dataColetaStr: string): string => {
    const d = new Date(dataColetaStr + 'T00:00:00');
    d.setDate(d.getDate() + SHELF_LIFE_DAYS);
    return d.toISOString().split('T')[0];
  };

  const getBagDaysRemaining = (validityDateStr: string, referenceDateStr = '2026-10-28'): number => {
    const exp = new Date(validityDateStr + 'T00:00:00');
    const ref = new Date(referenceDateStr + 'T00:00:00');
    return Math.ceil((exp.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getBagCollectionDaysAgo = (collectionDateStr: string, referenceDateStr = '2026-10-28'): number => {
    const col = new Date(collectionDateStr + 'T00:00:00');
    const ref = new Date(referenceDateStr + 'T00:00:00');
    return Math.max(0, Math.floor((ref.getTime() - col.getTime()) / (1000 * 60 * 60 * 24)));
  };

  // Totais consolidados para exibição nos cards da clínica
  const totalStockMl = inventory.reduce((acc, i) => acc + i.volumeMl, 0);
  const dogStockMl = inventory.filter((i) => i.especie === 'CANINA').reduce((acc, i) => acc + i.volumeMl, 0);
  const catStockMl = inventory.filter((i) => i.especie === 'FELINA').reduce((acc, i) => acc + i.volumeMl, 0);

  const availableBags = (bloodBags || []).filter((b) => b.status === 'DISPONIVEL');
  const totalBagsCount = availableBags.length;
  const expiringSoonBags = availableBags.filter((b) => {
    const rem = getBagDaysRemaining(b.dataValidade);
    return rem <= 10 && rem > 0;
  });
  const expiringSoonVolumeTotal = expiringSoonBags.reduce((acc, b) => acc + b.volumeMl, 0);

  const activeNeeds = needs.filter((n) => n.institutionId === institution.id && n.status === 'ACTIVE');
  const criticalNeedsCount = activeNeeds.filter((n) => n.urgencia === 'CRITICA' || n.urgencia === 'ALTA').length;

  const clinicAppointments = appointments.filter((a) => a.institutionId === institution.id);
  const pendingAppointments = clinicAppointments.filter((a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED');

  const activeEmployees = employees.filter((e) => e.isActive);

  const clinicVouchers = vouchers.filter((v) => v.institutionId === institution.id);
  const activeVouchers = clinicVouchers.filter((v) => v.status === 'ATIVO');

  // New Need Form
  const [showNeedModal, setShowNeedModal] = useState(false);
  const [needEspecie, setNeedEspecie] = useState<Especie>('CANINA');
  const [needTipo, setNeedTipo] = useState<string>('DEA 1.1 Negativo');
  const [needVolume, setNeedVolume] = useState<number>(900);
  const [needUrgencia, setNeedUrgencia] = useState<UrgenciaLevel>('CRITICA');
  const [needDescricao, setNeedDescricao] = useState<string>('');

  // Donation Screening Form Modal
  const [screeningAppId, setScreeningAppId] = useState<number | null>(null);
  const [screenCrmv, setScreenCrmv] = useState<string>(institution.crmvResponsavel);
  const [screenVolume, setScreenVolume] = useState<number>(450);
  const [screenHematocrito, setScreenHematocrito] = useState<number>(42);
  const [screenPeso, setScreenPeso] = useState<number>(30);
  const [screenTipo, setScreenTipo] = useState<string>('DEA 1.1 Negativo');
  const [screenSuccessMessage, setScreenSuccessMessage] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  // Voucher Redeemer
  const [voucherCodeInput, setVoucherCodeInput] = useState<string>('');
  const [voucherFeedback, setVoucherFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  // New Employee Form
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [empNome, setEmpNome] = useState('');
  const [empCpf, setEmpCpf] = useState('');
  const [empCargo, setEmpCargo] = useState('');
  const [empCrmv, setEmpCrmv] = useState('');
  const [empEmail, setEmpEmail] = useState('');

  // Edit Employee Form
  const [editingEmployee, setEditingEmployee] = useState<InstitutionEmployee | null>(null);
  const [editEmpNome, setEditEmpNome] = useState('');
  const [editEmpCpf, setEditEmpCpf] = useState('');
  const [editEmpCargo, setEditEmpCargo] = useState('');
  const [editEmpCrmv, setEditEmpCrmv] = useState('');
  const [editEmpEmail, setEditEmpEmail] = useState('');
  const [editEmpIsAdmin, setEditEmpIsAdmin] = useState(false);
  const [editEmpIsActive, setEditEmpIsActive] = useState(true);
  const [editEmpError, setEditEmpError] = useState<string | null>(null);

  // Remove Employee Form
  const [deletingEmployee, setDeletingEmployee] = useState<InstitutionEmployee | null>(null);
  const [deleteEmpError, setDeleteEmpError] = useState<string | null>(null);

  // Notification feedback
  const [employeeFeedback, setEmployeeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  // Agendamento de Doadores Interessados (Alertas & Notificações -> Triagem Clínica)
  const [schedulingInterest, setSchedulingInterest] = useState<DonorInterest | null>(null);
  const [scheduleSlot, setScheduleSlot] = useState<string>('Amanhã às 10:00');
  const [scheduleCustomTime, setScheduleCustomTime] = useState<string>('');

  const handleConfirmSchedule = async (interest: DonorInterest, slotText?: string) => {
    const chosenSlot = slotText || (scheduleCustomTime.trim() ? scheduleCustomTime.trim() : scheduleSlot);
    await onScheduleInterest(interest, chosenSlot);
    setScreenSuccessMessage(
      `Agendamento confirmado com sucesso para o pet ${interest.petNome} (Tutor: ${interest.tutorNome}) no horário "${chosenSlot}"! Redirecionado para a fila de Triagem Clínica.`
    );
    setSchedulingInterest(null);
    setScheduleCustomTime('');
    setActiveTab('AGENDAMENTOS');
  };

  // Handlers
  const handleMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStockError(null);
    const result = await onAddMovement(selectedInvId, movTipo, movVolume, movMotivo, movDataColeta);
    if (!result.success) {
      setStockError(result.error || 'Erro na operação de estoque.');
    } else {
      setShowMovementModal(false);
      setMovMotivo('');
      setMovDataColeta('2026-10-28');
    }
  };

  const handleCreateNeedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onCreateNeed(needEspecie, needTipo, needVolume, needUrgencia, needDescricao);
    if (res && 'success' in res && !res.success) {
      return;
    }
    setShowNeedModal(false);
    setNeedDescricao('');
  };

  const handleScreeningSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screeningAppId) return;
    setScreenError(null);

    const res = await onConfirmDonation(
      screeningAppId,
      screenCrmv,
      screenVolume,
      screenHematocrito,
      screenPeso,
      screenTipo
    );

    if (res.success) {
      setScreenSuccessMessage(`Doação de ${screenVolume}mL registrada! Voucher de benefício gerado: ${res.voucherCode}`);
      setScreeningAppId(null);
      setTimeout(() => setScreenSuccessMessage(null), 6000);
    } else {
      setScreenError(res.error || 'Falha na triagem clínica.');
    }
  };

  const handleRedeemVoucherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onRedeemVoucher(voucherCodeInput);
    setVoucherFeedback({ success: res.success, msg: res.message });
    if (res.success) {
      setVoucherCodeInput('');
    }
  };

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onAddEmployee(empNome, empCpf, empCargo, empCrmv, empEmail);
    if (res && 'success' in res && !res.success) {
      setEmployeeFeedback({
        type: 'error',
        message: res.error || 'Erro ao cadastrar colaborador.'
      });
      return;
    }
    setShowEmpModal(false);
    setEmployeeFeedback({
      type: 'success',
      message: `Colaborador(a) "${empNome}" cadastrado(a) com sucesso!`
    });
    setEmpNome('');
    setEmpCpf('');
    setEmpCargo('');
    setEmpCrmv('');
    setEmpEmail('');
    setTimeout(() => setEmployeeFeedback(null), 4000);
  };

  const handleOpenEditEmployee = (emp: InstitutionEmployee) => {
    setEditingEmployee(emp);
    setEditEmpNome(emp.nome);
    setEditEmpCpf(emp.cpf);
    setEditEmpCargo(emp.cargo);
    setEditEmpCrmv(emp.crmv || '');
    setEditEmpEmail(emp.email || '');
    setEditEmpIsAdmin(emp.isAdmin);
    setEditEmpIsActive(emp.isActive);
    setEditEmpError(null);
  };

  const handleSaveEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setEditEmpError(null);
    const res = await onUpdateEmployee(editingEmployee.id, {
      nome: editEmpNome.trim(),
      cpf: editEmpCpf.trim(),
      cargo: editEmpCargo.trim(),
      crmv: editEmpCrmv.trim() || undefined,
      email: editEmpEmail.trim() || undefined,
      isAdmin: editEmpIsAdmin,
      isActive: editEmpIsActive
    });

    if (!res.success) {
      setEditEmpError(res.error || 'Erro ao atualizar dados do colaborador.');
      return;
    }

    setEmployeeFeedback({
      type: 'success',
      message: `Dados do colaborador(a) "${editEmpNome}" atualizados com sucesso!`
    });
    setEditingEmployee(null);
    setTimeout(() => setEmployeeFeedback(null), 4000);
  };

  const handleConfirmRemoveEmployee = async () => {
    if (!deletingEmployee) return;

    setDeleteEmpError(null);
    const res = await onRemoveEmployee(deletingEmployee.id);
    if (!res.success) {
      setDeleteEmpError(res.error || 'Erro ao remover colaborador.');
      return;
    }

    setEmployeeFeedback({
      type: 'success',
      message: `Colaborador(a) "${deletingEmployee.nome}" foi removido(a) com sucesso da equipe.`
    });
    setDeletingEmployee(null);
    setTimeout(() => setEmployeeFeedback(null), 4000);
  };

  const handleToggleActiveFromModal = async () => {
    if (!deletingEmployee) return;

    setDeleteEmpError(null);
    const newStatus = !deletingEmployee.isActive;
    const res = await onUpdateEmployee(deletingEmployee.id, { isActive: newStatus });
    if (!res.success) {
      setDeleteEmpError(res.error || 'Erro ao alterar status do colaborador.');
      return;
    }

    setEmployeeFeedback({
      type: 'success',
      message: `Status de "${deletingEmployee.nome}" alterado para ${newStatus ? 'ATIVO' : 'INATIVO'}.`
    });
    setDeletingEmployee(null);
    setTimeout(() => setEmployeeFeedback(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Clinic Header Info */}
      <div className="p-5 sm:p-6 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-neutral-100">
              {institution.nomeFantasia}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              {institution.status}
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            CNPJ: {institution.cnpj} • {institution.crmvResponsavel} • {institution.cidade}/{institution.estado}
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNeedModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Emitir Alerta Urgente</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMovementModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Movimentar Estoque</span>
          </button>
        </div>
      </div>

      {/* Success banner if donation screened */}
      {screenSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{screenSuccessMessage}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TELA INICIAL: HUB DE MÓDULOS DA CLÍNICA                  */}
      {/* ======================================================== */}
      {activeTab === 'HOME' && (
        <div className="space-y-6">
          {/* Intro text */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Painel de Gestão da Clínica Veterinária
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Selecione uma área abaixo para gerenciar o estoque hemoterápico, emitir alertas, realizar triagens e validar vouchers.
              </p>
            </div>
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-3 py-1 rounded-full border border-emerald-200/60 dark:border-neutral-700 w-fit">
              Sistema Operacional • 5 Módulos
            </div>
          </div>

          {/* 5 Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Card: Estoque de Sangue */}
            <div
              onClick={() => setActiveTab('ESTOQUE')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    {totalBagsCount} {totalBagsCount === 1 ? 'bolsa ativa' : 'bolsas ativas'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Estoque de Sangue
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Saldo físico real em refrigeração, com histórico de doações (+), transfusões (-) e controle de validade de 40 dias.
                  </p>
                </div>

                <div className="py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Volume Físico Total:</span>
                    <span className="font-black text-neutral-900 dark:text-neutral-100 text-sm">
                      {totalStockMl} mL
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200/50 dark:border-neutral-800 text-[11px]">
                    <span className="text-neutral-600 dark:text-neutral-300">🐕 Cães: <strong>{dogStockMl} mL</strong></span>
                    <span className="text-neutral-600 dark:text-neutral-300">🐈 Gatos: <strong>{catStockMl} mL</strong></span>
                  </div>
                  {expiringSoonVolumeTotal > 0 && (
                    <div className="pt-1 border-t border-amber-200/40 dark:border-amber-900/40 flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        Validade próxima (≤10d):
                      </span>
                      <span>{expiringSoonVolumeTotal} mL</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Acessar Estoque de Sangue</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 2. Card: Alertas de Doação */}
            <div
              onClick={() => setActiveTab('ALERTAS')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  {activeNeeds.length > 0 ? (
                    <span className="text-[10px] font-semibold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-rose-200/70 dark:border-neutral-700">
                      {activeNeeds.length} {activeNeeds.length === 1 ? 'alerta ativo' : 'alertas ativos'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                      Estável
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Alertas de Doação
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Disparo de chamados emergenciais por tipo sanguíneo e acompanhamento de tutores com pets compatíveis mobilizados.
                  </p>
                </div>

                <div className="py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Urgências críticas:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {criticalNeedsCount > 0 ? `${criticalNeedsCount} prioritária(s)` : 'Sem urgências graves'}
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Ver Alertas de Doação</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 3. Card: Agendamentos & Triagem */}
            <div
              onClick={() => setActiveTab('AGENDAMENTOS')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    {clinicAppointments.length} {clinicAppointments.length === 1 ? 'coleta' : 'coletas'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Agendamentos &amp; Triagem
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Agendamentos de doadores com checagem de parâmetros clínicos (peso, hematócrito, CRMV e emissão de vouchers).
                  </p>
                </div>

                <div className="py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Coletas pendentes:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {pendingAppointments.length > 0 ? `${pendingAppointments.length} aguardando triagem` : 'Todas realizadas'}
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Acessar Agendamentos &amp; Triagem</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 4. Card: Equipe da Clínica */}
            <div
              onClick={() => setActiveTab('FUNCIONARIOS')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    {employees.length} {employees.length === 1 ? 'colaborador' : 'colaboradores'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Equipe da Clínica
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Gestão de veterinários e atendentes, controle de acessos, regras de segurança e proteção de administradores.
                  </p>
                </div>

                <div className="py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Colaboradores ativos:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {activeEmployees.length} ativos
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Gerenciar Equipe da Clínica</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 5. Card: Validação de Vouchers */}
            <div
              onClick={() => setActiveTab('VOUCHERS')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    {vouchers.length} {vouchers.length === 1 ? 'emitido' : 'emitidos'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Validação de Vouchers
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Leitura e validação instantânea de códigos de vouchers apresentados por tutores para liberação de benefícios.
                  </p>
                </div>

                <div className="py-2.5 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Resgates disponíveis:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {activeVouchers.length} {activeVouchers.length === 1 ? 'ativo' : 'ativos'}
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Acessar Validação de Vouchers</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: ESTOQUE                                           */}
      {/* ======================================================== */}
      {activeTab === 'ESTOQUE' && (
        <div className="space-y-6">
          {/* Barra de Navegação: Voltar para Tela Inicial */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('HOME')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Voltar para a Tela Inicial</span>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
                <HeartPulse className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Estoque de Sangue</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{totalStockMl} mL em estoque ({totalBagsCount} bolsas)</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventory.map((inv) => {
              const isBelowMin = inv.volumeMl < inv.volumeMinimoAlerta;
              const invBags = (bloodBags || []).filter(
                (b) => b.inventoryId === inv.id && b.status === 'DISPONIVEL'
              );
              const expiringSoonBags = invBags.filter((b) => {
                const rem = getBagDaysRemaining(b.dataValidade);
                return rem <= 10 && rem > 0;
              });
              const expiringSoonVolume = expiringSoonBags.reduce((acc, b) => acc + b.volumeMl, 0);
              const expiredBags = invBags.filter((b) => {
                const rem = getBagDaysRemaining(b.dataValidade);
                return rem <= 0;
              });
              const expiredVolume = expiredBags.reduce((acc, b) => acc + b.volumeMl, 0);
              const minDaysRemaining =
                invBags.length > 0
                  ? Math.min(...invBags.map((b) => getBagDaysRemaining(b.dataValidade)))
                  : null;

              return (
                <div
                  key={inv.id}
                  className={`p-5 rounded-2xl border transition shadow-xs flex flex-col justify-between ${
                    expiredVolume > 0
                      ? 'border-red-500/60 bg-red-500/5 dark:bg-red-950/20'
                      : expiringSoonVolume > 0
                      ? 'border-amber-400/60 bg-amber-500/5 dark:bg-amber-950/20'
                      : isBelowMin
                      ? 'border-red-400/50 bg-red-500/5 dark:bg-red-950/20'
                      : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                        {inv.especie === 'CANINA' ? '🐕 Canino' : '🐈 Felino'}
                      </span>
                      <span className="text-[10px] font-medium text-neutral-400">
                        {inv.componente.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                          {inv.tipoSanguineo}
                        </h3>
                        <span className="text-[11px] font-medium text-neutral-500">
                          {invBags.length} {invBags.length === 1 ? 'bolsa' : 'bolsas'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span
                          className={`text-3xl font-black ${
                            isBelowMin
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {inv.volumeMl}
                        </span>
                        <span className="text-xs text-neutral-500">mL em estoque</span>
                      </div>
                    </div>

                    {/* Alertas de Vencimento e Controle de 40 dias */}
                    <div className="mt-3 space-y-1.5">
                      {expiredVolume > 0 && (
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-[11px] font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-red-600" />
                          <span>{expiredVolume} mL vencido (excedeu 40 dias)</span>
                        </div>
                      )}

                      {expiringSoonVolume > 0 && (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                          <span>
                            {expiringSoonVolume} mL próximo do vencimento ({minDaysRemaining}d restantes)
                          </span>
                        </div>
                      )}

                      {expiredVolume === 0 && expiringSoonVolume === 0 && invBags.length > 0 && (
                        <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[10px] font-medium flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 flex-shrink-0 text-emerald-600" />
                          <span>
                            Validade segura: próximo lote vence em {minDaysRemaining} dias
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                    <div className="text-[11px] flex items-center justify-between mb-2">
                      <span className="text-neutral-400">Reserva Mínima: {inv.volumeMinimoAlerta} mL</span>
                      {isBelowMin ? (
                        <span className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Abaixo da Reserva
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">Adequado</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedInvBagsModal(inv)}
                      className="w-full py-1.5 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ver Bolsas e Lotes ({invBags.length})</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Histórico Transacional */}
          <div className="p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Histórico de Movimentações de Estoque
                </h2>
                <p className="text-xs text-neutral-500">
                  Rastreabilidade completa com registro de lotes, motivo clínico e controle de saldo
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-400">
                    <th className="py-2.5">Horário</th>
                    <th>Operação</th>
                    <th>Variação</th>
                    <th>Saldo Anterior ➔ Novo</th>
                    <th>Motivo & Rastreio</th>
                    <th>Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                      <td className="py-2.5 font-mono text-neutral-400">{m.createdAt}</td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                            m.volumeDeltaMl > 0
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {m.tipoMovimento}
                        </span>
                      </td>
                      <td
                        className={`font-bold ${
                          m.volumeDeltaMl > 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {m.volumeDeltaMl > 0 ? `+${m.volumeDeltaMl}` : m.volumeDeltaMl} mL
                      </td>
                      <td className="text-neutral-500">
                        {m.volumeAnteriorMl} mL ➔ <strong className="text-neutral-800 dark:text-neutral-200">{m.volumePosteriorMl} mL</strong>
                      </td>
                      <td className="text-neutral-600 dark:text-neutral-300">
                        {m.motivo}
                        {m.loteCodigo && (
                          <span className="font-mono text-[10px] ml-1 text-neutral-400">[{m.loteCodigo}]</span>
                        )}
                      </td>
                      <td className="text-neutral-500">{m.realizadoPor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ALERTAS & NOTIFICAÇÕES                            */}
      {/* ======================================================== */}
      {activeTab === 'ALERTAS' && (
        <div className="space-y-6">
          {/* Barra de Navegação: Voltar para Tela Inicial */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('HOME')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Voltar para a Tela Inicial</span>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Alertas de Doação</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{activeNeeds.length} {activeNeeds.length === 1 ? 'alerta ativo' : 'alertas ativos'}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {needs.map((n) => (
              <div
                key={n.id}
                className="p-5 rounded-3xl border border-rose-500/30 bg-white dark:bg-neutral-900 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                      n.urgencia === 'CRITICA'
                        ? 'bg-rose-600 text-white animate-pulse'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {n.urgencia}
                  </span>
                  <span className="text-xs font-bold text-neutral-400">
                    {n.especie} • {n.tipoSanguineo}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                    Necessidade: {n.volumeSolicitadoMl} mL
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{n.descricao}</p>
                </div>

                <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 text-xs grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Tutores Notificados</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {n.notificadosCount} receptores
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block text-[10px]">Tutores Interessados</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {n.interessadosCount} candidatos
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 text-[11px] text-neutral-400">
                  <span>Criado: {n.createdAt}</span>
                  <span className="font-bold text-emerald-600">Status: {n.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Candidatos com Interesse Manifestado */}
          <div className="p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-4">
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Tutores que Manifestaram Interesse em Doar</span>
            </h2>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {interests.length === 0 ? (
                <div className="py-8 text-center text-neutral-400 text-xs">
                  Nenhum tutor com interesse manifestado no momento. Novos candidatos aparecerão aqui assim que responderem aos alertas emitidos.
                </div>
              ) : (
                interests.map((int) => (
                  <div key={int.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">
                          {int.petNome} ({int.petEspecie})
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                          {int.petPesoKg} kg
                        </span>
                        {int.status === 'SELECIONADO_AGENDAMENTO' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-bold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Horário Marcado
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-500 mt-1">
                        Tutor: <strong>{int.tutorNome}</strong> • Contato: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{int.tutorTelefone}</span> • Manifestado: {int.createdAt}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {int.status === 'SELECIONADO_AGENDAMENTO' ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Agendado na Clínica</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('AGENDAMENTOS')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm cursor-pointer"
                            title="Ir para a fila de Agendamentos e Triagem Clínica"
                          >
                            <span>Ver na Triagem</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSchedulingInterest(int);
                              setScheduleSlot('Amanhã às 10:00');
                            }}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold transition shadow-sm cursor-pointer"
                            title="Escolher data/hora e confirmar agendamento"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Agendar Horário na Clínica</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmSchedule(int, 'Amanhã às 10:00')}
                            title="Agendar imediatamente para Amanhã às 10:00 e ir para a Triagem"
                            className="hidden sm:flex items-center gap-1 px-2.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold transition text-[11px] cursor-pointer"
                          >
                            <Clock className="w-3 h-3 text-emerald-600" />
                            <span>Amanhã 10h</span>
                            <ArrowRight className="w-3 h-3 text-neutral-400" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: AGENDAMENTOS & TRIAGEM CLÍNICA                    */}
      {/* ======================================================== */}
      {activeTab === 'AGENDAMENTOS' && (
        <div className="space-y-6">
          {/* Barra de Navegação: Voltar para Tela Inicial */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('HOME')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Voltar para a Tela Inicial</span>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
                <Calendar className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Agendamentos &amp; Triagem</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{clinicAppointments.length} agendamentos</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Stethoscope className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Triagem Veterinária Obrigatória:</strong> A avaliação clínica presencial (aferição de peso, dosagem de hematócrito e inspeção física) é indispensável para garantir a total segurança e bem-estar do pet doador.
            </span>
          </div>

          <div className="space-y-4">
            {appointments.map((app) => (
              <div
                key={app.id}
                className="p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-lg">
                      {app.petEspecie === 'CANINA' ? '🐕' : '🐈'}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                        {app.petNome} ({app.tipoSanguineo})
                      </h3>
                      <p className="text-xs text-neutral-500">
                        Tutor: {app.tutorNome} • Horário: <strong>{app.dataHora}</strong> • Slot: {app.slotCodigo}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        app.status === 'ATTENDED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {app.status === 'ATTENDED' ? '✅ Doação Realizada' : '⏳ Aguardando Comparecimento'}
                    </span>
                  </div>
                </div>

                {app.status !== 'ATTENDED' ? (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        setScreeningAppId(app.id);
                        setScreenPeso(app.petPesoKg);
                        setScreenTipo(app.tipoSanguineo);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
                    >
                      <Stethoscope className="w-4 h-4" />
                      <span>Iniciar Triagem Médica & Coleta de Sangue</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">
                    Procedimento concluído com sucesso. Bolsa estocada na hemoteca e voucher entregue ao tutor.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: FUNCIONÁRIOS                                      */}
      {/* ======================================================== */}
      {activeTab === 'FUNCIONARIOS' && (
        <div className="space-y-6">
          {/* Barra de Navegação: Voltar para Tela Inicial */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('HOME')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Voltar para a Tela Inicial</span>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
                <Users className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Equipe da Clínica</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{employees.length} colaboradores</span>
            </div>
          </div>
          {/* Header Feedback Banner */}
          {employeeFeedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-center justify-between gap-3 shadow-sm transition animate-in fade-in ${
                employeeFeedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {employeeFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                )}
                <span className="font-medium">{employeeFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setEmployeeFeedback(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Corpo Técnico e Equipe da Instituição
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  {employees.length} {employees.length === 1 ? 'colaborador' : 'colaboradores'}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Operadores com acesso restrito e seguro às operações desta clínica veterinária ({institution.nomeFantasia})
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowEmpModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition shadow-sm cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Cadastrar Colaborador</span>
            </button>
          </div>

          {/* Search bar & quick stats */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -tranneutral-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar por nome, cargo, CRMV ou CPF..."
                value={employeeSearchTerm}
                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {employeeSearchTerm && (
                <button
                  type="button"
                  onClick={() => setEmployeeSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -tranneutral-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-4 text-neutral-500 text-[11px]">
              <span>
                Ativos: <strong className="text-emerald-600 dark:text-emerald-400">{employees.filter((e) => e.isActive).length}</strong>
              </span>
              <span>
                Inativos: <strong className="text-neutral-400">{employees.filter((e) => !e.isActive).length}</strong>
              </span>
              <span>
                Admins: <strong className="text-purple-600 dark:text-purple-400">{employees.filter((e) => e.isAdmin).length}</strong>
              </span>
            </div>
          </div>

          {/* Tabela de Colaboradores */}
          <div className="p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-400 font-semibold">
                  <th className="py-3 px-2">Colaborador</th>
                  <th className="py-3 px-2">Cargo / Função</th>
                  <th className="py-3 px-2">CRMV</th>
                  <th className="py-3 px-2">CPF</th>
                  <th className="py-3 px-2">Perfil de Acesso</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {employees
                  .filter((emp) => {
                    if (!employeeSearchTerm.trim()) return true;
                    const term = employeeSearchTerm.toLowerCase();
                    return (
                      emp.nome.toLowerCase().includes(term) ||
                      emp.cargo.toLowerCase().includes(term) ||
                      (emp.crmv && emp.crmv.toLowerCase().includes(term)) ||
                      emp.cpf.toLowerCase().includes(term) ||
                      (emp.email && emp.email.toLowerCase().includes(term))
                    );
                  })
                  .map((emp) => (
                    <tr key={emp.id} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition">
                      <td className="py-3 px-2">
                        <div className="font-bold text-neutral-900 dark:text-neutral-100">{emp.nome}</div>
                        {emp.email && (
                          <div className="text-[11px] text-neutral-400 font-mono">{emp.email}</div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-neutral-600 dark:text-neutral-300 font-medium">{emp.cargo}</td>
                      <td className="py-3 px-2 font-mono text-neutral-500">
                        {emp.crmv ? (
                          <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-[11px] font-semibold">
                            {emp.crmv}
                          </span>
                        ) : (
                          <span className="text-neutral-400 italic">Não aplicável</span>
                        )}
                      </td>
                      <td className="py-3 px-2 font-mono text-neutral-500 dark:text-neutral-400">{emp.cpf}</td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                            emp.isAdmin
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}
                        >
                          {emp.isAdmin && <Shield className="w-2.5 h-2.5" />}
                          {emp.isAdmin ? 'Administrador' : 'Colaborador'}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            emp.isActive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {emp.isActive ? '● ATIVO' : '○ INATIVO'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditEmployee(emp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-neutral-200 dark:border-neutral-700 hover:border-purple-300 dark:hover:border-purple-800 transition font-semibold text-[11px] cursor-pointer"
                            title="Editar informações do colaborador"
                          >
                            <Pencil className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingEmployee(emp);
                              setDeleteEmpError(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-neutral-200 dark:border-neutral-700 hover:border-rose-300 dark:hover:border-rose-800 transition font-semibold text-[11px] cursor-pointer"
                            title="Remover colaborador da clínica"
                          >
                            <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            <span>Remover</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {employees.length === 0 && (
              <div className="py-8 text-center text-neutral-400 text-xs">
                Nenhum colaborador cadastrado. Clique no botão acima para adicionar membros à equipe.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: VOUCHERS                                          */}
      {/* ======================================================== */}
      {activeTab === 'VOUCHERS' && (
        <div className="space-y-6">
          {/* Barra de Navegação: Voltar para Tela Inicial */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('HOME')}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 hover:text-emerald-700 dark:hover:text-emerald-400 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Voltar para a Tela Inicial</span>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="p-1 rounded-lg bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
                <Ticket className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Validação de Vouchers</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{vouchers.length} emitidos</span>
            </div>
          </div>
          <div className="p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-4 max-w-xl">
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-amber-500" />
              <span>Resgatar Voucher de Benefício</span>
            </h2>
            <p className="text-xs text-neutral-500">
              Digite o código único apresentado pelo tutor para aplicar o benefício (check-up, vacinas, desconto parceiro).
            </p>

            <form onSubmit={handleRedeemVoucherSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase text-neutral-500">
                  Código Alfanumérico Único
                </label>
                <input
                  type="text"
                  value={voucherCodeInput}
                  onChange={(e) => setVoucherCodeInput(e.target.value.toUpperCase())}
                  required
                  placeholder="EX: DOEPET-CAN-9812-ZEUS"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-sm font-mono uppercase"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition"
              >
                Validar e Confirmar Resgate
              </button>
            </form>

            {voucherFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  voucherFeedback.success
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-600 border border-rose-500/30'
                }`}
              >
                {voucherFeedback.success ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                <span>{voucherFeedback.msg}</span>
              </div>
            )}
          </div>

          {/* Vouchers Emitidos */}
          <div className="p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-4">
            <h3 className="font-bold text-sm">Vouchers Emitidos por Doações Nesta Clínica ({vouchers.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vouchers.map((v) => (
                <div
                  key={v.id}
                  className="p-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-sm">
                      {v.codigo}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        v.status === 'ATIVO' ? 'bg-emerald-500 text-white' : 'bg-neutral-300 text-neutral-700'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className="font-semibold text-neutral-700 dark:text-neutral-300">{v.beneficioDescricao}</p>
                  <div className="text-[11px] text-neutral-400 flex justify-between pt-1 border-t border-purple-500/10">
                    <span>Tutor: {v.tutorNome}</span>
                    <span>Validade: {v.dataValidade}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BARRA TOGGLER: INDICADORES DA REDE DOEPET               */}
      {/* ======================================================== */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsKpisOpen(!isKpisOpen)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition cursor-pointer select-none"
          aria-expanded={isKpisOpen}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Indicadores de Prontidão da Rede DoePet
                </h3>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2 py-0.5 rounded-full border border-emerald-200/50 dark:border-neutral-700">
                  3 métricas
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Tempo de resposta, avisos aos tutores e horários de coleta organizados
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="hidden sm:inline">
              {isKpisOpen ? 'Ocultar indicadores' : 'Ver indicadores'}
            </span>
            <div className="p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              {isKpisOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </button>

        {/* Cards agrupados (expandidos através do toggler) */}
        {isKpisOpen && (
          <div className="p-4 sm:p-5 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/40 dark:bg-black/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {/* 1. Tempo de Resposta */}
              <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Tempo de Resposta</span>
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">
                    -20%
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    Mais Rápido
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Mobilização ágil quando houver emergência
                </p>
              </div>

              {/* 2. Avisos aos Tutores */}
              <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Avisos aos Tutores</span>
                  <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                    98.4%
                  </span>
                  <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    Entregues
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Alertas diretos para tutores com pets compatíveis
                </p>
              </div>

              {/* 3. Horários de Coleta */}
              <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Horários de Coleta</span>
                  <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">
                    100%
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
                    Organizados
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Sem filas ou esperas para os animais doadores
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: REGISTRAR MOVIMENTAÇÃO DE ESTOQUE               */}
      {/* ======================================================== */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Registrar Movimentação de Hemocomponente
            </h2>
            <p className="text-xs text-neutral-500">
              Controle de segurança: o saldo de estoque é validado automaticamente para impedir volumes negativos e manter a rastreabilidade das bolsas.
            </p>

            {stockError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{stockError}</span>
              </div>
            )}

            <form onSubmit={handleMovementSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Item de Estoque</label>
                <select
                  value={selectedInvId}
                  onChange={(e) => setSelectedInvId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                >
                  {inventory.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.especie} - {inv.tipoSanguineo} ({inv.componente}) - Saldo: {inv.volumeMl}mL
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Tipo de Movimento</label>
                  <select
                    value={movTipo}
                    onChange={(e) => setMovTipo(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="SAIDA_TRANSFUSAO">Saída para Transfusão</option>
                    <option value="SAIDA_VENCIMENTO">Descarte por Validade</option>
                    <option value="ENTRADA_DOACAO">Entrada Avulsa</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Volume (mL)</label>
                  <input
                    type="number"
                    value={movVolume}
                    onChange={(e) => setMovVolume(Number(e.target.value))}
                    min={1}
                    max={2000}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
              </div>

              {movTipo === 'ENTRADA_DOACAO' && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span>Data da Coleta da Bolsa</span>
                    </label>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                      Janela Máxima: 40 Dias
                    </span>
                  </div>
                  <input
                    type="date"
                    value={movDataColeta}
                    onChange={(e) => setMovDataColeta(e.target.value)}
                    max="2026-10-28"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 font-semibold"
                  />
                  <div className="text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between pt-1">
                    <span>Validade calculada (+40 dias):</span>
                    <span className="font-black font-mono bg-white dark:bg-neutral-900 px-2 py-0.5 rounded-md border border-amber-500/30">
                      {calculateBagExpiration(movDataColeta)}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                    Preservação de qualidade CPDA-1: bolsas de sangue total canino/felino devem ser transfundidas em até 40 dias da coleta. O sistema monitorará a validade em tempo real nos cards de estoque.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">Motivo Clínico / Justificativa</label>
                <input
                  type="text"
                  value={movMotivo}
                  onChange={(e) => setMovMotivo(e.target.value)}
                  placeholder="Ex: Hemotransfusão em paciente com anemia imunomediada ou Doação programada"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Confirmar Movimentação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: EMITIR ALERTA DE NECESSIDADE                    */}
      {/* ======================================================== */}
      {showNeedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Emitir Alerta de Urgência Transfusional
              </h2>
            </div>
            <p className="text-xs text-neutral-500">
              O sistema disparará notificações exclusivamente aos tutores cadastrados com animais da mesma espécie e com perfil apto para doação.
            </p>

            <form onSubmit={handleCreateNeedSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Espécie Necessária</label>
                  <select
                    value={needEspecie}
                    onChange={(e) => setNeedEspecie(e.target.value as Especie)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="CANINA">Canina (Cão)</option>
                    <option value="FELINA">Felina (Gato)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Tipo Sanguíneo</label>
                  <select
                    value={needTipo}
                    onChange={(e) => setNeedTipo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="DEA 1.1 Negativo">DEA 1.1 Negativo (Universal)</option>
                    <option value="DEA 1.1 Positivo">DEA 1.1 Positivo</option>
                    <option value="Tipo A">Tipo A (Felino)</option>
                    <option value="Tipo B">Tipo B (Felino)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Volume Necessário (mL)</label>
                  <input
                    type="number"
                    value={needVolume}
                    onChange={(e) => setNeedVolume(Number(e.target.value))}
                    min={100}
                    max={2500}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Nível de Urgência</label>
                  <select
                    value={needUrgencia}
                    onChange={(e) => setNeedUrgencia(e.target.value as UrgenciaLevel)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="CRITICA">Crítica (Risco de Óbito Iminente)</option>
                    <option value="ALTA">Alta (Cirurgia em até 24h)</option>
                    <option value="MODERADA">Moderada (Reposição preventiva)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Descrição do Caso Clínico</label>
                <textarea
                  value={needDescricao}
                  onChange={(e) => setNeedDescricao(e.target.value)}
                  placeholder="Ex: Paciente canino de porte grande vítima de trauma abdominal agudo."
                  rows={2}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNeedModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Publicar e Disparar Push</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: TRIAGEM CLÍNICA & COLETA DE DOAÇÃO              */}
      {/* ======================================================== */}
      {screeningAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Stethoscope className="w-5 h-5" />
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Triagem Veterinária & Registro de Doação
              </h2>
            </div>
            <p className="text-xs text-neutral-500">
              Apenas o médico veterinário habilitado (CRMV) confirma a aptidão clínica pós-exame físico e aferição de hematócrito.
            </p>

            {screenError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs">
                {screenError}
              </div>
            )}

            <form onSubmit={handleScreeningSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">CRMV do Veterinário Responsável</label>
                <input
                  type="text"
                  value={screenCrmv}
                  onChange={(e) => setScreenCrmv(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Peso Aferido na Balança (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={screenPeso}
                    onChange={(e) => setScreenPeso(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Hematócrito (%) [Mínimo: 37%]</label>
                  <input
                    type="number"
                    step="0.5"
                    value={screenHematocrito}
                    onChange={(e) => setScreenHematocrito(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Volume Coletado (mL)</label>
                  <input
                    type="number"
                    value={screenVolume}
                    onChange={(e) => setScreenVolume(Number(e.target.value))}
                    min={100}
                    max={500}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Tipo Sanguíneo Verificado</label>
                  <select
                    value={screenTipo}
                    onChange={(e) => setScreenTipo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="DEA 1.1 Negativo">DEA 1.1 Negativo</option>
                    <option value="DEA 1.1 Positivo">DEA 1.1 Positivo</option>
                    <option value="Tipo A">Tipo A</option>
                    <option value="Tipo B">Tipo B</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-[11px] text-emerald-700 dark:text-emerald-300 space-y-1">
                <p>✅ Triagem aprovada se Peso ≥ 25kg (cão) / 4kg (gato) e Hematócrito ≥ 37%.</p>
                <p>🎁 Ao confirmar: estoque receberá +{screenVolume}mL e voucher de benefício será emitido para o tutor.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScreeningAppId(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Aprovar & Efetivar Doação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: NOVO FUNCIONÁRIO                                */}
      {/* ======================================================== */}
      {showEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Cadastrar Colaborador da Clínica
            </h2>
            <p className="text-xs text-neutral-500">
              Controle de acesso: os colaboradores operam com acesso restrito e seguro exclusivamente aos registros desta instituição ({institution.nomeFantasia}).
            </p>

            <form onSubmit={handleAddEmployeeSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={empNome}
                  onChange={(e) => setEmpNome(e.target.value)}
                  placeholder="Dra. Juliana Prado"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">CPF</label>
                  <input
                    type="text"
                    value={empCpf}
                    onChange={(e) => setEmpCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">CRMV (se aplicável)</label>
                  <input
                    type="text"
                    value={empCrmv}
                    onChange={(e) => setEmpCrmv(e.target.value)}
                    placeholder="CRMV-SP 54321"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Cargo / Função</label>
                  <input
                    type="text"
                    value={empCargo}
                    onChange={(e) => setEmpCargo(e.target.value)}
                    placeholder="Médica Veterinária Hemoterapeuta"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">E-mail Corporativo</label>
                  <input
                    type="email"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="juliana@hemovet.com.br"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmpModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold"
                >
                  Salvar Colaborador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: AGENDAR HORÁRIO NA CLÍNICA                      */}
      {/* ======================================================== */}
      {schedulingInterest && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">
                    Agendar Horário na Clínica
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Defina o horário e avance diretamente para a Triagem Clínica
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingInterest(null)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações do Doador e Tutor */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Pet Doador:</span>
                <span className="font-bold text-neutral-900 dark:text-neutral-100 text-sm">
                  {schedulingInterest.petNome} ({schedulingInterest.petEspecie}) • {schedulingInterest.petPesoKg} kg
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Tutor Responsável:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {schedulingInterest.tutorNome}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Telefone / WhatsApp:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {schedulingInterest.tutorTelefone}
                </span>
              </div>
            </div>

            {/* Seleção de Horário */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Selecione o horário para a doação:
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  'Hoje às 16:30',
                  'Hoje às 18:00',
                  'Amanhã às 09:30',
                  'Amanhã às 10:00',
                  'Amanhã às 14:00',
                  'Depois de amanhã às 10:00'
                ].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setScheduleSlot(slot);
                      setScheduleCustomTime('');
                    }}
                    className={`p-2.5 rounded-xl border text-left font-medium transition flex items-center justify-between ${
                      scheduleSlot === slot && !scheduleCustomTime
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span>{slot}</span>
                    {scheduleSlot === slot && !scheduleCustomTime && (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                  </button>
                ))}
              </div>

              <div className="pt-1">
                <label className="block text-[11px] text-neutral-500 mb-1">
                  Ou digite outro horário personalizado:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Próxima segunda às 11h15"
                  value={scheduleCustomTime}
                  onChange={(e) => setScheduleCustomTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setSchedulingInterest(null)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmSchedule(schedulingInterest)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar e Ir para Triagem Clínica</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 6: EDITAR COLABORADOR                              */}
      {/* ======================================================== */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <Pencil className="w-5 h-5" />
                <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  Editar Colaborador da Clínica
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Modifique informações cadastrais, habilitação CRMV ou ajuste permissões de acesso ao sistema institucional.
            </p>

            {editEmpError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editEmpError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditEmployee} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-neutral-700 dark:text-neutral-300">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={editEmpNome}
                  onChange={(e) => setEditEmpNome(e.target.value)}
                  required
                  placeholder="Nome do colaborador"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-neutral-700 dark:text-neutral-300">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={editEmpCpf}
                    onChange={(e) => setEditEmpCpf(e.target.value)}
                    required
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-neutral-700 dark:text-neutral-300">
                    CRMV (se aplicável)
                  </label>
                  <input
                    type="text"
                    value={editEmpCrmv}
                    onChange={(e) => setEditEmpCrmv(e.target.value)}
                    placeholder="CRMV-SP 12345"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-neutral-700 dark:text-neutral-300">
                    Cargo / Função
                  </label>
                  <input
                    type="text"
                    value={editEmpCargo}
                    onChange={(e) => setEditEmpCargo(e.target.value)}
                    required
                    placeholder="Ex: Médica Veterinária"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-neutral-700 dark:text-neutral-300">
                    E-mail Corporativo
                  </label>
                  <input
                    type="email"
                    value={editEmpEmail}
                    onChange={(e) => setEditEmpEmail(e.target.value)}
                    placeholder="colaborador@clinica.com.br"
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
                      Perfil de Administrador
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      Permite gerenciar equipe, emitir vouchers e configurar parâmetros
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEmpIsAdmin}
                      onChange={(e) => setEditEmpIsAdmin(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer dark:bg-neutral-700 peer-checked:after:tranneutral-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                <div className="border-t border-neutral-200 dark:border-neutral-700/60 pt-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
                      Status do Acesso
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {editEmpIsActive ? 'Conta ativa e habilitada para operar' : 'Conta suspensa temporariamente'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditEmpIsActive(!editEmpIsActive)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                      editEmpIsActive
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {editEmpIsActive ? 'ATIVO' : 'INATIVO'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition shadow-sm cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 7: CONFIRMAR REMOÇÃO DE COLABORADOR                */}
      {/* ======================================================== */}
      {deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Remover Colaborador
                </h2>
                <p className="text-xs text-neutral-500">
                  Confirmação de revogação e exclusão da equipe
                </p>
              </div>
            </div>

            {/* Error Message */}
            {deleteEmpError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{deleteEmpError}</span>
              </div>
            )}

            {/* Info Card */}
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Profissional:</span>
                <span className="font-bold text-neutral-900 dark:text-neutral-100">{deletingEmployee.nome}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Função:</span>
                <span className="text-neutral-700 dark:text-neutral-300 font-medium">{deletingEmployee.cargo}</span>
              </div>
              {deletingEmployee.crmv && (
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">CRMV:</span>
                  <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">{deletingEmployee.crmv}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">CPF:</span>
                <span className="font-mono text-neutral-500">{deletingEmployee.cpf}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Perfil:</span>
                <span className="font-bold text-neutral-700 dark:text-neutral-300">{deletingEmployee.isAdmin ? 'Administrador' : 'Colaborador'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] space-y-1">
              <p className="font-semibold">⚠️ O que acontece ao remover?</p>
              <p>O acesso deste usuário à instituição será revogado. Os registros de auditoria e doações anteriormente realizadas por ele permanecem preservados para conformidade com a LGPD e normas veterinárias.</p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setDeletingEmployee(null)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              
              {/* Opção rápida de apenas inativar se estiver ativo */}
              {deletingEmployee.isActive && (
                <button
                  type="button"
                  onClick={handleToggleActiveFromModal}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl border border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-bold text-xs transition cursor-pointer"
                >
                  Apenas Inativar Acesso
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirmRemoveEmployee}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* MODAL 8: GERENCIAMENTO DE BOLSAS E CONTROLE DE 40 DIAS   */}
      {/* ======================================================== */}
      {selectedInvBagsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4 overflow-hidden animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                      selectedInvBagsModal.especie === 'CANINA'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                    }`}
                  >
                    {selectedInvBagsModal.especie === 'CANINA' ? '🐕 Canino' : '🐈 Felino'}
                  </span>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    Bolsas &amp; Lotes: {selectedInvBagsModal.tipoSanguineo}
                  </h2>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Componente: {selectedInvBagsModal.componente.replace('_', ' ')} • Saldo: {selectedInvBagsModal.volumeMl} mL
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedInvBagsModal(null)}
                className="p-1.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Banner de Conservação de 40 Dias */}
            <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-neutral-900 dark:text-neutral-100">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Controle de Conservação — Validade Máxima de 40 Dias</span>
              </div>
              <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                As bolsas de sangue coletadas possuem prazo de conservação de até <strong>40 dias</strong> sob refrigeração recomendada (2°C a 6°C). Lotes com vencimento mais próximo devem ser priorizados para transfusão.
              </p>
            </div>

            {/* Listagem de Bolsas */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(() => {
                const bags = (bloodBags || []).filter(
                  (b) => b.inventoryId === selectedInvBagsModal.id && b.status === 'DISPONIVEL'
                );

                if (bags.length === 0) {
                  return (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 text-neutral-400 text-xs">
                      Nenhuma bolsa ativa com saldo disponível para este tipo sanguíneo. Novas doações podem ser registradas no botão "Nova Movimentação".
                    </div>
                  );
                }

                return bags.map((bag) => {
                  const daysRemaining = getBagDaysRemaining(bag.dataValidade);
                  const isExpired = daysRemaining <= 0;
                  const isExpiringSoon = daysRemaining <= 10 && daysRemaining > 0;

                  return (
                    <div
                      key={bag.id}
                      className={`p-4 rounded-2xl border transition text-xs space-y-2 ${
                        isExpired
                          ? 'border-red-500/50 bg-red-500/5 dark:bg-red-950/20'
                          : isExpiringSoon
                          ? 'border-amber-500/50 bg-amber-500/5 dark:bg-amber-950/20'
                          : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 px-2 py-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
                            {bag.loteCodigo}
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {bag.volumeMl} mL
                          </span>
                        </div>

                        <div>
                          {isExpired ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> VENCIDA ({Math.abs(daysRemaining)}d atrás)
                            </span>
                          ) : isExpiringSoon ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white flex items-center gap-1">
                              <Clock className="w-3 h-3" /> VENCE EM {daysRemaining} {daysRemaining === 1 ? 'DIA' : 'DIAS'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                              🛡️ Válida ({daysRemaining} dias restantes)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-200/50 dark:border-neutral-700/50 text-[11px]">
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Data da Coleta:</span>
                          <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                            {bag.dataColeta}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Validade (+40 dias):</span>
                          <span
                            className={`font-bold ${
                              isExpired
                                ? 'text-red-600'
                                : isExpiringSoon
                                ? 'text-amber-600'
                                : 'text-neutral-700 dark:text-neutral-200'
                            }`}
                          >
                            {bag.dataValidade}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Doador:</span>
                          <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                            {bag.doadorNome || 'Doador voluntário'}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px]">CRMV Responsável:</span>
                          <span className="font-mono text-neutral-700 dark:text-neutral-200">
                            {bag.responsavelCrmv || 'CRMV-SP 48.912'}
                          </span>
                        </div>
                      </div>

                      {/* Botão de descarte por validade com confirmação inline */}
                      <div className="flex flex-col items-end gap-1.5 pt-2">
                        {discardBagError && confirmDiscardBagId === bag.id && (
                          <span className="text-[11px] text-rose-600 font-semibold">{discardBagError}</span>
                        )}
                        {confirmDiscardBagId === bag.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-neutral-600 dark:text-neutral-300 font-semibold">
                              Confirmar descarte ({bag.volumeMl} mL)?
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDiscardBagId(null);
                                setDiscardBagError(null);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setDiscardBagError(null);
                                const res = await onDiscardBag?.(bag.id);
                                if (res && !res.success) {
                                  setDiscardBagError(res.error || 'Não foi possível descartar a bolsa.');
                                  return;
                                }
                                setConfirmDiscardBagId(null);
                              }}
                              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Confirmar Descarte</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDiscardBagError(null);
                              setConfirmDiscardBagId(bag.id);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                              isExpired
                                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
                                : 'border border-neutral-300 dark:border-neutral-700 hover:bg-rose-500/10 hover:text-rose-600 text-neutral-600 dark:text-neutral-400'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isExpired ? 'Descartar Bolsa Vencida' : 'Descartar Bolsa'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <span className="text-[11px] text-neutral-500">
                Data do Sistema: <strong>28/10/2026</strong> • Ordenação por Validade
              </span>
              <button
                type="button"
                onClick={() => setSelectedInvBagsModal(null)}
                className="px-5 py-2 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs hover:opacity-90 transition cursor-pointer"
              >
                Concluir Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
