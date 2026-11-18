// Regras de cálculo dos programas — JS puro, usado no navegador (prévia do resultado) e no servidor (valor gravado).
// Reproduz fielmente as fórmulas Power Fx dos apps originais (ButtonEnviar / ButtonEnviarGrd).

export const PROGRAMAS = ["SOL", "GRD", "SGI"];
export const RESPOSTAS = {
  SOL: ["Sim", "Não", "N/A"],
  GRD: ["Sim", "Não"],
  SGI: ["Não Conformidade Maior", "Não Conformidade Menor", "Ponto de Melhoria", "Ponto Positivo", "Conforme", "N/A"],
};
// Respostas SGI que exigem Descrição do Apontamento, Referência Normativa e Sugestão de Adequação
export const SGI_RESPOSTAS_COM_APONTAMENTO = ["Não Conformidade Maior", "Não Conformidade Menor", "Ponto de Melhoria"];

// Trunc(x, 2) do Power Fx
export const trunc2 = (x) => Math.trunc(x * 100) / 100;
// IfError(a / b, 0): divisão por zero vira 0
const pct = (sim, nao) => (sim + nao === 0 ? 0 : trunc2(((2 * sim) / (2 * (sim + nao))) * 100));

export function statusSol(total) {
  if (total <= 59.99) return "RUIM";
  if (total >= 60 && total <= 69.99) return "REGULAR";
  if (total >= 70 && total <= 79.99) return "BOM";
  if (total >= 80 && total <= 89.99) return "ÓTIMO";
  return "EXCELENTE";
}

/**
 * Score SOL. Categorias: E=Empresa, C=Colaborador, S=Segurança, C/S.
 * Observação (fiel ao app original): o score "Empresa" conta itens de categoria E **ou S**
 * e o Score Total considera apenas Empresa + Colaborador.
 */
export function calcularSol(checklist) {
  const count = (cats, resp) => checklist.filter((i) => cats.includes(i.Categoria) && i.Resposta === resp).length;
  const colabSim = count(["C", "C/S"], "Sim"), colabNao = count(["C", "C/S"], "Não");
  const segSim = count(["S", "C/S"], "Sim"), segNao = count(["S", "C/S"], "Não");
  const empSim = count(["E", "S"], "Sim"), empNao = count(["E", "S"], "Não");
  const ScoreColaborador = pct(colabSim, colabNao);
  const ScoreSeguranca = pct(segSim, segNao);
  const ScoreEmpresa = pct(empSim, empNao);
  const conf = empSim + colabSim;
  const naoConf = empNao + colabNao;
  const ScoreTotal = conf + naoConf === 0 ? 0 : trunc2(((conf * 2) / (2 * (conf + naoConf))) * 100);
  return { ScoreColaborador, ScoreSeguranca, ScoreEmpresa, ScoreTotal, PLR: ScoreColaborador, Status: statusSol(ScoreTotal) };
}

// Ordem dos itens GRD: pelo nome do pilar (Sort(..., PilarNome, Ascending)) mantendo a ordem do cadastro dentro do pilar.
export function ordenarGrd(itens) {
  return itens
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => String(a.it.PilarNome).localeCompare(String(b.it.PilarNome), "pt-BR", { numeric: true }) || a.idx - b.idx)
    .map(({ it }, i) => ({ ...it, indice: i + 1 }));
}

/** Métricas GRD: % de atendimento por pilar e total (varPilarTotal). */
export function calcularGrd(checklist) {
  const pilares = [];
  for (const i of checklist) if (!pilares.includes(i.PilarNome)) pilares.push(i.PilarNome);
  const Metricas = pilares.map((p) => {
    const itens = checklist.filter((i) => i.PilarNome === p);
    const Conforme = itens.filter((i) => i.Resposta === "Sim").length;
    const NaoConforme = itens.filter((i) => i.Resposta === "Não").length;
    return {
      Pilar: p,
      Descricao: itens[0]?.PilarDescricao || "",
      Conforme,
      NaoConforme,
      Atendimento: Conforme + NaoConforme === 0 ? null : trunc2((Conforme / (Conforme + NaoConforme)) * 100),
    };
  });
  const sc = Metricas.reduce((s, m) => s + m.Conforme, 0);
  const sn = Metricas.reduce((s, m) => s + m.NaoConforme, 0);
  return { Metricas, Atendimento: sc + sn === 0 ? 0 : trunc2((sc / (sc + sn)) * 100) };
}

