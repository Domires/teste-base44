// Menu lateral da Administração (componente "Menu" do app Admin do Power Apps), agrupado por assunto.
// As demais áreas (Inspeção, Plano de Ação) não têm menu: navegam a partir da tela Início.

import {
  Award, Briefcase, Mails, Building2, CalendarDays, ClipboardList, Contact, Handshake, KeyRound, Layers, LayoutDashboard, MapPin, Network,
  ScrollText, Send, ShieldCheck, Sun, Tags, UserCheck, UserCog, UserSearch, Workflow,
} from "lucide-react";

export const MENU_ADMIN = [
  { grupo: "Visão geral", itens: [{ to: "/admin", label: "Painel", icone: LayoutDashboard, exact: true }] },
  {
    grupo: "Inspeções e Plano de Ação",
    itens: [{ to: "/admin/inspecoes", label: "Inspeções", icone: ClipboardList }], // Ativas / Em aberto / Inativas: filtro "Situação" na tela
  },
  {
    grupo: "Checklists",
    itens: [
      { to: "/admin/cadastros/$entidade", params: { entidade: "ItemSol" }, label: "Itens SOL", icone: Sun },
      { to: "/admin/pilares", label: "Pilares e Itens GRD", icone: Layers },
      { to: "/admin/cadastros/$entidade", params: { entidade: "ItemSgi" }, label: "Questões Auditoria SGI", icone: ShieldCheck },
    ],
  },
  {
    grupo: "Locais",
    itens: [
      { to: "/admin/cadastros/$entidade", params: { entidade: "Unidade" }, label: "Unidades", icone: Building2 },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Area" }, label: "Áreas", icone: MapPin },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Processo" }, label: "Processos", icone: Workflow },
      { to: "/admin/vinculos", label: "Vínculos", icone: Network },
    ],
  },
  {
    grupo: "Pessoas",
    itens: [
      { to: "/admin/cadastros/$entidade", params: { entidade: "Inspetor" }, label: "Inspetores", icone: UserCheck },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Auditor" }, label: "Auditores", icone: UserSearch },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Responsavel" }, label: "Responsáveis (SOL)", icone: UserCog },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Facilitador" }, label: "Facilitadores (SOL)", icone: Handshake },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Gestor" }, label: "Gestores (GRD)", icone: Briefcase },
      { to: "/admin/cadastros/$entidade", params: { entidade: "Lider" }, label: "Líderes (GRD)", icone: Award },
      { to: "/admin/cadastros/$entidade", params: { entidade: "ResponsavelSgi" }, label: "Responsáveis SGI", icone: Contact },
      { to: "/admin/usuarios", label: "Usuários e acessos", icone: KeyRound },
    ],
  },
  {
    grupo: "Programação",
    itens: [
      { to: "/admin/cadastros/$entidade", params: { entidade: "TipoDeInspecao" }, label: "Tipos de Inspeção", icone: Tags },
      { to: "/admin/agendamento", label: "Agendamento", icone: CalendarDays },
      { to: "/admin/disparos", label: "Disparos", icone: Send }, // SOL ou GRD: escolhido na própria tela
      { to: "/admin/configurar-emails", label: "Configurar e-mails", icone: Mails }, // modo teste + modelos dos e-mails
    ],
  },
  { grupo: "Sistema", itens: [{ to: "/admin/logs", label: "Logs do Sistema", icone: ScrollText }] },
];
