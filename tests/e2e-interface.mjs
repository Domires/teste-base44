// TESTE COMPLETO DE PONTA A PONTA — usa a aplicação pela interface (cliques reais, digitação, upload, assinatura).
// Uso: node completo.mjs <URL> <pasta-saida> <DATA_DIR do servidor> <pasta do projeto>
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const [B, OUT, DATA_DIR, PROJ] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const { calcularSol, calcularGrd } = await import(pathToFileURL(path.join(PROJ, "src/lib/scores.js")).href);

// ---------- imagem PNG de teste (foto de evidência) ----------
function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = (rgb[1] + y) % 256; raw[o + 2] = rgb[2]; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const FOTO = path.join(OUT, "foto-teste.png");
const ANEXO = path.join(OUT, "Relatório de calibração.xlsx"); // arquivo que não é imagem (evidência SGI)
writeFileSync(FOTO, png(320, 240, [220, 60, 30]));
const DOWN = path.join(OUT, "downloads");
mkdirSync(DOWN, { recursive: true });

// ---------- infraestrutura ----------
const res = { ok: 0, falhas: [] };
let passo = "";
const browser = await puppeteer.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, args: ["--no-sandbox"] });
const p = await browser.newPage();
await p.setViewport({ width: 1366, height: 900 });
const cdp = await p.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWN });
const errosConsole = [];
const httpErros = [];
let esperado = false;
p.on("pageerror", (e) => errosConsole.push(`[${passo}] ${e.message}`));
p.on("console", async (m) => {
  if (m.type() !== "error" || /status of 4\d\d/.test(m.text())) return;
  const det = await Promise.all(m.args().map((a) => a.evaluate((v) => (v instanceof Error ? `${v.message} @ ${(v.stack || "").split("\n").slice(0, 4).join(" | ")}` : String(v))).catch(() => "?")));
  errosConsole.push(`[${passo}] ${det.join(" ")}`);
});
p.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/") && !esperado) httpErros.push(`[${passo}] ${r.status()} ${r.url()}`); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(cond, msg) {
  if (cond) { res.ok++; console.log(`   ✔ ${msg}`); }
  else { res.falhas.push(`[${passo}] ${msg}`); console.log(`   ✘ ${msg}`); }
}
async function etapa(nome, fn) {
  passo = nome;
  console.log(`\n▶ ${nome}`);
  try { await fn(); }
  catch (e) {
    res.falhas.push(`[${nome}] EXCEÇÃO: ${e.message.split("\n")[0]}`);
    console.log(`   ✘ EXCEÇÃO: ${e.message.split("\n")[0]}`);
    await p.screenshot({ path: path.join(OUT, `erro-${nome.replace(/[^\w]+/g, "_").slice(0, 50)}.png`) }).catch(() => {});
  }
}

// helpers de página (injetados)
await p.evaluateOnNewDocument(() => {
  const limpa = (s) => (s || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  window.__alvo = (escopo, tipo, rotulo) => {
    const raiz = escopo ? document.querySelector(escopo) : document;
    if (!raiz) return null;
    if (tipo === "campo") {
      const l = [...raiz.querySelectorAll(".field-label")].find((x) => limpa(x.textContent) === rotulo);
      return l ? l.parentElement.querySelector("input:not([type=file]), select, textarea") : null;
    }
    const l = [...raiz.querySelectorAll("label")].find((x) => limpa(x.textContent) === rotulo);
    return l ? l.parentElement.querySelector("input:not([type=file]), select, textarea, button[role=switch]") : null;
  };
  window.__setar = (el, valor) => {
    if (!el) return "sem-elemento";
    if (el.tagName === "SELECT") {
      const opt = [...el.options].find((o) => o.value === valor) || [...el.options].find((o) => o.text.trim() === valor) || [...el.options].find((o) => valor && o.text.includes(valor));
      if (!opt) return "sem-opcao:" + [...el.options].map((o) => o.text).join("|");
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, opt.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    }
    if (el.getAttribute("role") === "switch") {
      if ((el.getAttribute("aria-checked") === "true") !== !!valor) el.click();
      return "ok";
    }
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return "ok";
  };
});

async function preencher(escopo, tipo, valores) {
  for (const [rotulo, valor] of Object.entries(valores)) {
    const r = await p.evaluate((e, t, r, v) => window.__setar(window.__alvo(e, t, r), v), escopo, tipo, rotulo, valor);
    if (r !== "ok") throw new Error(`Campo "${rotulo}": ${r}`);
    await sleep(60);
  }
}
async function clicar(texto, escopo = "body", seletor = "button", { exato = true, ultimo = false } = {}) {
  await fecharToasts();
  const h = await p.evaluateHandle((t, e, s, ex, ul) => {
    const raiz = document.querySelector(e);
    if (!raiz) return null;
    const lista = [...raiz.querySelectorAll(s)].filter((x) => !x.disabled && (ex ? x.innerText.trim() === t : x.innerText.includes(t)));
    return (ul ? lista[lista.length - 1] : lista[0]) || null;
  }, texto, escopo, seletor, exato, ultimo);
  const el = h.asElement();
  if (!el) throw new Error(`Botão "${texto}" não encontrado em ${escopo}`);
  await el.click();
  await sleep(250);
}
async function clicarTitulo(titulo, escopoEl) {
  const btn = escopoEl ? await escopoEl.$(`[title="${titulo}"]`) : await p.$(`[title="${titulo}"]`);
  if (!btn) throw new Error(`Botão [title="${titulo}"] não encontrado`);
  await btn.click();
  await sleep(300);
}
async function esperarTexto(texto, timeout = 10000) {
  await p.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, texto);
}
const temTexto = (t) => p.evaluate((t) => document.body.innerText.includes(t), t);
// Avisos já vistos são apenas marcados (nunca removidos do DOM — o React é dono desses elementos).
async function toasts() {
  return p.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]:not([data-visto])")].map((t) => t.innerText.replace(/\s+/g, " ").trim()));
}
async function esperarToast(trecho, timeout = 10000) {
  try {
    await p.waitForFunction((t) => [...document.querySelectorAll("[data-sonner-toast]:not([data-visto])")].some((x) => x.innerText.includes(t)), { timeout }, trecho);
    return true;
  } catch { return false; }
}
async function fecharToasts() {
  await p.evaluate(() => document.querySelectorAll("[data-sonner-toast]").forEach((t) => t.setAttribute("data-visto", "1"))).catch(() => {});
}
async function ir(url) {
  await fecharToasts();
  await p.goto(B + url, { waitUntil: "networkidle0" });
  await sleep(500);
}
async function comoUsuario(email) {
  await p.goto(B + "/", { waitUntil: "domcontentloaded" });
  await p.evaluate((e) => localStorage.setItem("sol_grd_sgi_dev_user", e), email);
}
async function api(fn, data, email) {
  return p.evaluate(async (fn, data, email) => {
    const r = await fetch(`/api/functions/${fn}`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": email }, body: JSON.stringify(data || {}) });
    return r.json();
  }, fn, data, email);
}
async function dialogo() { await p.waitForSelector('[role="dialog"]', { visible: true, timeout: 8000 }); }
async function semDialogo() { await p.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 8000 }); }
async function shot(nome) { await p.screenshot({ path: path.join(OUT, `${nome}.png`) }); }
const outbox = () => (existsSync(path.join(DATA_DIR, "outbox")) ? readdirSync(path.join(DATA_DIR, "outbox")).map((f) => readFileSync(path.join(DATA_DIR, "outbox", f), "utf8")) : []);

// ---------- dados do cenário ----------
const hoje = new Date();
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const diasA = (n) => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n));
const U = "Unidade Teste E2E", A = "Área Teste E2E", PR = "Processo E2E";
const ADMIN = "admin@sol.local";
const PESSOAS = {
  inspetor: { Nome: "João Inspetor", "E-mail": "joao.inspetor@icl.com" },
  auditor: { Nome: "Fábio Auditor", "E-mail": "fabio.auditor@icl.com", Cargo: "Auditor Líder", Tipo: "Interno" },
  resp: { Nome: "Ana Responsável", "E-mail": "ana.resp@icl.com", Cargo: "Supervisora" },
  fac: { Nome: "Bruno Facilitador", "E-mail": "bruno.fac@icl.com", Cargo: "Técnico" },
  lider: { Nome: "Carla Líder", "E-mail": "carla.lider@icl.com", Cargo: "Líder de Turno" },
  gestor: { Nome: "Diego Gestor", "E-mail": "diego.gestor@icl.com", Cargo: "Gerente" },
  rsgi: { Nome: "Elisa SGI", "E-mail": "elisa.sgi@icl.com", Cargo: "Analista SGI" },
};
const ids = {};

async function cadastrar(entidade, valores, nomeVerif) {
  await ir(`/admin/cadastros/${entidade}`);
  await clicar("Adicionar", "main");
  await dialogo();
  await preencher('[role="dialog"]', "label", valores);
  await clicar("Adicionar", '[role="dialog"]');
  const ok = await esperarToast("Inserido com sucesso");
  await semDialogo().catch(() => {});
  await sleep(400);
  check(ok && (await temTexto(nomeVerif)), `${entidade}: "${nomeVerif}" cadastrado`);
}

// =====================================================================================
await etapa("01 Início, Admin e navegação", async () => {
  await comoUsuario(ADMIN);
  await ir("/");
  check(new URL(p.url()).pathname === "/" && await temTexto("Programa SOL · GRD · SGI"), "o app começa na tela Início");
  check(!(await p.$("header")) && !(await p.$("aside")), "Início sem cabeçalho e sem menu lateral");
  for (const [href, nome] of [["/inspecao", "Inspeção"], ["/plano-acao", "Resultado e Plano de Ação"], ["/admin", "Administração"]]) {
    check(!!(await p.$(`main a[href="${href}"]`)), `cartão "${nome}" no Início do admin`);
  }
  check(!!(await p.$("main select")), 'seletor "Usuário de teste" no Início');
  await clicar("Administração", "main", "a", { exato: false });
  await sleep(800);
  check(new URL(p.url()).pathname === "/admin", "cartão leva à Administração");
  for (const t of ["Inspeções Realizadas", "Inspetores", "Itens", "Unidades", "Planos de Ação Não Iniciados", "Planos de Ação em Andamento", "Planos de Ação Finalizados"]) check(await temTexto(t), `indicador "${t}"`);
  const links = await p.$$eval("aside nav a", (as) => as.map((a) => a.getAttribute("href")));
  check(links.length === 22, `menu lateral da Administração com ${links.length} itens`);
  // navegação pelo menu do Admin e volta ao Início
  await clicar("Unidades", "aside", "a");
  await sleep(800);
  check(p.url().endsWith("/admin/cadastros/Unidade") && await temTexto("Unidades"), "clique no menu lateral navega para a tela");
  await clicar("Início", "aside", "a");
  await sleep(800);
  check(new URL(p.url()).pathname === "/", '"← Início" no menu do Admin volta para a tela Início');
  await ir("/admin");
  check(!links.some((h) => /situacao=/.test(h || "")), "menu sem itens separados de Inativadas / Em Aberto");
  for (const href of links) {
    await ir(href);
    const vazio = await p.evaluate(() => document.querySelector("main")?.innerText.trim().length || 0);
    check(vazio > 20, `página ${href} renderiza`);
  }
  await shot("01-admin-home");
});

