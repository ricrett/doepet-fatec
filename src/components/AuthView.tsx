import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  Phone,
  MapPin,
  Eye,
  EyeOff,
  User,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  KeyRound,
  Check,
  X
} from 'lucide-react';
import { AuthMode, AuthenticatedUser, Role, Tutor, Institution } from '../types';
import { apiClient } from '../services/api';

interface AuthViewProps {
  initialMode?: AuthMode;
  onLoginSuccess: (user: AuthenticatedUser) => void;
  onRegisterTutorSuccess: (
    newTutor: Partial<Tutor>,
    password: string,
    authResult?: { user: AuthenticatedUser; tutor?: Tutor }
  ) => void;
  onRegisterClinicSuccess: (
    newClinic: Partial<Institution>,
    password: string,
    authResult?: { user: AuthenticatedUser; institution?: Institution }
  ) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const AuthView: React.FC<AuthViewProps> = ({
  initialMode = 'LOGIN',
  onLoginSuccess,
  onRegisterTutorSuccess,
  onRegisterClinicSuccess,
  onClose,
  isModal = false
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Login Form States
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot Password States
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotCountdown, setForgotCountdown] = useState(0);

  // Tutor Registration Form States
  const [tutorName, setTutorName] = useState('');
  const [tutorEmail, setTutorEmail] = useState('');
  const [tutorPhone, setTutorPhone] = useState('');
  const [tutorCpf, setTutorCpf] = useState('');
  const [tutorCep, setTutorCep] = useState('');
  const [tutorCidade, setTutorCidade] = useState('');
  const [tutorEstado, setTutorEstado] = useState('SP');
  const [tutorBairro, setTutorBairro] = useState('');
  const [tutorPassword, setTutorPassword] = useState('');
  const [tutorPasswordConfirm, setTutorPasswordConfirm] = useState('');
  const [showTutorPassword, setShowTutorPassword] = useState(false);
  const [showTutorPasswordConfirm, setShowTutorPasswordConfirm] = useState(false);
  const [tutorTermsAccepted, setTutorTermsAccepted] = useState(false);
  const [tutorFormError, setTutorFormError] = useState<string | null>(null);

  // Clinic Registration Form States
  const [clinicRazaoSocial, setClinicRazaoSocial] = useState('');
  const [clinicNomeFantasia, setClinicNomeFantasia] = useState('');
  const [clinicCnpj, setClinicCnpj] = useState('');
  const [clinicCrmv, setClinicCrmv] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicCep, setClinicCep] = useState('');
  const [clinicEndereco, setClinicEndereco] = useState('');
  const [clinicCidade, setClinicCidade] = useState('');
  const [clinicEstado, setClinicEstado] = useState('SP');
  const [clinicCapacidade, setClinicCapacidade] = useState(10);
  const [clinicPassword, setClinicPassword] = useState('');
  const [clinicPasswordConfirm, setClinicPasswordConfirm] = useState('');
  const [showClinicPassword, setShowClinicPassword] = useState(false);
  const [showClinicPasswordConfirm, setShowClinicPasswordConfirm] = useState(false);
  const [clinicTermsAccepted, setClinicTermsAccepted] = useState(false);
  const [clinicFormError, setClinicFormError] = useState<string | null>(null);

  // Terms Modal State
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Helper formatting masks
  const formatCPF = (val: string) => {
    return val
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .substring(0, 14);
  };

