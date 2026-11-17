import React from 'react';
import { Clock, Send, CalendarCheck, HeartPulse, AlertTriangle } from 'lucide-react';

interface ExecutiveKpisProps {
  totalStockMl: number;
  dogStockMl?: number;
  catStockMl?: number;
  expiringSoonVolumeTotal?: number;
  activeNeedsCount: number;
  totalDonationsCount: number;
}

export const ExecutiveKpis: React.FC<ExecutiveKpisProps> = ({
  totalStockMl,
  dogStockMl = 0,
  catStockMl = 0,
  expiringSoonVolumeTotal = 0,
  activeNeedsCount,
  totalDonationsCount
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {/* KPI 1: Tempo de Resposta */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium">Tempo de Resposta</span>
          <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">-20%</span>
          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            Mais Rápido
          </span>
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          Mobilização rápida em emergências
        </p>
      </div>

      {/* KPI 2: Avisos aos Tutores */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium">Avisos aos Tutores</span>
          <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">98.4%</span>
          <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            Entregues
          </span>
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          Alertas diretos para tutores com pets compatíveis
        </p>
      </div>

      {/* KPI 3: Horários de Coleta */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium">Horários de Coleta</span>
          <CalendarCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight text-emerald-700 dark:text-emerald-400">100%</span>
          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            Organizados
          </span>
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">Sem filas ou esperas para os animais</p>
      </div>

      {/* KPI 4: Volume Físico em Estoque da Clínica (Contando doações + e transfusões -) */}
      <div className="p-4 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">
            Volume Físico em Estoque
          </span>
          <HeartPulse className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">{totalStockMl} mL</span>
          <span className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {activeNeedsCount > 0 ? `${activeNeedsCount} Alertas` : 'Estoque Ativo'}
          </span>
        </div>

        {/* Separação entre cães e gatos */}
        <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800">
            <span className="text-sm shrink-0">🐕</span>
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block truncate">
                Cães
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100 text-xs block">{dogStockMl} mL</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-neutral-50 dark:bg-black border border-neutral-200/70 dark:border-neutral-800">
            <span className="text-sm shrink-0">🐈</span>
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block truncate">
                Gatos
              </span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100 text-xs block">{catStockMl} mL</span>
            </div>
          </div>
        </div>

        {/* Alerta de validade de 40 dias */}
        {expiringSoonVolumeTotal > 0 ? (
          <div className="mt-2 py-1 px-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300 font-medium">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Validade próxima:</span>
            </span>
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{expiringSoonVolumeTotal} mL</span>
          </div>
        ) : (
          <p className="text-[10px] text-neutral-400 mt-2">Saldo físico real: doações (+) e transfusões (-)</p>
        )}
      </div>
    </div>
  );
};