await etapa("02 Cadastros - Locais (Unidade, Área, Processo)", async () => {
  await comoUsuario(ADMIN);
  await cadastrar("Unidade", { Nome: U, Sigla: "UTE", Escopo: "Fertilizantes", "E-mail do Gestor Industrial": "gestor.industrial@icl.com" }, U);
  await cadastrar("Area", { Nome: A, Sigla: "ATE" }, A);
  await cadastrar("Processo", { Nome: PR }, PR);
  // validação de sigla duplicada
  await ir("/admin/cadastros/Unidade");
  await clicar("Adicionar", "main"); await dialogo();
  await preencher('[role="dialog"]', "label", { Nome: "Outra", Sigla: "UTE" });
  esperado = true;
  await clicar("Adicionar", '[role="dialog"]');
  check(await esperarToast("Já existe"), "sigla de unidade duplicada é bloqueada");
  esperado = false;
  await clicar("Cancelar", '[role="dialog"]');
  // obrigatórios
  await clicar("Adicionar", "main"); await dialogo();
  await clicar("Adicionar", '[role="dialog"]');
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Campo(s) não preenchido(s)")), "campos obrigatórios validados no formulário");
  await clicar("Cancelar", '[role="dialog"]');
  // edição
  await ir("/admin/cadastros/Unidade");
  const linha = (await p.$$("tbody tr")).find(async () => true);
  const linhas = await p.$$("tbody tr");
  let alvo = null;
  for (const l of linhas) if ((await l.evaluate((x) => x.innerText)).includes(U)) alvo = l;
  await clicarTitulo("Editar", alvo); await dialogo();
  await preencher('[role="dialog"]', "label", { Escopo: "Fertilizantes Especiais" });
  await clicar("Salvar", '[role="dialog"]');
  check(await esperarToast("Atualizado com sucesso"), "edição de unidade salva");
  await sleep(500);
  check(await temTexto("Fertilizantes Especiais"), "valor editado aparece na tabela");
  // pesquisa
  await p.type('input[placeholder="Pesquisar..."]', "E2E");
  await sleep(300);
  check((await p.$$("tbody tr")).length === 1, "pesquisa filtra a tabela");
  // remoção de registro livre
  await cadastrar("Processo", { Nome: "Processo Temporário" }, "Processo Temporário");
  const lp = await p.$$("tbody tr");
  for (const l of lp) if ((await l.evaluate((x) => x.innerText)).includes("Processo Temporário")) { await clicarTitulo("Remover", l); break; }
  await clicar("Remover", '[role="alertdialog"]');
  check(await esperarToast("Removido com sucesso"), "processo removido");
  await sleep(400);
  check(!(await temTexto("Processo Temporário")), "processo some da lista");
});

await etapa("03 Cadastros - Pessoas (Inspetor, Auditor, Responsável, Facilitador, Gestor, Líder, Resp. SGI)", async () => {
  await cadastrar("Inspetor", { ...PESSOAS.inspetor, "Área": A }, PESSOAS.inspetor.Nome);
  await cadastrar("Auditor", PESSOAS.auditor, PESSOAS.auditor.Nome);
  await cadastrar("Responsavel", PESSOAS.resp, PESSOAS.resp.Nome);
  await cadastrar("Facilitador", PESSOAS.fac, PESSOAS.fac.Nome);
  await cadastrar("Gestor", PESSOAS.gestor, PESSOAS.gestor.Nome);
  await cadastrar("Lider", PESSOAS.lider, PESSOAS.lider.Nome);
  await cadastrar("ResponsavelSgi", PESSOAS.rsgi, PESSOAS.rsgi.Nome);
  // e-mail duplicado
  await ir("/admin/cadastros/Responsavel");
  await clicar("Adicionar", "main"); await dialogo();
  await preencher('[role="dialog"]', "label", { Nome: "Duplicado", "E-mail": "ANA.RESP@icl.com", Cargo: "X" });
  esperado = true;
  await clicar("Adicionar", '[role="dialog"]');
  check(await esperarToast("Já existe"), "e-mail duplicado (maiúsculas) é bloqueado");
  esperado = false;
  await clicar("Cancelar", '[role="dialog"]');
  // contas criadas automaticamente
  await ir("/admin/usuarios");
  for (const k of Object.keys(PESSOAS)) check(await temTexto(PESSOAS[k]["E-mail"]), `conta de acesso criada para ${PESSOAS[k]["E-mail"]}`);
});

await etapa("04 Usuários e acessos", async () => {
  await ir("/admin/usuarios");
  await clicar("Adicionar", "main"); await dialogo();
  await preencher('[role="dialog"]', "label", { "E-mail": "gabriel.externo@icl.com", Nome: "Gabriel Sem Vínculo" });
  await clicar("Salvar", '[role="dialog"]');
  check(await esperarToast("Usuário salvo"), "usuário sem perfil criado");
  await sleep(500);
  // promover a admin e voltar
  const promover = async (perfil) => {
    const ls = await p.$$("tbody tr");
    for (const l of ls) if ((await l.evaluate((x) => x.innerText)).includes("gabriel.externo")) { await (await l.$("button")).click(); break; }
    await dialogo();
    await preencher('[role="dialog"]', "label", { Perfil: perfil });
    await clicar("Salvar", '[role="dialog"]');
    await esperarToast("Usuário salvo"); await sleep(500); await fecharToasts();
  };
  await promover("admin");
  check(await p.evaluate(() => [...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes("gabriel.externo"))?.innerText.includes("Administrador")), "usuário promovido a Administrador");
  await promover("user");
  check(await p.evaluate(() => ![...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes("gabriel.externo"))?.innerText.includes("Administrador")), "perfil revertido para Usuário");
  // admin não pode remover a si mesmo
  esperado = true;
  const minha = (await p.$$("tbody tr"));
  for (const l of minha) if ((await l.evaluate((x) => x.innerText)).includes(ADMIN)) { const bs = await l.$$("button"); await bs[1].click(); break; }
  await clicar("Remover", '[role="alertdialog"]');
  check(await esperarToast("não pode remover"), "admin não consegue remover o próprio usuário");
  esperado = false;
});

await etapa("05 Checklists - Item SOL, Item GRD (pilar) e Questão SGI", async () => {
  await cadastrar("ItemSol", { Ordem: "99", Requisito: "Requisito E2E SOL: área sinalizada?", Categoria: "C/S", Subcategoria: "Teste E2E" }, "Requisito E2E SOL");
  // item inativo não deve aparecer no checklist
  await cadastrar("ItemSol", { Ordem: "100", Requisito: "Item Inativo E2E", Categoria: "E", Subcategoria: "Inativo", Ativo: false }, "Item Inativo E2E");
  await ir("/admin/pilares");
  check(await temTexto("1º Pilar") && await temTexto("5º Pilar"), "5 pilares GRD carregados das planilhas");
  await clicar("1º Pilar", "main", "button", { exato: false });
  await clicar("Adicionar item", "main");
  await dialogo();
  await preencher('[role="dialog"]', "label", { Ordem: "99", Requisito: "Requisito E2E GRD: indicador atualizado?", "Nº Requisito": "9", "Nº Sub-requisito": "9.1" });
  await clicar("Adicionar", '[role="dialog"]');
  check(await esperarToast("Salvo com sucesso"), "item GRD adicionado ao 1º pilar");
  await sleep(500);
  check(await temTexto("Requisito E2E GRD"), "item GRD aparece no pilar");
  await cadastrar("ItemSgi", { Ordem: "1", "Questão": "Questão E2E SGI: registros de calibração em dia?", Procedimento: "PG-E2E", "Área (vazio = todas)": A, "ISO 9001": "7.1.5", CAPA: "Ações de calibração" }, "Questão E2E SGI");
  await cadastrar("TipoDeInspecao", { Tipo: "Avaliação E2E", "Descrição": "Avaliação GRD do teste", "Formulário": "GRD" }, "Avaliação E2E");
});

await etapa("06 Agendamento - remover janela GRD e verificar bloqueio", async () => {
  await ir("/admin/agendamento");
  const card = await p.evaluateHandle(() => [...document.querySelectorAll("main .rounded-lg.border")].find((c) => c.innerText.includes("1ª Avaliação")));
  const trash = await card.asElement().$("tbody tr button");
  await trash.click();
  await clicar("Remover", '[role="alertdialog"]');
  check(await esperarToast("Agendamento removido"), "agendamento GRD existente removido");
});

await etapa("07 Vínculos - área na unidade e pessoas por programa", async () => {
  await ir("/admin/vinculos");
  await clicar(U, "main", "button", { exato: false });
  await clicar("Vincular área", "main");
  await dialogo();
  await preencher('[role="dialog"]', "campo", { "Área": A, Processo: PR });
  await clicar("Vincular", '[role="dialog"]');
  check(await esperarToast("Vínculo Unidade-Área-Processo realizado"), "área vinculada à unidade");
  await sleep(600);
  await clicar(A, "main", "button", { exato: false });
  const vincular = async (programa, papel, nome) => {
    await clicar(programa, "main", '[role="tab"]');
    await clicar("Vincular", "main");
    await dialogo();
    await preencher('[role="dialog"]', "campo", { Papel: papel });
    await sleep(150);
    await preencher('[role="dialog"]', "campo", { [papel]: nome });
    await clicar("Vincular", '[role="dialog"]');
    const ok = await esperarToast("vinculado(a) à área com sucesso");
    await semDialogo().catch(() => {}); await sleep(400); await fecharToasts();
    check(ok && (await temTexto(nome)), `${programa}: ${papel} ${nome} vinculado(a)`);
  };
  await vincular("SOL", "Responsável", PESSOAS.resp.Nome);
  await vincular("SOL", "Facilitador", PESSOAS.fac.Nome);
  await vincular("GRD", "Líder", PESSOAS.lider.Nome);
  await vincular("GRD", "Gestor", PESSOAS.gestor.Nome);
  await vincular("SGI", "Responsável SGI", PESSOAS.rsgi.Nome);
  // duplicado
  await clicar("GRD", "main", '[role="tab"]');
  await clicar("Vincular", "main"); await dialogo();
  await preencher('[role="dialog"]', "campo", { Papel: "Líder" }); await sleep(150);
  await preencher('[role="dialog"]', "campo", { "Líder": PESSOAS.lider.Nome });
  esperado = true;
  await clicar("Vincular", '[role="dialog"]');
  check(await esperarToast("já está vinculado"), "vínculo duplicado bloqueado");
  esperado = false;
  await clicar("Cancelar", '[role="dialog"]');
  // vincular e desvincular
  await vincular("SOL", "Responsável", "Preenchedor Demonstração");
  await clicar("SOL", "main", '[role="tab"]');
  const linhas = await p.$$("main li li");
  for (const l of linhas) if ((await l.evaluate((x) => x.innerText)).includes("Preenchedor Demonstração")) { await clicarTitulo("Desvincular", l); break; }
  await clicar("Confirmar", '[role="alertdialog"]');
  check(await esperarToast("Desvinculado com sucesso"), "vínculo removido");
  await sleep(500);
  check(!(await temTexto("Preenchedor Demonstração")), "pessoa desvinculada some da área");
  check(await p.evaluate((a) => [...document.querySelectorAll("main li")].find((l) => l.innerText.includes(a))?.innerText.includes("SOL 2"), A), "contador SOL 2 / GRD 2 / SGI 1 na área");
  await shot("07-vinculos");
  // cadastro em uso não pode ser removido
  await ir("/admin/cadastros/Unidade");
  for (const l of await p.$$("tbody tr")) if ((await l.evaluate((x) => x.innerText)).includes(U)) { await clicarTitulo("Remover", l); break; }
  esperado = true;
  await clicar("Remover", '[role="alertdialog"]');
  check(await esperarToast("em uso"), "unidade em uso não pode ser removida");
  esperado = false;
});

// ---------- Excel: exportar e importar cadastros e vínculos ----------
// "antes" = instante (ms) anterior ao clique; aceita arquivo novo ou sobrescrito depois desse instante
async function esperarDownload(antes, prefixo, timeout = 15000) {
  const ini = Date.now();
  const desde = typeof antes === "number" ? antes : ini - 1000;
  while (Date.now() - ini < timeout) {
    const novo = readdirSync(DOWN).find((f) => f.startsWith(prefixo) && f.endsWith(".xlsx") && statSync(path.join(DOWN, f)).mtimeMs >= desde - 50);
    if (novo) { await sleep(300); return path.join(DOWN, novo); }
    await sleep(200);
  }
  throw new Error(`download "${prefixo}*.xlsx" não apareceu`);
}
async function importarArquivo(arquivo) {
  await clicar("Importar Excel", "main");
  await dialogo();
  const inp = await p.$('[role="dialog"] input[data-teste="arquivo-excel"]');
  await inp.uploadFile(arquivo);
  await p.waitForFunction(() => /Importar \d+ linha/.test(document.querySelector('[role="dialog"]')?.innerText || ""), { timeout: 10000 });
  return p.evaluate(() => document.querySelector('[role="dialog"]').innerText);
}
async function confirmarImportacao() {
  await clicar("Importar", '[role="dialog"]', "button", { exato: false });
  await p.waitForFunction(() => /criado|vinculada/.test(document.querySelector('[role="dialog"]')?.innerText || ""), { timeout: 15000 });
  const t = await p.evaluate(() => document.querySelector('[role="dialog"]').innerText);
  await clicar("Fechar", '[role="dialog"]');
  await sleep(600);
  return t;
}