// Colunas de pilar da planilha GRD, montadas a partir das inspeções exportadas (nada fixo).
// Cada pilar é identificado pelo PilarId gravado nos itens da inspeção — não pela posição nem pelo nome —,
// então renomear, criar, reordenar ou excluir pilares nunca desalinha inspeções antigas e novas:
//  - pilar renomeado: as inspeções antigas aparecem na mesma coluna, com o nome atual;
//  - pilar novo: ganha sua coluna (vazia nas inspeções feitas antes dele);
//  - pilar excluído: mantém sua coluna com o último nome usado + "(excluído)".
// Ordem: pilares cadastrados pela Ordem/Nome; depois os excluídos.
export function pilaresDaPlanilha(insps, pilaresCadastro) {
  const cadastro = new Map(pilaresCadastro.map((p) => [p.id, p]));
  const chave = (it) => (it.PilarId ? `id:${it.PilarId}` : `nome:${it.PilarNome || ""}`); // itens antigos sem PilarId
  const vistos = new Map(); // chave -> { nome, pilar }
  const porInspecao = new Map(); // inspeção -> Map(chave -> % atendimento)
  for (const i of insps) {
    const grupos = new Map();
    for (const it of i.Checklist || []) {
      const k = chave(it);
      if (!grupos.has(k)) grupos.set(k, { sim: 0, nao: 0 });
      const g = grupos.get(k);
      if (it.Resposta === "Sim") g.sim++;
      else if (it.Resposta === "Não") g.nao++;
      vistos.set(k, { nome: it.PilarNome || "Sem pilar", pilar: it.PilarId ? cadastro.get(it.PilarId) : null });
    }
    porInspecao.set(i, new Map([...grupos].map(([k, g]) => [k, g.sim + g.nao === 0 ? null : trunc2((g.sim / (g.sim + g.nao)) * 100)])));
  }
  const cmpNome = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true });
  const ordem = [...vistos].sort(([, a], [, b]) => {
    if (!!a.pilar !== !!b.pilar) return a.pilar ? -1 : 1;
    if (a.pilar) return (Number(a.pilar.Ordem) || 999) - (Number(b.pilar.Ordem) || 999) || cmpNome(a.pilar.Nome, b.pilar.Nome);
    return cmpNome(a.nome, b.nome);
  });
  let colunas = ordem.map(([, v]) => (v.pilar ? v.pilar.Nome : `${v.nome} (excluído)`));
  // nomes repetidos (ex.: dois pilares com o mesmo nome) ganham a descrição para não confundir
  colunas = colunas.map((c, n) => (colunas.indexOf(c) !== colunas.lastIndexOf(c) ? `${c} - ${ordem[n][1].pilar?.Descricao || n + 1}` : c));
  return { colunas, valores: (i) => ordem.map(([k]) => porInspecao.get(i)?.get(k) ?? null) };
}

/** Resumo SGI: quantidade por tipo de resposta. */
export function resumoSgi(checklist) {
  return RESPOSTAS.SGI.map((r) => ({ Resposta: r, Quantidade: checklist.filter((i) => i.Resposta === r).length }));
}

/** Itens que geram plano de ação. */
export function itensNaoConformes(programa, checklist = []) {
  if (programa === "SGI") return checklist.filter((i) => ["Não Conformidade Maior", "Não Conformidade Menor"].includes(i.Resposta));
  return checklist.filter((i) => i.Resposta === "Não");
}

/** Texto das normas/disciplinas de um item SGI (" ⁃ ISO 9001: ... ⁃ CAPA: ..."). */
export function normasSgiTexto(i) {
  return [["ISO 9001", i.ISO9001], ["ISO 14001", i.ISO14001], ["ISO 45001", i.ISO45001], ["LOTOTO", i.LOTOTO], ["PROCESSO", i.PROCESSO], ["CAPA", i.CAPA]]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" ⁃ ");
}

/** Normas/Disciplinas disponíveis para auditoria SGI (LOTOTO apenas para a área Manutenção). */
export const normasDisponiveis = (nomeArea) => (nomeArea === "Manutenção" ? ["ISO SGI", "LOTOTO", "PROCESSO", "CAPA"] : ["ISO SGI", "PROCESSO", "CAPA"]);

/** FiltrarItemSgi_sp: questões da área (ou sem área) que possuam conteúdo em alguma das normas selecionadas. */
export function filtrarItensSgi(itens, nomeArea, normas) {
  const sel = normas.map((n) => n.trim()).filter(Boolean);
  const temNorma = (i) =>
    sel.some((n) => (n === "ISO SGI" ? i.ISO9001 || i.ISO14001 || i.ISO45001 : i[n]));
  return itens.filter((i) => (!i.Area || i.Area === nomeArea) && (sel.length === 0 || temNorma(i)));
}
