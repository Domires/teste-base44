// Funções do app "Inspeção" (Power Apps ProgramaSOL&GRD-Inspeção).
// Fluxos originais: ObterInspecaoEmAndamento, InspecaoParcialTransaction, InspecaoTransaction,
// DeletarInspecaoParcialTransaction, ObterInspecao_sp, FiltrarItemSgi_sp, PreencherPlanilhaSol, GRD_PreencherPlanilha.
import { z } from "zod";
import { exigir, getAccess } from "../lib/access.js";
import { falha } from "../lib/http.js";
import { registrarAtividade } from "../lib/log.js";
import { agendamentoNaData, byId, sortPt, uapById, unidadeAreaProcessoView } from "../lib/views.js";
import { hojeISO } from "../lib/inspecoes.js";
import {
  RESPOSTAS, SGI_RESPOSTAS_COM_APONTAMENTO, calcularGrd, calcularSol, filtrarItensSgi, ordenarGrd,
} from "../../src/lib/scores.js";
import { EXIGIR_AGENDAMENTO, UNIDADES_SEM_SGI } from "../../src/lib/constantes.js";

const APP = "Inspeção";
const Programa = z.enum(["SOL", "GRD", "SGI"]);
const txt = (n = 500) => z.string().max(n).optional().default("");

const podeUsar = (a, programa) => (programa === "SGI" ? a.isAuditor || a.isInspetor : a.isInspetor);

// SGI: não existe "Finalizar". Há um único registro por Unidade/Área + Norma/Disciplina + ANO;
// abrir as mesmas opções no mesmo ano carrega o que foi salvo, e num ano novo começa um registro novo
// (os dos anos anteriores ficam guardados no seu ano, só para consulta).
const anoAtual = () => Number(hojeISO().slice(0, 4));
export const anoSgi = (i) => Number(i.Ano) || Number(String(i.Data || "").slice(0, 4)) || null;
async function sgiDoAno(sr, uapId, norma, ano = anoAtual()) {
  const regs = await sr.Inspecao.filter({ TipoDeFormulario: "SGI", UnidadeAreaProcessoId: uapId, Inativado: { $ne: true } }, "-updated_date");
  return regs.find((i) => (i.NormaDisciplina || "") === norma && anoSgi(i) === ano) || null;
}
const falhaAnoSgi = (i) => falha(`Esta auditoria SGI pertence a ${anoSgi(i)} e não pode mais ser alterada. Para ${anoAtual()}, abra a Unidade, Área e Norma/Disciplina pela tela de seleção.`);

// ---------- seleção ----------
export async function dadosSelecao(ctx) {
  const a = await getAccess(ctx);
  exigir(a.isInspetor || a.isAuditor, "Seu e-mail não está cadastrado como inspetor ou auditor. Procure o administrador.");
  const { sr } = ctx;
  const [unidades, locais] = await Promise.all([sr.Unidade.list("Nome"), unidadeAreaProcessoView(sr)]);
  return {
    programas: ["SOL", "GRD", "SGI"].filter((p) => podeUsar(a, p)),
    unidades: sortPt(unidades, "Nome").map((u) => ({ id: u.id, Nome: u.Nome, Sigla: u.Sigla, semSgi: UNIDADES_SEM_SGI.includes(u.Nome) })),
    locais,
  };
}

// ObterInspecaoEmAndamento_sp + checagem do agendamento (botão "Avançar" da ScreenSelecao)
export async function verificarEmAndamento(ctx, data) {
  const { programa, uapId, normas } = z.object({ programa: Programa, uapId: z.string().min(1), normas: z.array(z.string()).default([]) }).parse(data);
  const a = await getAccess(ctx);
  exigir(podeUsar(a, programa));
  const { sr } = ctx;
  const ag = await agendamentoNaData(sr, programa, hojeISO());
  if (EXIGIR_AGENDAMENTO[programa] && !ag) falha("Nenhum agendamento foi realizado para data de hoje!");
  if (programa === "SOL") return { inspecaoId: null, tipoInspecao: ag?.Tipo || "" };
  if (programa === "SGI") {
    const doAno = await sgiDoAno(sr, uapId, normas.join(";"));
    return { inspecaoId: doAno?.id || null, tipoInspecao: ag?.Tipo || "", dataAberta: doAno?.Data || null, avaliador: doAno?.Auditor || "", ano: anoAtual() };
  }
  const abertas = await sr.Inspecao.filter({ TipoDeFormulario: programa, UnidadeAreaProcessoId: uapId, EmAberto: true, Inativado: { $ne: true } }, "-updated_date");
  const aberta = abertas[0];
  return { inspecaoId: aberta?.id || null, tipoInspecao: ag?.Tipo || "", dataAberta: aberta?.Data || null, avaliador: aberta?.Avaliador || aberta?.Auditor || "" };
}

