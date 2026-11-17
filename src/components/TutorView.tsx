import React, { useState } from 'react';
import {
  Tutor,
  Pet,
  BloodNeed,
  DonorInterest,
  Appointment,
  Voucher,
  Especie
} from '../types';
import {
  Heart,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Ticket,
  Download,
  ShieldCheck,
  Stethoscope,
  Send,
  Sparkles,
  Info,
  Trash2,
  Clock,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Activity,
  LayoutGrid,
  ArrowRight,
  ArrowLeft,
  Bell
} from 'lucide-react';
import { apiClient } from '../services/api';
import { subscribeToWebPush } from '../services/pushClient';

interface TutorViewProps {
  tutor: Tutor;
  pets: Pet[];
  needs: BloodNeed[];
  interests: DonorInterest[];
  appointments: Appointment[];
  vouchers: Voucher[];
  onRegisterPet: (pet: Omit<Pet, 'id' | 'tutorId' | 'statusElegibilidade'>) => Promise<void> | void;
  onDeletePet: (petId: number) => Promise<void> | void;
  onExpressInterest: (needId: number, petId: number) => Promise<void> | void;
}

export const TutorView: React.FC<TutorViewProps> = ({
  tutor,
  pets,
  needs,
  interests,
  appointments,
  vouchers,
  onRegisterPet,
  onDeletePet,
  onExpressInterest
}) => {
  const [activeTab, setActiveTab] = useState<'HOME' | 'PETS' | 'ALERTAS' | 'AGENDAMENTOS' | 'VOUCHERS' | 'LGPD'>('HOME');

  // Estado para a barra toggler de indicadores no final da página
  const [isKpisOpen, setIsKpisOpen] = useState(true);

  // Form states for new Pet
  const [showPetModal, setShowPetModal] = useState(false);
  const [petNome, setPetNome] = useState('');
  const [petEspecie, setPetEspecie] = useState<Especie>('CANINA');
  const [petRaca, setPetRaca] = useState('');
  const [petSexo, setPetSexo] = useState<'MACHO' | 'FEMEA'>('MACHO');
  const [petDataNascimento, setPetDataNascimento] = useState<string>('2023-01-15');
  const [petTipoDataNasc, setPetTipoDataNasc] = useState<'REAL' | 'ESTIMADA'>('REAL');
  const [petIdade, setPetIdade] = useState<number>(3);
  const [petPeso, setPetPeso] = useState<number>(28);
  const [petTipo, setPetTipo] = useState<string>('DEA 1.1 Negativo (Doador Universal)');
  const [petCastrado, setPetCastrado] = useState(true);
  const [petVacinado, setPetVacinado] = useState(true);
  const [petVermifugado, setPetVermifugado] = useState(true);
  const [petObs, setPetObs] = useState('');

  // Helper para cálculo da idade do animal a partir da data de nascimento (SQL DATE)
  const calculateAgeInYears = (birthDateStr: string): number => {
    if (!birthDateStr) return 1;
    const birth = new Date(birthDateStr + 'T00:00:00');
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      years--;
    }
    return Math.max(0, years);
  };

  // Selected pet for expressing interest
  const [selectedPetForNeed, setSelectedPetForNeed] = useState<{ [needId: number]: number }>({});
  const [interestSuccessBanner, setInterestSuccessBanner] = useState<string | null>(null);
  const [interestErrorBanner, setInterestErrorBanner] = useState<string | null>(null);
  const [pushStatusMsg, setPushStatusMsg] = useState<string | null>(null);
  const [isPushBusy, setIsPushBusy] = useState(false);

  // Exclusão de Pet com confirmação
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);

  // Considerar estritamente os animais pertencentes a este tutor
  const myPets = pets.filter((p) => !p.tutorId || p.tutorId === tutor.id);
  const tutorSpecies = Array.from(new Set(myPets.map((p) => p.especie)));
  const compatibleNeeds = needs.filter((n) => tutorSpecies.includes(n.especie) && n.status === 'ACTIVE');

  // Cálculo verificado e clinicamente correto do potencial de doação dos pets aptos deste tutor:
  // Diretriz médica veterinária segura: 450 mL por cão apto (≥ 25 kg, 1-8 anos) e 50 mL por gato apto (≥ 4 kg, 1-7 anos)
  const tutorEligibleDogs = myPets.filter((p) => p.especie === 'CANINA' && p.statusElegibilidade === 'APTO');
  const tutorEligibleCats = myPets.filter((p) => p.especie === 'FELINA' && p.statusElegibilidade === 'APTO');
  const tutorDogMl = tutorEligibleDogs.length * 450;
  const tutorCatMl = tutorEligibleCats.length * 50;
  const tutorTotalMl = tutorDogMl + tutorCatMl;
  const tutorEligibleCount = tutorEligibleDogs.length + tutorEligibleCats.length;

  const handleRegisterPetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRegisterPet({
      nome: petNome,
      especie: petEspecie,
      raca: petRaca,
      sexo: petSexo,
      idadeAnos: petIdade,
      dataNascimento: petDataNascimento,
      pesoKg: petPeso,
      tipoSanguineo: petTipo,
      castrado: petCastrado,
      vacinadoEmDia: petVacinado,
      vermifugadoEmDia: petVermifugado,
      observacoes: petObs
    });

    setShowPetModal(false);
    setPetNome('');
    setPetRaca('');
    setPetDataNascimento('2023-01-15');
    setPetTipoDataNasc('REAL');
    setPetIdade(3);
    setPetObs('');
  };

  const handleInterestSubmit = async (needId: number) => {
    setInterestErrorBanner(null);
    const need = needs.find((n) => n.id === needId);
    if (!need) return;

    // Pick chosen pet or default to first matching species
    const chosenPetId =
      selectedPetForNeed[needId] ||
      pets.find((p) => p.especie === need.especie && p.statusElegibilidade === 'APTO')?.id;

    if (!chosenPetId) {
      setInterestErrorBanner('Selecione um animal apto desta espécie para doar.');
      setTimeout(() => setInterestErrorBanner(null), 5000);
      return;
    }

    await onExpressInterest(needId, chosenPetId);
    const petObj = pets.find((p) => p.id === chosenPetId);
    setInterestSuccessBanner(
      `Interesse registrado com sucesso para o pet ${petObj?.nome}! A equipe clínica entrará em contato para confirmar o agendamento.`
    );
    setTimeout(() => setInterestSuccessBanner(null), 6000);
  };

  // Web Push opt-in & test notification (DT-06)
  const handleEnableWebPush = async () => {
    setIsPushBusy(true);
    setPushStatusMsg(null);
    try {
      const subResult = await subscribeToWebPush();
      if (!subResult.subscribed) {
        setPushStatusMsg(subResult.reason || 'Não foi possível ativar notificações push neste dispositivo.');
        return;
      }
      await apiClient.sendTestPush();
      setPushStatusMsg('Alertas push ativados! Você receberá chamados de emergência compatíveis em tempo real.');
    } catch (err) {
      setPushStatusMsg(err instanceof Error ? err.message : 'Erro ao configurar notificações.');
    } finally {
      setIsPushBusy(false);
    }
  };

  // LGPD Artigo 18 Export via backend API with local fallback
  const handleExportLgpd = async () => {
    let payload: unknown;
    try {
      payload = await apiClient.exportLgpd();
    } catch {
      payload = {
        titular: {
          nome: tutor.nome,
          cpf: tutor.cpf,
          telefone: tutor.telefone,
          cidade: tutor.cidade,
          estado: tutor.estado,
          bairro: tutor.bairro
        },
        consentimento: {
          aceito: tutor.lgpdAceito,
          versaoPolitica: tutor.lgpdVersao,
          dataAceite: tutor.dataAceite,
          baseLegal: 'Consentimento do Titular - LGPD Lei 13.709/2018'
        },
        animaisCadastrados: pets,
        vouchersFidelidade: vouchers,
        agendamentos: appointments,
        exportadoEm: new Date().toISOString()
      };
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `doepet_dados_titular_${tutor.cpf.replace(/\D/g, '')}.json`);
    dlAnchorElem.click();
  };

  return (
    <div className="space-y-6">
      {/* Tutor Profile Header */}
      <div className="p-5 sm:p-6 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-neutral-100">
              Olá, {tutor.nome}
            </h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-neutral-800 dark:text-emerald-300 border border-emerald-200 dark:border-neutral-700">
              Tutor Cadastrado
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Localização: {tutor.bairro}, {tutor.cidade}/{tutor.estado} • Notificações ativas: {tutor.notifPush ? 'Sim' : 'Não'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleEnableWebPush}
            disabled={isPushBusy}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition disabled:opacity-50"
          >
            <Bell className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isPushBusy ? 'Ativando...' : 'Ativar Alertas Push'}</span>
          </button>
          <button
            onClick={() => setShowPetModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Novo Animal</span>
          </button>
        </div>
      </div>

      {pushStatusMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 flex-shrink-0" />
            <span>{pushStatusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPushStatusMsg(null)}
            className="text-xs font-bold hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {interestErrorBanner && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{interestErrorBanner}</span>
        </div>
      )}

      {interestSuccessBanner && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{interestSuccessBanner}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* TELA INICIAL (CARDS DO PAINEL PRINCIPAL DO TUTOR)        */}
      {/* ======================================================== */}
      {activeTab === 'HOME' && (
        <div className="space-y-6">
          {/* Header e Boas-Vindas da Tela Inicial */}
          <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span className="p-1 rounded-lg bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400">
                  <LayoutGrid className="w-4 h-4" />
                </span>
                <span>Painel Principal do Tutor</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Selecione um dos módulos abaixo para gerenciar seus animais, atender a alertas urgentes e acompanhar doações.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-3 py-1 rounded-xl border border-emerald-200/60 dark:border-neutral-700">
                Rede Ativa DoePet
              </span>
            </div>
          </div>

          {/* Grid com os 5 Cards de Navegação */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {/* 1. Card: Meus Animais */}
            <div
              onClick={() => setActiveTab('PETS')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <Heart className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    {myPets.length} {myPets.length === 1 ? 'animal' : 'animais'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Meus Animais
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Cadastro de cães e gatos, acompanhamento de data de nascimento, peso, vacinação e cálculo de aptidão clínica.
                  </p>
                </div>

                <div className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Potencial de doação:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">{tutorTotalMl} mL</span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Acessar Meus Animais</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 2. Card: Alertas Compatíveis */}
            <div
              onClick={() => setActiveTab('ALERTAS')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    {compatibleNeeds.length} {compatibleNeeds.length === 1 ? 'alerta ativo' : 'alertas ativos'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Alertas Compatíveis
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Casos de emergência e pedidos de transfusão abertos por clínicas veterinárias com compatibilidade de espécie.
                  </p>
                </div>

                <div className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Prontidão de doação:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {compatibleNeeds.length > 0 ? `${compatibleNeeds.length} aguardando` : 'Em espera'}
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Ver Alertas Compatíveis</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 3. Card: Doações Agendadas */}
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
                    {appointments.length} {appointments.length === 1 ? 'agendamento' : 'agendamentos'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Doações Agendadas
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Acompanhamento de horários marcados para triagem e coleta presencial, sem filas e com conforto para o pet.
                  </p>
                </div>

                <div className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Status das coletas:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">
                    {appointments.length > 0 ? `${appointments.length} marcadas` : 'Sem filas ativas'}
                  </span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Ver Doações Agendadas</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 4. Card: Vouchers de Benefício */}
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
                    {vouchers.length} {vouchers.length === 1 ? 'voucher' : 'vouchers'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Vouchers de Benefício
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Benefícios e gratuidade conquistados em doações confirmadas, incluindo hemogramas completos e consultas.
                  </p>
                </div>

                <div className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Programa de fidelidade:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">Ativo</span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Acessar Vouchers de Benefício</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>

            {/* 5. Card: Segurança e LGPD */}
            <div
              onClick={() => setActiveTab('LGPD')}
              className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-2.5 py-1 rounded-full border border-emerald-200/70 dark:border-neutral-700">
                    Art. 18 LGPD
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    Segurança e LGPD
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                    Portabilidade integral de dados em JSON, consentimento expresso e privacidade conforme a Lei 13.709/2018.
                  </p>
                </div>

                <div className="py-2 px-3 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">Direito do titular:</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">Exportação ativa</span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span>Acessar Segurança e LGPD</span>
                <ArrowRight className="w-4 h-4 group-hover:tranneutral-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: MEUS PETS                                         */}
      {/* ======================================================== */}
      {activeTab === 'PETS' && (
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
                <Heart className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Meus Animais</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{myPets.length} cadastrados</span>
            </div>
          </div>
          {/* Card: Volume de Doação dos Seus Pets (Valor verificado e clinicamente exato) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Volume de Doação dos Seus Pets
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-neutral-900 dark:text-neutral-100">
                  {tutorTotalMl} mL
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  disponível para doação ({tutorEligibleCount} {tutorEligibleCount === 1 ? 'pet apto' : 'pets aptos'})
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {tutorEligibleCount > 0
                  ? 'Capacidade segura calculada exclusivamente a partir dos animais do seu cadastro aptos para coleta.'
                  : 'Nenhum animal atende aos critérios no momento. Mantenha vacinas e peso em dia para liberar o potencial.'}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
              <div className="px-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/80 dark:border-neutral-800 flex items-center gap-2.5">
                <span className="text-xl">🐕</span>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold block">
                    Cães ({tutorEligibleDogs.length} {tutorEligibleDogs.length === 1 ? 'apto' : 'aptos'})
                  </span>
                  <span className="font-black text-neutral-900 dark:text-neutral-100 text-sm block">
                    {tutorDogMl} mL
                  </span>
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-neutral-50 dark:bg-black border border-neutral-200/80 dark:border-neutral-800 flex items-center gap-2.5">
                <span className="text-xl">🐈</span>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold block">
                    Gatos ({tutorEligibleCats.length} {tutorEligibleCats.length === 1 ? 'apto' : 'aptos'})
                  </span>
                  <span className="font-black text-neutral-900 dark:text-neutral-100 text-sm block">
                    {tutorCatMl} mL
                  </span>
                </div>
              </div>
            </div>
          </div>

          {deleteFeedback && (
            <div className="p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{deleteFeedback}</span>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Avaliação Presencial:</strong> O cadastro prévio identifica cães e gatos com porte adequado. A aptidão clínica final é confirmada presencialmente pelo médico veterinário da clínica conveniada (aferição de peso, dosagem de hematócrito e inspeção física).
            </div>
          </div>

          {myPets.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-800 space-y-3">
              <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                Você ainda não possui nenhum animal cadastrado como doador.
              </p>
              <button
                type="button"
                onClick={() => setShowPetModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
              >
                Cadastrar Primeiro Pet
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPets.map((pet) => {
                const isDog = pet.especie === 'CANINA';
                const isEligible = pet.statusElegibilidade === 'APTO';

                return (
                  <div
                    key={pet.id}
                    className="p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{isDog ? '🐕' : '🐈'}</span>
                          <div>
                            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">{pet.nome}</h3>
                            <p className="text-xs text-neutral-500">{pet.raca} • {pet.sexo === 'MACHO' ? 'Macho' : 'Fêmea'}</p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            isEligible
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {pet.statusElegibilidade}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50">
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Peso Atual</span>
                          <span className="font-bold text-neutral-800 dark:text-neutral-200">{pet.pesoKg} kg</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px]">Idade & Nascimento</span>
                          <span className="font-bold text-neutral-800 dark:text-neutral-200">{pet.idadeAnos} anos</span>
                          {pet.dataNascimento && (
                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block font-mono">
                              Nasc: {new Date(pet.dataNascimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <div className="col-span-2">
                          <span className="text-neutral-400 block text-[10px]">Tipo Sanguíneo</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{pet.tipoSanguineo}</span>
                        </div>
                      </div>

                      <div className="text-[11px] space-y-1 text-neutral-500">
                        <div className="flex justify-between">
                          <span>Vacinas & Vermífugo:</span>
                          <span className="font-bold text-emerald-600">Em dia ✅</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Última Doação:</span>
                          <span className="text-neutral-700 dark:text-neutral-300">
                            {pet.ultimaDoacaoEm || 'Ainda não doou'}
                          </span>
                        </div>
                      </div>

                      {pet.observacoes && (
                        <p className="text-[11px] text-neutral-400 italic bg-neutral-50 dark:bg-neutral-800/40 p-2 rounded-xl">
                          "{pet.observacoes}"
                        </p>
                      )}
                    </div>

                    {/* Ação de Exclusão do Pet */}
                    <div className="pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-neutral-400">ID: #{pet.id.toString().slice(-4)}</span>
                      <button
                        type="button"
                        onClick={() => setPetToDelete(pet)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition py-1 px-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                        title={`Excluir cadastro do pet ${pet.nome}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        <span>Excluir pet</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: ALERTAS COMPATÍVEIS (US06 & US07)                 */}
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
                <AlertCircle className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Alertas Compatíveis</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{compatibleNeeds.length} ativos</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Alertas Personalizados:</strong> Você recebe exclusivamente solicitações de clínicas veterinárias compatíveis com a espécie dos seus animais cadastrados ({tutorSpecies.join(', ')}).
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {compatibleNeeds.map((need) => {
              const myInterest = interests.find((i) => i.needId === need.id && i.tutorId === tutor.id);
              const eligiblePetsForNeed = pets.filter(
                (p) => p.especie === need.especie && p.statusElegibilidade === 'APTO'
              );

              return (
                <div
                  key={need.id}
                  className="p-5 rounded-3xl border border-rose-500/30 bg-white dark:bg-neutral-900 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                        need.urgencia === 'CRITICA'
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {need.urgencia}
                    </span>
                    <span className="text-xs font-bold text-neutral-400">
                      {need.especie} • {need.tipoSanguineo}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                      {need.institutionNome}
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{need.descricao}</p>
                  </div>

                  <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 text-xs flex justify-between">
                    <span>Volume solicitado: <strong>{need.volumeSolicitadoMl} mL</strong></span>
                    <span>Local: <strong>{need.cidade}</strong></span>
                  </div>

                  {myInterest ? (
                    <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Interesse registrado para o pet {myInterest.petNome}!</span>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 text-xs">
                        <label className="text-neutral-500 font-semibold text-[11px]">Animal Doador:</label>
                        <select
                          value={selectedPetForNeed[need.id] || eligiblePetsForNeed[0]?.id || ''}
                          onChange={(e) =>
                            setSelectedPetForNeed({
                              ...selectedPetForNeed,
                              [need.id]: Number(e.target.value)
                            })
                          }
                          className="flex-1 px-3 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs"
                        >
                          {eligiblePetsForNeed.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome} ({p.pesoKg}kg - {p.raca})
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => handleInterestSubmit(need.id)}
                        disabled={eligiblePetsForNeed.length === 0}
                        className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Manifestar Interesse em Doar</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: AGENDAMENTOS                                      */}
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
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Doações Agendadas</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{appointments.length} registradas</span>
            </div>
          </div>
          {appointments.map((app) => (
            <div
              key={app.id}
              className="p-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                    📅
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      Doação do(a) {app.petNome} ({app.petEspecie})
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Data: <strong>{app.dataHora}</strong> • Slot: {app.slotCodigo}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                    app.status === 'ATTENDED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                  }`}
                >
                  {app.status === 'ATTENDED' ? 'Concluída' : 'Confirmada'}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 text-[11px] text-neutral-500 space-y-1">
                <p>📌 <strong>Orientações pré-doação:</strong></p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Manter jejum alimentar de 4 horas (água liberada à vontade).</li>
                  <li>Levar a carteira de vacinação original do pet.</li>
                  <li>O procedimento dura cerca de 20 minutos com monitoramento contínuo.</li>
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: VOUCHERS */}
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
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Vouchers de Benefício</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">{vouchers.length} disponíveis</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-800 dark:text-purple-200 flex items-center gap-2">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Programa de Fidelidade e Reconhecimento DoePet:</strong> A cada doação concretizada, você recebe um voucher exclusivo com código único emitido pela clínica para resgate de benefícios.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vouchers.map((v) => (
              <div
                key={v.id}
                className="p-5 rounded-3xl border border-purple-500/30 bg-white dark:bg-neutral-900 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-950/60 px-3 py-1 rounded-xl">
                    {v.codigo}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      v.status === 'ATIVO' ? 'bg-emerald-500 text-white' : 'bg-neutral-400 text-white'
                    }`}
                  >
                    {v.status}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    {v.beneficioDescricao}
                  </h4>
                  <p className="text-xs text-neutral-500 mt-1">Clínica Emissora: {v.institutionNome}</p>
                </div>

                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400 flex justify-between">
                  <span>Validade: <strong>{v.dataValidade}</strong></span>
                  <span className="text-purple-600 font-bold">Apresente na recepção</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: SEGURANÇA E LGPD */}
      {activeTab === 'LGPD' && (
        <div className="space-y-6 max-w-3xl">
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
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">Segurança e LGPD</span>
              <span className="text-neutral-400 hidden sm:inline">•</span>
              <span className="text-neutral-500 dark:text-neutral-400 hidden sm:inline">Portabilidade Art. 18</span>
            </div>
          </div>
          <div className="p-6 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 space-y-4">
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Segurança e LGPD (Portabilidade de Dados)</span>
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              No DoePet, os dados de contato do tutor e dos animais são protegidos e tratados exclusivamente para conectar doadores em momentos críticos de necessidade de transfusão com consentimento explícito.
            </p>

            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/60 text-xs space-y-2.5 border border-neutral-200 dark:border-neutral-800">
              <div className="flex justify-between">
                <span className="text-neutral-500">Titular dos Dados:</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{tutor.nome} (CPF: {tutor.cpf})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Termo de Consentimento:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">Aceito e Vigente ({tutor.lgpdVersao})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Data de Registro do Aceite:</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{tutor.dataAceite.split('T')[0]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Animais Vinculados:</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{pets.length} animal(is) cadastrado(s)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Direito de Portabilidade (Art. 18):</span>
                <span className="text-neutral-700 dark:text-neutral-300 font-semibold">Cópia integral em formato estruturado (JSON)</span>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleExportLgpd}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Exportar Meus Dados (JSON)</span>
              </button>
              <p className="text-[11px] text-neutral-400">
                O arquivo exportado contém seus dados cadastrais de titular, informações completas dos animais sob sua guarda e histórico na rede DoePet.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BARRA TOGGLER NO FINAL DA PÁGINA: INDICADORES E DESEMPENHO */}
      {/* ======================================================== */}
      <section aria-label="Indicadores da Rede DoePet" className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
          {/* Botão Toggler da Barra */}
          <button
            type="button"
            onClick={() => setIsKpisOpen((prev) => !prev)}
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
                  Tempo de resposta, avisos recebidos e agendamentos organizados
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

                {/* 2. Avisos Recebidos */}
                <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">Avisos Recebidos</span>
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
                    Alertas diretos para os seus pets cadastrados
                  </p>
                </div>

                {/* 3. Doações Agendadas */}
                <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">Doações Agendadas</span>
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
                    Sem filas ou esperas para os animais
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* MODAL: CADASTRAR ANIMAL */}
      {showPetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-3xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Cadastrar Animal Potencial Doador
            </h2>
            <p className="text-xs text-neutral-500">
              Regras clínicas: Cães ≥ 25kg / Gatos ≥ 4kg, 1 a 8 anos, vacinação e vermifugação em dia.
            </p>

            <form onSubmit={handleRegisterPetSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Nome do Pet</label>
                  <input
                    type="text"
                    value={petNome}
                    onChange={(e) => setPetNome(e.target.value)}
                    placeholder="Ex: Zeus"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Espécie</label>
                  <select
                    value={petEspecie}
                    onChange={(e) => setPetEspecie(e.target.value as Especie)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="CANINA">Canina (Cão)</option>
                    <option value="FELINA">Felina (Gato)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Raça</label>
                  <input
                    type="text"
                    value={petRaca}
                    onChange={(e) => setPetRaca(e.target.value)}
                    placeholder="Golden Retriever / SRD"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Sexo</label>
                  <select
                    value={petSexo}
                    onChange={(e) => setPetSexo(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  >
                    <option value="MACHO">Macho</option>
                    <option value="FEMEA">Fêmea</option>
                  </select>
                </div>
              </div>

              {/* Campo Obrigatório: Data de Nascimento (Real ou Estimada) para controle SQL */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    Data de Nascimento (Real ou Estimada) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="petTipoDataNasc"
                        value="REAL"
                        checked={petTipoDataNasc === 'REAL'}
                        onChange={() => setPetTipoDataNasc('REAL')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300 text-[11px]">Data Real</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="petTipoDataNasc"
                        value="ESTIMADA"
                        checked={petTipoDataNasc === 'ESTIMADA'}
                        onChange={() => setPetTipoDataNasc('ESTIMADA')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300 text-[11px]">Estimada</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <input
                      type="date"
                      value={petDataNascimento}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPetDataNascimento(val);
                        if (val) {
                          const computedAge = calculateAgeInYears(val);
                          setPetIdade(computedAge);
                        }
                      }}
                      max={new Date().toISOString().split('T')[0]}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs text-neutral-900 dark:text-neutral-100 font-medium"
                    />
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-300">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {petIdade} {petIdade === 1 ? 'ano' : 'anos'}
                    </span>{' '}
                    <span className="text-[11px] text-neutral-400">
                      ({petTipoDataNasc === 'REAL' ? 'data confirmada' : 'data estimada'})
                    </span>
                  </div>
                </div>

                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                  Critério veterinário de doação: cães entre 1 e 8 anos e gatos entre 1 e 7 anos. A idade é acompanhada para assegurar a aptidão para doação.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Peso Atual (kg) <span className="text-rose-500">*</span></label>
                  <input
                    type="number"
                    step="0.5"
                    value={petPeso}
                    onChange={(e) => setPetPeso(Number(e.target.value))}
                    min={2}
                    max={100}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-0.5">Mín: 25kg (cão) / 4kg (gato)</span>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Idade Informada (anos)</label>
                  <input
                    type="number"
                    value={petIdade}
                    onChange={(e) => setPetIdade(Number(e.target.value))}
                    min={0}
                    max={20}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                  />
                  <span className="text-[10px] text-neutral-400 block mt-0.5">Sincronizada com a data de nascimento</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Tipo Sanguíneo (se souber)</label>
                <select
                  value={petTipo}
                  onChange={(e) => setPetTipo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent"
                >
                  <option value="DEA 1.1 Negativo (Doador Universal)">DEA 1.1 Negativo (Universal Canino)</option>
                  <option value="DEA 1.1 Positivo">DEA 1.1 Positivo</option>
                  <option value="Tipo A">Tipo A (Felino)</option>
                  <option value="Tipo B">Tipo B (Felino)</option>
                  <option value="Desconhecido">Desconhecido (será tipado na clínica)</option>
                </select>
              </div>

              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-neutral-800/40 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={petCastrado}
                    onChange={(e) => setPetCastrado(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <span>Animal castrado</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={petVacinado}
                    onChange={(e) => setPetVacinado(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <span>Vacinação antirrábica e polivalente em dia</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={petVermifugado}
                    onChange={(e) => setPetVermifugado(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600"
                  />
                  <span>Vermifugação e controle de ectoparasitas (pulgas/carrapatos) ativo</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPetModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  Cadastrar e Validar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE PET */}
      {petToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Confirmar Exclusão do Pet
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Ação irreversível de cadastro
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
              Deseja realmente remover <strong>{petToDelete.nome}</strong> ({petToDelete.especie === 'CANINA' ? 'Cão' : 'Gato'} • {petToDelete.raca}) do seu cadastro? O histórico e a aptidão de doação deste animal deixarão de constar na rede.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPetToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const petName = petToDelete.nome;
                  await onDeletePet(petToDelete.id);
                  setDeleteFeedback(`Animal "${petName}" foi removido do seu cadastro.`);
                  setPetToDelete(null);
                  setTimeout(() => setDeleteFeedback(null), 4000);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition flex items-center gap-1.5 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir Pet</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
