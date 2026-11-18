// Funções do app "Plano de Ação" (Power Apps ProgramaSOL&GRD-PlanodeAção).
// Fluxos originais: ObterInspecoesDosPreenchedores, VerificarRespVinculo, ObterInspecao_sp,
// PlanoDeAcaoTransaction (InserirDadosPlanoDeAcao_sp) e EditarPlanoDeAcaoTransaction (EditarDadosPlanoDeAcao_sp).
import { z } from "zod";
import { exigir, getAccess } from "../lib/access.js";
import { falha } from "../lib/http.js";
import { registrarAtividade } from "../lib/log.js";
import { carregarBase, filtrarResumo, resumirInspecao, hojeISO, agendamentoDaInspecao } from "../lib/inspecoes.js";
import { itensNaoConformes } from "../../src/lib/scores.js";
import { EMAIL_CONTATO } from "../../src/lib/constantes.js";

const APP = "Plano de Ação";
const ProgramaPA = z.enum(["SOL", "GRD"]);

// VerificarRespVinculo_sp: o usuário está entre os responsáveis do local inspecionado?
async function vinculado(ctx, a, insp) {
  if (a.isAdmin) return true;
  const v = await ctx.sr.Vinculo.filter({ UnidadeAreaProcessoId: insp.UnidadeAreaProcessoId, Programa: insp.TipoDeFormulario, Email: a.email });
  return v.length > 0;
}

// ObterInspecoesFiltroPreenchimentoPA_sp
export async function listar(ctx, data) {
  const f = z
    .object({
      programa: ProgramaPA,
      mes: z.coerce.number().int().min(1).max(12).optional().nullable(),
      ano: z.coerce.number().int().optional().nullable(),
      naoIniciado: z.boolean().default(true), emAndamento: z.boolean().default(true), finalizado: z.boolean().default(true),
    })
    .parse(data);
  const a = await getAccess(ctx);
  exigir(a.isPreenchedor, "Você não está vinculado a nenhuma área. Procure o administrador.");
  const { sr } = ctx;
  const locais = a.isAdmin ? null : new Set(a.vinculos.filter((v) => v.Programa === f.programa).map((v) => v.UnidadeAreaProcessoId));
  const insps = (await sr.Inspecao.filter({ TipoDeFormulario: f.programa, EmAberto: { $ne: true }, Inativado: { $ne: true } }))
    .filter((i) => !locais || locais.has(i.UnidadeAreaProcessoId));
  const base = await carregarBase(sr);
  const hoje = hojeISO();
  return filtrarResumo(insps.map((i) => resumirInspecao(i, base, hoje)), f);
}

// Abre a tela ScreenPlanoDeAcao (acesso direto pelo link do e-mail: /plano-acao/<id>)
export async function obter(ctx, data) {
  const { inspecaoId } = z.object({ inspecaoId: z.string().min(1) }).parse(data);
  const a = await getAccess(ctx);
  const { sr } = ctx;
  let insp;
  try {
    insp = await sr.Inspecao.get(inspecaoId);
  } catch {
    return { erro: "nao-encontrada", contato: EMAIL_CONTATO };
  }
  if (!(await vinculado(ctx, a, insp))) return { erro: "vinculo", contato: EMAIL_CONTATO };
  if (insp.Inativado) return { erro: "inativada", motivo: insp.MotivoInativacao || "", contato: EMAIL_CONTATO };
  if (insp.EmAberto) return { erro: "em-aberto", contato: EMAIL_CONTATO };
  const [planos, base] = await Promise.all([sr.PlanoDeAcao.filter({ InspecaoId: inspecaoId }), carregarBase(sr)]);
  const ag = agendamentoDaInspecao(insp, base);
  return {
    inspecao: insp,
    tipoInspecao: ag?.Tipo || insp.TipoDeInspecao || "",
    prazo: ag ? { inicio: ag.PaDtInicial, fim: ag.PaDtFinal } : null,
    planos,
    naoConformes: itensNaoConformes(insp.TipoDeFormulario, insp.Checklist).map((i) => String(i.Id)),
    usuario: { nome: a.nome, email: a.email },
    podeEditar: true,
  };
}