await etapa("07b Excel - exportar e importar cadastros e vínculos", async () => {
  const { default: gravarXlsx } = await import("write-excel-file/node");
  const { readSheet } = await import("read-excel-file/node");
  await comoUsuario(ADMIN);

  // --- Unidades: exportar ---
  await ir("/admin/cadastros/Unidade");
  let antes = Date.now();
  await clicar("Exportar Excel", "main");
  const arqU = await esperarDownload(antes, "cadastro-unidade");
  const dadosU = await readSheet(arqU);
  const totalU = (await api("contexto", {}, ADMIN)) && (await p.$$eval("tbody tr", (r) => r.length));
  check(dadosU[0].join("|") === "Nome|Sigla|Escopo|E-mail do Gestor Industrial", "Excel de Unidades sem coluna ID (cabeçalho correto)");
  check(dadosU.length - 1 === totalU, `Excel de Unidades com ${dadosU.length - 1} linhas (= tabela)`);
  const linhaUTE = dadosU.find((r) => r[1] === "UTE");
  check(!!linhaUTE && linhaUTE[0] === U && linhaUTE[2] === "Fertilizantes Especiais", "linha exportada traz os valores atuais");
  const instr = await readSheet(arqU, "Instruções");
  check(instr.some((r) => String(r[0]) === "Sigla" && /Obrigatório/.test(String(r[1]))), "aba Instruções explica cada coluna");
  check(instr.some((r) => String(r[0]) === "Como funciona" && /identificada por Nome/.test(String(r[1]))), "instruções explicam que o Nome identifica a unidade");
  check(!instr.some((r) => /\bID\b/.test(String(r[0]) + String(r[1]))), "instruções não mencionam ID");
  // modelo
  await clicar("Importar Excel", "main"); await dialogo();
  check(await p.evaluate(() => !/\bID\b/.test(document.querySelector('[role="dialog"]').innerText)), "tela de importação não fala em ID");
  antes = Date.now();
  await clicar("Baixar modelo", '[role="dialog"]');
  const modelo = await readSheet(await esperarDownload(antes, "modelo-unidade"));
  check(modelo.length === 1 && modelo[0][0] === "Nome", "modelo vem só com o cabeçalho, sem ID");
  await clicar("Fechar", '[role="dialog"]');

  // --- Unidades: importar (atualização pelo Nome, nova, erros na prévia e erro do servidor) ---
  const arqImpU = path.join(OUT, "importar-unidades.xlsx");
  await gravarXlsx([
    dadosU[0],
    [U.toUpperCase(), "UTE", "Escopo alterado via Excel", linhaUTE[3] || ""],
    ["Unidade Excel Nova", "UXN", "Nova pelo Excel", "gestor.novo@icl.com"],
    ["Sem Sigla", "", "", ""],
    ["unidade excel nova", "UXX", "", ""],
    ["E-mail ruim", "UXR", "", "nao-e-email"],
    ["Sigla de Outra", "UTE", "", ""],
  ].map((l) => l.map((v) => ({ value: v ?? "" })))).toFile(arqImpU);
  const previa = await importarArquivo(arqImpU);
  check(/2 novo/.test(previa) && /1 atualizar/.test(previa) && /3 erro/.test(previa), "prévia: 2 novos, 1 atualizar (nome em maiúsculas), 3 erros");
  check(previa.includes("Sigla é obrigatório") && previa.includes("Repetido na planilha") && previa.includes("não é um e-mail válido"), "prévia explica cada erro");
  const resU = await confirmarImportacao();
  check(resU.includes("1 registro(s) criado(s)") && resU.includes("1 registro(s) atualizado(s)"), "resultado: 1 criado, 1 atualizado");
  check(resU.includes("Linha 7") && resU.includes("Já existe unidade com esta sigla"), "sigla já usada por outra unidade é recusada pelo servidor e informada");
  check(await temTexto("Unidade Excel Nova") && await temTexto("Escopo alterado via Excel"), "tabela mostra a unidade nova e a alteração");
  check(await temTexto(U) && !(await temTexto(U.toUpperCase())), "atualização pelo nome não altera o nome cadastrado");
  // nome duplicado também é bloqueado no formulário
  await clicar("Adicionar", "main"); await dialogo();
  await preencher('[role="dialog"]', "label", { Nome: "Unidade Excel Nova", Sigla: "ZZZ" });
  esperado = true;
  await clicar("Adicionar", '[role="dialog"]');
  check(await esperarToast("Já existe unidade com este nome"), "nome de unidade repetido é bloqueado no formulário");
  esperado = false;
  await clicar("Cancelar", '[role="dialog"]');

  // --- Pessoas (Responsável): nova pessoa, atualização pelo e-mail (sem ID) e erro ---
  await ir("/admin/cadastros/Responsavel");
  const arqImpR = path.join(OUT, "importar-responsaveis.xlsx");
  await gravarXlsx([
    ["Nome", "E-mail", "Cargo"],
    ["Rita Excel", "Rita.Excel@ICL.com", "Supervisora"],
    [PESSOAS.resp.Nome, PESSOAS.resp["E-mail"].toUpperCase(), "Coordenadora"],
    ["Sem Email", "", "Cargo"],
  ].map((l) => l.map((v) => ({ value: v })))).toFile(arqImpR);
  const prevR = await importarArquivo(arqImpR);
  check(/1 novo/.test(prevR) && /1 atualizar/.test(prevR) && /1 erro/.test(prevR), "pessoas: sem ID, o e-mail identifica quem atualizar");
  const resR = await confirmarImportacao();
  check(resR.includes("1 registro(s) criado(s)") && resR.includes("1 registro(s) atualizado(s)"), "pessoas importadas");
  check(await temTexto("rita.excel@icl.com") && await temTexto("Coordenadora"), "e-mail normalizado e cargo atualizado");
  await ir("/admin/usuarios");
  check(await temTexto("rita.excel@icl.com"), "pessoa importada ganhou conta de acesso");

  // --- Usuários e acessos: exportar e importar (identificados pelo e-mail) ---
  antes = Date.now();
  await clicar("Exportar Excel", "main");
  const users = await readSheet(await esperarDownload(antes, "cadastro-usuarios"));
  check(users[0].join("|") === "E-mail|Nome|Perfil", "Excel de usuários com cabeçalho E-mail|Nome|Perfil (sem ID)");
  check(users.some((r) => r[0] === ADMIN && r[2] === "Administrador") && users.some((r) => r[0] === "rita.excel@icl.com" && r[2] === "Usuário"), "usuários exportados com o perfil");
  const arqImpUs = path.join(OUT, "importar-usuarios.xlsx");
  await gravarXlsx([
    ["E-mail", "Nome", "Perfil"],
    ["Novo.Admin@ICL.com", "Novo Admin Excel", "Administrador"],
    ["rita.excel@icl.com", "Rita Excel Atualizada", ""],
    [ADMIN, "", "Usuário"],
    ["sem-arroba", "X", ""],
    ["perfil.ruim@icl.com", "Y", "Chefe"],
  ].map((l) => l.map((v) => ({ value: v })))).toFile(arqImpUs);
  const prevUs = await importarArquivo(arqImpUs);
  check(/1 novo/.test(prevUs) && /1 atualizar/.test(prevUs) && /3 erro/.test(prevUs), "prévia de usuários: 1 novo, 1 atualizar, 3 erros");
  check(prevUs.includes("próprio perfil de administrador") && prevUs.includes("E-mail inválido") && prevUs.includes('Perfil "Chefe" inválido'), "prévia explica os erros (próprio admin, e-mail e perfil)");
  const resUs = await confirmarImportacao();
  check(resUs.includes("1 usuário(s) criado(s)") && resUs.includes("1 usuário(s) atualizado(s)"), "usuários importados");
  const linhaUs = (e) => p.evaluate((x) => [...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(x))?.innerText || "", e);
  check((await linhaUs("novo.admin@icl.com")).includes("Administrador"), "usuário novo criado como Administrador (e-mail normalizado)");
  const rita = await linhaUs("rita.excel@icl.com");
  check(rita.includes("Rita Excel Atualizada") && rita.includes("Usuário"), "nome atualizado e perfil em branco manteve o atual");
  check((await linhaUs(ADMIN)).includes("Administrador"), "admin logado continua Administrador");

  // --- Inspetores: área informada pela sigla ---
  await ir("/admin/cadastros/Inspetor");
  const arqImpI = path.join(OUT, "importar-inspetores.xlsx");
  await gravarXlsx([["Nome", "E-mail", "Área"], ["Inspetor Excel", "inspetor.excel@icl.com", "ATE"], ["Área Errada", "x@icl.com", "Não Existe"]].map((l) => l.map((v) => ({ value: v })))).toFile(arqImpI);
  const prevI = await importarArquivo(arqImpI);
  check(prevI.includes(`${A}`) && prevI.includes("não está cadastrado(a)"), "área resolvida pela sigla; área inexistente vira erro");
  await confirmarImportacao();
  check(await p.evaluate((a) => [...document.querySelectorAll("tbody tr")].some((r) => r.innerText.includes("Inspetor Excel") && r.innerText.includes(a)), A), "inspetor importado com a área correta");

  // --- Vínculos: exportar e importar ---
  await ir("/admin/vinculos");
  antes = Date.now();
  await clicar("Exportar Excel", "main");
  const vinc = await readSheet(await esperarDownload(antes, "cadastro-vinculos"));
  check(vinc[0].join("|") === "Unidade|Área|Processo|Programa|Papel|Nome|E-mail", "Excel de vínculos com cabeçalho correto");
  check(vinc.some((r) => r[1] === A && r[4] === "Responsável" && r[6] === PESSOAS.resp["E-mail"]) && vinc.some((r) => r[1] === A && r[4] === "Líder"), "vínculos atuais exportados (SOL e GRD)");
  check(vinc.some((r) => r[0] === "Cruz Alta" && !r[4]), "áreas sem ninguém vinculado também são exportadas");
  const arqImpV = path.join(OUT, "importar-vinculos.xlsx");
  await gravarXlsx([
    ["Unidade", "Área", "Processo", "Programa", "Papel", "Nome", "E-mail"],
    [U, A, PR, "SOL", "Responsável", "Rita Excel", "rita.excel@icl.com"],
    ["UXN", A, PR, "", "", "", ""],
    [U, A, PR, "GRD", "Líder", PESSOAS.lider.Nome, PESSOAS.lider["E-mail"]],
    [U, A, PR, "SOL", "Responsável", "Fulano", "nao.cadastrado@icl.com"],
    [U, A, PR, "", "Chefe", "", "x@icl.com"],
    ["Unidade Inexistente", A, PR, "", "", "", ""],
  ].map((l) => l.map((v) => ({ value: v })))).toFile(arqImpV);
  const prevV = await importarArquivo(arqImpV);
  check(/1 vincular/.test(prevV) && /1 novo/.test(prevV) && /1 atualizar/.test(prevV) && /3 erro/.test(prevV), "prévia de vínculos: vincular, área nova, já existente e 3 erros");
  check(prevV.includes("não está cadastrado(a) como Responsável") && prevV.includes('Papel "Chefe" inválido') && prevV.includes("não cadastrada"), "prévia de vínculos explica os erros");
  const resV = await confirmarImportacao();
  check(resV.includes("1 área(s) vinculada(s)") && resV.includes("1 pessoa(s) vinculada(s)"), "vínculos importados");
  const dv = (await api("admin.dadosVinculos", {}, ADMIN)).data;
  const uapA = dv.locais.find((l) => l.NomeUnidade === U && l.NomeArea === A);
  check(dv.vinculos.some((v) => v.UnidadeAreaProcessoId === uapA.UnidadeAreaProcessoId && v.Email === "rita.excel@icl.com" && v.Programa === "SOL"), "Rita vinculada como Responsável SOL na área de teste");
  check(dv.locais.some((l) => l.NomeUnidade === "Unidade Excel Nova" && l.NomeArea === A), "área vinculada à unidade nova");
  const logs = (await p.evaluate(async () => (await fetch("/api/entities/LogAuditoria?sort=-Data&limit=20", { headers: { "x-dev-user": "admin@sol.local" } })).json()));
  check(logs.some((l) => l.Acao === "Importar Unidade (Excel)") && logs.some((l) => l.Acao === "Importar vínculos (Excel)"), "importações registradas no log");
});

