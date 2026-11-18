// Camada de dados chamada pelas páginas — cada função equivale a um fluxo do Power Automate / stored procedure.
// Todas passam pela server function chamarFuncao (src/lib/server-fns.js); a implementação de cada uma está em
// src/lib/servidor/<grupo>.server.js.
import { chamarFuncao } from "@/lib/server-fns";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const call = (nome) => async (dados) => {
  let r;
  try {
    r = await chamarFuncao({ data: { nome, dados: dados ?? {} } });
  } catch (e) {
    // sem sessão (401) ou falha inesperada no servidor
    if (e?.status === 401) throw new ApiError(401, "Sua sessão expirou. Entre novamente.");
    if (e instanceof TypeError) throw new ApiError(0, "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    throw new ApiError(e?.status || 500, "Erro interno no servidor.");
  }
  if (!r?.ok) throw new ApiError(r?.erro?.status || 500, r?.erro?.message || "Ocorreu um erro inesperado.");
  return r.data;
};

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
  carregarDadosIniciais: call("admin.carregarDadosIniciais"),
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