  const formatCNPJ = (val: string) => {
    return val
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})/, '$1-$2')
      .substring(0, 18);
  };

  const formatPhone = (val: string) => {
    return val
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{4})/, '$1-$2')
      .substring(0, 15);
  };

  const formatCEP = (val: string) => {
    return val
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .substring(0, 9);
  };

  // Mock auto-fill address by CEP
  const handleCepLookup = (cepVal: string, isClinic: boolean) => {
    const cleanCep = cepVal.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      if (cleanCep.startsWith('01') || cleanCep.startsWith('04') || cleanCep.startsWith('05')) {
        if (isClinic) {
          if (!clinicCidade) setClinicCidade('São Paulo');
          if (!clinicEstado) setClinicEstado('SP');
          if (!clinicEndereco) setClinicEndereco('Av. Paulista, 1578');
        } else {
          if (!tutorCidade) setTutorCidade('São Paulo');
          if (!tutorEstado) setTutorEstado('SP');
          if (!tutorBairro) setTutorBairro('Bela Vista');
        }
      } else if (cleanCep.startsWith('20') || cleanCep.startsWith('22')) {
        if (isClinic) {
          if (!clinicCidade) setClinicCidade('Rio de Janeiro');
          if (!clinicEstado) setClinicEstado('RJ');
          if (!clinicEndereco) setClinicEndereco('Rua Barata Ribeiro, 400');
        } else {
          if (!tutorCidade) setTutorCidade('Rio de Janeiro');
          if (!tutorEstado) setTutorEstado('RJ');
          if (!tutorBairro) setTutorBairro('Copacabana');
        }
      }
    }
  };

  // Handle Login Submit via /api/v1/auth/login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setLoginError('Por favor, preencha o e-mail ou documento e a senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.login({
        identifier: loginIdentifier.trim(),
        password: loginPassword,
      });
      onLoginSuccess(res.user);
    } catch (err: any) {
      setLoginError(err?.message || 'E-mail/documento ou senha inválidos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Forgot Password Submit via /api/v1/auth/forgot-password
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
      return;
    }
    try {
      await apiClient.forgotPassword(forgotEmail.trim());
    } catch {
      // Non-enumerating security response
    }
    setForgotSent(true);
    setForgotCountdown(30);

    const timer = setInterval(() => {
      setForgotCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle Tutor Register Submit via /api/v1/auth/register/tutor
  const handleTutorRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTutorFormError(null);

    if (!tutorName.trim() || !tutorEmail.trim() || !tutorPhone.trim() || !tutorCpf.trim() || !tutorCep.trim()) {
      setTutorFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (tutorPassword.length < 6) {
      setTutorFormError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (tutorPassword !== tutorPasswordConfirm) {
      setTutorFormError('As senhas digitadas não coincidem.');
      return;
    }

    if (!tutorTermsAccepted) {
      setTutorFormError('Você precisa concordar com os Termos de Uso e Política de Privacidade para prosseguir.');
      return;
    }

    const tutorPayload: Partial<Tutor> = {
      nome: tutorName,
      cpf: tutorCpf,
      telefone: tutorPhone,
      whatsapp: tutorPhone,
      cidade: tutorCidade || 'São Paulo',
      estado: tutorEstado || 'SP',
      bairro: tutorBairro || 'Centro',
      notifPush: true,
      lgpdAceito: true,
      lgpdVersao: 'v1.0-2026',
      dataAceite: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      const res = await apiClient.registerTutor(tutorPayload, tutorPassword, tutorEmail.trim());
      onRegisterTutorSuccess(tutorPayload, tutorPassword, {
        user: res.user,
        tutor: res.tutor,
      });
    } catch (err: any) {
      setTutorFormError(err?.message || 'Erro ao registrar tutor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Clinic Register Submit via /api/v1/auth/register/clinic
  const handleClinicRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClinicFormError(null);

    if (
      !clinicRazaoSocial.trim() ||
      !clinicNomeFantasia.trim() ||
      !clinicCnpj.trim() ||
      !clinicCrmv.trim() ||
      !clinicEmail.trim() ||
      !clinicPhone.trim() ||
      !clinicCep.trim() ||
      !clinicEndereco.trim()
    ) {
      setClinicFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (clinicPassword.length < 6) {
      setClinicFormError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }

    if (clinicPassword !== clinicPasswordConfirm) {
      setClinicFormError('As senhas digitadas não coincidem.');
      return;
    }

    if (!clinicTermsAccepted) {
      setClinicFormError('A instituição precisa aceitar as diretrizes da LGPD e as normas do CFMV.');
      return;
    }

    const clinicPayload: Partial<Institution> = {
      razaoSocial: clinicRazaoSocial,
      nomeFantasia: clinicNomeFantasia,
      cnpj: clinicCnpj,
      crmvResponsavel: clinicCrmv,
      emailContato: clinicEmail,
      telefone: clinicPhone,
      cidade: clinicCidade || 'São Paulo',
      estado: clinicEstado || 'SP',
      capacidadeDiaria: clinicCapacidade || 10,
      status: 'ACTIVE',
    };

    setIsSubmitting(true);
    try {
      const res = await apiClient.registerClinic(clinicPayload, clinicPassword);
      onRegisterClinicSuccess(clinicPayload, clinicPassword, {
        user: res.user,
        institution: res.institution,
      });
    } catch (err: any) {
      setClinicFormError(err?.message || 'Erro ao registrar instituição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`relative ${isModal ? 'w-full' : 'max-w-4xl mx-auto my-6 px-4'}`}>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-lg overflow-hidden transition-all duration-300">
        {/* Header Bar */}
        <div className="bg-emerald-700 dark:bg-black px-6 py-5 text-white flex items-center justify-between border-b border-emerald-800 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-lg">
              🐾
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <span>DOEPET</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/15">
                  Autenticação
                </span>
              </h2>
              <p className="text-xs text-emerald-100 dark:text-neutral-400">
                Rede Solidária de Hemoterapia Animal
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              title="Fechar janela"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Dynamic Auth Views */}
        <div className="p-6 sm:p-8">
          {/* ========================================================================= */}
          {/* 1. TELA DE LOGIN PRINCIPAL */}
          {/* ========================================================================= */}
          {mode === 'LOGIN' && (
            <div className="max-w-md mx-auto space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xl">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 tracking-tight">
                  Acesse sua Conta
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Tutores de animais doadores e clínicas veterinárias
                </p>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Formulário de Login */}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* Campo E-mail / CPF / CNPJ */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                    E-mail, CPF ou CNPJ
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="seu.email@exemplo.com ou documento"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
                    />
                  </div>
                </div>

                {/* Campo Senha com alternador de visibilidade */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                      Senha de Acesso
                    </label>
                    <button
                      type="button"
                      onClick={() => setMode('FORGOT_PASSWORD')}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 focus:outline-none"
                      title={showLoginPassword ? 'Ocultar senha' : 'Exibir senha'}
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Lembrar de mim */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-neutral-300 dark:border-neutral-700"
                    />
                    <span className="text-xs text-neutral-600 dark:text-neutral-400 font-medium">
                      Lembrar de mim neste dispositivo
                    </span>
                  </label>
                </div>

                {/* Botão Entrar */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Entrar no DoePet</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Chamada para Cadastrar */}
              <div className="pt-2 text-center text-xs">
                <span className="text-neutral-500 dark:text-neutral-400">Ainda não tem conta? </span>
                <button
                  type="button"
                  onClick={() => setMode('SELECT_PROFILE')}
                  className="font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>Cadastre-se no DoePet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. FLUXO DE SELEÇÃO DE PERFIL ("Como você deseja se cadastrar?") */}
          {/* ========================================================================= */}
          {mode === 'SELECT_PROFILE' && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode('LOGIN')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar para o Login</span>
                </button>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Etapa 1 de 2: Perfil
                </span>
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 tracking-tight">
                  Como você deseja se cadastrar?
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                  Selecione o tipo de perfil para direcionarmos a experiência e os recursos ideais para o seu objetivo.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Opção A: Sou Tutor */}
                <button
                  type="button"
                  onClick={() => setMode('REGISTER_TUTOR')}
                  className="group p-6 rounded-3xl border-2 border-neutral-200 dark:border-neutral-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-white dark:bg-neutral-800/80 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20 text-left transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🐾
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500 block">
                        Pessoa Física
                      </span>
                      <h4 className="text-lg font-black text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        Sou Tutor de Pet
                      </h4>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      Desejo cadastrar meus cães ou gatos para doar sangue, receber alertas urgentes da minha região ou solicitar sangue em emergências.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/60 flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <span>Cadastrar como Tutor</span>
                    <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
                  </div>
                </button>

                {/* Opção B: Sou Clínica / Banco de Sangue */}
                <button
                  type="button"
                  onClick={() => setMode('REGISTER_CLINIC')}
                  className="group p-6 rounded-3xl border-2 border-neutral-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-neutral-800/80 hover:bg-blue-50/20 dark:hover:bg-blue-950/20 text-left transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🏥
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500 block">
                        Pessoa Jurídica
                      </span>
                      <h4 className="text-lg font-black text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        Clínica / Banco de Sangue
                      </h4>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      Hospitais veterinários, clínicas e laboratórios que gerenciam estoque de hemocomponentes, disparam alertas de carência e agendam coletas.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/60 flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400">
                    <span>Cadastrar Instituição</span>
                    <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
                  </div>
                </button>
              </div>

              <div className="text-center text-xs text-neutral-400 pt-2">
                Já possui uma conta ativa?{' '}
                <button
                  type="button"
                  onClick={() => setMode('LOGIN')}
                  className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Fazer login agora
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. FORMULÁRIO DE CADASTRO - TUTOR */}
          {/* ========================================================================= */}
          {mode === 'REGISTER_TUTOR' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode('SELECT_PROFILE')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Trocar Tipo de Perfil</span>
                </button>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  🐾 Cadastro de Tutor
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 tracking-tight">
                  Criar Conta de Tutor Doador / Receptor
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Preencha os dados do tutor responsável para receber convocações para salvar vidas.
                </p>
              </div>

              {tutorFormError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{tutorFormError}</span>
                </div>
              )}

              <form onSubmit={handleTutorRegisterSubmit} className="space-y-4">
                {/* Linha 1: Nome Completo & CPF */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Nome Completo *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={tutorName}
                        onChange={(e) => setTutorName(e.target.value)}
                        placeholder="Ex: Carlos Eduardo Silva"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      CPF *
                    </label>
                    <input
                      type="text"
                      required
                      value={tutorCpf}
                      onChange={(e) => setTutorCpf(formatCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>
                </div>

                {/* Linha 2: E-mail & Telefone/WhatsApp com DDD */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      E-mail *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={tutorEmail}
                        onChange={(e) => setTutorEmail(e.target.value)}
                        placeholder="carlos@exemplo.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Telefone / WhatsApp (com DDD) *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={tutorPhone}
                        onChange={(e) => setTutorPhone(formatPhone(e.target.value))}
                        placeholder="(11) 98765-4321"
                        maxLength={15}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Linha 3: Localização & CEP (Cruzamento de emergências) */}
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Localização e Raio de Atendimento</span>
                    </span>
                    <span className="text-[10px] text-neutral-500">Crucial para alertas próximos</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">CEP *</label>
                      <input
                        type="text"
                        required
                        value={tutorCep}
                        onChange={(e) => {
                          const formatted = formatCEP(e.target.value);
                          setTutorCep(formatted);
                          handleCepLookup(formatted, false);
                        }}
                        placeholder="01400-000"
                        maxLength={9}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={tutorBairro}
                        onChange={(e) => setTutorBairro(e.target.value)}
                        placeholder="Ex: Pinheiros"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={tutorCidade}
                        onChange={(e) => setTutorCidade(e.target.value)}
                        placeholder="São Paulo"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">UF (Estado) *</label>
                      <select
                        value={tutorEstado}
                        onChange={(e) => setTutorEstado(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                      >
                        {['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'DF', 'BA', 'PE', 'GO'].map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Linha 4: Senha e Confirmação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Senha * (Mínimo 6 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        type={showTutorPassword ? 'text' : 'password'}
                        required
                        value={tutorPassword}
                        onChange={(e) => setTutorPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 pr-10 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTutorPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600"
                      >
                        {showTutorPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <input
                        type={showTutorPasswordConfirm ? 'text' : 'password'}
                        required
                        value={tutorPasswordConfirm}
                        onChange={(e) => setTutorPasswordConfirm(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 pr-10 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTutorPasswordConfirm((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600"
                      >
                        {showTutorPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Checkbox Termos de Uso e Política de Privacidade */}
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tutorTermsAccepted}
                      onChange={(e) => setTutorTermsAccepted(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-neutral-300 dark:border-neutral-700"
                    />
                    <span className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      Declaro que li e concordo com os{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-emerald-600 dark:text-emerald-400 font-bold underline hover:text-emerald-700"
                      >
                        Termos de Uso
                      </button>{' '}
                      e a{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-emerald-600 dark:text-emerald-400 font-bold underline hover:text-emerald-700"
                      >
                        Política de Privacidade (LGPD Lei nº 13.709/2018)
                      </button>
                      , autorizando o tratamento do número de telefone e geolocalização exclusivamente para urgências transfusionais veterinárias.
                    </span>
                  </label>
                </div>

                {/* Botão de Envio */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('LOGIN')}
                    className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Já tenho conta
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition flex items-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Criar Minha Conta de Tutor</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. FORMULÁRIO DE CADASTRO - CLÍNICA / BANCO DE SANGUE */}
          {/* ========================================================================= */}
          {mode === 'REGISTER_CLINIC' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode('SELECT_PROFILE')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Trocar Tipo de Perfil</span>
                </button>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  🏥 Cadastro de Instituição Veterinária
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 tracking-tight">
                  Cadastro de Clínica ou Hemocentro Veterinário
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Cadastro técnico para hospitais veterinários 24h, clínicas e bancos de sangue animal regulamentados.
                </p>
              </div>

              {clinicFormError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{clinicFormError}</span>
                </div>
              )}

              <form onSubmit={handleClinicRegisterSubmit} className="space-y-4">
                {/* Linha 1: Nome Fantasia e Razão Social */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Nome Fantasia da Clínica *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={clinicNomeFantasia}
                        onChange={(e) => setClinicNomeFantasia(e.target.value)}
                        placeholder="Ex: HVet Vida 24 Horas"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Razão Social *
                    </label>
                    <input
                      type="text"
                      required
                      value={clinicRazaoSocial}
                      onChange={(e) => setClinicRazaoSocial(e.target.value)}
                      placeholder="Hospital Veterinário Vida LTDA"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Linha 2: CNPJ e CRMV */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      CNPJ *
                    </label>
                    <input
                      type="text"
                      required
                      value={clinicCnpj}
                      onChange={(e) => setClinicCnpj(formatCNPJ(e.target.value))}
                      placeholder="00.000.000/0001-00"
                      maxLength={18}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      CRMV do Responsável Técnico *
                    </label>
                    <input
                      type="text"
                      required
                      value={clinicCrmv}
                      onChange={(e) => setClinicCrmv(e.target.value.toUpperCase())}
                      placeholder="CRMV-SP 12345"
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                    />
                  </div>
                </div>

                {/* Linha 3: E-mail Corporativo e Telefone de Emergência */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      E-mail Corporativo *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={clinicEmail}
                        onChange={(e) => setClinicEmail(e.target.value)}
                        placeholder="contato@hvetvida.com.br"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Telefone / WhatsApp para Urgências *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={clinicPhone}
                        onChange={(e) => setClinicPhone(formatPhone(e.target.value))}
                        placeholder="(11) 3333-2222"
                        maxLength={15}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Linha 4: Endereço Completo com CEP, Cidade e Estado */}
                <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Endereço Completo da Unidade</span>
                    </span>
                    <span className="text-[10px] text-neutral-500">Unidade de Coleta e Estoque</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">CEP *</label>
                      <input
                        type="text"
                        required
                        value={clinicCep}
                        onChange={(e) => {
                          const formatted = formatCEP(e.target.value);
                          setClinicCep(formatted);
                          handleCepLookup(formatted, true);
                        }}
                        placeholder="01310-100"
                        maxLength={9}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold uppercase mb-1">Logradouro e Número *</label>
                      <input
                        type="text"
                        required
                        value={clinicEndereco}
                        onChange={(e) => setClinicEndereco(e.target.value)}
                        placeholder="Av. Paulista, 1500 - Bela Vista"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">UF *</label>
                      <select
                        value={clinicEstado}
                        onChange={(e) => setClinicEstado(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                      >
                        {['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'DF', 'BA', 'PE', 'GO'].map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={clinicCidade}
                        onChange={(e) => setClinicCidade(e.target.value)}
                        placeholder="São Paulo"
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase mb-1">Capacidade Diária (Doações)</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={clinicCapacidade}
                        onChange={(e) => setClinicCapacidade(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Linha 5: Senha e Confirmação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Senha * (Mínimo 6 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        type={showClinicPassword ? 'text' : 'password'}
                        required
                        value={clinicPassword}
                        onChange={(e) => setClinicPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 pr-10 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClinicPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600"
                      >
                        {showClinicPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <input
                        type={showClinicPasswordConfirm ? 'text' : 'password'}
                        required
                        value={clinicPasswordConfirm}
                        onChange={(e) => setClinicPasswordConfirm(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 pr-10 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClinicPasswordConfirm((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600"
                      >
                        {showClinicPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Checkbox Termos de Uso e Política de Privacidade */}
                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-xs space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clinicTermsAccepted}
                      onChange={(e) => setClinicTermsAccepted(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-700"
                    />
                    <span className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      A instituição declara concordância com os{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-700"
                      >
                        Termos de Uso
                      </button>{' '}
                      e as <strong>Normas do CFMV e LGPD</strong> para manejo ético de hemoderivados veterinários, custódia de bolsas e confidencialidade médica de doadores.
                    </span>
                  </label>
                </div>

                {/* Botão de Envio */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('LOGIN')}
                    className="px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-bold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Já tenho conta
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition flex items-center gap-2 disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Criar Cadastro da Instituição</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. TELA / MODAL DE RECUPERAÇÃO DE SENHA ("Esqueci minha senha") */}
          {/* ========================================================================= */}
          {mode === 'FORGOT_PASSWORD' && (
            <div className="max-w-md mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMode('LOGIN');
                    setForgotSent(false);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar para o Login</span>
                </button>
              </div>

              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shadow-sm">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 tracking-tight">
                  Recuperação de Senha
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Digite seu e-mail cadastrado para receber instruções e um link seguro para redefinição.
                </p>
              </div>

              {!forgotSent ? (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 mb-1.5">
                      E-mail Cadastrado *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="seu.email@exemplo.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
                  >
                    <span>Enviar instruções de recuperação</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                /* Mensagem de Confirmação de Envio */
                <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-center space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Check className="w-6 h-6 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                      Instruções enviadas com sucesso!
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                      Enviamos um link de redefinição para <strong>{forgotEmail}</strong>. Verifique sua caixa de entrada e spam.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={forgotCountdown > 0}
                      onClick={handleForgotSubmit}
                      className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-emerald-600 disabled:opacity-50"
                    >
                      {forgotCountdown > 0
                        ? `Aguarde ${forgotCountdown}s para solicitar novo envio`
                        : 'Não recebeu o e-mail? Clique para reenviar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('LOGIN');
                        setForgotSent(false);
                      }}
                      className="w-full py-2.5 rounded-xl bg-white dark:bg-neutral-800 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs hover:bg-emerald-50/50 transition"
                    >
                      Voltar e Entrar na Conta
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: TERMOS DE USO & POLÍTICA DE PRIVACIDADE (LGPD) */}
      {/* ========================================================================= */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[85vh] bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-neutral-900 dark:text-neutral-100">
                  Termos de Uso e Política de Privacidade (LGPD)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto text-xs text-neutral-600 dark:text-neutral-300 space-y-4 leading-relaxed">
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-medium">
                🔒 DoePet opera em estrita conformidade com a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong> e as Resoluções do CFMV sobre hemoterapia e transfusão de sangue veterinário.
              </div>

              <div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">
                  1. Finalidade do Tratamento de Dados
                </h4>
                <p>
                  Os dados cadastrais de tutores (nome, CPF, telefone, WhatsApp, localização geográfica/CEP) e de instituições (CNPJ, CRMV técnico, contato de plantão) são tratados única e exclusivamente para a finalidade de localização rápida, cruzamento de tipo sanguíneo e acionamento de emergências veterinárias transfusionais.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">
                  2. Proteção de Dados e Não Compartilhamento Comercial
                </h4>
                <p>
                  O DoePet <strong>não vende, aluga ou compartilha</strong> dados com seguradoras, indústrias farmacêuticas ou terceiros comerciais. O acionamento de um tutor ocorre exclusivamente quando há um alerta ativo de sangue compatível em clínicas cadastradas na sua microrregião.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">
                  3. Elegibilidade e Bem-Estar Animal
                </h4>
                <p>
                  A doação de sangue pet é voluntária e sempre precedida por triagem clínica, aferição de hematócrito e avaliação médica veterinária. A integridade física do pet doador é a prioridade absoluta da rede.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">
                  4. Direito de Revogação e Exclusão
                </h4>
                <p>
                  Em atendimento ao Artigo 18 da LGPD, o titular tem direito a solicitar a qualquer momento a visualização de logs, a alteração de dados cadastrais ou a revogação de consentimento com exclusão definitiva de sua conta da plataforma.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition"
              >
                Compreendi e Concordo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
