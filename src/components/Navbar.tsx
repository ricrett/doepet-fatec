import React from 'react';
import {
  Building2,
  HeartHandshake,
  ShieldCheck,
  Code2,
  Sun,
  Moon,
  Lock,
  LogOut
} from 'lucide-react';
import { Role, AuthenticatedUser } from '../types';

interface NavbarProps {
  currentRole: Role | 'AUDITOR' | 'CODE_EXPLORER' | 'AUTH';
  onSelectRole: (role: Role | 'AUDITOR' | 'CODE_EXPLORER' | 'AUTH') => void;
  isDark: boolean;
  onToggleTheme: () => void;
  activeAlertsCount: number;
  isOwnerAuthorized?: boolean;
  onExitOwnerDev?: () => void;
  currentUser?: AuthenticatedUser | null;
  onLogout?: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSelectRole,
  isDark,
  onToggleTheme,
  activeAlertsCount,
  isOwnerAuthorized = false,
  currentUser,
  onLogout,
  onOpenAuth
}) => {
  const isAuthenticated = Boolean(currentUser && currentUser.isLoggedIn);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md border-b transition-colors duration-200 bg-white/95 dark:bg-black/95 border-neutral-200 dark:border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 h-16">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
              🐾
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-xl tracking-tight text-emerald-700 dark:text-emerald-400">
                  DOEPET
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-neutral-900 dark:text-emerald-300 border border-emerald-200 dark:border-neutral-800 whitespace-nowrap">
                  Hemoterapia Animal
                </span>
              </div>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 hidden sm:block truncate">
                Rede Solidária de Doadores de Sangue Canino e Felino
              </p>
            </div>
          </div>

          {/* Center Navigation / Context */}
          {isAuthenticated && currentUser ? (
            <div className="hidden lg:flex items-center p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              {currentUser.role === 'INSTITUTION_ADMIN' || currentUser.role === 'INSTITUTION_EMPLOYEE' ? (
                <button
                  onClick={() => onSelectRole('INSTITUTION_ADMIN')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentRole === 'INSTITUTION_ADMIN'
                      ? 'bg-white dark:bg-black text-emerald-700 dark:text-emerald-400 shadow-sm border border-neutral-200 dark:border-neutral-800 font-bold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Clínica Veterinária</span>
                </button>
              ) : (
                <button
                  onClick={() => onSelectRole('TUTOR')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                    currentRole === 'TUTOR'
                      ? 'bg-white dark:bg-black text-emerald-700 dark:text-emerald-400 shadow-sm border border-neutral-200 dark:border-neutral-800 font-bold'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Área do Tutor</span>
                  {activeAlertsCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
              )}

              <button
                onClick={() => onSelectRole('AUDITOR')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  currentRole === 'AUDITOR'
                    ? 'bg-white dark:bg-black text-emerald-700 dark:text-emerald-400 shadow-sm border border-neutral-200 dark:border-neutral-800 font-bold'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Privacidade &amp; Segurança</span>
              </button>

              {/* Aba de código exibida estritamente se o dono do projeto estiver autenticado */}
              {isOwnerAuthorized && (
                <button
                  onClick={() => onSelectRole('CODE_EXPLORER')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentRole === 'CODE_EXPLORER'
                      ? 'bg-neutral-800 text-white shadow-sm font-bold'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Visão Técnica (Dono)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex items-center gap-3">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Acesso Seguro para Tutores e Clínicas</span>
              </div>

              {isOwnerAuthorized && (
                <button
                  onClick={() => onSelectRole('CODE_EXPLORER')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentRole === 'CODE_EXPLORER'
                      ? 'bg-neutral-800 text-white shadow-sm font-bold'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Visão Técnica (Dono)</span>
                </button>
              )}
            </div>
          )}

          {/* Right Action Area */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile role select & logout: exibidos apenas quando autenticado */}
            {isAuthenticated && currentUser && (
              <>
                <select
                  value={currentRole}
                  onChange={(e) => {
                    if (e.target.value === '__LOGOUT__') {
                      if (onLogout) {
                        onLogout();
                      } else {
                        onOpenAuth();
                      }
                    } else {
                      onSelectRole(e.target.value as any);
                    }
                  }}
                  className="lg:hidden text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 focus:outline-none"
                >
                  {currentUser.role === 'INSTITUTION_ADMIN' || currentUser.role === 'INSTITUTION_EMPLOYEE' ? (
                    <option value="INSTITUTION_ADMIN">🏥 Clínica Veterinária</option>
                  ) : (
                    <option value="TUTOR">🐕 Tutor do Animal</option>
                  )}
                  <option value="AUDITOR">🛡️ Segurança &amp; LGPD</option>
                  {isOwnerAuthorized && <option value="CODE_EXPLORER">🐍 Arquitetura (Dono)</option>}
                  <option value="__LOGOUT__">🚪 Sair da conta (Login)</option>
                </select>

                <button
                  type="button"
                  onClick={onLogout || onOpenAuth}
                  title="Sair da conta e ir para a tela de login"
                  aria-label="Sair da conta e ir para a tela de login"
                  className="flex sm:hidden items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/60 transition cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>

                <div className="hidden sm:flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-xs">
                  <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {currentUser.role === 'TUTOR' ? '🐾' : '🏥'}
                  </div>
                  <div className="max-w-[120px] truncate text-left">
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate block text-[11px]">
                      {currentUser.nome.split(' ')[0]}
                    </span>
                    <span className="text-[9px] text-neutral-400 block -mt-0.5">
                      {currentUser.role === 'TUTOR' ? 'Tutor' : 'Clínica'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout || onOpenAuth}
                    title="Sair da conta e ir para a tela de login"
                    aria-label="Sair da conta e ir para a tela de login"
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition font-semibold text-[11px] cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              </>
            )}

            {/* Dark/Light mode toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
              title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all duration-200 flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
                isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">Modo Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
                  <span className="hidden sm:inline">Modo Escuro</span>
                </>
              )}
            </button>

            {/* Status indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-neutral-900 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-neutral-800 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Rede Ativa</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
