// Equivalente das procedures de listagem: ObterInspecoesFiltroPAv2_sp (Admin) e
// ObterInspecoesFiltroPreenchimentoPA_sp (Plano de Ação). Calcula, para cada inspeção, a contagem de
// planos de ação Não Iniciados / Em Andamento / Finalizados, o prazo de preenchimento e se está em atraso.
import { itensNaoConformes } from "../../src/lib/scores.js";
import { byId } from "./views.js";

export const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export async function carregarBase(sr) {
  const [planos, agendamentos, tipos] = await Promise.all([sr.PlanoDeAcao.list(), sr.Agendamento.list(), sr.TipoDeInspecao.list()]);
  return { planos, agendamentos, tipos };
}

export function agendamentoDaInspecao(insp, { agendamentos, tipos }) {
  const T = byId(tipos);
  const d = String(insp.Data || "").slice(0, 10);
  const ag = agendamentos.find((a) => {
    const t = T.get(a.TipoDeInspecaoId);
    return t && t.Programa === insp.TipoDeFormulario && a.InspecaoDtInicial <= d && a.InspecaoDtFinal >= d;
  });
  return ag ? { ...ag, Tipo: T.get(ag.TipoDeInspecaoId)?.Tipo } : null;
}

// Programas que têm Plano de Ação. O SGI (auditoria) não tem: suas não conformidades não entram nas contagens de PA.
export const PROGRAMAS_COM_PA = ["SOL", "GRD"];

export function resumirInspecao(insp, base, hoje = hojeISO()) {
  const temPA = PROGRAMAS_COM_PA.includes(insp.TipoDeFormulario);
  const nc = temPA ? itensNaoConformes(insp.TipoDeFormulario, insp.Checklist) : [];
  const planos = base.planos.filter((p) => p.InspecaoId === insp.id);
  const porItem = new Map(planos.map((p) => [String(p.ItemRef), p]));
  let naoIniciados = 0, emAndamento = 0, finalizados = 0;
  for (const i of nc) {
    const p = porItem.get(String(i.Id));
    if (!p) naoIniciados++;
    else if (p.Status === "Finalizado") finalizados++;
    else emAndamento++;
  }
  const ag = agendamentoDaInspecao(insp, base);
  const PreenchimentoDtFinal = ag?.PaDtFinal || null;
  return {
    InspecaoId: insp.id,
    Data: insp.Data,
    NomeUnidade: insp.Unidade,
    NomeArea: insp.Area,
    NomeProcesso: insp.Processo,
    UnidadeAreaProcessoId: insp.UnidadeAreaProcessoId,
    TipoDeFormulario: insp.TipoDeFormulario,
    TipoDeInspecao: ag?.Tipo || insp.TipoDeInspecao || "",
    InspecaoDtInicial: ag?.InspecaoDtInicial || null,
    InspecaoDtFinal: ag?.InspecaoDtFinal || null,
    PreenchimentoDtInicial: ag?.PaDtInicial || null,
    PreenchimentoDtFinal,
    TemPlanoDeAcao: temPA,
    ItensPANaoIniciados: naoIniciados,
    PlanoDeAcaoEmAndamento: emAndamento,
    PlanoDeAcaoFinalizado: finalizados,
    EmAtraso: !!(temPA && PreenchimentoDtFinal && hoje > PreenchimentoDtFinal && naoIniciados + emAndamento > 0),
    Status: insp.Status || "",
    ScoreTotal: insp.ScoreTotal ?? null,
    Atendimento: insp.Atendimento ?? null,
    Avaliador: insp.Avaliador || insp.Inspetor1 || insp.Auditor || "",
    RespAcompanhamento: insp.RespAcompanhamento || "",
    Inativado: !!insp.Inativado,
    EmAberto: !!insp.EmAberto,
    Disparado: !!insp.Disparado,
    NormaDisciplina: insp.NormaDisciplina || "",
  };
}

/**
 * Filtros: ano, mes (1..12), programa, status do PA (naoIniciado / emAndamento / finalizado).
 * Status do PA: se todos (ou nenhum) marcados, não filtra; senão mantém inspeções com pelo menos um item no status marcado.
 */
export function filtrarResumo(lista, f = {}) {
  const st = [f.naoIniciado, f.emAndamento, f.finalizado];
  const filtraStatus = st.some(Boolean) && !st.every(Boolean);
  return lista
    .filter((r) => {
      const [y, m] = String(r.Data || "").split("-").map(Number);
      if (f.ano && y !== Number(f.ano)) return false;
      if (f.mes && m !== Number(f.mes)) return false;
      if (f.programa && r.TipoDeFormulario !== f.programa) return false;
      if (filtraStatus) {
        return (f.naoIniciado && r.ItensPANaoIniciados > 0) || (f.emAndamento && r.PlanoDeAcaoEmAndamento > 0) || (f.finalizado && r.PlanoDeAcaoFinalizado > 0);
      }
      return true;
    })
    .sort((a, b) => String(b.Data).localeCompare(String(a.Data)));
}

// Monta o "documento" completo da inspeção (ObterInspecao_sp) com os planos de ação.
export async function inspecaoCompleta(sr, id) {
  const insp = await sr.Inspecao.get(id);
  const planos = await sr.PlanoDeAcao.filter({ InspecaoId: id });
  return { ...insp, Planos: planos };
}
