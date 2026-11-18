// Funções do app "Admin" (Power Apps ProgramaSOL&GRD-Admin).
// Fluxos originais: ListarInspecoes (ObterInspecoesFiltroPAv2_sp), ObterInspecao_sp, EditarInspecaoTransaction,
// EnviarPAporAreaSelecionada, EnviarPAPorUnidadeMesAno, EnviarPAporMesAno, EnviarPAporTipoAno,
// DeletarInspecaoParcialTransaction, além dos Patch/Remove diretos das telas de cadastro.
import { z } from "zod";
import { exigir, getAccess } from "../lib/access.js";
import { findUser } from "../lib/auth.js";
import { store } from "../lib/db.js";
import { marcarTeste, modeloPadrao, sendEmail } from "../lib/email.js";
import { falha } from "../lib/http.js";
import { carregarBase, filtrarResumo, hojeISO, inspecaoCompleta, resumirInspecao, PROGRAMAS_COM_PA } from "../lib/inspecoes.js";
import { registrarAtividade } from "../lib/log.js";
import { PAPEIS, areasSemResponsaveis as semResp, byId, sortPt, uapById, unidadeAreaProcessoView } from "../lib/views.js";
import { itensNaoConformes, pilaresDaPlanilha } from "../../src/lib/scores.js";
import {
  ASSUNTO_PADRAO, LIMITES, TIPOS_MODELO, montarEmail, variaveisDesconhecidas,
} from "../../src/lib/emailModelo.js";
import { EMAIL_CONTATO, PROGRAMA_INFO } from "../../src/lib/constantes.js";

const APP = "Admin";
const Programa = z.enum(["SOL", "GRD", "SGI"]);
const id = z.string().min(1).max(100);

async function admin(ctx) {
  const a = await getAccess(ctx);
  exigir(a.isAdmin, "Acesso restrito aos administradores.");
  return a;
}

// ---------- Home (Indicadores_vw) ----------
export async function indicadores(ctx) {
  await admin(ctx);
  const { sr } = ctx;
  const [insps, inspetores, itensSol, itensGrd, itensSgi, unidades] = await Promise.all([
    sr.Inspecao.filter({ EmAberto: { $ne: true }, Inativado: { $ne: true } }), sr.Inspetor.list(), sr.ItemSol.list(), sr.ItemGrd.list(), sr.ItemSgi.list(), sr.Unidade.list(),
  ]);
  const base = await carregarBase(sr);
  const res = insps.map((i) => resumirInspecao(i, base));
  const soma = (k, f = () => true) => res.filter(f).reduce((s, r) => s + r[k], 0);
  const porPrograma = ["SOL", "GRD", "SGI"].map((p) => ({
    programa: p,
    temPlanoDeAcao: PROGRAMAS_COM_PA.includes(p),
    inspecoes: res.filter((r) => r.TipoDeFormulario === p).length,
    naoIniciados: soma("ItensPANaoIniciados", (r) => r.TipoDeFormulario === p),
    emAndamento: soma("PlanoDeAcaoEmAndamento", (r) => r.TipoDeFormulario === p),
    finalizados: soma("PlanoDeAcaoFinalizado", (r) => r.TipoDeFormulario === p),
    emAtraso: res.filter((r) => r.TipoDeFormulario === p && r.EmAtraso).length,
  }));
  return {
    TotalInspecao: res.length,
    TotalInspetor: inspetores.length,
    TotalItem: itensSol.length + itensGrd.length + itensSgi.length,
    TotalUnidade: unidades.length,
    PlanoDeAcaoEmAndamento: soma("PlanoDeAcaoEmAndamento"),
    PlanoDeAcaoFinalizado: soma("PlanoDeAcaoFinalizado"),
    TotalItensNaoIniciados: soma("ItensPANaoIniciados"),
    porPrograma,
  };
}

// ---------- Inspeções ----------
const filtros = z.object({
  situacao: z.enum(["ativas", "inativadas", "emAberto", "todas"]).default("ativas"),
  programa: Programa.optional().nullable(),
  ano: z.coerce.number().int().optional().nullable(),
  mes: z.coerce.number().int().min(1).max(12).optional().nullable(),
  naoIniciado: z.boolean().default(true), emAndamento: z.boolean().default(true), finalizado: z.boolean().default(true),
});

export async function listarInspecoes(ctx, data) {
  await admin(ctx);
  const f = filtros.parse(data || {});
  const { sr } = ctx;
  const q = {
    inativadas: { Inativado: true },
    emAberto: { EmAberto: true, Inativado: { $ne: true } },
    ativas: { EmAberto: { $ne: true }, Inativado: { $ne: true } },
    todas: {},
  }[f.situacao];
  const [insps, base] = await Promise.all([sr.Inspecao.filter(q), carregarBase(sr)]);
  const hoje = hojeISO();
  return filtrarResumo(insps.map((i) => resumirInspecao(i, base, hoje)), f);
}

export async function obterInspecao(ctx, data) {
  await admin(ctx);
  const { id: inspId } = z.object({ id }).parse(data);
  return inspecaoCompleta(ctx.sr, inspId);
}

// EditarInspecaoTransaction (EditarDadosInspecao_sp)
export async function editarInspecao(ctx, data) {
  const a = await admin(ctx);
  const d = z.object({
    id, uapId: id, Data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    RespAcompanhamento: z.string().max(200).default(""), Cargo: z.string().max(200).default(""),
    Inspetor1: z.string().max(200).optional(), Inspetor2: z.string().max(200).optional(), Avaliador: z.string().max(200).optional(),
    Observacao: z.string().max(4000).default(""),
  }).parse(data);
  const { sr } = ctx;
  const insp = await sr.Inspecao.get(d.id);
  const local = await uapById(sr, d.uapId);
  if (!local) falha("Local não encontrado.");
  const patch = {
    UnidadeAreaProcessoId: local.UnidadeAreaProcessoId, Unidade: local.NomeUnidade, UnidadeSigla: local.SiglaUnidade,
    Area: local.NomeArea, AreaSigla: local.SiglaArea, Processo: local.NomeProcesso,
    Data: d.Data, RespAcompanhamento: d.RespAcompanhamento, Cargo: d.Cargo, Observacao: d.Observacao,
    Editor: a.email, dtEdicao: hojeISO(),
  };
  if (insp.TipoDeFormulario === "SOL") Object.assign(patch, { Inspetor1: d.Inspetor1 ?? insp.Inspetor1, Inspetor2: d.Inspetor2 ?? insp.Inspetor2 });
  if (insp.TipoDeFormulario === "GRD") patch.Avaliador = d.Avaliador ?? insp.Avaliador;
  const r = await sr.Inspecao.update(d.id, patch);
  registrarAtividade(ctx, { aplicacao: APP, acao: "Editar inspeção", funcao: "admin.editarInspecao", modelo: { InspecaoId: d.id, ...patch } });
  return r;
}