// ---------- formulário de inspeção (helpers) ----------
async function selecionarLocal(programa, unidade, area, normas = []) {
  await ir("/inspecao");
  const ss = await p.$$("main select");
  await ss[0].select(programa); await sleep(200);
  await p.evaluate((u) => window.__setar(document.querySelectorAll("main select")[1], u), unidade); await sleep(200);
  await p.evaluate((a) => window.__setar(document.querySelectorAll("main select")[2], a), area); await sleep(300);
  for (const n of normas) {
    await p.evaluate((n) => [...document.querySelectorAll("main label")].find((l) => l.innerText.trim() === n)?.querySelector("button")?.click(), n);
    await sleep(100);
  }
  await clicar("Avançar", "main");
  await sleep(1500);
}
async function itens() {
  return p.evaluate(() => [...document.querySelectorAll('[id^="item-"]')].filter((x) => x.id !== "item-cabecalho").map((x) => ({ id: x.id, texto: x.querySelector("p")?.innerText || "" })));
}
async function responder(itemId, resposta) {
  const ok = await p.evaluate((id, r) => {
    const b = [...document.getElementById(id).querySelectorAll('[role="radio"]')].find((x) => x.innerText.trim() === r);
    if (!b) return false;
    if (b.getAttribute("aria-checked") !== "true") b.click();
    return true;
  }, itemId, resposta);
  if (!ok) throw new Error(`Resposta ${resposta} não encontrada em ${itemId}`);
}
async function textoItem(itemId, placeholder, valor) {
  await p.evaluate((id, ph, v) => window.__setar(document.getElementById(id).querySelector(`[placeholder="${ph}"]`), v), itemId, placeholder, valor);
}
async function fotoItem(itemId) {
  const inp = await p.$(`#${itemId} input[type=file]`);
  await inp.uploadFile(FOTO);
  await p.waitForFunction((id) => document.querySelectorAll(`#${id} img[alt="Evidência"]`).length > 0, { timeout: 15000 }, itemId);
}
async function assinar() {
  const c = await p.$('[role="dialog"] canvas');
  await c.evaluate((x) => x.scrollIntoView());
  const b = await c.boundingBox();
  await p.mouse.move(b.x + 30, b.y + 60); await p.mouse.down();
  for (let i = 0; i < 12; i++) await p.mouse.move(b.x + 40 + i * 18, b.y + 60 + (i % 2 ? 35 : -25), { steps: 3 });
  await p.mouse.up();
  await sleep(300);
}
const respondidos = () => p.evaluate(() => document.body.innerText.match(/(\d+)\/(\d+) respondidos/)?.slice(1).map(Number));
const ids_ = (lst) => lst.map((i) => i.id);

let solEsperado, grdEsperado;

await etapa("08 Inspeção SOL completa (inspetor João)", async () => {
  await comoUsuario(PESSOAS.inspetor["E-mail"]);
  await ir("/");
  check(new URL(p.url()).pathname === "/", "inspetor começa na tela Início");
  check(!!(await p.$('main a[href="/inspecao"]')) && !(await p.$('main a[href="/admin"]')) && !(await p.$('main a[href="/plano-acao"]')), "Início do inspetor só tem o cartão Inspeção");
  await clicar("Inspeção", "main", "a", { exato: false }); await sleep(800);
  check(new URL(p.url()).pathname === "/inspecao" && !(await p.$("aside")), "cartão abre a Inspeção (sem menu lateral)");
  await clicar("Início", "main", "a"); await sleep(800);
  check(new URL(p.url()).pathname === "/", '"← Início" da Inspeção volta para o Início');
  await selecionarLocal("SOL", U, A);
  check(p.url().includes("/inspecao/formulario") && p.url().includes("programa=SOL"), "formulário SOL aberto");
  const lst = await itens();
  check(lst.length === 32, `checklist SOL com ${lst.length} itens (31 da planilha + 1 novo; inativo excluído)`);
  check(lst.some((i) => i.texto.includes("Requisito E2E SOL")) && !lst.some((i) => i.texto.includes("Item Inativo E2E")), "item novo aparece e item inativo não");
  await preencher("main", "campo", { "Resp. Acompanhamento": "Fulano de Tal", Cargo: "Operador", "Inspetor 1": PESSOAS.inspetor.Nome, "Inspetor 2": "Inspetor Demonstração", "Observações": "Inspeção de teste E2E" });
  check(await temTexto(PESSOAS.resp.Nome) && await temTexto(PESSOAS.fac.Nome), "responsáveis da área exibidos no cabeçalho");
  // tentativa sem responder
  await clicar("Enviar");
  check(await esperarToast("sem resposta"), "Enviar bloqueado com itens sem resposta");
  await fecharToasts();
  const naoIdx = [];
  for (let k = 0; k < lst.length; k++) {
    const r = k % 5 === 0 ? "Não" : k % 7 === 0 ? "N/A" : "Sim";
    await responder(lst[k].id, r);
    if (r === "Não") naoIdx.push(k);
  }
  await sleep(300);
  await clicar("Enviar");
  check(await esperarToast("exigem foto"), `Enviar bloqueado: ${naoIdx.length} itens "Não" sem foto`);
  await fecharToasts();
  for (const k of naoIdx) {
    await textoItem(lst[k].id, "Breve descrição...", `Não conformidade do item ${k + 1}`);
    await fotoItem(lst[k].id);
  }
  check(true, `${naoIdx.length} fotos de evidência enviadas`);
  // trocar "Não" -> "Sim" limpa observação e fotos (regra do app original)
  await responder(lst[naoIdx[0]].id, "Sim"); await sleep(200);
  check(await p.evaluate((id) => !document.getElementById(id).querySelector('[placeholder="Breve descrição..."]'), lst[naoIdx[0]].id), 'trocar "Não" por "Sim" limpa observação/foto');
  await responder(lst[naoIdx[0]].id, "Não"); await sleep(200);
  await textoItem(lst[naoIdx[0]].id, "Breve descrição...", "Não conformidade do item 1");
  await fotoItem(lst[naoIdx[0]].id);
  check(JSON.stringify(await respondidos()) === "[32,32]", "32/32 respondidos");
  // calcula esperado
  const chk = await api("inspecao.abrirFormulario", { programa: "SOL", uapId: new URL(p.url()).searchParams.get("uap") }, PESSOAS.inspetor["E-mail"]);
  const respSim = chk.data.checklist.map((it, k) => ({ ...it, Resposta: k % 5 === 0 ? "Não" : k % 7 === 0 ? "N/A" : "Sim" }));
  solEsperado = calcularSol(respSim);
  await clicar("Enviar");
  await dialogo();
  const txt = await p.evaluate(() => document.querySelector('[role="dialog"]').innerText);
  check(txt.includes(solEsperado.Status), `resultado mostra status ${solEsperado.Status}`);
  check(txt.includes(String(solEsperado.ScoreTotal).replace(".", ",")), `Score Total ${solEsperado.ScoreTotal}% exibido`);
  check(await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.innerText.trim() === "Finalizar").disabled), "Finalizar desabilitado sem assinatura");
  await assinar();
  await shot("08-sol-resultado");
  await clicar("Finalizar", '[role="dialog"]');
  await esperarTexto("Inspeção Finalizada", 15000);
  check(true, "inspeção SOL finalizada");
  await shot("08-sol-finalizada");
});

await etapa("09 Rascunho local, recarregar e Limpar", async () => {
  await selecionarLocal("SOL", "Cruz Alta", "Recebimento");
  const lst = await itens();
  for (const it of lst.slice(0, 3)) await responder(it.id, "Sim");
  await preencher("main", "campo", { Cargo: "Rascunho" });
  await sleep(1200);
  await p.reload({ waitUntil: "networkidle0" }); await sleep(1500);
  check(await esperarToast("Rascunho salvo neste dispositivo"), "aviso de rascunho restaurado após recarregar");
  check(JSON.stringify((await respondidos())) === `[3,${lst.length}]`, "3 respostas recuperadas do rascunho");
  check(await p.evaluate(() => window.__alvo("main", "campo", "Cargo").value === "Rascunho"), "cabeçalho recuperado do rascunho");
  await clicar("Limpar");
  await clicar("Limpar", '[role="alertdialog"]');
  await sleep(400);
  check(JSON.stringify(await respondidos()) === `[0,${lst.length}]`, "Limpar apaga as respostas");
  await clicar("", "main", '[title="Sair"]', { exato: false });
  await sleep(800);
  check(p.url().endsWith("/inspecao"), "botão Sair volta para a seleção");
});

await etapa("10 GRD bloqueado sem agendamento", async () => {
  esperado = true;
  await selecionarLocal("GRD", U, A);
  check(await esperarToast("Nenhum agendamento"), "GRD exige agendamento vigente");
  esperado = false;
});

await etapa("11 Agendamento GRD criado pela tela", async () => {
  await comoUsuario(ADMIN);
  await ir("/admin/agendamento");
  const sel = async (etapaNome, ini, fim) => {
    await p.evaluate((e) => {
      const card = [...document.querySelectorAll("main .rounded-lg.border")].find((c) => c.innerText.includes("Avaliação E2E"));
      [...card.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(e)).click();
    }, etapaNome);
    await sleep(300);
    await preencher("main", "campo", { "Data Inicial": ini, "Data Final": fim });
    await clicar("Salvar", "main");
    check(await esperarToast("Prazo salvo"), `agendamento "${etapaNome}" salvo`);
    await sleep(500); await fecharToasts();
  };
  await sel("Inspeção", diasA(-5), diasA(10));
  await sel("Preenchimento do PA", diasA(0), diasA(20));
  const card = await p.evaluate(() => [...document.querySelectorAll("main .rounded-lg.border")].find((c) => c.innerText.includes("Avaliação E2E")).innerText);
  check(card.includes(diasA(-5).split("-").reverse().join("/")) && card.includes(diasA(20).split("-").reverse().join("/")), "datas exibidas no agendamento");
});

await etapa("12 Avaliação GRD: salvar parcial, continuar e finalizar", async () => {
  await comoUsuario(PESSOAS.inspetor["E-mail"]);
  await selecionarLocal("GRD", U, A);
  check(p.url().includes("programa=GRD"), "formulário GRD aberto");
  check(await temTexto("Avaliação E2E"), "tipo de avaliação vem do agendamento");
  let lst = await itens();
  check(lst.length === 37, `checklist GRD com ${lst.length} itens (36 + 1 novo)`);
  check(/^1\.?\s*\D/.test(lst[0].texto) && (await p.evaluate((id) => document.getElementById(id).innerText.includes("1º Pilar"), lst[0].id)), "itens ordenados a partir do 1º pilar");
  check(await temTexto(PESSOAS.lider["E-mail"]) && await temTexto(PESSOAS.gestor["E-mail"]), "líderes e gestores da área exibidos");
  await preencher("main", "campo", { "Res. Acompanhamento": "Beltrano", Cargo: "Supervisor", Avaliador: PESSOAS.inspetor.Nome, "Observações": "Avaliação GRD E2E" });
  for (const it of lst.slice(0, 10)) { await responder(it.id, "Sim"); await textoItem(it.id, "Descrição...", "Evidenciado em campo"); }
  await clicar("Salvar");
  await esperarTexto("Inspeção Salva", 15000);
  check(true, "avaliação GRD salva parcialmente");
  await clicar("Voltar à seleção");
  await sleep(800);
  check(await temTexto("Minhas avaliações em aberto") && await temTexto(`${U} · ${A}`), "avaliação aparece em 'Minhas avaliações em aberto'");
  // reabrir pela seleção -> diálogo "Avaliação em aberto"
  await selecionarLocal("GRD", U, A);
  await dialogo();
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Existe uma avaliação em aberto")), "diálogo 'Avaliação em aberto' exibido");
  await clicar("Continuar Avaliação", '[role="dialog"]');
  await sleep(1800);
  check(JSON.stringify(await respondidos()) === "[10,37]", "continuação mantém 10 respostas salvas");
  check(await p.evaluate(() => window.__alvo("main", "campo", "Res. Acompanhamento").value === "Beltrano"), "cabeçalho salvo foi recuperado");
  lst = await itens();
  for (let k = 10; k < lst.length; k++) { await responder(lst[k].id, k % 4 === 0 ? "Não" : "Sim"); }
  await clicar("Enviar");
  check(await esperarToast("Preencha a Evidência"), "Enviar bloqueado sem evidência em todos os itens");
  await fecharToasts();
  for (let k = 10; k < lst.length; k++) await textoItem(lst[k].id, "Descrição...", k % 4 === 0 ? "Não evidenciado" : "Ok");
  await fotoItem(lst[12].id);
  const chk = await api("inspecao.abrirFormulario", { programa: "GRD", uapId: new URL(p.url()).searchParams.get("uap") }, PESSOAS.inspetor["E-mail"]);
  grdEsperado = calcularGrd(chk.data.checklist.map((it, k) => ({ ...it, Resposta: k < 10 ? "Sim" : k % 4 === 0 ? "Não" : "Sim" })));
  await clicar("Enviar");
  await dialogo();
  const txt = await p.evaluate(() => document.querySelector('[role="dialog"]').innerText);
  check(["1º Pilar", "2º Pilar", "3º Pilar", "4º Pilar", "5º Pilar", "% Atendimento"].every((x) => txt.includes(x)), "resultado mostra os 5 pilares e % de atendimento");
  check(txt.includes(String(grdEsperado.Atendimento).replace(".", ",")), `atendimento total ${grdEsperado.Atendimento}%`);
  await assinar();
  await clicar("Finalizar", '[role="dialog"]');
  await esperarTexto("Inspeção Finalizada", 15000);
  check(true, "avaliação GRD finalizada");
  await clicar("Voltar à seleção"); await sleep(800);
  check(!(await temTexto(`${U} · ${A}`)), "avaliação finalizada sai da lista de em aberto");
});

