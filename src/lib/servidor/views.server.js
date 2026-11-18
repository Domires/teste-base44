// Equivalentes das VIEWS do SQL Server original, montadas a partir das entidades.
// Recebem `sr` = entidades com acesso de serviço (base44.asServiceRole.entities).

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
const sortPt = (rows, key) => [...rows].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "pt-BR", { numeric: true }));

// UnidadeAreaProcesso_vw
export async function unidadeAreaProcessoView(sr) {
  const [uaps, unidades, areas, processos] = await Promise.all([
    sr.UnidadeAreaProcesso.list(), sr.Unidade.list(), sr.Area.list(), sr.Processo.list(),
  ]);
  const U = byId(unidades), A = byId(areas), P = byId(processos);
  return sortPt(
    uaps.map((x) => ({
      UnidadeAreaProcessoId: x.id,
      UnidadeId: x.UnidadeId, AreaId: x.AreaId, ProcessoId: x.ProcessoId,
      NomeUnidade: U.get(x.UnidadeId)?.Nome || "", SiglaUnidade: U.get(x.UnidadeId)?.Sigla || "",
      NomeArea: A.get(x.AreaId)?.Nome || "", SiglaArea: A.get(x.AreaId)?.Sigla || "",
      NomeProcesso: P.get(x.ProcessoId)?.Nome || "",
    })),
    "NomeArea",
  );
}

export async function uapById(sr, id) {
  const v = await unidadeAreaProcessoView(sr);
  return v.find((x) => x.UnidadeAreaProcessoId === id) || null;
}

// Papéis que recebem/preenchem o plano de ação por programa (RespSOLUnidadeAreaProcesso_vw / RespGRDUnidadeAreaProcesso_vw / RespSgiUnidadeAreaProcesso_vw)
export const PAPEIS = {
  SOL: ["Responsável", "Facilitador"],
  GRD: ["Gestor", "Líder"],
  SGI: ["Responsável SGI"],
};

export async function responsaveisDoLocal(sr, uapId, programa) {
  return sr.Vinculo.filter({ UnidadeAreaProcessoId: uapId, Programa: programa });
}

// UnidadesAreasSemResponsaveis_vw (SOL) / UnidadesAreasSemLiderEGestor_vw (GRD)
export async function areasSemResponsaveis(sr, programa, unidadeNome) {
  const [view, vinculos] = await Promise.all([unidadeAreaProcessoView(sr), sr.Vinculo.filter({ Programa: programa })]);
  const com = new Set(vinculos.map((v) => v.UnidadeAreaProcessoId));
  return sortPt(
    view.filter((x) => !com.has(x.UnidadeAreaProcessoId) && (!unidadeNome || x.NomeUnidade === unidadeNome))
      .map((x) => ({ Unidade: x.NomeUnidade, Area: x.NomeArea, Processo: x.NomeProcesso })),
    "Unidade",
  );
}

// Agendamento vigente para um programa numa data (InspecaoDtInicial <= data <= InspecaoDtFinal)
export async function agendamentoNaData(sr, programa, dataISO) {
  const [tipos, ags] = await Promise.all([sr.TipoDeInspecao.filter({ Programa: programa }), sr.Agendamento.list()]);
  const T = byId(tipos);
  const d = String(dataISO).slice(0, 10);
  const ag = ags.find((a) => T.has(a.TipoDeInspecaoId) && a.InspecaoDtInicial <= d && a.InspecaoDtFinal >= d);
  return ag ? { ...ag, Tipo: T.get(ag.TipoDeInspecaoId).Tipo } : null;
}

export { byId, sortPt };