// Monta o checklist a partir dos itens cadastrados (Item_vw / PilarItemGrd_vw / FiltrarItemSgi_sp)
async function montarChecklist(sr, programa, local, normas) {
  if (programa === "SOL") {
    const itens = (await sr.ItemSol.list("Ordem")).filter((i) => i.Ativo !== false);
    return itens.map((i, idx) => ({ Id: i.id, indice: idx + 1, Requisito: i.Requisito, Categoria: i.Categoria, Subcategoria: i.Subcategoria || "", Resposta: "", ItemObservacao: "", Fotos: [] }));
  }
  if (programa === "GRD") {
    const [itens, pilares] = await Promise.all([sr.ItemGrd.list("Ordem"), sr.Pilar.list()]);
    const P = byId(pilares);
    return ordenarGrd(
      itens.filter((i) => i.Ativo !== false).map((i) => ({
        Id: i.id, Requisito: i.Requisito, NmrRequisito: i.NmrRequisito || "", NmrSubRequisito: i.NmrSubRequisito || "",
        PilarId: i.PilarId, PilarNome: P.get(i.PilarId)?.Nome || "", PilarDescricao: P.get(i.PilarId)?.Descricao || "",
        Resposta: "", ItemObservacao: "", Fotos: [],
      })),
    );
  }
  const itens = (await sr.ItemSgi.list("Ordem")).filter((i) => i.Ativo !== false);
  return filtrarItensSgi(itens, local.NomeArea, normas).map((i, idx) => ({
    Id: i.id, indice: idx + 1, Questao: i.Questao, Procedimento: i.Procedimento || "",
    ISO9001: i.ISO9001 || "", ISO14001: i.ISO14001 || "", ISO45001: i.ISO45001 || "", LOTOTO: i.LOTOTO || "", PROCESSO: i.PROCESSO || "", CAPA: i.CAPA || "",
    Resposta: "", DescricaoApontamento: "", ReferenciaNormativa: "", EvidenciasObjetivas: "", SugestaoDeAdequacao: "", Fotos: [],
  }));
}

// Carrega a tela do formulário (OnVisible de ScreenInspecaoSOL / ScreenAvaliacaoGRD / ScreenAuditoriaSGI)
export async function abrirFormulario(ctx, data) {
  const { programa, uapId, normas, inspecaoId } = z
    .object({ programa: Programa, uapId: z.string().min(1), normas: z.array(z.string()).default([]), inspecaoId: z.string().optional().nullable() })
    .parse(data);
  const a = await getAccess(ctx);
  exigir(podeUsar(a, programa));
  const { sr } = ctx;
  const local = await uapById(sr, uapId);
  if (!local) falha("Local (unidade/área) não encontrado.", 404);

  let inspecao = null;
  if (inspecaoId) {
    inspecao = await sr.Inspecao.get(inspecaoId);
    if (programa === "SGI") {
      if (anoSgi(inspecao) !== anoAtual()) falhaAnoSgi(inspecao);
    } else if (!inspecao.EmAberto) falha("Esta inspeção já foi finalizada.");
  } else if (programa === "SGI") {
    inspecao = await sgiDoAno(sr, uapId, normas.join(";")); // mesmas opções no mesmo ano = mesmo registro
  }
  const checklist = inspecao?.Checklist?.length ? inspecao.Checklist : await montarChecklist(sr, programa, local, normas);
  const ag = await agendamentoNaData(sr, programa, hojeISO());

  const [inspetores, auditores, vinculos] = await Promise.all([sr.Inspetor.list("Nome"), sr.Auditor.list("Nome"), sr.Vinculo.filter({ UnidadeAreaProcessoId: uapId })]);
  return {
    programa,
    local,
    tipoInspecao: inspecao?.TipoDeInspecao || ag?.Tipo || "",
    normas: inspecao?.NormaDisciplina ? inspecao.NormaDisciplina.split(";") : normas,
    inspecao,
    checklist,
    inspetores: sortPt(inspetores, "Nome").map((i) => ({ id: i.id, Nome: i.Nome, Email: i.Email })),
    auditores: sortPt(auditores, "Nome").map((i) => ({ id: i.id, Nome: i.Nome, Email: i.Email })),
    responsaveis: vinculos.filter((v) => v.Programa === "SOL").map((v) => ({ Nome: v.Nome, Email: v.Email, Papel: v.Papel })),
    lideres: vinculos.filter((v) => v.Papel === "Líder").map((v) => ({ Nome: v.Nome, Email: v.Email })),
    gestores: vinculos.filter((v) => v.Papel === "Gestor").map((v) => ({ Nome: v.Nome, Email: v.Email })),
    usuario: { nome: a.nome, email: a.email },
  };
}