await etapa("13 GRD 'Nova Avaliação' descarta a em aberto", async () => {
  await selecionarLocal("GRD", "Cruz Alta", "Recebimento");
  let lst = await itens();
  await responder(lst[0].id, "Sim"); await responder(lst[1].id, "Não");
  await clicar("Salvar"); await esperarTexto("Inspeção Salva", 15000);
  await clicar("Voltar à seleção"); await sleep(600);
  await selecionarLocal("GRD", "Cruz Alta", "Recebimento");
  await dialogo();
  await clicar("Nova Avaliação", '[role="dialog"]');
  await p.waitForSelector('[role="alertdialog"]', { visible: true, timeout: 8000 });
  const confGrd = await p.evaluate(() => document.querySelector('[role="alertdialog"]').innerText);
  check(confGrd.includes("Descartar a avaliação GRD em aberto?") && confGrd.includes("não pode ser desfeita"), "GRD: confirmação antes de descartar");
  await clicar("Descartar e iniciar nova", '[role="alertdialog"]');
  await sleep(1800);
  check(JSON.stringify((await respondidos())?.[0]) === "0", "Nova Avaliação começa vazia (anterior descartada)");
  lst = await itens();
  await responder(lst[0].id, "Sim");
  await clicar("Salvar"); await esperarTexto("Inspeção Salva", 15000);
  check(true, "nova avaliação salva em aberto (para o teste do Admin)");
});

await etapa("14 Auditoria SGI completa (auditor Fábio)", async () => {
  await comoUsuario(PESSOAS.auditor["E-mail"]);
  await ir("/inspecao");
  const progs = await p.evaluate(() => [...document.querySelectorAll("main select")[0].options].map((o) => o.value).filter(Boolean));
  check(JSON.stringify(progs) === '["SGI"]', "auditor (sem cadastro de inspetor) só vê SGI");
  await selecionarLocal("SGI", U, A, ["ISO SGI", "CAPA"]);
  check(p.url().includes("programa=SGI"), "formulário SGI aberto");
  const lst = await itens();
  check(lst.some((i) => i.texto.includes("Questão E2E SGI")), "questão específica da área aparece");
  check(!lst.some((i) => i.texto.includes("LOTOTO")), "questão LOTOTO (só Manutenção) não aparece");
  check(await p.evaluate(() => ![...document.querySelectorAll("button")].some((b) => /^(Finalizar|Enviar)$/.test(b.innerText.trim()))), "SGI sem botão Finalizar/Enviar (só Salvar)");
  await clicar("Salvar");
  check(await esperarToast("Preencha no cabeçalho: Auditor, Equipe Entrevistada"), "Salvar exige Auditor e Equipe Entrevistada");
  await fecharToasts();
  await preencher("main", "campo", { Auditor: PESSOAS.auditor.Nome });
  const eq = await p.$('input[placeholder="Nome ou e-mail (Enter para adicionar)"]');
  await eq.type("Maria Silva"); await p.keyboard.press("Enter");
  await eq.type("jose.operador@icl.com"); await p.keyboard.press("Enter");
  await sleep(200);
  check(await temTexto("Maria Silva") && await temTexto("jose.operador@icl.com"), "equipe entrevistada aceita nome e e-mail");
  await responder(lst[0].id, "Não Conformidade Maior");
  await responder(lst[1].id, "Ponto de Melhoria");
  for (let k = 2; k < lst.length - 1; k++) await responder(lst[k].id, "Conforme");
  await responder(lst[lst.length - 1].id, "N/A");
  check(await p.evaluate((id) => !!document.getElementById(id).querySelector('[placeholder="Descrição do Apontamento..."]'), lst[0].id), "NC mostra campos de apontamento");
  check(await p.evaluate((id) => !document.getElementById(id).querySelector('[placeholder="Evidências Objetivas..."]'), lst[lst.length - 1].id), "N/A não mostra campos");
  await textoItem(lst[0].id, "Descrição do Apontamento...", "Certificado de calibração vencido");
  await textoItem(lst[0].id, "Referência Normativa...", "ISO 9001 7.1.5");
  await textoItem(lst[0].id, "Evidências Objetivas...", "Balança B-12 sem etiqueta");
  await textoItem(lst[0].id, "Sugestão de Adequação...", "Recalibrar e etiquetar");
  await fotoItem(lst[0].id);
  // SGI aceita qualquer tipo de arquivo
  writeFileSync(ANEXO, "planilha de teste E2E");
  check(await p.evaluate((id) => !document.querySelector(`#${id} input[type=file]`).getAttribute("accept"), lst[0].id), "SGI: seletor de arquivos sem restrição de tipo");
  await (await p.$(`#${lst[0].id} input[type=file]`)).uploadFile(ANEXO);
  await p.waitForFunction((id) => !!document.querySelector(`#${id} a[data-anexo]`), { timeout: 15000 }, lst[0].id);
  const anexo = await p.evaluate((id) => { const a = document.querySelector(`#${id} a[data-anexo]`); return { nome: a.dataset.anexo, href: a.getAttribute("href") }; }, lst[0].id);
  check(anexo.nome === "Relatorio_de_calibracao.xlsx" && anexo.href.endsWith(".xlsx"), `SGI: anexo não-imagem exibido com o nome (${anexo.nome})`);
  ids.anexoSgi = anexo.href;
  const rAnexo = await fetch(new URL(anexo.href, B));
  check(rAnexo.ok && /attachment/.test(rAnexo.headers.get("content-disposition") || "") && rAnexo.headers.get("x-content-type-options") === "nosniff", "anexo não-imagem é servido só para download (seguro)");
  // salvar e reabrir as mesmas opções no mesmo ano: carrega o que foi salvo
  await clicar("Salvar"); await esperarTexto("Inspeção Salva", 15000);
  check(await temTexto("continuar esta auditoria ou iniciar uma nova"), "mensagem explica o registro anual do SGI");
  await clicar("Voltar à seleção"); await sleep(600);
  await selecionarLocal("SGI", U, A, ["ISO SGI", "CAPA"]);
  await dialogo();
  const dlgSgi = await p.evaluate(() => document.querySelector('[role="dialog"]').innerText);
  check(/Auditoria SGI de \d{4} em aberto/.test(dlgSgi) && dlgSgi.includes("Nova Avaliação") && dlgSgi.includes("Continuar Avaliação"), "SGI do ano: pergunta se continua ou inicia nova");
  // Nova Avaliação no SGI pede confirmação; Cancelar mantém a auditoria e volta à escolha
  await clicar("Nova Avaliação", '[role="dialog"]');
  await p.waitForSelector('[role="alertdialog"]', { visible: true, timeout: 8000 });
  const conf = await p.evaluate(() => document.querySelector('[role="alertdialog"]').innerText);
  check(/Descartar a auditoria SGI de \d{4}\?/.test(conf) && conf.includes("não pode ser desfeita") && conf.includes("Descartar e iniciar nova"), "SGI: confirmação antes de descartar");
  await clicar("Cancelar", '[role="alertdialog"]');
  await p.waitForFunction(() => !document.querySelector('[role="alertdialog"]') && !!document.querySelector('[role="dialog"]'), { timeout: 8000 });
  check(!p.url().includes("formulario"), "Cancelar não descarta e volta à escolha continuar/nova");
  await clicar("Continuar Avaliação", '[role="dialog"]');
  await sleep(800);
  check(p.url().includes("id="), "Continuar Avaliação abre a SGI salva do ano");
  check(JSON.stringify(await respondidos()) === `[${lst.length},${lst.length}]`, "respostas SGI preservadas");
  check(await temTexto("Maria Silva"), "equipe entrevistada preservada");
  check(await p.evaluate((id) => !!document.querySelector(`#${id} a[data-anexo]`) && !!document.querySelector(`#${id} img[alt="Evidência"]`), lst[0].id), "foto e anexo do SGI preservados");
  await textoItem(lst[1].id, "Descrição do Apontamento...", "Procedimento pode ser simplificado");
  await clicar("Salvar"); await esperarTexto("Inspeção Salva", 15000);
  check(true, "auditoria SGI do ano salva novamente (mesmo registro)");
  await shot("14-sgi-salva");
});

await etapa("15 SOL extra (inspetor demo) para teste de inativação", async () => {
  await comoUsuario("inspetor@sol.local");
  const v = (await api("admin.dadosVinculos", {}, ADMIN)).data;
  const primeiro = v.locais.find((l) => v.vinculos.some((x) => x.UnidadeAreaProcessoId === l.UnidadeAreaProcessoId && x.Email === "preenchedor@sol.local" && x.Programa === "SOL"));
  ids.localDemo = primeiro;
  await selecionarLocal("SOL", primeiro.NomeUnidade, primeiro.NomeArea);
  const lst = await itens();
  await preencher("main", "campo", { "Resp. Acompanhamento": "Fulano 2", Cargo: "Op", "Inspetor 1": "Inspetor Demonstração", "Inspetor 2": "Segundo Inspetor" });
  for (const it of lst) await responder(it.id, "Sim");
  await responder(lst[2].id, "Não"); await fotoItem(lst[2].id);
  await clicar("Enviar"); await dialogo(); await assinar();
  await clicar("Finalizar", '[role="dialog"]');
  await esperarTexto("Inspeção Finalizada", 15000);
  check(true, "inspeção SOL extra finalizada");
});

// ---------- Admin: inspeções ----------
// filtros da barra azul (rótulo em <span> acima do select)
async function filtro(rotulo, valor) {
  if (rotulo === "Situação") { // abas
    const ok = await p.evaluate((v) => { const b = document.querySelector(`main [role="tab"][data-situacao="${v}"]`); b?.click(); return !!b; }, valor);
    if (!ok) throw new Error(`Aba de Situação "${valor}" não encontrada`);
    return sleep(300);
  }
  const r = await p.evaluate((rot, v) => {
    const span = [...document.querySelectorAll("main span")].find((s) => s.innerText.trim() === rot && s.parentElement.querySelector("select"));
    return window.__setar(span?.parentElement.querySelector("select"), v);
  }, rotulo, valor);
  if (r !== "ok") throw new Error(`Filtro "${rotulo}": ${r}`);
  await sleep(300);
}
async function linhaInspecao(texto, programa) {
  const lis = await p.$$("main ul > li");
  for (const l of lis) {
    const t = await l.evaluate((x) => x.innerText);
    if (t.includes(texto) && t.includes(programa)) return l;
  }
  return null;
}