const planoInput = z.object({
  inspecaoId: z.string().min(1),
  itemRef: z.union([z.string(), z.number()]).transform(String),
  Acao: z.string().max(10000).default(""),
  Data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  Status: z.enum(["Em andamento", "Finalizado"]),
  RespExec: z.string().max(200).optional().default(""),
  AreaResponsavel: z.string().max(200).optional().default(""),
  OrdemDeServico: z.string().max(100).optional().default(""),
  Fotos: z.array(z.string().max(500)).max(20).optional().default([]),
});

// PlanoDeAcaoTransaction (botão "Adicionar") e EditarPlanoDeAcaoTransaction (botão "Atualizar")
export async function salvar(ctx, data) {
  const d = planoInput.parse(data);
  const a = await getAccess(ctx);
  const { sr } = ctx;
  const insp = await sr.Inspecao.get(d.inspecaoId);
  exigir(await vinculado(ctx, a, insp), "Você não possui acesso a essa inspeção!");
  if (insp.Inativado) falha("Inspeção inativada pelo administrador!");
  const nc = itensNaoConformes(insp.TipoDeFormulario, insp.Checklist).map((i) => String(i.Id));
  if (!nc.includes(d.itemRef)) falha("Este item não é uma não conformidade da inspeção.");

  const [existente] = await sr.PlanoDeAcao.filter({ InspecaoId: d.inspecaoId, ItemRef: d.itemRef });
  const acaoVazia = !d.Acao.replace(/<[^>]*>/g, "").trim();
  try {
    if (!existente) {
      const faltando = [acaoVazia && "Descritivo da ação", !d.RespExec.trim() && "Resp. pela execução", !d.AreaResponsavel.trim() && "Área responsável pela execução"].filter(Boolean);
      if (faltando.length) falha(`Campo(s) não preenchido(s): ${faltando.join(", ")}.`);
      const novo = await sr.PlanoDeAcao.create({
        InspecaoId: d.inspecaoId, ItemRef: d.itemRef, TipoDeFormulario: insp.TipoDeFormulario,
        Acao: d.Acao, Data: d.Data, Status: d.Status,
        Responsavel: a.nome, ResponsavelEmail: a.email,
        RespExec: d.RespExec, AreaResponsavel: d.AreaResponsavel,
        OrdemDeServico: d.OrdemDeServico.trim() || "N/A", Fotos: d.Fotos,
      });
      registrarAtividade(ctx, { aplicacao: APP, acao: "Inserir plano de ação", funcao: "plano.salvar", modelo: { PlanoDeAcaoId: novo.id, InspecaoId: d.inspecaoId, ItemRef: d.itemRef, Status: d.Status } });
      return { plano: novo, criado: true };
    }
    if (existente.Status === "Finalizado") falha("O plano de ação desse item já foi finalizado!");
    // em andamento: todos os campos seguem editáveis (o responsável pelo preenchimento continua o original)
    const respExec = d.RespExec.trim() || existente.RespExec || "";
    const areaResp = d.AreaResponsavel.trim() || existente.AreaResponsavel || "";
    const faltando = [acaoVazia && "Descritivo da ação", !respExec && "Resp. pela execução", !areaResp && "Área responsável pela execução"].filter(Boolean);
    if (faltando.length) falha(`Campo(s) não preenchido(s): ${faltando.join(", ")}.`);
    const atualizado = await sr.PlanoDeAcao.update(existente.id, {
      Acao: d.Acao, Data: d.Data, Status: d.Status,
      RespExec: respExec, AreaResponsavel: areaResp,
      OrdemDeServico: d.OrdemDeServico.trim() || "N/A",
      // Fotos enviadas = lista completa (permite remover); sem o campo, mantém as atuais
      Fotos: "Fotos" in (data || {}) ? d.Fotos : existente.Fotos || [],
    });
    registrarAtividade(ctx, { aplicacao: APP, acao: "Editar plano de ação em andamento", funcao: "plano.salvar", modelo: { PlanoDeAcaoId: existente.id, Status: d.Status, Data: d.Data } });
    return { plano: atualizado, criado: false };
  } catch (e) {
    registrarAtividade(ctx, { aplicacao: APP, acao: "Salvar plano de ação", funcao: "plano.salvar", status: false, descricao: e.message });
    throw e;
  }
}