// ---------- salvar / finalizar ----------
const itemResposta = z.object({
  Id: z.union([z.string(), z.number()]).transform(String),
  Resposta: z.string().max(40).optional().default(""),
  ItemObservacao: txt(4000),
  DescricaoApontamento: txt(4000), ReferenciaNormativa: txt(4000), EvidenciasObjetivas: txt(4000), SugestaoDeAdequacao: txt(4000),
  Fotos: z.array(z.string().max(500)).max(20).optional().default([]),
});
const payload = z.object({
  programa: Programa,
  uapId: z.string().min(1),
  inspecaoId: z.string().optional().nullable(),
  normas: z.array(z.string()).optional().default([]),
  cabecalho: z.object({
    Data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    RespAcompanhamento: txt(200), Cargo: txt(200), Inspetor1: txt(200), Inspetor2: txt(200), Avaliador: txt(200),
    Auditor: txt(200), EquipeEntrevistada: txt(2000), Observacao: txt(4000),
  }),
  respostas: z.array(itemResposta).max(1000),
  assinaturaUrl: z.string().max(500).optional().nullable(),
});

async function prepararRegistro(ctx, d, a) {
  const { sr } = ctx;
  const local = await uapById(sr, d.uapId);
  if (!local) falha("Local (unidade/área) não encontrado.", 404);
  let existente = null;
  if (d.inspecaoId) {
    existente = await sr.Inspecao.get(d.inspecaoId);
    if (d.programa !== "SGI" && !existente.EmAberto) falha("Esta inspeção já foi finalizada.");
    if (existente.TipoDeFormulario !== d.programa || existente.UnidadeAreaProcessoId !== d.uapId) falha("Inspeção não corresponde ao formulário selecionado.");
  } else if (d.programa === "SGI") {
    existente = await sgiDoAno(sr, d.uapId, d.normas.join(";")); // evita duplicar o registro do ano
  }
  if (d.programa === "SGI") {
    if (existente && anoSgi(existente) !== anoAtual()) falhaAnoSgi(existente);
    if (Number(d.cabecalho.Data.slice(0, 4)) !== anoAtual()) falha(`A data da auditoria SGI deve ser de ${anoAtual()}.`);
  }
  // O texto dos itens vem do servidor (cadastro ou checklist já salvo); do navegador só aceitamos as respostas.
  const base = existente?.Checklist?.length ? existente.Checklist : await montarChecklist(sr, d.programa, local, d.normas);
  const resp = new Map(d.respostas.map((r) => [String(r.Id), r]));
  const validas = RESPOSTAS[d.programa];
  const Checklist = base.map((item) => {
    const r = resp.get(String(item.Id));
    if (!r) return item;
    const out = { ...item, Resposta: validas.includes(r.Resposta) ? r.Resposta : "", Fotos: r.Fotos || [] };
    if (d.programa === "SGI") {
      Object.assign(out, { DescricaoApontamento: r.DescricaoApontamento, ReferenciaNormativa: r.ReferenciaNormativa, EvidenciasObjetivas: r.EvidenciasObjetivas, SugestaoDeAdequacao: r.SugestaoDeAdequacao });
    } else {
      out.ItemObservacao = r.ItemObservacao;
    }
    return out;
  });
  const ag = await agendamentoNaData(sr, d.programa, d.cabecalho.Data);
  const c = d.cabecalho;
  const reg = {
    TipoDeFormulario: d.programa,
    TipoDeInspecao: ag?.Tipo || existente?.TipoDeInspecao || "",
    TipoDeInspecaoId: ag?.TipoDeInspecaoId || existente?.TipoDeInspecaoId || "",
    Data: c.Data,
    UnidadeAreaProcessoId: local.UnidadeAreaProcessoId,
    Unidade: local.NomeUnidade, UnidadeSigla: local.SiglaUnidade,
    Area: local.NomeArea, AreaSigla: local.SiglaArea, Processo: local.NomeProcesso,
    RespAcompanhamento: c.RespAcompanhamento, Cargo: c.Cargo,
    Observacao: c.Observacao || "Sem Observações",
    Checklist,
    InspetorEmail: existente?.InspetorEmail || a.email,
    Inativado: false,
  };
  if (d.programa === "SOL") Object.assign(reg, { Inspetor1: c.Inspetor1, Inspetor2: c.Inspetor2 });
  if (d.programa === "GRD") Object.assign(reg, { Avaliador: c.Avaliador });
  if (d.programa === "SGI") Object.assign(reg, { Auditor: c.Auditor, EquipeEntrevistada: c.EquipeEntrevistada, NormaDisciplina: (existente?.NormaDisciplina || d.normas.join(";")), Ano: anoAtual() });
  return { reg, existente };
}