await etapa("16 Admin - lista de inspeções, filtros e detalhes", async () => {
  await comoUsuario(ADMIN);
  await ir("/admin/inspecoes?situacao=ativas");
  for (const pr of ["SOL", "GRD", "SGI"]) check(!!(await linhaInspecao(A, pr)), `inspeção ${pr} da ${A} listada`);
  await preencher("main", "campo", {}); // noop
  await filtro("Programa", "GRD");
  await sleep(1200);
  const progs = await p.$$eval("main ul > li", (ls) => ls.map((l) => l.innerText));
  check(progs.length >= 1 && progs.every((t) => t.includes("GRD")), "filtro por Programa (GRD)");
  check(await p.$eval("main section[aria-label=Filtros]", (x) => x.innerText.includes("1 ativo")), 'contador de filtros mostra "1 ativo"');
  await clicar("Limpar filtros", "main section[aria-label=Filtros]", "button");
  await sleep(800);
  check(await p.evaluate(() => [...document.querySelectorAll("main section[aria-label=Filtros] select")].every((x) => x.value === "" || x.value === String(new Date().getFullYear()))), '"Limpar filtros" volta os filtros ao padrão');
  await filtro("Unidade", U);
  await sleep(500);
  check((await p.$$("main ul > li")).length === 3, "filtro por Unidade mostra as 3 inspeções da unidade de teste");
  const sol = await linhaInspecao(A, "SOL");
  check((await sol.evaluate((x) => x.innerText)).includes(solEsperado.Status), "lista mostra status/score do SOL");
  await (await sol.$("a")).click();
  await esperarTexto("Inspeção", 8000); await sleep(800);
  const det = await p.evaluate(() => document.body.innerText);
  check(det.includes("Fulano de Tal") && det.includes("Inspeção de teste E2E"), "detalhe: cabeçalho da inspeção");
  check((await p.$$('img[alt="Foto"]')).length >= 7, "detalhe: fotos de evidência");
  check(!!(await p.$('img[alt="Assinatura"]')), "detalhe: assinatura");
  await clicar("Plano de Ação", "main", '[role="tab"]', { exato: false });
  await sleep(400);
  check(await temTexto("Não preenchido"), "aba Plano de Ação mostra itens sem plano");
  await shot("16-admin-detalhe");
});

await etapa("17 Admin - editar inspeção", async () => {
  await ir("/admin/inspecoes?situacao=ativas");
  const sol = await linhaInspecao(A, "SOL");
  await clicarTitulo("Editar inspeção", sol);
  await dialogo();
  await p.waitForFunction(() => window.__alvo('[role="dialog"]', "campo", "Resp. Acompanhamento"), { timeout: 8000 });
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Processo E2E")), "edição mostra o processo do local");
  await preencher('[role="dialog"]', "campo", { "Resp. Acompanhamento": "Fulano Editado", "Observações": "Observação editada" });
  await clicar("Salvar", '[role="dialog"]');
  check(await esperarToast("atualizada com sucesso"), "inspeção editada");
  const det = (await api("admin.listarInspecoes", { situacao: "ativas" }, ADMIN)).data.find((x) => x.NomeArea === A && x.TipoDeFormulario === "SOL");
  ids.sol = det.InspecaoId;
  ids.grd = (await api("admin.listarInspecoes", { situacao: "ativas" }, ADMIN)).data.find((x) => x.NomeArea === A && x.TipoDeFormulario === "GRD").InspecaoId;
  check(det.RespAcompanhamento === "Fulano Editado", "alteração gravada no banco");
});

await etapa("18 E-mail de Plano de Ação (inspeção selecionada)", async () => {
  const antes = outbox().length;
  await ir("/admin/inspecoes?situacao=ativas");
  await clicarTitulo("Enviar plano de ação por e-mail", await linhaInspecao(A, "SOL"));
  await clicar("Enviar", '[role="alertdialog"]');
  check(await esperarToast("Preenchimento do Plano de Ação Enviado"), "envio confirmado na tela");
  await sleep(500);
  const novos = outbox().slice(antes);
  // como o SendEmail do Base44: um e-mail por destinatário
  const paraDe = (x) => (x.match(/<!-- PARA: (.*?) -->/) || [])[1] || "";
  const paras = novos.map(paraDe).sort();
  ids.qtdDest = novos.length;
  check(novos.length >= 2 && new Set(paras).size === novos.length && paras.every((x) => !x.includes(";")), `um e-mail por destinatário (${novos.length} e-mails)`);
  check(paras.includes(PESSOAS.resp["E-mail"].toLowerCase()) && paras.includes(PESSOAS.fac["E-mail"].toLowerCase()), "destinatários: responsável e facilitador SOL");
  const m = novos[0] || "";
  check(m.includes("Resultado e Plano de Ação - Inspeção do Programa SOL") && m.includes(U) && m.includes(A), "assunto com programa, unidade e área");
  ids.linkSol = (m.match(/href="([^"]+\/plano-acao\/[^"]+)"/) || [])[1];
  check(!!ids.linkSol && ids.linkSol.endsWith(ids.sol), `link do e-mail aponta para o plano de ação (${ids.linkSol})`);
  await ir("/admin/inspecoes?situacao=ativas");
  check((await (await linhaInspecao(A, "SOL")).evaluate((x) => x.innerText)).includes("e-mail enviado"), "lista marca 'e-mail enviado'");
});

await etapa("19 Disparos SOL e GRD (com aviso de áreas sem responsáveis)", async () => {
  await ir("/admin");
  await clicar("Disparos", "aside", "a"); await sleep(800);
  check(new URL(p.url()).pathname === "/admin/disparos" && await temTexto("Mês"), 'item único "Disparos" no menu abre com SOL selecionado');
  let antes = outbox().length;
  await preencher("main", "campo", { "Mês": String(hoje.getMonth() + 1), Ano: String(hoje.getFullYear()), Unidade: U });
  await clicar("Disparar", "main");
  check(await esperarToast("Fluxo disparado"), "disparo SOL por unidade");
  await sleep(300);
  const disp = outbox().slice(antes);
  check(disp.length === ids.qtdDest && disp.every((x) => !/<!-- PARA: [^>]*;/.test(x)), `e-mails SOL da unidade de teste: um por destinatário (${disp.length})`);
  check(await temTexto("Resultado do disparo") && await temTexto("Enviados"), "tela mostra o resumo do disparo (enviados/falhas/sem vínculo)");
  await fecharToasts();
  // unidade com áreas sem responsáveis -> aviso
  await preencher("main", "campo", { Unidade: "Uberlândia" });
  await clicar("Disparar", "main");
  await dialogo();
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("áreas sem responsáveis")), "aviso de áreas sem responsáveis");
  await clicar("Disparar mesmo assim", '[role="dialog"]');
  check(await esperarToast("Fluxo disparado"), "disparo mesmo assim");
  await fecharToasts();
  // todas as unidades
  antes = outbox().length;
  await p.evaluate(() => [...document.querySelectorAll("main label")].find((l) => l.innerText.includes("Todas Unidades")).querySelector("button").click());
  await clicar("Disparar", "main");
  check(await esperarToast("Fluxo disparado"), "disparo SOL todas as unidades");
  await sleep(300);
  check(outbox().length - antes >= 2, `e-mails gerados para todas as inspeções SOL do mês (${outbox().length - antes})`);
  // GRD: troca pelo seletor de programa da própria tela
  await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.innerText.trim() === "GRD").click());
  await sleep(800);
  check(p.url().includes("programa=GRD") && await temTexto("Tipo") && !(await temTexto("Todas Unidades")), "seletor troca a tela para o disparo GRD");
  antes = outbox().length;
  await preencher("main", "campo", { Tipo: "Avaliação E2E", Ano: String(hoje.getFullYear()) });
  await clicar("Disparar", "main");
  await dialogo();
  await clicar("Disparar mesmo assim", '[role="dialog"]');
  check(await esperarToast("Fluxo disparado"), "disparo GRD por tipo/ano");
  await sleep(300);
  const g = outbox().slice(antes).join("\n");
  check(g.includes(PESSOAS.lider["E-mail"]) && g.includes(PESSOAS.gestor["E-mail"]) && g.includes("Programa GRD"), "e-mail GRD para líder e gestor");
  ids.linkGrd = (g.match(/href="([^"]+\/plano-acao\/[^"]+)"/) || [])[1];
  check(!!ids.linkGrd, "link GRD presente");
});

await etapa("19b Configurar e-mails: modo teste (Programação)", async () => {
  await ir("/admin");
  const itensProg = await p.evaluate(() => [...document.querySelectorAll("aside nav a")].map((a) => a.innerText.trim()));
  check(itensProg.indexOf("Configurar e-mails") === itensProg.indexOf("Disparos") + 1, "menu: 'Configurar e-mails' logo abaixo de Disparos");
  await clicar("Configurar e-mails", "aside", "a"); await sleep(800);
  check(new URL(p.url()).pathname === "/admin/configurar-emails" && await temTexto("Envio normal") && await temTexto("E-mail individual") && await temTexto("E-mail em lote"), "tela Configurar e-mails abre na aba Modo teste (desligado)");
  await p.click('[role="switch"][aria-label="Modo teste"]');
  await clicar("Salvar", "main");
  check(await esperarToast("ao menos um destinatário"), "ligar sem destinatário é bloqueado");
  await fecharToasts();
  const campo = await p.$('input[aria-label="Adicionar destinatário de teste"]');
  await campo.type("qa1@exemplo.com; qa2@exemplo.com"); await p.keyboard.press("Enter");
  await sleep(200);
  check(await p.evaluate(() => document.querySelectorAll('[aria-label="Destinatários de teste"] li').length === 2), "dois destinatários adicionados");
  await clicar("Salvar", "main");
  check(await esperarToast("Modo teste ligado"), "modo teste ligado e salvo");
  await sleep(400);
  check(await temTexto("Modo teste ATIVO"), "tela indica modo teste ativo");
  // disparo SOL da unidade de teste: só para os destinatários de teste
  await clicar("Disparos", "aside", "a"); await sleep(800);
  check(!!(await p.$("[data-modo-teste]")), "Disparos avisa que o modo teste está ativo");
  const antes = outbox().length;
  await preencher("main", "campo", { "Mês": String(hoje.getMonth() + 1), Ano: String(hoje.getFullYear()), Unidade: U });
  await clicar("Disparar", "main");
  check(await esperarToast("MODO TESTE"), "disparo em modo teste confirmado");
  await sleep(300);
  const novos = outbox().slice(antes);
  const m = novos[0] || "";
  check(novos.length === 2 && novos.some((x) => x.includes("<!-- PARA: qa1@exemplo.com -->")) && novos.some((x) => x.includes("<!-- PARA: qa2@exemplo.com -->")) && novos.every((x) => x.includes("[TESTE] Resultado e Plano de Ação")), "e-mail foi só para os destinatários de teste (um para cada), com [TESTE] no assunto");
  check(m.includes("no envio real iria para") && m.includes(PESSOAS.resp["E-mail"]), "e-mail de teste mostra os destinatários reais");
  // desliga de novo
  await clicar("Configurar e-mails", "aside", "a"); await sleep(800);
  await p.click('[role="switch"][aria-label="Modo teste"]');
  await clicar("Salvar", "main");
  check(await esperarToast("Modo teste desligado"), "modo teste desligado");
});

// substitui todo o texto de um campo controlado pelo React
async function substituirTexto(seletor, texto) {
  await p.click(seletor);
  await p.keyboard.down("Control"); await p.keyboard.press("KeyA"); await p.keyboard.up("Control");
  await p.keyboard.press("Backspace");
  await p.type(seletor, texto);
}

