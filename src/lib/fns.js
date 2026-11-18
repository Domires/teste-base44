// Camada de dados chamada pelas páginas — cada função equivale a um fluxo do Power Automate / stored procedure.
// No Base44 (TanStack Start) estas chamadas viram server functions (createServerFn) com a mesma assinatura;
// a implementação de cada uma está em server/functions/<grupo>.js.
import { base44 } from "@/api/base44Client";

const call = (name) => async (data) => (await base44.functions.invoke(name, data)).data;

export const obterContexto = call("contexto");

export const inspecaoFns = {
  dadosSelecao: call("inspecao.dadosSelecao"),
  verificarEmAndamento: call("inspecao.verificarEmAndamento"),
  abrirFormulario: call("inspecao.abrirFormulario"),
  salvarParcial: call("inspecao.salvarParcial"),
  finalizar: call("inspecao.finalizar"),
  descartarParcial: call("inspecao.descartarParcial"),
  minhasEmAberto: call("inspecao.minhasEmAberto"),
};

export const planoFns = {
  listar: call("plano.listar"),
  obter: call("plano.obter"),
  salvar: call("plano.salvar"),
};

export const adminFns = {
  indicadores: call("admin.indicadores"),
  listarInspecoes: call("admin.listarInspecoes"),
  obterInspecao: call("admin.obterInspecao"),
  editarInspecao: call("admin.editarInspecao"),
  inativarInspecao: call("admin.inativarInspecao"),
  descartarEmAberto: call("admin.descartarEmAberto"),
  enviarPAInspecao: call("admin.enviarPAInspecao"),
  areasSemResponsaveis: call("admin.areasSemResponsaveis"),
  dispararSol: call("admin.dispararSol"),
  dispararGrd: call("admin.dispararGrd"),
  obterConfigEmail: call("admin.obterConfigEmail"),
  salvarConfigEmail: call("admin.salvarConfigEmail"),
  salvarModeloEmail: call("admin.salvarModeloEmail"),
  salvarCadastro: call("admin.salvarCadastro"),
  removerCadastro: call("admin.removerCadastro"),
  importarCadastro: call("admin.importarCadastro"),
  importarVinculos: call("admin.importarVinculos"),
  dadosVinculos: call("admin.dadosVinculos"),
  vincularLocal: call("admin.vincularLocal"),
  desvincularLocal: call("admin.desvincularLocal"),
  vincularPessoa: call("admin.vincularPessoa"),
  desvincularPessoa: call("admin.desvincularPessoa"),
  listarAgendamentos: call("admin.listarAgendamentos"),
  salvarAgendamento: call("admin.salvarAgendamento"),
  limparAgendamento: call("admin.limparAgendamento"),
  exportarPlanilha: call("admin.exportarPlanilha"),
  listarUsuarios: call("admin.listarUsuarios"),
  salvarUsuario: call("admin.salvarUsuario"),
  importarUsuarios: call("admin.importarUsuarios"),
  removerUsuario: call("admin.removerUsuario"),
};

export const contextoQuery = { queryKey: ["contexto"], queryFn: () => obterContexto(), staleTime: 60_000 };