// InspecaoParcialTransaction (botão "Salvar" de GRD e SGI)
export async function salvarParcial(ctx, data) {
  const d = payload.parse(data);
  const a = await getAccess(ctx);
  exigir(podeUsar(a, d.programa));
  if (d.programa === "SOL") falha("A inspeção SOL não pode ser salva parcialmente.");
  if (d.programa === "SGI" && (!d.cabecalho.Auditor || !d.cabecalho.EquipeEntrevistada)) falha("Campo Auditor e Equipe Entrevistada são obrigatórios!");
  const { sr } = ctx;
  const { reg, existente } = await prepararRegistro(ctx, d, a);
  // SGI salvo já é o registro válido do ano (sem etapa de finalização): entra nas listas e no resultado.
  if (d.programa === "SGI") Object.assign(reg, { EmAberto: false, DataFinalizacao: new Date().toISOString(), AssinaturaUrl: "" });
  else reg.EmAberto = true;
  try {
    const salvo = existente ? await sr.Inspecao.update(existente.id, reg) : await sr.Inspecao.create(reg);
    registrarAtividade(ctx, { aplicacao: APP, acao: "Salvar inspeção parcial", funcao: "inspecao.salvarParcial", modelo: { id: salvo.id, ...d.cabecalho, programa: d.programa } });
    return { id: salvo.id };
  } catch (e) {
    registrarAtividade(ctx, { aplicacao: APP, acao: "Salvar inspeção parcial", funcao: "inspecao.salvarParcial", status: false, descricao: e.message });
    throw e;
  }
}

function validarFinalizacao(programa, c, checklist) {
  const vazios = checklist.filter((i) => !i.Resposta).length;
  if (vazios) falha(`Existem ${vazios} item(ns) sem resposta.`);
  if (programa === "SOL") {
    if (!c.RespAcompanhamento || !c.Cargo || !c.Inspetor1 || !c.Inspetor2) falha("Preencha Resp. Acompanhamento, Cargo, Inspetor 1 e Inspetor 2.");
    if (checklist.some((i) => i.Resposta === "Não" && !(i.Fotos || []).length)) falha("Campo evidência vazio! Verifique e tente novamente!");
  }
  if (programa === "GRD") {
    if (!c.RespAcompanhamento || !c.Cargo || !c.Avaliador) falha("Preencha Resp. Acompanhamento, Cargo e Avaliador.");
    if (checklist.some((i) => !String(i.ItemObservacao || "").trim())) falha("Campo evidência vazio! Verifique e tente novamente!");
  }
  if (programa === "SGI") {
    if (!c.Auditor || !c.EquipeEntrevistada) falha("Campo Auditor e Equipe Entrevistada são obrigatórios!");
    const semApont = checklist.filter((i) => SGI_RESPOSTAS_COM_APONTAMENTO.includes(i.Resposta) && !String(i.DescricaoApontamento || "").trim()).length;
    if (semApont) falha(`Preencha a Descrição do Apontamento de ${semApont} item(ns).`);
  }
}

