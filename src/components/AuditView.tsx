import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Key,
  Download,
  CheckCircle2,
  Mail,
  FileCheck,
  EyeOff,
  UserCheck,
  AlertCircle,
  FileText,
  Eye,
  Copy,
  Check,
  X
} from 'lucide-react';

export const DECLARACAO_LGPD_TEXT = `DECLARAÇÃO PÚBLICA DE CONFORMIDADE E PRIVACIDADE — PLATAFORMA DOEPET
Em estrito cumprimento à Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 - LGPD)
Versão: 2026.1 • Atualizada e Vigente para 2026

Olá! Seja muito bem-vindo(a) ao DoePet.

A DoePet nasceu de um propósito nobre: criar uma rede solidária para salvar vidas de cães e gatos que necessitam com urgência de transfusões sanguíneas. Sabemos que para você confiar em nós, a proteção dos seus dados pessoais e das informações do seu amigo de quatro patas deve vir em primeiro lugar.

Esta declaração foi escrita de forma clara, amigável e direta — sem "juridiquês" ou termos técnicos complicados — para que você compreenda exatamente como cuidamos das suas informações.

----------------------------------------------------------------------
1. QUAIS DADOS NÓS COLETAMOS E POR QUAL MOTIVO?
----------------------------------------------------------------------
Coletamos unicamente o necessário para que a ajuda chegue a tempo:

• SOBRE VOCÊ (TUTOR):
  - Seu nome e cidade/bairro: Para identificar quem está oferecendo ajuda.
  - Seu telefone e WhatsApp: Para que a equipe veterinária da clínica possa entrar em contato rápido caso surja um paciente que precise com urgência do sangue do seu pet.
  - Seu e-mail: Para enviarmos confirmações, comprovantes de doação e vouchers de benefícios.

• SOBRE O SEU PET:
  - Nome, espécie (cão ou gato), peso, idade e histórico de vacinas e doações.
  - Por quê? Doações de sangue exigem critérios veterinários rigorosos (como peso mínimo e vacinação em dia) para garantir que a doação seja 100% segura tanto para o doador quanto para o receptor.

• SOBRE PROFISSIONAIS E CLÍNICAS VETERINÁRIAS:
  - Nome, CRMV ativo, e-mail institucional e identificação da clínica credenciada.
  - Por quê? Para garantir a total responsabilidade técnica, idoneidade e segurança sanitária dos procedimentos.

----------------------------------------------------------------------
2. O QUE NÓS NUNCA FAREMOS COM OS SEUS DADOS
----------------------------------------------------------------------
Aqui o seu respeito é absoluto:
  ✓ NUNCA venderemos ou alugaremos seus dados a empresas de marketing, publicidade ou bancos de dados comerciais.
  ✓ NUNCA enviaremos spam ou anúncios de produtos não solicitados.
  ✓ NUNCA compartilharemos seus dados de contato com terceiros ou pessoas sem vínculo com o atendimento médico-veterinário da emergência.

----------------------------------------------------------------------
3. COMO PROTEGEMOS SUA CONTA E SEUS DADOS
----------------------------------------------------------------------
Sua segurança técnica é tratada com padrão de ponta:
  • Suas senhas são protegidas com criptografia de uma via (hashing seguro PBKDF2/SHA-256). Ninguém da nossa equipe consegue ver a sua senha.
  • Todas as conexões entre o seu dispositivo e o DoePet utilizam navegação criptografada (HTTPS/TLS 1.3).
  • Apenas profissionais veterinários devidamente credenciados têm acesso aos contatos para agendamento presencial.

----------------------------------------------------------------------
4. SEUS DIREITOS GARANTIDOS PELA LGPD (SIMPLES E RÁPIDO)
----------------------------------------------------------------------
Você está sempre no controle:
  1. Direito de Saber: Você pode consultar todos os dados que temos sobre você e seus pets a qualquer momento.
  2. Direito de Corrigir: Mudou de telefone ou endereço? Você pode atualizar seus dados com facilidade pelo aplicativo.
  3. Direito à Portabilidade: Você pode baixar uma cópia completa dos seus dados cadastrais.
  4. Direito de Pausar ou Revogar: Não quer mais receber avisos de urgência? Você pode desativar as notificações quando quiser.
  5. Direito ao Esquecimento: Você pode solicitar a exclusão da sua conta e de todos os seus dados a qualquer momento, respeitados apenas os prazos legais de guarda médico-veterinária.

----------------------------------------------------------------------
5. CANAL ABERTO COM O NOSSO ENCARREGADO DE PRIVACIDADE (DPO)
----------------------------------------------------------------------
Tem qualquer dúvida, elogio ou solicitação sobre a proteção dos seus dados?
Fale diretamente com o nosso Encarregado de Proteção de Dados:

• E-mail do DPO: dpo@doepet.com.br
• Prazo de resposta: Até 5 dias úteis com atendimento humanizado
• Atendimento: Segunda a sexta-feira, das 09h às 18h

Obrigado por fazer parte dessa corrente pela vida animal!

Equipe DoePet — Rede Solidária de Mobilização de Doadores de Sangue Animal
`;