export async function inativarInspecao(ctx, data) {
  const a = await admin(ctx);
  const d = z.object({ id, motivo: z.string().min(1, "Informe o motivo.").max(4000) }).parse(data);
  const r = await ctx.sr.Inspecao.update(d.id, { Inativado: true, MotivoInativacao: d.motivo, Inativador: a.email, dtInativacao: hojeISO() });
  registrarAtividade(ctx, { aplicacao: APP, acao: "Inativar inspeção", funcao: "admin.inativarInspecao", modelo: { InspecaoId: d.id, Motivo: d.motivo } });
  return r;
}

export async function descartarEmAberto(ctx, data) {
  await admin(ctx);
  const { id: inspId } = z.object({ id }).parse(data);
  const insp = await ctx.sr.Inspecao.get(inspId);
  if (!insp.EmAberto) falha("Somente avaliações em aberto podem ser descartadas.");
  await ctx.sr.Inspecao.delete(inspId);
  registrarAtividade(ctx, { aplicacao: APP, acao: "Deletar inspeção parcial", funcao: "admin.descartarEmAberto", modelo: { InspecaoId: inspId } });
  return { ok: true };
}

// ---------- Disparo de e-mails (Resultado e Plano de Ação) ----------
const fmtData = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function resultadoTexto(insp) {
  if (insp.TipoDeFormulario === "SOL") return `${insp.Status || ""} — Score Total ${insp.ScoreTotal ?? 0}%`;
  if (insp.TipoDeFormulario === "GRD") return `Atendimento ${insp.Atendimento ?? 0}%`;
  return "";
}