// InspecaoTransaction (botão "Finalizar") — calcula os scores no servidor e grava a inspeção concluída.
export async function finalizar(ctx, data) {
  const d = payload.parse(data);
  const a = await getAccess(ctx);
  exigir(podeUsar(a, d.programa));
  if (d.programa === "SGI") falha("A auditoria SGI não é finalizada: use o botão Salvar.");
  const { sr } = ctx;
  const { reg, existente } = await prepararRegistro(ctx, d, a);
  validarFinalizacao(d.programa, d.cabecalho, reg.Checklist);
  if (d.programa !== "SGI" && !d.assinaturaUrl) falha("Colete a assinatura do responsável pelo acompanhamento.");
  if (d.programa === "SOL") Object.assign(reg, calcularSol(reg.Checklist));
  if (d.programa === "GRD") Object.assign(reg, calcularGrd(reg.Checklist));
  Object.assign(reg, { EmAberto: false, AssinaturaUrl: d.assinaturaUrl || "", DataFinalizacao: new Date().toISOString(), InspetorEmail: existente?.InspetorEmail || a.email });
  try {
    const salvo = existente ? await sr.Inspecao.update(existente.id, reg) : await sr.Inspecao.create(reg);
    registrarAtividade(ctx, {
      aplicacao: APP, acao: "Inserir inspeção no banco de dados", funcao: "inspecao.finalizar",
      modelo: { id: salvo.id, programa: d.programa, ...d.cabecalho, ScoreTotal: reg.ScoreTotal, Status: reg.Status, Atendimento: reg.Atendimento },
    });
    return {
      id: salvo.id,
      resultado: { ScoreTotal: reg.ScoreTotal, ScoreEmpresa: reg.ScoreEmpresa, ScoreColaborador: reg.ScoreColaborador, ScoreSeguranca: reg.ScoreSeguranca, Status: reg.Status, Metricas: reg.Metricas, Atendimento: reg.Atendimento },
    };
  } catch (e) {
    registrarAtividade(ctx, { aplicacao: APP, acao: "Inserir inspeção no banco de dados", funcao: "inspecao.finalizar", status: false, descricao: e.message });
    throw e;
  }
}

// DeletarInspecaoParcialTransaction (botão "Nova Avaliação" quando há avaliação em aberto)
export async function descartarParcial(ctx, data) {
  const { id } = z.object({ id: z.string().min(1) }).parse(data);
  const a = await getAccess(ctx);
  const { sr } = ctx;
  const insp = await sr.Inspecao.get(id);
  exigir(podeUsar(a, insp.TipoDeFormulario));
  // SGI não tem finalização: a auditoria salva do ano atual pode ser descartada ("Nova Avaliação");
  // as de anos anteriores ficam guardadas como histórico.
  if (insp.TipoDeFormulario === "SGI") {
    if (insp.Inativado) falha("Esta auditoria está inativada.");
    if (anoSgi(insp) !== anoAtual()) falha(`Somente a auditoria SGI de ${anoAtual()} pode ser descartada; a de ${anoSgi(insp)} fica no histórico.`);
  } else if (!insp.EmAberto) falha("Somente inspeções em aberto podem ser descartadas.");
  await sr.Inspecao.delete(id);
  registrarAtividade(ctx, { aplicacao: APP, acao: `Deletar inspeção parcial ${insp.TipoDeFormulario}`, funcao: "inspecao.descartarParcial", modelo: { InspecaoId: id } });
  return { ok: true };
}

// Lista as inspeções em aberto do próprio inspetor (atalho na tela de seleção)
export async function minhasEmAberto(ctx) {
  const a = await getAccess(ctx);
  exigir(a.isInspetor || a.isAuditor, "Seu e-mail não está cadastrado como inspetor ou auditor. Procure o administrador.");
  const [abertas, sgi] = await Promise.all([
    ctx.sr.Inspecao.filter({ InspetorEmail: a.email, EmAberto: true, Inativado: { $ne: true } }, "-updated_date", 30),
    ctx.sr.Inspecao.filter({ InspetorEmail: a.email, TipoDeFormulario: "SGI", Inativado: { $ne: true } }, "-updated_date", 60),
  ]);
  // SGI do ano atual (editáveis); SGI de anos anteriores ficam só como histórico
  const ids = new Set();
  const rows = [...abertas, ...sgi]
    .filter((r) => (r.TipoDeFormulario !== "SGI" || anoSgi(r) === anoAtual()) && !ids.has(r.id) && ids.add(r.id))
    .sort((x, y) => String(y.updated_date).localeCompare(String(x.updated_date)))
    .slice(0, 30);
  return rows.map((r) => ({
    id: r.id, TipoDeFormulario: r.TipoDeFormulario, Unidade: r.Unidade, Area: r.Area, Processo: r.Processo, Data: r.Data,
    UnidadeAreaProcessoId: r.UnidadeAreaProcessoId, NormaDisciplina: r.NormaDisciplina || "", updated_date: r.updated_date,
    respondidos: (r.Checklist || []).filter((i) => i.Resposta).length, total: (r.Checklist || []).length,
  }));
}