await etapa("19c Configurar e-mails: modelos individual e em lote (assunto e HTML)", async () => {
  await ir("/admin/configurar-emails?aba=individual");
  await sleep(600);
  check(await temTexto("Modelo padrão") && (await p.$eval('input[aria-label="Assunto do e-mail"]', (i) => i.value)).includes("{{unidade}}"), "aba E-mail individual mostra o modelo padrão para editar");
  check(!!(await p.$('iframe[title="Pré-visualização do e-mail"]')), "pré-visualização do HTML");
  await substituirTexto('input[aria-label="Assunto do e-mail"]', "Assunto E2E individual - ");
  // variável inserida pelo botão, na posição do cursor
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "{{unidade}}").click());
  await sleep(150);
  check((await p.$eval('input[aria-label="Assunto do e-mail"]', (i) => i.value)) === "Assunto E2E individual - {{unidade}}", "botão de variável insere {{unidade}} no assunto");
  check(!(await p.$('select[aria-label="Importância"]')) && !(await temTexto("Importância")), "editor sem o campo Importância");
  await substituirTexto('textarea[aria-label="Corpo do e-mail em HTML"]', '<p>Corpo E2E da <b>{{area}}</b> - {{inexistente}}</p><a href="https://app.teste/plano-acao/{{id_inspecao}}">Abrir plano</a>');
  await sleep(300);
  check(await temTexto("Variáveis desconhecidas") && await temTexto("{{inexistente}}"), "avisa variável desconhecida");
  const previa = await p.$eval('[data-previa-assunto]', (e) => e.innerText);
  check(previa === "Assunto E2E individual - Jacareí II", `pré-visualização do assunto com dados de exemplo (${previa})`);
  await clicar("Salvar", "main");
  check(await esperarToast("E-mail individual salvo"), "modelo individual salvo");
  await sleep(500);
  check(await temTexto("Modelo personalizado"), "aba indica modelo personalizado");
  // envio individual usa o modelo individual
  let antes = outbox().length;
  await ir("/admin/inspecoes?situacao=ativas");
  await clicarTitulo("Enviar plano de ação por e-mail", await linhaInspecao(A, "SOL"));
  await clicar("Enviar", '[role="alertdialog"]');
  check(await esperarToast("Preenchimento do Plano de Ação Enviado"), "envio individual com modelo editado");
  await sleep(500);
  const mi = outbox().slice(antes)[0] || "";
  check(mi.includes(`<!-- ASSUNTO: Assunto E2E individual - ${U} -->`), "e-mail individual com o assunto do modelo");
  check(mi.includes(`Corpo E2E da <b>${A}</b>`) && /href="[^"]+\/plano-acao\/[^"]+"/.test(mi) && mi.includes("{{inexistente}}"), "corpo HTML do modelo com variáveis substituídas");
  // disparo em lote continua com o modelo de lote (padrão)
  antes = outbox().length;
  await ir("/admin/disparos");
  await preencher("main", "campo", { "Mês": String(hoje.getMonth() + 1), Ano: String(hoje.getFullYear()), Unidade: U });
  await clicar("Disparar", "main");
  check(await esperarToast("Fluxo disparado"), "disparo em lote");
  await sleep(300);
  const ml = outbox().slice(antes)[0] || "";
  check(ml.includes("<!-- ASSUNTO: Resultado e Plano de Ação - Inspeção do Programa SOL"), "lote usa o próprio modelo (padrão), independente do individual");
  // restaurar o padrão do individual
  await ir("/admin/configurar-emails?aba=individual"); await sleep(600);
  await clicar("Restaurar padrão", "main");
  await p.waitForSelector('[role="alertdialog"]', { visible: true });
  await clicar("Restaurar padrão", '[role="alertdialog"]');
  check(await esperarToast("modelo padrão restaurado"), "modelo individual restaurado ao padrão");
  await sleep(500);
  check(await temTexto("Modelo padrão"), "aba volta a indicar modelo padrão");
});

await etapa("20 Planilhas SOL/GRD (exportação CSV)", async () => {
  await ir("/admin/inspecoes?situacao=ativas");
  const t0 = Date.now() - 50;
  await clicar("Planilha SOL", "main"); await sleep(1500);
  await clicar("Planilha GRD", "main"); await sleep(1500);
  const arqs = readdirSync(DOWN).filter((f) => statSync(path.join(DOWN, f)).mtimeMs >= t0); // só os baixados agora
  const sol = arqs.find((f) => f.startsWith("planilha-sol")), grd = arqs.find((f) => f.startsWith("planilha-grd"));
  check(!!sol && !!grd, `CSVs baixados: ${arqs.join(", ")}`);
  const cs = readFileSync(path.join(DOWN, sol), "utf8"), cg = readFileSync(path.join(DOWN, grd), "utf8");
  check(cs.includes("Pontuação;Empresa;Colaboradores") && cs.includes("UTE") && cs.includes(String(solEsperado.ScoreTotal).replace(".", ",") + "%"), "planilha SOL com colunas e score corretos");
  check(cg.includes("1º Pilar;2º Pilar") && cg.includes("Avaliação E2E") && cg.includes("UTE"), "planilha GRD com pilares e tipo de avaliação");
});

await etapa("21 Admin - filtro Situação: em aberto (descartar) e todas", async () => {
  await ir("/admin/inspecoes");
  check((await p.$$("main [role=tablist][aria-label=Situação] [role=tab]")).length === 4, "abas de Situação (Ativas, Em aberto, Inativas, Todas) na tela de Inspeções");
  await filtro("Situação", "emAberto");
  await sleep(1200);
  check(p.url().includes("situacao=emAberto"), "filtro Situação atualiza o endereço");
  const todosEmAberto = await p.$$eval("main ul > li", (ls) => ls.length > 0 && ls.every((l) => l.innerText.includes("Em aberto")));
  check(todosEmAberto, "Situação 'Em aberto' lista só avaliações em aberto (com etiqueta)");
  const l = await linhaInspecao("Recebimento", "GRD");
  check(!!l, "avaliação GRD em aberto listada");
  check(!(await l.$('[title="Editar inspeção"]')) && !!(await l.$('[title="Descartar avaliação"]')), "em aberto: só ação de descartar");
  await clicarTitulo("Descartar avaliação", l);
  await clicar("Descartar", '[role="alertdialog"]');
  check(await esperarToast("Avaliação descartada"), "avaliação em aberto descartada");
  await sleep(500);
  check(!(await linhaInspecao("Recebimento", "GRD")), "descartada some da lista");
});

await etapa("22 Admin - inativar inspeção", async () => {
  await ir("/admin/inspecoes?situacao=ativas");
  const l = await linhaInspecao(ids.localDemo.NomeArea, "SOL");
  await clicarTitulo("Inativar inspeção", l);
  await dialogo();
  check(await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.innerText === "Inativar").disabled), "Inativar exige motivo");
  await preencher('[role="dialog"]', "campo", { Motivo: "Inspeção duplicada (teste E2E)" });
  await clicar("Inativar", '[role="dialog"]');
  check(await esperarToast("inativada com sucesso"), "inspeção inativada");
  await ir("/admin/inspecoes");
  check(!(await linhaInspecao(ids.localDemo.NomeArea, "SOL")), "inativada sai da lista padrão (Ativas)");
  await filtro("Situação", "inativadas");
  await sleep(1200);
  const li = await linhaInspecao(ids.localDemo.NomeArea, "SOL");
  check(!!li && (await li.evaluate((x) => x.innerText.includes("Inativa"))), "aparece com Situação 'Inativas' e etiqueta");
  check(!(await li.$('[title="Inativar inspeção"]')), "inativa não mostra ações de edição");
  await filtro("Situação", "todas");
  await sleep(1200);
  const todas = await p.$$eval("main ul > li", (ls) => ls.map((l) => l.innerText));
  check(todas.some((t) => t.includes("Inativa")) && todas.some((t) => !t.includes("Inativa") && !t.includes("Em aberto")), `Situação 'Todas' junta ativas e inativas (${todas.length})`);
  ids.inativada = (await api("admin.listarInspecoes", { situacao: "inativadas" }, ADMIN)).data[0].InspecaoId;
});

// ---------- Plano de Ação ----------
async function preencherPlano(item, dados, botao) {
  await ir(item.url);
  const bts = await p.$$("main button");
  const pa = [];
  for (const b of bts) if ((await b.evaluate((x) => x.innerText.trim())) === "Plano de Ação") pa.push(b);
  await pa[item.idx].click();
  await dialogo();
  const { __foto, ...campos } = dados;
  await preencher('[role="dialog"]', "campo", campos);
  if (__foto) { const inp = await p.$('[role="dialog"] input[type=file]'); await inp.uploadFile(FOTO); await p.waitForFunction(() => document.querySelectorAll('[role="dialog"] img[alt="Evidência"]').length > 0, { timeout: 15000 }); }
  await clicar(botao, '[role="dialog"]');
}

await etapa("23 Plano de Ação SOL - acesso pelo link do e-mail (responsável Ana)", async () => {
  await comoUsuario(PESSOAS.resp["E-mail"]);
  await ir("/");
  check(!!(await p.$('main a[href="/plano-acao"]')) && !(await p.$('main a[href="/admin"]')) && !(await p.$('main a[href="/inspecao"]')), "Início do responsável só tem o cartão Plano de Ação");
  esperado = true; // 403 da Inspeção é o comportamento esperado aqui
  await ir("/inspecao");
  await p.waitForSelector("[data-sem-acesso]", { timeout: 8000 }).catch(() => {});
  check(!!(await p.$("[data-sem-acesso]")) && await temTexto("não está cadastrado como inspetor ou auditor"), "responsável (sem perfil de inspetor) vê 'Sem acesso' na tela de Inspeção");
  await p.waitForNetworkIdle({ idleTime: 300, timeout: 5000 }).catch(() => {});
  esperado = false;
  const url = new URL(ids.linkSol).pathname;
  await ir(url);
  const t = await p.evaluate(() => document.body.innerText);
  check(t.includes("Itens não conformes") && t.includes(solEsperado.Status) && t.includes("Fulano Editado"), "página do plano de ação abre pelo link com resultado e cabeçalho");
  await ir(`/plano-acao?inspecao=${ids.sol}`);
  await p.waitForFunction((id) => location.pathname === `/plano-acao/${id}`, { timeout: 8000 }, ids.sol).catch(() => {});
  check(new URL(p.url()).pathname === `/plano-acao/${ids.sol}` && await temTexto("Itens não conformes"), "link por parâmetro (?inspecao=<id>) abre o mesmo plano de ação");
  await ir(url);
  check(t.includes("Prazo para preenchimento") && t.includes("1ª Inspeção"), "prazo de preenchimento e tipo de inspeção (agendamento SOL) exibidos");
  const qtd = await p.$$eval("main button", (bs) => bs.filter((b) => b.innerText.trim() === "Plano de Ação").length);
  check(qtd === 7, `${qtd} itens não conformes com botão Plano de Ação`);
  ids.qtdNcSol = qtd;
  // validação: adicionar vazio
  await clicar("Plano de Ação", "main");
  await dialogo();
  esperado = true;
  await clicar("Adicionar", '[role="dialog"]');
  check(await esperarToast("não preenchido"), "plano exige descritivo/responsáveis");
  esperado = false;
  await clicar("Fechar", '[role="dialog"]');
  // 1º item: criar em andamento com foto
  await preencherPlano({ url, idx: 0 }, { "Data do término da ação": diasA(7), Status: "Em andamento", "Resp. pela execução": "José Manutenção", "Área responsável pela execução": "Manutenção", "Nº da Nota Criada": "OS-12345", "Descritivo da ação": "Corrigir sinalização da área", __foto: true }, "Adicionar");
  check(await esperarToast("Plano de ação enviado"), "plano criado (em andamento)");
  await semDialogo(); await sleep(500);
  check(await p.evaluate(() => [...document.querySelectorAll("main button")].filter((b) => b.innerText.trim() === "Plano de Ação")[0].dataset.situacao === "andamento"), "botão do item fica amarelo (em andamento)");
  // reabrir: em andamento continua editável (SOL também mostra o responsável pelo preenchimento); atualizar para finalizado
  await clicar("Plano de Ação", "main");
  await dialogo();
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Resp. pelo preenchimento")), "SOL mostra 'Resp. pelo preenchimento'");
  check(await p.evaluate(() => ["Resp. pela execução", "Área responsável pela execução", "Nº da Nota Criada", "Status", "Descritivo da ação"].every((r) => !window.__alvo('[role="dialog"]', "campo", r).disabled)), "plano em andamento: campos continuam editáveis");
  check(await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] img[alt="Evidência"]')].length === 1 && !!document.querySelector('[role="dialog"] [aria-label^="Remover"], [role="dialog"] button[title^="Remover"]')), "foto enviada aparece no plano (removível enquanto em andamento)");
  await preencher('[role="dialog"]', "campo", { "Resp. pela execução": "José Elétrica", Status: "Finalizado", "Descritivo da ação": "Sinalização corrigida e verificada" });
  await clicar("Atualizar", '[role="dialog"]');
  check(await esperarToast("Plano de ação enviado"), "plano atualizado para Finalizado");
  await semDialogo(); await sleep(500);
  check(await p.evaluate(() => [...document.querySelectorAll("main button")].filter((b) => b.innerText.trim() === "Plano de Ação")[0].dataset.situacao === "finalizado"), "botão do item fica verde (finalizado)");
  await clicar("Plano de Ação", "main"); await dialogo();
  check(await p.evaluate(() => ![...document.querySelectorAll('[role="dialog"] button')].some((b) => ["Atualizar", "Adicionar"].includes(b.innerText.trim()))), "plano finalizado fica somente leitura");
  check(await p.evaluate(() => window.__alvo('[role="dialog"]', "campo", "Resp. pela execução").disabled && window.__alvo('[role="dialog"]', "campo", "Resp. pela execução").value === "José Elétrica"), "edição em andamento foi salva e o finalizado trava os campos");
  await clicar("Fechar", '[role="dialog"]');
  // 2º item em andamento, demais finalizados direto
  await preencherPlano({ url, idx: 1 }, { "Data do término da ação": diasA(10), Status: "Em andamento", "Resp. pela execução": "Maria", "Área responsável pela execução": "Produção", "Descritivo da ação": "Treinar equipe" }, "Adicionar");
  await esperarToast("Plano de ação enviado"); await semDialogo();
  for (let i = 2; i < qtd; i++) {
    await preencherPlano({ url, idx: i }, { "Data do término da ação": diasA(3), Status: "Finalizado", "Resp. pela execução": "Equipe", "Área responsável pela execução": "Produção", "Descritivo da ação": `Ação do item ${i}` }, "Adicionar");
    await esperarToast("Plano de ação enviado"); await semDialogo(); await fecharToasts();
  }
  check(true, `planos preenchidos para os ${qtd} itens`);
  await clicar("Visualizar Inspeção Completa", "main");
  await dialogo();
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Requisito E2E SOL")), "visualizar inspeção completa");
  await clicar("", '[role="dialog"]', "button.absolute", { exato: false }).catch(() => p.keyboard.press("Escape"));
  await shot("23-pa-sol");
});

