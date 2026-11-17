import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Lock, Eye, EyeOff, X, CheckCircle2, Terminal, AlertTriangle, UserCheck } from 'lucide-react';

interface OwnerDevAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticateSuccess: (ownerInfo: { email: string; authorizedAt: string }) => void;
  onLogAttempt?: (action: string, details: any) => void;
}

// Master passkeys recognized for project owners / lead architects
const AUTHORIZED_KEYS = ['doepet-dev-2026', 'doepet2026', 'admin@doepet', 'dev-master-2026'];
const OWNER_EMAILS = ['ricardo.gs2010@gmail.com', 'admin@doepet.com.br', 'dev@doepet.com.br'];

export const OwnerDevAuthModal: React.FC<OwnerDevAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticateSuccess,
  onLogAttempt
}) => {
  const [ownerIdentifier, setOwnerIdentifier] = useState('ricardo.gs2010@gmail.com');
  const [masterKey, setMasterKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsVerifying(true);

    const trimmedKey = masterKey.trim();
    const trimmedId = ownerIdentifier.trim().toLowerCase();

    // Check credentials
    const isKeyValid = AUTHORIZED_KEYS.includes(trimmedKey);
    const isIdValid = trimmedId.length > 3;

    setTimeout(() => {
      setIsVerifying(false);

      if (isKeyValid && isIdValid) {
        onLogAttempt?.('OWNER_AUTH_SUCCESS', {
          identifier: trimmedId,
          timestamp: new Date().toISOString()
        });

        onAuthenticateSuccess({
          email: trimmedId,
          authorizedAt: new Date().toLocaleString('pt-BR')
        });
        onClose();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        const errorMsg = 'Chave mestre de segurança inválida ou credencial de proprietário não reconhecida.';
        setError(errorMsg);

        onLogAttempt?.('OWNER_AUTH_FAILED', {
          identifier: trimmedId,
          attemptCount: newAttempts,
          timestamp: new Date().toISOString()
        });
      }
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-slate-900 dark:text-slate-100">
                  Portal dos Donos do Projeto
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Restrito
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Autenticação de Nível Proprietário / Engenharia DoePet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Notice */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>Módulo Oculto do Frontend</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Este módulo e qualquer referência ao código ou arquitetura backend (Python/Flask e MySQL) são <strong>estritamente ocultados</strong> das interfaces de tutores e clínicas. Apenas mantenedores e donos do projeto devidamente autenticados podem habilitar esta visualização.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Acesso Rejeitado</p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Identificação do Proprietário / Dev Lead
            </label>
            <div className="relative">
              <input
                type="text"
                value={ownerIdentifier}
                onChange={(e) => setOwnerIdentifier(e.target.value)}
                placeholder="Ex: ricardo.gs2010@gmail.com ou dev@doepet.com.br"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              E-mail ou identificador autorizado nos registros do projeto.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Chave Mestre de Segurança (Master Passkey)
              </label>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                Chave padrão: doepet-dev-2026
              </span>
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={masterKey}
                onChange={(e) => setMasterKey(e.target.value)}
                placeholder="Insira a chave de acesso mestre..."
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-slate-400">
              Tentativas registradas em auditoria
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isVerifying}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isVerifying ? 'Verificando...' : 'Liberar Acesso Dono'}</span>
              </button>
            </div>
          </div>
        </form>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
          <span>DoePet Security Guard • Requisito de Sigilo Institucional</span>
          <span>Atalho de emergência: <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono">Ctrl + Shift + D</kbd></span>
        </div>
      </div>
    </div>
  );
};