// ---------- Configurar e-mails (Admin › Programação › Configurar e-mails) ----------
// Registro único na entidade ConfiguracaoEmail:
//  - Modo teste: com ModoTeste ligado, TODOS os e-mails de Resultado e Plano de Ação vão somente para DestinatariosTeste
//    (o e-mail mostra para quem iria de verdade) e as inspeções NÃO são marcadas como "e-mail enviado".
//  - Modelos: assunto e corpo (HTML) do e-mail individual (tela Inspeções) e do e-mail em lote (Disparos).
//    Campo vazio = modelo padrão (ASSUNTO_PADRAO e src/emails/PlanoDeAcao.html). Variáveis: VARIAVEIS_EMAIL.
const listaEmails = (s) => [...new Set(String(s || "").split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const SUFIXO = { individual: "Individual", lote: "Lote" };
const padraoEmail = () => ({ Assunto: ASSUNTO_PADRAO, Corpo: modeloPadrao("PlanoDeAcao") });

async function configEmail(sr) {
  const [c] = await sr.ConfiguracaoEmail.list();
  const modelos = Object.fromEntries(Object.entries(SUFIXO).map(([tipo, suf]) => {
    const Assunto = c?.[`Assunto${suf}`] || "", Corpo = c?.[`Corpo${suf}`] || "";
    return [tipo, { Assunto, Corpo, personalizado: !!(Assunto.trim() || Corpo.trim()) }];
  }));
  return {
    id: c?.id || null, ModoTeste: !!c?.ModoTeste, DestinatariosTeste: listaEmails(c?.DestinatariosTeste), updated_date: c?.updated_date || null,
    modelos, padrao: padraoEmail(),
  };
}
// Carrega a configuração para um envio; no modo teste exige ao menos um destinatário.
async function configParaEnvio(sr) {
  const c = await configEmail(sr);
  if (c.ModoTeste && !c.DestinatariosTeste.length) falha("O modo teste de e-mails está ativo, mas sem destinatários. Configure em Admin › Programação › Configurar e-mails.");
  return c;
}

async function gravarConfigEmail(sr, campos) {
  const [c] = await sr.ConfiguracaoEmail.list();
  if (c) await sr.ConfiguracaoEmail.update(c.id, campos); else await sr.ConfiguracaoEmail.create(campos);
}

// Salva o modelo de um tipo de e-mail. Campos vazios = padrão; restaurar = volta tudo ao padrão.
export async function salvarModeloEmail(ctx, data) {
  await admin(ctx);
  const d = z.object({
    tipo: z.enum(["individual", "lote"]),
    Assunto: z.string().max(LIMITES.assunto, `Assunto com mais de ${LIMITES.assunto} caracteres.`).default(""),
    Corpo: z.string().max(LIMITES.corpo, "Corpo do e-mail muito grande.").default(""),
    restaurar: z.boolean().default(false),
  }).parse(data);
  const suf = SUFIXO[d.tipo];
  const campos = d.restaurar
    ? { [`Assunto${suf}`]: "", [`Corpo${suf}`]: "" }
    : { [`Assunto${suf}`]: d.Assunto.replace(/[\r\n]+/g, " ").trim(), [`Corpo${suf}`]: d.Corpo.trim() };
  // corpo igual ao padrão não precisa ser guardado (assim futuras melhorias do padrão continuam valendo)
  if (campos[`Corpo${suf}`] && campos[`Corpo${suf}`] === modeloPadrao("PlanoDeAcao").trim()) campos[`Corpo${suf}`] = "";
  if (campos[`Assunto${suf}`] === ASSUNTO_PADRAO) campos[`Assunto${suf}`] = "";
  await gravarConfigEmail(ctx.sr, campos);
  registrarAtividade(ctx, {
    aplicacao: APP, acao: `${d.restaurar ? "Restaurar padrão do" : "Editar"} ${TIPOS_MODELO[d.tipo].rotulo.toLowerCase()}`, funcao: "admin.salvarModeloEmail",
    modelo: { tipo: d.tipo, Assunto: campos[`Assunto${suf}`], CorpoTamanho: campos[`Corpo${suf}`].length },
  });
  return { ...(await configEmail(ctx.sr)), avisos: variaveisDesconhecidas(d.Assunto, d.Corpo) };
}

export async function obterConfigEmail(ctx) {
  await admin(ctx);
  return configEmail(ctx.sr);
}

export async function salvarConfigEmail(ctx, data) {
  await admin(ctx);
  const d = z.object({ ModoTeste: z.boolean(), DestinatariosTeste: z.array(z.string()).max(50).default([]) }).parse(data);
  const dest = listaEmails(d.DestinatariosTeste.join(";"));
  const invalidos = dest.filter((e) => !emailValido(e));
  if (invalidos.length) falha(`E-mail(s) inválido(s): ${invalidos.join(", ")}`);
  if (d.ModoTeste && !dest.length) falha("Informe ao menos um destinatário para ligar o modo teste.");
  const { sr } = ctx;
  const reg = { ModoTeste: d.ModoTeste, DestinatariosTeste: dest.join(";") };
  await gravarConfigEmail(sr, reg);
  registrarAtividade(ctx, { aplicacao: APP, acao: `Modo teste de e-mails ${d.ModoTeste ? "LIGADO" : "desligado"}`, funcao: "admin.salvarConfigEmail", modelo: reg });
  return configEmail(sr);
}

// Envia o e-mail de uma inspeção. Nunca lança erro: devolve a situação para o lote continuar.
// Como no Base44 (SendEmail aceita um endereço por chamada), envia UM e-mail por destinatário.
//   situacao: "enviado" (ao menos um destinatário recebeu) | "sem-vinculo" | "falha" (nenhum recebeu: erro do servidor de e-mail)
//             | "nao-configurado" (sem SMTP: só gravado em outbox)
// Só "enviado" marca a inspeção como e-mail enviado (Disparado). Cada destinatário com falha fica registrado no Log.
// tipo: "individual" (tela Inspeções) | "lote" (Disparos) — escolhe o modelo do e-mail.
async function enviarEmailPA(ctx, insp, origem, cfg, tipo) {
  const { sr } = ctx;
  const base = { inspecaoId: insp.id, programa: insp.TipoDeFormulario, unidade: insp.Unidade, area: insp.Area, data: insp.Data };
  const destinatarios = [...new Set((await sr.Vinculo.filter({ UnidadeAreaProcessoId: insp.UnidadeAreaProcessoId, Programa: insp.TipoDeFormulario })).map((v) => String(v.Email || "").trim().toLowerCase()).filter(Boolean))];
  if (!destinatarios.length) return { ...base, enviado: false, situacao: "sem-vinculo", motivo: "Área sem vínculo" };
  let assunto, html;
  try {
    ({ assunto, corpo: html } = montarEmail(cfg.modelos[tipo], cfg.padrao, variaveisEmailPA(insp)));
  } catch (e) {
    const motivo = `Erro ao montar o e-mail: ${e?.message || e}`;
    registrarAtividade(ctx, { aplicacao: APP, acao: `Falha no envio de e-mail de PA (${origem})`, funcao: "admin.enviarEmailPA", status: false, descricao: motivo.slice(0, 500), modelo: { ...base, destinatarios } });
    return { ...base, enviado: false, situacao: "falha", motivo, destinatarios };
  }
  // modo teste: os e-mails vão só para os destinatários de teste (o corpo mostra para quem iria de verdade)
  const teste = cfg?.ModoTeste ? cfg.DestinatariosTeste : null;
  const msg = teste ? marcarTeste(assunto, html, destinatarios) : { subject: assunto, html };
  const enviadoPara = [], falhasDestinatarios = [];
  let semSmtp = false;
  for (const to of teste || destinatarios) {
    try {
      const r = await sendEmail({ to, ...msg }); // no Base44: sr.integrations.Core.SendEmail({ to, subject, html })
      if (r.sent) enviadoPara.push(to); else semSmtp = true;
    } catch (e) {
      const motivo = e?.message || String(e);
      falhasDestinatarios.push({ email: to, motivo });
      registrarAtividade(ctx, { aplicacao: APP, acao: `Falha no envio de e-mail de PA (${origem})`, funcao: "admin.enviarEmailPA", status: false, descricao: `${to}: ${motivo}`.slice(0, 500), modelo: { ...base, destinatario: to } });
    }
  }
  const extra = { destinatarios, teste: !!teste, enviadoPara, falhasDestinatarios, assunto };
  if (enviadoPara.length) {
    // no modo teste os responsáveis não receberam: não marca a inspeção como "e-mail enviado"
    if (!teste) await sr.Inspecao.update(insp.id, { Disparado: true, DataDisparo: new Date().toISOString() });
    return { ...base, ...extra, enviado: true, situacao: "enviado" };
  }
  if (falhasDestinatarios.length) return { ...base, ...extra, enviado: false, situacao: "falha", motivo: falhasDestinatarios.map((f) => `${f.email}: ${f.motivo}`).join(" | ") };
  if (semSmtp) return { ...base, ...extra, enviado: false, situacao: "nao-configurado", motivo: "Servidor de e-mail (SMTP) não configurado — mensagem gravada em server/data/outbox" };
  return { ...base, ...extra, enviado: false, situacao: "falha", motivo: "Nenhum destinatário" };
}

// Resumo de um lote de envios (Disparos SOL/GRD)
function resumoLote(resultados, cfg) {
  const n = (s) => resultados.filter((r) => r.situacao === s).length;
  return {
    modoTeste: !!cfg?.ModoTeste, destinatariosTeste: cfg?.ModoTeste ? cfg.DestinatariosTeste : [],
    total: resultados.length, enviados: n("enviado"), semVinculo: n("sem-vinculo"), falhas: n("falha"), naoConfigurado: n("nao-configurado"),
    // enviados em que algum destinatário falhou (os demais receberam)
    parciais: resultados.filter((r) => r.situacao === "enviado" && r.falhasDestinatarios?.length).length,
    erros: resultados.filter((r) => r.situacao === "falha").map(({ inspecaoId, unidade, area, data, motivo }) => ({ inspecaoId, unidade, area, data, motivo })),
    destinatariosComFalha: resultados.flatMap((r) => (r.falhasDestinatarios || []).map((f) => ({ inspecaoId: r.inspecaoId, unidade: r.unidade, area: r.area, ...f }))),
    resultados,
  };
}

// Valores das variáveis {{...}} dos modelos (lista e descrição em VARIAVEIS_EMAIL, src/lib/emailModelo.js)
function variaveisEmailPA(insp) {
  const info = PROGRAMA_INFO[insp.TipoDeFormulario];
  return {
    programa: insp.TipoDeFormulario, titulo_programa: info.tituloLongo.replace("Avaliação", "Inspeção"), programa_descricao: info.programa, tipo_texto: info.tipoTexto,
    unidade: insp.Unidade, area: insp.Area, processo: insp.Processo, data: fmtData(insp.Data),
    resultado: resultadoTexto(insp), nao_conformes: itensNaoConformes(insp.TipoDeFormulario, insp.Checklist).length,
    id_inspecao: insp.id, contato: EMAIL_CONTATO,
  };
}

// Ordem dos envios num lote: data da inspeção e, no mesmo dia, ordem de criação (resultado previsível)
const porDataCriacao = (a, b) => String(a.Data).localeCompare(String(b.Data)) || String(a.created_date).localeCompare(String(b.created_date));

// EnviarPAporAreaSelecionada
export async function enviarPAInspecao(ctx, data) {
  await admin(ctx);
  const { id: inspId } = z.object({ id }).parse(data);
  const insp = await ctx.sr.Inspecao.get(inspId);
  const cfg = await configParaEnvio(ctx.sr);
  const r = await enviarEmailPA(ctx, insp, "área selecionada", cfg, "individual");
  if (r.situacao === "sem-vinculo") falha("Área sem vínculo!");
  if (r.situacao === "falha") falha(`Falha ao enviar o e-mail: ${r.motivo}`); // já registrada no Log
  const parcial = r.falhasDestinatarios?.length ? `Não receberam: ${r.falhasDestinatarios.map((f) => f.email).join(", ")}` : undefined;
  registrarAtividade(ctx, { aplicacao: APP, acao: "Enviar plano de ação (área selecionada)", funcao: "admin.enviarPAInspecao", modelo: r, status: r.enviado && !parcial, descricao: r.enviado ? parcial : r.motivo });
  return r;
}

export async function areasSemResponsaveis(ctx, data) {
  await admin(ctx);
  const d = z.object({ programa: Programa, unidade: z.string().optional().nullable() }).parse(data);
  return semResp(ctx.sr, d.programa, d.unidade || null);
}

// EnviarPAPorUnidadeMesAno / EnviarPAporMesAno (Disparos SOL)
export async function dispararSol(ctx, data) {
  await admin(ctx);
  const d = z.object({ mes: z.coerce.number().int().min(1).max(12), ano: z.coerce.number().int(), unidade: z.string().optional().nullable(), forcar: z.boolean().default(false) }).parse(data);
  const { sr } = ctx;
  if (d.unidade && !d.forcar) {
    const pend = await semResp(sr, "SOL", d.unidade);
    if (pend.length) return { pendencias: pend };
  }
  const prefixo = `${d.ano}-${String(d.mes).padStart(2, "0")}`;
  const insps = (await sr.Inspecao.filter({ TipoDeFormulario: "SOL", EmAberto: { $ne: true }, Inativado: { $ne: true } }))
    .filter((i) => String(i.Data).startsWith(prefixo) && (!d.unidade || i.Unidade === d.unidade));
  const resultados = [];
  const cfg = await configParaEnvio(sr);
  for (const i of [...insps].sort(porDataCriacao)) resultados.push(await enviarEmailPA(ctx, i, "Disparo SOL", cfg, "lote"));
  return registrarLote(ctx, "Disparo SOL", "admin.dispararSol", d, resultados, cfg);
}

// EnviarPAporTipoAno (Disparos GRD) — avaliações dentro da janela do agendamento do tipo/ano
export async function dispararGrd(ctx, data) {
  await admin(ctx);
  const d = z.object({ ano: z.coerce.number().int(), tipoDeInspecaoId: id, forcar: z.boolean().default(false) }).parse(data);
  const { sr } = ctx;
  if (!d.forcar) {
    const pend = await semResp(sr, "GRD");
    if (pend.length) return { pendencias: pend };
  }
  const [ag] = await sr.Agendamento.filter({ TipoDeInspecaoId: d.tipoDeInspecaoId, Ano: d.ano });
  if (!ag) falha("Não há agendamento para o tipo e ano selecionados.");
  const insps = (await sr.Inspecao.filter({ TipoDeFormulario: "GRD", EmAberto: { $ne: true }, Inativado: { $ne: true } }))
    .filter((i) => i.Data >= ag.InspecaoDtInicial && i.Data <= ag.InspecaoDtFinal);
  const resultados = [];
  const cfg = await configParaEnvio(sr);
  for (const i of [...insps].sort(porDataCriacao)) resultados.push(await enviarEmailPA(ctx, i, "Disparo GRD", cfg, "lote"));
  return registrarLote(ctx, "Disparo GRD", "admin.dispararGrd", d, resultados, cfg);
}

function registrarLote(ctx, acao, funcao, filtros, resultados, cfg) {
  const r = resumoLote(resultados, cfg);
  const ok = r.falhas === 0 && r.naoConfigurado === 0 && r.parciais === 0;
  registrarAtividade(ctx, {
    aplicacao: APP, acao: r.modoTeste ? `${acao} (MODO TESTE → ${r.destinatariosTeste.join("; ")})` : acao, funcao, status: ok,
    descricao: `${r.enviados} de ${r.total} enviado(s)` + (r.falhas ? ` · ${r.falhas} falha(s)` : "") + (r.parciais ? ` · ${r.parciais} com destinatário(s) que não receberam` : "") + (r.semVinculo ? ` · ${r.semVinculo} sem vínculo` : "") + (r.naoConfigurado ? ` · ${r.naoConfigurado} não enviado(s): SMTP não configurado` : ""),
    modelo: { ...filtros, total: r.total, enviados: r.enviados, falhas: r.falhas, parciais: r.parciais, semVinculo: r.semVinculo, naoConfigurado: r.naoConfigurado, erros: r.erros, destinatariosComFalha: r.destinatariosComFalha },
  });
  return r;
}

// ---------- Cadastros (Patch/Remove das telas de cadastro) ----------
const CADASTROS = {
  Unidade: { unico: ["Nome", "Sigla"], rotulo: "Unidade", usadoEm: [["UnidadeAreaProcesso", "UnidadeId"]] },
  Area: { unico: ["Nome", "Sigla"], rotulo: "Área", usadoEm: [["UnidadeAreaProcesso", "AreaId"]] },
  Processo: { unico: "Nome", rotulo: "Processo", usadoEm: [["UnidadeAreaProcesso", "ProcessoId"]] },
  Inspetor: { unico: "Email", rotulo: "Inspetor(a)", conta: true },
  Auditor: { unico: "Email", rotulo: "Auditor(a)", conta: true },
  Responsavel: { unico: "Email", rotulo: "Responsável", pessoa: true, conta: true },
  Facilitador: { unico: "Email", rotulo: "Facilitador(a)", pessoa: true, conta: true },
  Gestor: { unico: "Email", rotulo: "Gestor(a)", pessoa: true, conta: true },
  Lider: { unico: "Email", rotulo: "Líder", pessoa: true, conta: true },
  ResponsavelSgi: { unico: "Email", rotulo: "Responsável SGI", pessoa: true, conta: true },
  TipoDeInspecao: { rotulo: "Tipo de inspeção", usadoEm: [["Agendamento", "TipoDeInspecaoId"]] },
  ItemSol: { rotulo: "Item SOL" },
  Pilar: { rotulo: "Pilar", usadoEm: [["ItemGrd", "PilarId"]] },
  ItemGrd: { rotulo: "Item GRD" },
  ItemSgi: { rotulo: "Questão SGI" },
};

// Garante que pessoas cadastradas tenham conta de acesso (no Base44: convite de usuário pelo e-mail).
function garantirConta(email, nome) {
  if (!email || findUser(email)) return;
  store.insert("User", { email: email.toLowerCase(), full_name: nome || email, role: "user" });
}

// Grava um registro de cadastro (usado pelo formulário e pela importação por Excel). Quem chama já validou o admin.
async function gravarCadastro(ctx, entidade, id, dadosBrutos) {
  const cfg = CADASTROS[entidade];
  const { sr } = ctx;
  const dados = Object.fromEntries(Object.entries(dadosBrutos).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
  if (dados.Email) dados.Email = dados.Email.toLowerCase();
  // cada campo de "unico" não pode se repetir (comparação sem diferenciar maiúsculas/espaços)
  const DESCR = { Email: "este e-mail", Sigla: "esta sigla", Nome: "este nome" };
  for (const campo of [].concat(cfg.unico || [])) {
    if (!dados[campo]) continue;
    const dup = (await sr[entidade].filter({ [campo]: dados[campo] })).find((r) => r.id !== id);
    if (dup) falha(`Já existe ${cfg.rotulo.toLowerCase()} com ${DESCR[campo] || `este(a) ${campo.toLowerCase()}`} (${dados[campo]}).`);
  }
  const salvo = id ? await sr[entidade].update(id, dados) : await sr[entidade].create(dados);
  // mantém as cópias denormalizadas em Vinculo
  if (cfg.pessoa && id) {
    for (const v of await sr.Vinculo.filter({ PessoaId: id })) await sr.Vinculo.update(v.id, { Nome: salvo.Nome, Email: salvo.Email, Cargo: salvo.Cargo || "" });
  }
  if (cfg.conta) garantirConta(salvo.Email, salvo.Nome);
  return salvo;
}

export async function salvarCadastro(ctx, data) {
  await admin(ctx);
  const d = z.object({ entidade: z.enum(Object.keys(CADASTROS)), id: z.string().optional().nullable(), dados: z.record(z.any()) }).parse(data);
  const salvo = await gravarCadastro(ctx, d.entidade, d.id || null, d.dados);
  registrarAtividade(ctx, { aplicacao: APP, acao: `${d.id ? "Editar" : "Inserir"} ${CADASTROS[d.entidade].rotulo}`, funcao: "admin.salvarCadastro", modelo: { entidade: d.entidade, ...salvo } });
  return salvo;
}

// Importação em massa por Excel: cada linha é gravada separadamente; erros não interrompem as demais.
export async function importarCadastro(ctx, data) {
  await admin(ctx);
  const d = z.object({
    entidade: z.enum(Object.keys(CADASTROS)),
    linhas: z.array(z.object({ linha: z.number().int(), id: z.string().max(100).optional().nullable(), dados: z.record(z.any()) })).max(5000),
  }).parse(data);
  const res = { criados: 0, atualizados: 0, erros: [] };
  for (const l of d.linhas) {
    try {
      await gravarCadastro(ctx, d.entidade, l.id || null, l.dados);
      if (l.id) res.atualizados++;
      else res.criados++;
    } catch (e) {
      res.erros.push({ linha: l.linha, mensagem: e.message });
    }
  }
  registrarAtividade(ctx, {
    aplicacao: APP, acao: `Importar ${CADASTROS[d.entidade].rotulo} (Excel)`, funcao: "admin.importarCadastro",
    modelo: { entidade: d.entidade, linhas: d.linhas.length, ...res }, status: res.erros.length === 0, descricao: `${res.criados} criados, ${res.atualizados} atualizados, ${res.erros.length} erros`,
  });
  return res;
}

export async function removerCadastro(ctx, data) {
  await admin(ctx);
  const d = z.object({ entidade: z.enum(Object.keys(CADASTROS)), id }).parse(data);
  const cfg = CADASTROS[d.entidade];
  const { sr } = ctx;
  for (const [ent, campo] of cfg.usadoEm || []) {
    const n = (await sr[ent].filter({ [campo]: d.id })).length;
    if (n) falha(`${cfg.rotulo} em uso (${n} registro(s) em ${ent}). Remova os vínculos antes.`);
  }
  const reg = await sr[d.entidade].get(d.id);
  if (cfg.pessoa) await sr.Vinculo.deleteMany({ PessoaId: d.id });
  await sr[d.entidade].delete(d.id);
  registrarAtividade(ctx, { aplicacao: APP, acao: `Remover ${cfg.rotulo}`, funcao: "admin.removerCadastro", modelo: { entidade: d.entidade, ...reg } });
  return { ok: true };
}

// ---------- Vínculos ----------
export async function dadosVinculos(ctx) {
  await admin(ctx);
  const { sr } = ctx;
  const [unidades, areas, processos, locais, vinculos, responsaveis, facilitadores, gestores, lideres, responsaveisSgi] = await Promise.all([
    sr.Unidade.list(), sr.Area.list(), sr.Processo.list(), unidadeAreaProcessoView(sr), sr.Vinculo.list(),
    sr.Responsavel.list(), sr.Facilitador.list(), sr.Gestor.list(), sr.Lider.list(), sr.ResponsavelSgi.list(),
  ]);
  return {
    unidades: sortPt(unidades, "Nome"), areas: sortPt(areas, "Nome"), processos: sortPt(processos, "Nome"), locais, vinculos,
    pessoas: {
      "Responsável": sortPt(responsaveis, "Nome"), Facilitador: sortPt(facilitadores, "Nome"), Gestor: sortPt(gestores, "Nome"),
      "Líder": sortPt(lideres, "Nome"), "Responsável SGI": sortPt(responsaveisSgi, "Nome"),
    },
  };
}

export async function vincularLocal(ctx, data) {
  await admin(ctx);
  const d = z.object({ unidadeId: id, areaId: id, processoId: id }).parse(data);
  const { sr } = ctx;
  const dup = await sr.UnidadeAreaProcesso.filter({ UnidadeId: d.unidadeId, AreaId: d.areaId });
  if (dup.length) falha("Esta área já está vinculada à unidade.");
  const r = await sr.UnidadeAreaProcesso.create({ UnidadeId: d.unidadeId, AreaId: d.areaId, ProcessoId: d.processoId });
  registrarAtividade(ctx, { aplicacao: APP, acao: "Vincular Unidade-Área-Processo", funcao: "admin.vincularLocal", modelo: r });
  return r;
}

export async function desvincularLocal(ctx, data) {
  await admin(ctx);
  const { uapId } = z.object({ uapId: id }).parse(data);
  const { sr } = ctx;
  await sr.Vinculo.deleteMany({ UnidadeAreaProcessoId: uapId });
  await sr.UnidadeAreaProcesso.delete(uapId);
  registrarAtividade(ctx, { aplicacao: APP, acao: "Desvincular área da unidade", funcao: "admin.desvincularLocal", modelo: { uapId } });
  return { ok: true };
}

const ENTIDADE_DO_PAPEL = { "Responsável": "Responsavel", Facilitador: "Facilitador", Gestor: "Gestor", "Líder": "Lider", "Responsável SGI": "ResponsavelSgi" };

export async function vincularPessoa(ctx, data) {
  await admin(ctx);
  const d = z.object({ uapId: id, papel: z.enum(Object.keys(ENTIDADE_DO_PAPEL)), pessoaId: id }).parse(data);
  const programa = Object.entries(PAPEIS).find(([, papeis]) => papeis.includes(d.papel))[0];
  const { sr } = ctx;
  const pessoa = await sr[ENTIDADE_DO_PAPEL[d.papel]].get(d.pessoaId);
  const dup = await sr.Vinculo.filter({ UnidadeAreaProcessoId: d.uapId, Papel: d.papel, PessoaId: d.pessoaId });
  if (dup.length) falha(`${pessoa.Nome} já está vinculado(a) a esta área como ${d.papel}.`);
  const r = await sr.Vinculo.create({ UnidadeAreaProcessoId: d.uapId, Programa: programa, Papel: d.papel, PessoaId: pessoa.id, Nome: pessoa.Nome, Email: pessoa.Email, Cargo: pessoa.Cargo || "" });
  registrarAtividade(ctx, { aplicacao: APP, acao: `Vincular ${d.papel}`, funcao: "admin.vincularPessoa", modelo: r });
  return r;
}

export async function desvincularPessoa(ctx, data) {
  await admin(ctx);
  const { vinculoId } = z.object({ vinculoId: id }).parse(data);
  const v = await ctx.sr.Vinculo.get(vinculoId);
  await ctx.sr.Vinculo.delete(vinculoId);
  registrarAtividade(ctx, { aplicacao: APP, acao: `Desvincular ${v.Papel}`, funcao: "admin.desvincularPessoa", modelo: v });
  return { ok: true };
}

// Importação de vínculos por Excel. Cada linha: Unidade, Área, Processo e (opcional) Papel + E-mail da pessoa.
// Cria o vínculo Unidade×Área (ou ajusta o processo) e vincula a pessoa já cadastrada. Não remove vínculos.
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export async function importarVinculos(ctx, data) {
  await admin(ctx);
  const txt = z.string().max(300).optional().nullable().transform((v) => (v ?? "").trim());
  const d = z.object({
    linhas: z.array(z.object({ linha: z.number().int(), Unidade: txt, Area: txt, Processo: txt, Papel: txt, Email: txt })).max(5000),
  }).parse(data);
  const { sr } = ctx;
  const [unidades, areas, processos] = await Promise.all([sr.Unidade.list(), sr.Area.list(), sr.Processo.list()]);
  const acha = (lista, v) => lista.find((x) => norm(x.Nome) === norm(v) || (x.Sigla && norm(x.Sigla) === norm(v)));
  const papeis = Object.keys(ENTIDADE_DO_PAPEL);
  const pessoasCache = {};
  const res = { locaisCriados: 0, processosAjustados: 0, vinculosCriados: 0, jaExistiam: 0, erros: [] };
  for (const l of d.linhas) {
    try {
      const u = acha(unidades, l.Unidade), a = acha(areas, l.Area), p = acha(processos, l.Processo);
      const faltas = [!u && `Unidade "${l.Unidade}"`, !a && `Área "${l.Area}"`, !p && `Processo "${l.Processo}"`].filter(Boolean);
      if (faltas.length) falha(`${faltas.join(", ")} não encontrado(a) — cadastre antes.`);
      let [uap] = await sr.UnidadeAreaProcesso.filter({ UnidadeId: u.id, AreaId: a.id });
      if (!uap) {
        uap = await sr.UnidadeAreaProcesso.create({ UnidadeId: u.id, AreaId: a.id, ProcessoId: p.id });
        res.locaisCriados++;
      } else if (uap.ProcessoId !== p.id) {
        uap = await sr.UnidadeAreaProcesso.update(uap.id, { ProcessoId: p.id });
        res.processosAjustados++;
      }
      if (!l.Papel && !l.Email) continue;
      const papel = papeis.find((x) => norm(x) === norm(l.Papel));
      if (!papel) falha(`Papel "${l.Papel}" inválido (use ${papeis.join(", ")}).`);
      if (!l.Email) falha("Informe o e-mail da pessoa.");
      const ent = ENTIDADE_DO_PAPEL[papel];
      pessoasCache[ent] ||= await sr[ent].list();
      const pessoa = pessoasCache[ent].find((x) => norm(x.Email) === norm(l.Email));
      if (!pessoa) falha(`${l.Email} não está cadastrado(a) como ${papel} — cadastre (ou importe) a pessoa antes.`);
      const dup = await sr.Vinculo.filter({ UnidadeAreaProcessoId: uap.id, Papel: papel, PessoaId: pessoa.id });
      if (dup.length) { res.jaExistiam++; continue; }
      const programa = Object.entries(PAPEIS).find(([, ps]) => ps.includes(papel))[0];
      await sr.Vinculo.create({ UnidadeAreaProcessoId: uap.id, Programa: programa, Papel: papel, PessoaId: pessoa.id, Nome: pessoa.Nome, Email: pessoa.Email, Cargo: pessoa.Cargo || "" });
      res.vinculosCriados++;
    } catch (e) {
      res.erros.push({ linha: l.linha, mensagem: e.message });
    }
  }
  registrarAtividade(ctx, {
    aplicacao: APP, acao: "Importar vínculos (Excel)", funcao: "admin.importarVinculos", modelo: { linhas: d.linhas.length, ...res }, status: res.erros.length === 0,
    descricao: `${res.locaisCriados} locais, ${res.vinculosCriados} vínculos criados, ${res.erros.length} erros`,
  });
  return res;
}

// ---------- Agendamento ----------
export async function listarAgendamentos(ctx) {
  await admin(ctx);
  const { sr } = ctx;
  const [tipos, ags] = await Promise.all([sr.TipoDeInspecao.list(), sr.Agendamento.list()]);
  return { tipos: sortPt(tipos, "Tipo"), agendamentos: ags };
}

export async function salvarAgendamento(ctx, data) {
  await admin(ctx);
  const d = z.object({
    tipoDeInspecaoId: id, ano: z.coerce.number().int(), etapa: z.enum(["Inspeção", "Preenchimento do PA"]),
    dtInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dtFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(data);
  if (d.dtFinal < d.dtInicial) falha("A data final deve ser posterior à data inicial.");
  const { sr } = ctx;
  const [ag] = await sr.Agendamento.filter({ TipoDeInspecaoId: d.tipoDeInspecaoId, Ano: d.ano });
  let r;
  if (d.etapa === "Inspeção") {
    const patch = { InspecaoDtInicial: d.dtInicial, InspecaoDtFinal: d.dtFinal, Ano: Number(d.dtInicial.slice(0, 4)) };
    r = ag ? await sr.Agendamento.update(ag.id, patch) : await sr.Agendamento.create({ TipoDeInspecaoId: d.tipoDeInspecaoId, ...patch });
  } else {
    if (!ag) falha("Cadastre primeiro o período de inspeção deste tipo/ano.");
    r = await sr.Agendamento.update(ag.id, { PaDtInicial: d.dtInicial, PaDtFinal: d.dtFinal });
  }
  registrarAtividade(ctx, { aplicacao: APP, acao: `Agendamento - ${d.etapa}`, funcao: "admin.salvarAgendamento", modelo: r });
  return r;
}

export async function limparAgendamento(ctx, data) {
  await admin(ctx);
  const d = z.object({ tipoDeInspecaoId: id, ano: z.coerce.number().int(), etapa: z.enum(["Inspeção", "Preenchimento do PA"]) }).parse(data);
  const { sr } = ctx;
  const [ag] = await sr.Agendamento.filter({ TipoDeInspecaoId: d.tipoDeInspecaoId, Ano: d.ano });
  if (!ag) return { ok: true };
  if (d.etapa === "Inspeção") await sr.Agendamento.delete(ag.id);
  else await sr.Agendamento.update(ag.id, { PaDtInicial: null, PaDtFinal: null });
  registrarAtividade(ctx, { aplicacao: APP, acao: `Remover agendamento - ${d.etapa}`, funcao: "admin.limparAgendamento", modelo: ag });
  return { ok: true };
}

// ---------- Planilha (substitui PreencherPlanilhaSol / GRD_PreencherPlanilha — Office Scripts) ----------
export async function exportarPlanilha(ctx, data) {
  await admin(ctx);
  const d = z.object({ programa: z.enum(["SOL", "GRD"]), ano: z.coerce.number().int().optional().nullable(), mes: z.coerce.number().int().optional().nullable() }).parse(data);
  const { sr } = ctx;
  const insps = (await sr.Inspecao.filter({ TipoDeFormulario: d.programa, EmAberto: { $ne: true }, Inativado: { $ne: true } }, "Data"))
    .filter((i) => (!d.ano || i.Data.startsWith(String(d.ano))) && (!d.mes || Number(i.Data.slice(5, 7)) === d.mes));
  const pctTxt = (v) => (v == null ? "" : `${String(v).replace(".", ",")}%`);
  if (d.programa === "SOL") {
    const subcats = (i, cats) => [...new Set(i.Checklist.filter((c) => c.Resposta === "Não" && cats.includes(c.Categoria) && c.Subcategoria).map((c) => c.Subcategoria))].join(" / ");
    return {
      colunas: ["Data", "Processo", "Área", "Unidade", "Pontuação", "Empresa", "Colaboradores", "Itens Colaboradores", "Itens Empresa", "Comentário"],
      linhas: insps.map((i) => [fmtData(i.Data), i.Processo, i.AreaSigla, i.UnidadeSigla, pctTxt(i.ScoreTotal), pctTxt(i.ScoreEmpresa), pctTxt(i.ScoreColaborador),
        subcats(i, ["C", "C/S"]), subcats(i, ["E", "S"]), i.Observacao === "Sem Observações" ? "" : i.Observacao]),
    };
  }
  const { colunas: colPilares, valores } = pilaresDaPlanilha(insps, await sr.Pilar.list());
  return {
    colunas: ["Data", "Processo", "Unidade", "Área", "Avaliação", ...colPilares, "Atendimento"],
    linhas: insps.map((i) => [
      fmtData(i.Data), i.Processo, i.UnidadeSigla, i.AreaSigla, i.TipoDeInspecao,
      ...valores(i).map(pctTxt),
      i.Atendimento == null ? "" : `${Math.trunc(i.Atendimento)}%`,
    ]),
  };
}


// ---------- Usuários (no Base44: gerenciado pela plataforma — convites e papéis admin/user) ----------
export async function listarUsuarios(ctx) {
  await admin(ctx);
  return sortPt(store.all("User"), "email").map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, created_date: u.created_date }));
}

const usuarioSchema = z.object({ id: z.string().optional().nullable(), email: z.string().email(), full_name: z.string().max(200).default(""), role: z.enum(["admin", "user"]) });

// Regras comuns ao cadastro manual e à importação por Excel
function gravarUsuario(adminLogado, d) {
  const email = d.email.toLowerCase();
  const dup = findUser(email);
  if (dup && dup.id !== d.id) falha("Já existe um usuário com este e-mail.");
  if (d.id && d.id === store.all("User").find((u) => u.email === adminLogado.email)?.id && d.role !== "admin") falha("Você não pode remover seu próprio perfil de administrador.");
  return d.id ? store.update("User", d.id, { email, full_name: d.full_name, role: d.role }) : store.insert("User", { email, full_name: d.full_name, role: d.role }, adminLogado.email);
}

export async function salvarUsuario(ctx, data) {
  const a = await admin(ctx);
  const d = usuarioSchema.parse(data);
  const u = gravarUsuario(a, d);
  registrarAtividade(ctx, { aplicacao: APP, acao: `${d.id ? "Editar" : "Inserir"} usuário`, funcao: "admin.salvarUsuario", modelo: { email: d.email.toLowerCase(), role: d.role } });
  return { id: u.id };
}

// Importação por Excel: identifica o usuário pelo e-mail (existe → atualiza; senão → cria).
// Nome ou Perfil em branco mantêm o valor atual (usuário novo sem perfil = "user").
export async function importarUsuarios(ctx, data) {
  const a = await admin(ctx);
  const d = z.object({
    linhas: z.array(z.object({
      linha: z.number().int(),
      email: z.string().max(200),
      full_name: z.string().max(200).optional().nullable(),
      role: z.enum(["admin", "user"]).optional().nullable(),
    })).max(5000),
  }).parse(data);
  const res = { criados: 0, atualizados: 0, erros: [] };
  for (const l of d.linhas) {
    try {
      const email = l.email.trim().toLowerCase();
      if (!z.string().email().safeParse(email).success) falha(`E-mail inválido: "${l.email}"`);
      const atual = findUser(email);
      gravarUsuario(a, usuarioSchema.parse({
        id: atual?.id || null,
        email,
        full_name: l.full_name?.trim() || atual?.full_name || "",
        role: l.role || atual?.role || "user",
      }));
      if (atual) res.atualizados++;
      else res.criados++;
    } catch (e) {
      res.erros.push({ linha: l.linha, mensagem: e.issues ? e.issues.map((i) => i.message).join("; ") : e.message });
    }
  }
  registrarAtividade(ctx, {
    aplicacao: APP, acao: "Importar usuários (Excel)", funcao: "admin.importarUsuarios",
    modelo: { linhas: d.linhas.length, ...res }, status: res.erros.length === 0, descricao: `${res.criados} criados, ${res.atualizados} atualizados, ${res.erros.length} erros`,
  });
  return res;
}

export async function removerUsuario(ctx, data) {
  const a = await admin(ctx);
  const { id: uid } = z.object({ id }).parse(data);
  const u = store.get("User", uid);
  if (!u) return { ok: true };
  if (u.email === a.email) falha("Você não pode remover o seu próprio usuário.");
  store.remove("User", uid);
  registrarAtividade(ctx, { aplicacao: APP, acao: "Remover usuário", funcao: "admin.removerUsuario", modelo: { email: u.email } });
  return { ok: true };
}

export { byId };