export const AuditView: React.FC = () => {
  const [downloadFeedback, setDownloadFeedback] = useState(false);
  const [showDeclarationModal, setShowDeclarationModal] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleExportHumanDeclaration = () => {
    const blob = new Blob([DECLARACAO_LGPD_TEXT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', url);
    dlAnchorElem.setAttribute('download', 'doepet_declaracao_conformidade_lgpd.txt');
    dlAnchorElem.click();
    URL.revokeObjectURL(url);

    setDownloadFeedback(true);
    setTimeout(() => setDownloadFeedback(false), 4000);
  };

  const handleCopyDeclaration = () => {
    navigator.clipboard.writeText(DECLARACAO_LGPD_TEXT);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Institucional de Segurança e Privacidade */}
      <div className="p-6 sm:p-8 rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-neutral-100">
                Privacidade &amp; Proteção de Dados
              </h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Segurança rigorosa e respeito aos dados de tutores e clínicas parceiras
              </p>
            </div>
          </div>

          <span className="self-start sm:self-auto text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 dark:bg-neutral-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-neutral-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Dados Protegidos</span>
          </span>
        </div>

        <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
          O <strong>DoePet</strong> foi construído com foco integral na privacidade e na segurança. As informações de tutores de animais e profissionais veterinários são tratadas com a finalidade exclusiva de viabilizar o salvamento de vidas através de doações e transfusões sanguíneas de cães e gatos.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-2.5 text-xs">
          <button
            type="button"
            onClick={handleExportHumanDeclaration}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition shadow-xs cursor-pointer"
            title="Baixar declaração em formato de texto legível para o usuário"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Declaração de Privacidade (.txt)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeclarationModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-semibold transition cursor-pointer"
            title="Ler o documento completo na tela"
          >
            <Eye className="w-4 h-4 text-emerald-600" />
            <span>Ler Declaração na Tela</span>
          </button>

          <a
            href="mailto:dpo@doepet.com.br"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
          >
            <Mail className="w-4 h-4 text-emerald-600" />
            <span>Falar com o Responsável de Privacidade</span>
          </a>
        </div>

        {downloadFeedback && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-neutral-800 border border-emerald-200 dark:border-neutral-700 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              <strong>Declaração baixada com sucesso!</strong> Documento completo em linguagem clara e transparente.
            </span>
          </div>
        )}
      </div>

      {/* Pilares da Política de Segurança */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
            <Lock className="w-4 h-4 text-emerald-600" />
            <span>Criptografia e Proteção</span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Todas as conexões são protegidas com criptografia segura. Suas senhas e acessos são resguardados, impedindo qualquer visualização não autorizada.
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
            <EyeOff className="w-4 h-4 text-emerald-600" />
            <span>Minimização de Dados</span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Coletamos apenas as informações essenciais para identificar a compatibilidade do doador e agendar a triagem. Seus dados nunca são vendidos ou cedidos para marketing.
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>Acesso Responsável</span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Apenas médicos-veterinários credenciados têm acesso aos contatos para realizar o agendamento de doações expressamente autorizadas pelos tutores.
          </p>
        </div>
      </div>

      {/* Direitos do Titular de Dados (Artigo 18 da LGPD) */}
      <div className="p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Direitos Garantidos aos Titulares (Artigo 18 da Lei nº 13.709/2018)
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 space-y-1">
            <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
              1. Acesso e Transparência
            </span>
            <p className="text-neutral-500">
              Você tem o direito de consultar todos os seus dados e os animais vinculados ao seu cadastro a qualquer momento.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 space-y-1">
            <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
              2. Portabilidade dos Dados
            </span>
            <p className="text-neutral-500">
              Direito de exportar seus dados cadastrais em formato aberto e estruturado (JSON) com apenas 1 clique no painel do tutor.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 space-y-1">
            <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
              3. Correção de Dados
            </span>
            <p className="text-neutral-500">
              Atualização facilitada de telefones, endereços e condições médicas do seu pet diretamente pelo aplicativo.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 space-y-1">
            <span className="font-bold text-neutral-800 dark:text-neutral-200 block">
              4. Revogação do Consentimento
            </span>
            <p className="text-neutral-500">
              Direito de pausar o recebimento de alertas de emergência ou solicitar a exclusão da sua conta e registros vinculados.
            </p>
          </div>
        </div>
      </div>

      {/* Contato do Encarregado (DPO) */}
      <div className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div>
          <span className="font-bold text-neutral-800 dark:text-neutral-200 block text-sm">
            Canal de Atendimento ao Titular e Autoridades (DPO)
          </span>
          <p className="text-neutral-500 mt-0.5">
            Para solicitações formais de privacidade, entre em contato diretamente pelo e-mail institucional:
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 font-mono text-emerald-600 dark:text-emerald-400 font-bold text-xs">
            dpo@doepet.com.br
          </code>
        </div>
      </div>

      {/* Modal Leitor da Declaração em Linguagem Clara e Natural */}
      {showDeclarationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-neutral-900 dark:text-neutral-100">
                    Declaração de Conformidade LGPD (Linguagem Clara)
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Versão amigável e direta para tutores, clínicas e comunidade
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDeclarationModal(false)}
                className="p-1.5 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed font-sans select-text">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-semibold text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>
                  Este documento assegura os direitos previstos na Lei Federal nº 13.709/2018 (LGPD), sem jargões técnicos ou termos complexos de engenharia de software.
                </span>
              </div>

              <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm bg-neutral-50 dark:bg-neutral-950 p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 leading-relaxed overflow-x-hidden">
                {DECLARACAO_LGPD_TEXT}
              </pre>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-900/50 rounded-b-3xl">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDeclaration}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs transition"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-600">Copiado para a área de transferência!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Texto</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleExportHumanDeclaration}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Arquivo (.txt)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowDeclarationModal(false)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-bold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
