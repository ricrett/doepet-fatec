/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { InstitutionView } from './components/InstitutionView';
import { TutorView } from './components/TutorView';
import { AuditView } from './components/AuditView';
import { FlaskCodeViewer } from './components/FlaskCodeViewer';
import { AuthView } from './components/AuthView';
import { OwnerDevAuthModal } from './components/OwnerDevAuthModal';
import {
  initialInstitutions,
  initialTutors
} from './mockData';
import {
  Role,
  AuthenticatedUser,
  Institution,
  Tutor,
  BloodInventoryItem,
  BloodBag,
  BloodInventoryMovement,
  BloodNeed,
  DonorInterest,
  Appointment,
  Voucher,
  Pet,
  InstitutionEmployee,
  Especie,
  UrgenciaLevel
} from './types';
import { apiClient, restoreSession, setAccessToken } from './services/api';
import { connectNotificationStream, registerServiceWorker } from './services/pushClient';
import { ShieldCheck, Sparkles, AlertCircle, CheckCircle2, X, Lock, KeyRound, Code2 } from 'lucide-react';

export default function App() {
  // Theme state: light or dark
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('doepet_theme');
    if (saved) return saved === 'dark';
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
      body.classList.add('dark');
      localStorage.setItem('doepet_theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
      body.classList.remove('dark');
      localStorage.setItem('doepet_theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  const OWNER_AUTH_SESSION_KEY = 'doepet_owner_auth_session';

  // DT-04: Session restored exclusively via HttpOnly cookie (/api/v1/auth/refresh), never localStorage
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthBooting, setIsAuthBooting] = useState<boolean>(true);
  const [currentRole, setCurrentRole] = useState<Role | 'AUDITOR' | 'CODE_EXPLORER' | 'AUTH'>('AUTH');

  // Project Owner / Developer Access Authorization State (Restrito aos donos do projeto e oculto do front)
  const [isOwnerAuthorized, setIsOwnerAuthorized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(OWNER_AUTH_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Owner authentication modal visibility state
  const [showOwnerAuthModal, setShowOwnerAuthModal] = useState<boolean>(false);
  const [footerSecretClicks, setFooterSecretClicks] = useState<number>(0);

  // Toast Notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Keyboard shortcut listener and URL trigger for project owners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Shift + D (or Cmd + Shift + D on macOS) triggers owner authentication gate
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowOwnerAuthModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Check URL parameters or hash for owner developer entrance
    if (window.location.hash === '#owner-dev' || window.location.search.includes('dev=owner')) {
      setShowOwnerAuthModal(true);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Secret discrete clicks trigger on the footer stack text (5 clicks to open owner modal)
  const handleSecretFooterClick = () => {
    const next = footerSecretClicks + 1;
    if (next >= 5) {
      setFooterSecretClicks(0);
      setShowOwnerAuthModal(true);
    } else {
      setFooterSecretClicks(next);
      setTimeout(() => setFooterSecretClicks(0), 3000);
    }
  };

  // Handler to lock and completely hide Dev Mode
  const handleLockOwnerDev = () => {
    try {
      sessionStorage.removeItem(OWNER_AUTH_SESSION_KEY);
    } catch (e) {
      console.error(e);
    }
    setIsOwnerAuthorized(false);
    if (currentRole === 'CODE_EXPLORER') {
      if (currentUser && currentUser.isLoggedIn) {
        setCurrentRole(currentUser.role === 'TUTOR' ? 'TUTOR' : 'INSTITUTION_ADMIN');
      } else {
        setCurrentRole('AUTH');
      }
    }
    showToast('Modo de Engenharia bloqueado e ocultado do front-end.', 'info');
  };

  // Route Guard / Proteção de Rotas: intercepta qualquer navegação sem autenticação válida
  const handleSelectRole = (requestedRole: Role | 'AUDITOR' | 'CODE_EXPLORER' | 'AUTH') => {
    if (requestedRole === 'AUTH') {
      setCurrentRole('AUTH');
      return;
    }
    if (requestedRole === 'CODE_EXPLORER') {
      if (!isOwnerAuthorized) {
        showToast('Acesso negado: O módulo de engenharia é restrito aos proprietários do projeto e está oculto para tutores e clínicas.', 'error');
        return;
      }
      setCurrentRole('CODE_EXPLORER');
      return;
    }
    // Route Guard: bloqueia acesso às telas internas se o usuário não estiver autenticado
    if (!currentUser || !currentUser.isLoggedIn) {
      setCurrentRole('AUTH');
      showToast('Acesso protegido: Você precisa entrar ou se cadastrar para acessar esta área.', 'error');
      return;
    }

    // Direcionamento dinâmico conforme perfil salvo
    if (requestedRole === 'INSTITUTION_ADMIN' && currentUser.role === 'TUTOR') {
      showToast('Seu perfil atual é de Tutor. Acessando a área do Tutor.', 'info');
      setCurrentRole('TUTOR');
      return;
    }
    if (requestedRole === 'TUTOR' && (currentUser.role === 'INSTITUTION_ADMIN' || currentUser.role === 'INSTITUTION_EMPLOYEE')) {
      showToast('Seu perfil atual é de Clínica Veterinária. Acessando a área da Clínica.', 'info');
      setCurrentRole('INSTITUTION_ADMIN');
      return;
    }

    setCurrentRole(requestedRole);
  };

  // Route Guard Effect: garante reativamente que nenhuma tela protegida seja exibida sem login
  useEffect(() => {
    if (currentRole === 'CODE_EXPLORER' && !isOwnerAuthorized) {
      setCurrentRole(currentUser && currentUser.isLoggedIn ? (currentUser.role === 'TUTOR' ? 'TUTOR' : 'INSTITUTION_ADMIN') : 'AUTH');
    } else if ((!currentUser || !currentUser.isLoggedIn) && currentRole !== 'AUTH' && currentRole !== 'CODE_EXPLORER') {
      setCurrentRole('AUTH');
    }
  }, [currentUser, currentRole, isOwnerAuthorized]);

  // Application Data States (Populated strictly via REST /api/v1/bootstrap)
  const [institutions, setInstitutions] = useState<Institution[]>(initialInstitutions);
  const [currentInstitution, setCurrentInstitution] = useState<Institution>(initialInstitutions[0]);
  const [tutors, setTutors] = useState<Tutor[]>(initialTutors);
  const [currentTutor, setCurrentTutor] = useState<Tutor>(initialTutors[0]);
  const [employees, setEmployees] = useState<InstitutionEmployee[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [inventory, setInventory] = useState<BloodInventoryItem[]>([]);
  const [movements, setMovements] = useState<BloodInventoryMovement[]>([]);
  const [bloodBags, setBloodBags] = useState<BloodBag[]>([]);
  const [needs, setNeeds] = useState<BloodNeed[]>([]);
  const [interests, setInterests] = useState<DonorInterest[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);

  const loadBootstrapData = useCallback(async () => {
    const data = await apiClient.bootstrap();
    setInstitutions(data.institutions);
    if (data.activeInstitution) {
      setCurrentInstitution(data.activeInstitution);
    } else if (data.institutions[0]) {
      setCurrentInstitution(data.institutions[0]);
    }
    setTutors(data.tutors);
    if (data.activeTutor) {
      setCurrentTutor(data.activeTutor);
    } else if (data.tutors[0]) {
      setCurrentTutor(data.tutors[0]);
    }
    setEmployees(data.employees);
    setPets(data.pets);
    setInventory(data.inventory);
    setBloodBags(data.bloodBags);
    setMovements(data.movements);
    setNeeds(data.needs);
    setInterests(data.interests);
    setAppointments(data.appointments);
    setVouchers(data.vouchers);
  }, []);

  // On mount: wipe any legacy localStorage token, restore HttpOnly session & register Service Worker
  useEffect(() => {
    try {
      localStorage.removeItem('doepet_auth_session');
    } catch {
      // Ignore storage errors
    }

    void registerServiceWorker();

    let cancelled = false;
    (async () => {
      try {
        const restored = await restoreSession();
        if (!cancelled && restored?.user) {
          setCurrentUser(restored.user);
          setCurrentRole(restored.user.role === 'TUTOR' ? 'TUTOR' : 'INSTITUTION_ADMIN');
          await loadBootstrapData();
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setCurrentUser(null);
          setCurrentRole('AUTH');
        }
      } finally {
        if (!cancelled) {
          setIsAuthBooting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadBootstrapData]);

  // DT-06: Connect SSE notification stream when authenticated
  useEffect(() => {
    if (!currentUser?.isLoggedIn) return;
    const disconnect = connectNotificationStream((payload) => {
      showToast(`${payload.title}: ${payload.body}`, 'info');
      void loadBootstrapData().catch(() => undefined);
    });
    return () => {
      disconnect();
    };
  }, [currentUser?.isLoggedIn, loadBootstrapData]);

  // Auth Handlers backed by RS256 JWT + HttpOnly Cookie + REST Bootstrap
  const handleLoginSuccess = async (user: AuthenticatedUser) => {
    setCurrentUser(user);
    setCurrentRole(user.role === 'TUTOR' ? 'TUTOR' : 'INSTITUTION_ADMIN');
    try {
      await loadBootstrapData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar dados iniciais.', 'error');
    }
    showToast(`Bem-vindo(a), ${user.nome}! Sessão autenticada com sucesso.`, 'success');
  };

  const handleRegisterTutorSuccess = async (
    newTutorData: Partial<Tutor>,
    _password: string,
    authResult?: { user: AuthenticatedUser; tutor?: Tutor }
  ) => {
    const resolvedUser: AuthenticatedUser = authResult?.user || {
      id: Date.now(),
      nome: newTutorData.nome || 'Novo Tutor',
      email: `${(newTutorData.nome || 'tutor').toLowerCase().replace(/\s+/g, '.')}@doepet.com.br`,
      role: 'TUTOR',
      documento: newTutorData.cpf || '000.000.000-00',
      isLoggedIn: true,
    };

    if (authResult?.tutor) {
      setCurrentTutor(authResult.tutor);
    }
    setCurrentUser(resolvedUser);
    setCurrentRole('TUTOR');
    try {
      await loadBootstrapData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao sincronizar cadastro.', 'error');
    }

    showToast(
      `Cadastro de tutor concluído! Bem-vindo(a), ${resolvedUser.nome}. Cadastre seus pets para salvar vidas!`,
      'success'
    );
  };

  const handleRegisterClinicSuccess = async (
    newClinicData: Partial<Institution>,
    _password: string,
    authResult?: { user: AuthenticatedUser; institution?: Institution }
  ) => {
    const resolvedUser: AuthenticatedUser = authResult?.user || {
      id: Date.now(),
      nome: newClinicData.nomeFantasia || 'Hospital Veterinário',
      email: newClinicData.emailContato || 'contato@clinica.com.br',
      role: 'INSTITUTION_ADMIN',
      documento: newClinicData.cnpj || '00.000.000/0001-00',
      isLoggedIn: true,
    };

    if (authResult?.institution) {
      setCurrentInstitution(authResult.institution);
    }
    setCurrentUser(resolvedUser);
    setCurrentRole('INSTITUTION_ADMIN');
    try {
      await loadBootstrapData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao sincronizar clínica.', 'error');
    }

    showToast(
      `Instituição "${resolvedUser.nome}" cadastrada com sucesso! Estoque inicial de hemocomponentes provisionado.`,
      'success'
    );
  };

  const handleLogout = async () => {
    await apiClient.logout();
    setCurrentUser(null);
    setCurrentRole('AUTH');
    setEmployees([]);
    setPets([]);
    setInventory([]);
    setBloodBags([]);
    setMovements([]);
    setNeeds([]);
    setInterests([]);
    setAppointments([]);
    setVouchers([]);
    showToast('Você encerrou a sessão com segurança. Faça login para continuar.', 'info');
  };

  // Handler: Add Stock Movement via /api/v1/inventory/movements (RN04 + 40-day CPDA-1 bag + FEFO)
  const handleAddMovement = async (
    inventoryId: number,
    tipo: any,
    delta: number,
    motivo: string,
    dataColeta?: string,
    targetBagId?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.addMovement({
        inventoryId,
        tipo,
        delta,
        motivo,
        dataColeta,
        targetBagId,
      });
      setInventory((prev) => prev.map((i) => (i.id === inventoryId ? res.inventoryItem : i)));
      setMovements((prev) => [res.movement, ...prev]);
      if (res.createdBag) {
        setBloodBags((prev) => [res.createdBag!, ...prev]);
      }
      if (res.updatedBag) {
        setBloodBags((prev) => prev.map((b) => (b.id === res.updatedBag!.id ? res.updatedBag! : b)));
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro na operação de estoque.' };
    }
  };

  // Handler: Descarte específico de bolsa vencida (> 40 dias)
  const handleDiscardBag = async (bagId: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.discardBag(bagId);
      setInventory((prev) => prev.map((i) => (i.id === res.inventoryItem.id ? res.inventoryItem : i)));
      setMovements((prev) => [res.movement, ...prev]);
      if (res.updatedBag) {
        setBloodBags((prev) => prev.map((b) => (b.id === res.updatedBag!.id ? res.updatedBag! : b)));
      }
      showToast('Bolsa descartada com rastreabilidade registrada no banco de sangue.', 'info');
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Erro ao descartar bolsa.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
  };

  // Handler: Create Blood Urgency Need (US05 & DT-03 Async Queue Dispatch)
  const handleCreateNeed = async (
    especie: Especie,
    tipo: string,
    volume: number,
    urgencia: UrgenciaLevel,
    descricao: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.createNeed({
        especie,
        tipoSanguineo: tipo,
        volumeSolicitadoMl: volume,
        urgencia,
        descricao,
      });
      setNeeds((prev) => [res.need, ...prev]);
      showToast('Alerta urgente publicado e enfileirado para envio assíncrono aos tutores compatíveis.', 'success');
      // Refresh shortly after async worker processes delivery count
      setTimeout(() => {
        void loadBootstrapData().catch(() => undefined);
      }, 600);
      return { success: true };
    } catch (err: any) {
      const msg = err?.message || 'Falha ao publicar alerta.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
  };

  // Handler: Tutor expresses interest (US07 & RF07)
  const handleExpressInterest = async (needId: number, petId: number) => {
    try {
      const res = await apiClient.expressInterest(needId, petId);
      setInterests((prev) => [res.interest, ...prev]);
      setNeeds((prev) =>
        prev.map((n) => (n.id === needId ? { ...n, interessadosCount: n.interessadosCount + 1 } : n))
      );
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível manifestar interesse.', 'error');
    }
  };

  // Handler: Schedule appointment from candidate interest (US08 / RN08 / RN20)
  const handleScheduleInterest = async (interest: DonorInterest, slotHora: string) => {
    try {
      const res = await apiClient.scheduleInterest(interest.id, slotHora);
      setAppointments((prev) => [res.appointment, ...prev]);
      setInterests((prev) =>
        prev.map((i) => (i.id === interest.id ? { ...i, status: 'SELECIONADO_AGENDAMENTO' } : i))
      );
    } catch (err: any) {
      showToast(err?.message || 'Erro ao agendar doação.', 'error');
    }
  };

  // Handler: Veterinary Screening & Confirm Donation (US09, US10, RN09, RN15)
  const handleConfirmDonation = async (
    appointmentId: number,
    veterinarioCrmv: string,
    volumeColetado: number,
    hematocrito: number,
    pesoAferido: number,
    tipoConfirmado: string
  ): Promise<{ success: boolean; voucherCode?: string; error?: string }> => {
    try {
      const res = await apiClient.confirmDonation(appointmentId, {
        veterinarioCrmv,
        volumeColetado,
        hematocrito,
        pesoAferido,
        tipoConfirmado,
      });
      await loadBootstrapData();
      return { success: true, voucherCode: res.voucher?.codigo };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha na triagem clínica.' };
    }
  };

  // Handler: Redeem voucher (US10 / RN12)
  const handleRedeemVoucher = async (codigo: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await apiClient.redeemVoucher(codigo);
      if (res.voucher) {
        setVouchers((prev) => prev.map((v) => (v.id === res.voucher!.id ? res.voucher! : v)));
      }
      return { success: res.success, message: res.message };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao resgatar voucher.' };
    }
  };

  // Handler: Register Pet (US03 / RN16 / RN15)
  const handleRegisterPet = async (newPetData: Omit<Pet, 'id' | 'tutorId' | 'statusElegibilidade'>) => {
    try {
      const res = await apiClient.registerPet(newPetData);
      setPets((prev) => [res.pet, ...prev]);
      showToast(`Pet "${res.pet.nome}" cadastrado com status ${res.pet.statusElegibilidade}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cadastrar pet.', 'error');
    }
  };

  // Handler: Delete Pet from Registry
  const handleDeletePet = async (petId: number) => {
    const targetPet = pets.find((p) => p.id === petId);
    try {
      await apiClient.deletePet(petId);
      setPets((prev) => prev.filter((p) => p.id !== petId));
      setInterests((prev) => prev.filter((i) => i.petId !== petId));
      showToast(`O pet "${targetPet?.nome || ''}" foi removido do seu cadastro.`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao excluir pet.', 'error');
    }
  };

  // Handler: Add staff employee (US13 / RN03)
  const handleAddEmployee = async (
    nome: string,
    cpf: string,
    cargo: string,
    crmv: string,
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.addEmployee({ nome, cpf, cargo, crmv, email });
      setEmployees((prev) => [...prev, res.employee]);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao cadastrar colaborador.' };
    }
  };

  // Handler: Edit / Update staff employee
  const handleUpdateEmployee = async (
    employeeId: number,
    data: Partial<Omit<InstitutionEmployee, 'id' | 'institutionId'>>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.updateEmployee(employeeId, data);
      setEmployees((prev) => prev.map((e) => (e.id === employeeId ? res.employee : e)));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar colaborador.' };
    }
  };

  // Handler: Remove staff employee
  const handleRemoveEmployee = async (
    employeeId: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await apiClient.removeEmployee(employeeId);
      setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao remover colaborador.' };
    }
  };

  // Identificação do Tutor e Clínica ativos (priorizando retorno do /api/v1/bootstrap)
  const activeTutor =
    currentUser && currentUser.role === 'TUTOR'
      ? tutors.find((t) => t.userId === currentUser.id || t.cpf === currentUser.documento) || currentTutor
      : currentTutor;

  const activeClinic =
    currentUser && (currentUser.role === 'INSTITUTION_ADMIN' || currentUser.role === 'INSTITUTION_EMPLOYEE')
      ? institutions.find((i) => i.cnpj === currentUser.documento) || currentInstitution
      : currentInstitution;

  const tutorPets = pets.filter((p) => p.tutorId === activeTutor.id);
  const activeNeedsCount = needs.filter((n) => n.status === 'ACTIVE').length;

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? 'dark bg-black text-neutral-100' : 'bg-white text-neutral-900'} flex flex-col`}>
      {/* Top Navbar */}
      <Navbar
        currentRole={currentRole}
        onSelectRole={handleSelectRole}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        activeAlertsCount={activeNeedsCount}
        isOwnerAuthorized={isOwnerAuthorized}
        onExitOwnerDev={handleLockOwnerDev}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAuth={() => setCurrentRole('AUTH')}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`p-4 rounded-xl shadow-lg border flex items-start gap-3 backdrop-blur-md ${
              toast.type === 'success'
                ? 'bg-neutral-900/95 border-emerald-600/50 text-white'
                : toast.type === 'error'
                ? 'bg-neutral-900/95 border-red-600/50 text-white'
                : 'bg-neutral-900/95 border-neutral-700 text-white'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-red-400" />
              ) : (
                <Sparkles className="w-5 h-5 text-neutral-300" />
              )}
            </div>
            <div className="flex-1 text-xs font-semibold leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Barra Exclusiva de Engenharia para o Dono do Projeto (Oculta para tutores e clínicas) */}
      {isOwnerAuthorized && (
        <aside aria-label="Painel de Controle do Dono do Projeto" className="bg-neutral-900 border-b border-neutral-800 px-4 sm:px-8 py-2 text-xs text-neutral-300 flex flex-wrap items-center justify-between gap-3 shadow-sm z-30">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-neutral-800 text-emerald-400">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400">
                Acesso Técnico Autorizado
              </span>
              <span className="hidden md:inline text-[11px] text-neutral-400 ml-2">
                (Visualização restrita ao proprietário)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentRole('CODE_EXPLORER')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                currentRole === 'CODE_EXPLORER'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Ver Arquitetura Técnica</span>
            </button>

            {currentUser && currentUser.isLoggedIn ? (
              <button
                onClick={() => setCurrentRole(currentUser.role === 'TUTOR' ? 'TUTOR' : 'INSTITUTION_ADMIN')}
                className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
              >
                Visão {currentUser.role === 'TUTOR' ? 'Tutor' : 'Clínica'}
              </button>
            ) : currentRole === 'CODE_EXPLORER' ? (
              <button
                onClick={() => setCurrentRole('AUTH')}
                className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
              >
                Tela de Login
              </button>
            ) : null}

            <button
              onClick={handleLockOwnerDev}
              className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition flex items-center gap-1"
              title="Encerrar sessão de proprietário e ocultar qualquer traço de dev do front-end"
            >
              <Lock className="w-3 h-3" />
              <span>Ocultar Painel</span>
            </button>
          </div>
        </aside>
      )}

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* View Switcher */}
        {isAuthBooting ? (
          <div className="max-w-md mx-auto my-12 p-8 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              Validando sessão segura...
            </p>
          </div>
        ) : currentRole === 'AUTH' ? (
          <AuthView
            initialMode="LOGIN"
            onLoginSuccess={handleLoginSuccess}
            onRegisterTutorSuccess={handleRegisterTutorSuccess}
            onRegisterClinicSuccess={handleRegisterClinicSuccess}
          />
        ) : currentRole === 'INSTITUTION_ADMIN' || currentRole === 'INSTITUTION_EMPLOYEE' ? (
          <InstitutionView
            institution={activeClinic}
            inventory={inventory}
            movements={movements}
            bloodBags={bloodBags}
            needs={needs}
            interests={interests}
            appointments={appointments}
            employees={employees}
            vouchers={vouchers}
            allPets={pets}
            onAddMovement={handleAddMovement}
            onDiscardBag={handleDiscardBag}
            onCreateNeed={handleCreateNeed}
            onConfirmDonation={handleConfirmDonation}
            onRedeemVoucher={handleRedeemVoucher}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onRemoveEmployee={handleRemoveEmployee}
            onScheduleInterest={handleScheduleInterest}
          />
        ) : currentRole === 'TUTOR' ? (
          <TutorView
            tutor={activeTutor}
            pets={tutorPets}
            needs={needs}
            interests={interests}
            appointments={appointments}
            vouchers={vouchers}
            onRegisterPet={handleRegisterPet}
            onDeletePet={handleDeletePet}
            onExpressInterest={handleExpressInterest}
          />
        ) : currentRole === 'AUDITOR' ? (
          <AuditView />
        ) : isOwnerAuthorized && currentRole === 'CODE_EXPLORER' ? (
          <FlaskCodeViewer />
        ) : (
          <InstitutionView
            institution={activeClinic}
            inventory={inventory}
            movements={movements}
            bloodBags={bloodBags}
            needs={needs}
            interests={interests}
            appointments={appointments}
            employees={employees}
            vouchers={vouchers}
            allPets={pets}
            onAddMovement={handleAddMovement}
            onDiscardBag={handleDiscardBag}
            onCreateNeed={handleCreateNeed}
            onConfirmDonation={handleConfirmDonation}
            onRedeemVoucher={handleRedeemVoucher}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onRemoveEmployee={handleRemoveEmployee}
            onScheduleInterest={handleScheduleInterest}
          />
        )}
      </main>

      {/* Footer LGPD & Compliance */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black py-6 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              onClick={handleSecretFooterClick}
              className="font-bold text-neutral-800 dark:text-neutral-200 cursor-pointer select-none"
              title="DoePet Hemoterapia"
            >
              DOEPET
            </span>
            <span>• Rede Solidária de Hemoterapia Animal</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Privacidade e Proteção de Dados</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Modal de Autenticação Restrita aos Donos do Projeto */}
      <OwnerDevAuthModal
        isOpen={showOwnerAuthModal}
        onClose={() => setShowOwnerAuthModal(false)}
        onAuthenticateSuccess={(ownerInfo) => {
          try {
            sessionStorage.setItem(OWNER_AUTH_SESSION_KEY, 'true');
          } catch (e) {
            console.error(e);
          }
          setIsOwnerAuthorized(true);
          setCurrentRole('CODE_EXPLORER');
          showToast(`Acesso autenticado! Modo de Engenharia liberado para o Dono do Projeto (${ownerInfo.email}).`, 'success');
        }}
        onLogAttempt={() => {
          // Recorded server-side via audit middleware
        }}
      />
    </div>
  );
}