await etapa("24 Plano de Ação - lista, filtros e acesso do facilitador", async () => {
  await ir("/");
  await clicar("Resultado e Plano de Ação", "main", "a", { exato: false }); await sleep(800);
  check(new URL(p.url()).pathname === "/plano-acao" && !(await p.$("aside")), "cartão abre a escolha SOL/GRD do Plano de Ação (sem menu lateral)");
  await clicar("Avaliações GRD", "main", "a", { exato: false }); await sleep(800);
  check(p.url().includes("programa=GRD"), "escolha leva às avaliações GRD");
  await clicar("Resultado e Plano de Ação", "nav[aria-label=Trilha]", "a"); await sleep(800);
  check(new URL(p.url()).pathname === "/plano-acao", 'trilha da lista retorna à escolha SOL/GRD');
  await clicar("Início", "main", "a"); await sleep(800);
  check(new URL(p.url()).pathname === "/", '"← Início" do Plano de Ação volta para o Início');
  await ir("/plano-acao");
  await clicar("Inspeções SOL", "main", "a", { exato: false });
  await sleep(1000);
  const t = await p.evaluate(() => document.body.innerText);
  check(t.includes(U) && t.includes(A), "inspeção da área aparece na lista do responsável");
  check(!t.includes("Cruz Alta"), "responsável não vê inspeções de áreas sem vínculo");
  const cont = await p.evaluate((a) => [...document.querySelectorAll("main li")].find((l) => l.innerText.includes(a))?.querySelectorAll("span[title]") , A);
  const nums = await p.evaluate((a) => [...[...document.querySelectorAll("main li")].find((l) => l.innerText.includes(a)).querySelectorAll("span[title]")].map((s) => s.innerText), A);
  check(JSON.stringify(nums) === `["0","1","${ids.qtdNcSol - 1}"]`, `contadores Não iniciado/Em andamento/Finalizado = ${nums}`);
  check(t.includes("Em Dia!"), "prazo de preenchimento 'Em Dia!'");
  // filtro status: só não iniciados -> some
  await p.click('main [data-status-pa="emAndamento"]');
  await p.click('main [data-status-pa="finalizado"]');
  check(await p.$eval("main section[aria-label=Filtros]", (x) => x.innerText.includes("2 ativos")), 'contador mostra "2 ativos"');
  await sleep(1200);
  check(!(await temTexto(A)) , "filtro 'Não Iniciado' esconde inspeção sem itens pendentes");
  // facilitador
  await comoUsuario(PESSOAS.fac["E-mail"]);
  await ir("/plano-acao/lista?programa=SOL");
  check(await temTexto(A), "facilitador também acessa a inspeção da área");
});

await etapa("25 Plano de Ação GRD (líder Carla e gestor Diego)", async () => {
  await comoUsuario(PESSOAS.lider["E-mail"]);
  const url = new URL(ids.linkGrd).pathname;
  await ir(url);
  const t = await p.evaluate(() => document.body.innerText);
  check(t.includes("Avaliação do Programa GRD") && t.includes("1º Pilar") && t.includes("Avaliação E2E"), "plano de ação GRD com pilares e tipo");
  check(t.includes("Prazo para preenchimento"), "prazo do agendamento exibido");
  await preencherPlano({ url, idx: 0 }, { "Data do término da ação": diasA(5), Status: "Finalizado", "Resp. pela execução": "Carla", "Área responsável pela execução": "Qualidade", "Descritivo da ação": "Indicador atualizado" }, "Adicionar");
  check(await esperarToast("Plano de ação enviado"), "plano GRD criado pela líder");
  await semDialogo();
  await clicar("Plano de Ação", "main"); await dialogo();
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Carla Líder")), "GRD mostra 'Resp. pelo preenchimento'");
  await p.keyboard.press("Escape");
  await comoUsuario(PESSOAS.gestor["E-mail"]);
  await ir("/plano-acao/lista?programa=GRD");
  const nums = await p.evaluate((a) => [...[...document.querySelectorAll("main li")].find((l) => l.innerText.includes(a)).querySelectorAll("span[title]")].map((s) => s.innerText), A);
  check(nums[2] === "1", `gestor vê o plano finalizado pela líder (${nums})`);
});

await etapa("26 Controle de acesso", async () => {
  await comoUsuario("gabriel.externo@icl.com");
  await ir("/");
  check(await temTexto("ainda não está cadastrado"), "usuário sem perfil vê orientação na home");
  await ir(new URL(ids.linkSol).pathname);
  check(await temTexto("Sem Acesso!"), "usuário sem vínculo recebe 'Sem Acesso!' no link");
  await ir("/admin");
  check(await temTexto("Acesso restrito aos administradores"), "não-admin bloqueado no Admin");
  esperado = true;
  const r = await api("admin.indicadores", {}, "gabriel.externo@icl.com");
  check(/restrito/.test(r.message || ""), "API do admin recusa não-admin");
  const r2 = await api("inspecao.dadosSelecao", {}, PESSOAS.resp["E-mail"]);
  check(/inspetor ou auditor/.test(r2.message || ""), "API de inspeção recusa quem não é inspetor");
  const r3 = await p.evaluate(async () => (await fetch("/api/entities/Unidade", { method: "POST", headers: { "content-type": "application/json", "x-dev-user": "ana.resp@icl.com" }, body: JSON.stringify({ Nome: "X", Sigla: "X" }) })).status);
  check(r3 === 403, "regra de acesso da entidade bloqueia criação por não-admin");
  esperado = false;
  // inspeção inativada
  await comoUsuario("preenchedor@sol.local");
  await ir(`/plano-acao/${ids.inativada}`);
  check(await temTexto("Inspeção inativada!") && await temTexto("Inspeção duplicada (teste E2E)"), "link de inspeção inativada mostra o motivo");
  // inspetor não vê plano de ação de outros
  await comoUsuario(PESSOAS.inspetor["E-mail"]);
  await ir("/");
  check(!(await temTexto("Resultado e Plano de Ação")), "inspetor sem vínculo não vê Plano de Ação");
});

await etapa("27 Admin - planos no detalhe, indicadores e logs", async () => {
  await comoUsuario(ADMIN);
  await ir(`/admin/inspecao/${ids.sol}`);
  await clicar("Plano de Ação", "main", '[role="tab"]', { exato: false });
  await sleep(400);
  const verdes = await p.$$eval("main button", (bs) => bs.filter((b) => b.dataset.situacao === "finalizado").length);
  check(verdes === ids.qtdNcSol - 1, `admin vê ${verdes} planos finalizados no detalhe`);
  await clicar("Plano de Ação", "main", "button");
  await dialogo();
  check(await p.evaluate(() => !document.querySelector('[role="dialog"]').innerText.includes("Atualizar")), "admin vê o plano somente leitura");
  await p.keyboard.press("Escape");
  const ind = (await api("admin.indicadores", {}, ADMIN)).data;
  check(ind.TotalInspecao === 3 && ind.PlanoDeAcaoFinalizado === ids.qtdNcSol && ind.PlanoDeAcaoEmAndamento === 1, `indicadores: ${ind.TotalInspecao} inspeções, ${ind.PlanoDeAcaoFinalizado} PA finalizados, ${ind.PlanoDeAcaoEmAndamento} em andamento, ${ind.TotalItensNaoIniciados} não iniciados`);
  await ir("/admin");
  check(await temTexto(String(ind.PlanoDeAcaoFinalizado)), "Home do admin mostra os números");
  await ir("/admin/logs");
  const n = await p.$$eval("tbody tr", (r) => r.length);
  check(n >= 30, `${n} registros de log`);
  for (const acao of ["Inserir inspeção no banco de dados", "Salvar inspeção parcial", "Inserir plano de ação", "Editar plano de ação em andamento", "Inativar inspeção", "Disparo SOL", "Disparo GRD", "Vincular Responsável", "Editar inspeção"]) check(await temTexto(acao), `log "${acao}"`);
  await (await p.$("tbody tr")).click();
  await dialogo();
  check(await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.includes("Descrição")), "detalhe do log abre");
});

await etapa("28 Seletor 'Usuário de teste' e desvincular área", async () => {
  await ir("/");
  await (await p.$("main select")).select(PESSOAS.lider["E-mail"]);
  await sleep(2500);
  check(await temTexto(PESSOAS.lider["E-mail"]) && !(await temTexto("Administração")), "seletor troca o usuário logado");
  await comoUsuario(ADMIN);
  await ir("/admin/vinculos");
  await clicar(U, "main", "button", { exato: false });
  const linha = await p.evaluateHandle((a) => [...document.querySelectorAll("main li")].find((l) => l.innerText.includes(a)), A);
  await clicarTitulo("Desvincular área", linha.asElement());
  await clicar("Confirmar", '[role="alertdialog"]');
  check(await esperarToast("Área desvinculada"), "área desvinculada da unidade");
  await sleep(500);
  check(!(await p.evaluate((a) => [...document.querySelectorAll("main li")].some((l) => l.innerText.includes(a)), A)), "área sai da unidade");
  const insp = (await api("admin.listarInspecoes", { situacao: "ativas" }, ADMIN)).data.filter((x) => x.NomeArea === A);
  check(insp.length === 3, "inspeções já realizadas são mantidas");
});

// =====================================================================================
console.log("\n==================== RESULTADO ====================");
console.log(`Verificações OK: ${res.ok}`);
console.log(`Falhas: ${res.falhas.length}`);
res.falhas.forEach((f) => console.log("  ✘ " + f));
console.log(`Erros de JavaScript na página: ${errosConsole.length}`);
errosConsole.forEach((e) => console.log("  ! " + e));
console.log(`Respostas HTTP de erro inesperadas: ${httpErros.length}`);
httpErros.forEach((e) => console.log("  ! " + e));
writeFileSync(path.join(OUT, "resultado.json"), JSON.stringify({ ...res, errosConsole, httpErros }, null, 2));
await browser.close();
process.exit(res.falhas.length || errosConsole.length || httpErros.length ? 1 : 0);
