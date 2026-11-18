// Popula o banco LOCAL com um ano de uso realista: calendário de agendamentos, pessoas, vínculos,
// inspeções SOL / avaliações GRD / auditorias SGI e planos de ação em vários estados.
// Tudo é gravado pelas MESMAS funções de negócio usadas pelo app (validações e scores idênticos).
// Uso: npm run popular            (recusa se já houver muitas inspeções)
//      npm run popular -- --forcar
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { findUser, publicUser } from "./lib/auth.js";
import { store } from "./lib/db.js";
import { createEntities } from "./lib/entities.js";
import { UPLOADS_DIR } from "./lib/paths.js";
import { seedIfEmpty } from "./seed.js";
import * as admin from "./functions/admin.js";
import * as inspecao from "./functions/inspecao.js";
import * as plano from "./functions/plano.js";
import { itensNaoConformes, normasDisponiveis } from "../src/lib/scores.js";
import { UNIDADES_SEM_SGI } from "../src/lib/constantes.js";

await seedIfEmpty();
if (store.all("Inspecao").length > 20 && !process.argv.includes("--forcar")) {
  console.log("O banco já tem inspeções. Use 'npm run popular -- --forcar' para adicionar mais.");
  process.exit(0);
}

// ---------- aleatoriedade reprodutível ----------
let semente = 20261117;
const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 4294967296);
const sorteio = (lista) => lista[Math.floor(rnd() * lista.length)];
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const embaralhar = (l) => l.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const somaDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoje = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
const ANO = Number(hoje.slice(0, 4));

// ---------- imagens (fotos de evidência e assinaturas) ----------
function png(w, h, pintar) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = pintar(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
mkdirSync(UPLOADS_DIR, { recursive: true });
function salvarImagem(nome, buf) {
  writeFileSync(path.join(UPLOADS_DIR, nome), buf);
  return `/uploads/${nome}`;
}
const CORES = [[120, 130, 140], [170, 120, 70], [90, 140, 90], [150, 150, 110], [110, 120, 160], [160, 100, 100]];
const FOTOS = CORES.map((c, i) =>
  salvarImagem(`carga-foto-${i + 1}.png`, png(320, 240, (x, y) => {
    const faixa = Math.floor((x + y * 0.6) / 40) % 2;
    const mancha = (x - 160 - i * 10) ** 2 + (y - 120) ** 2 < 2500 ? 60 : 0;
    return [Math.min(255, c[0] + faixa * 25 + mancha), c[1] + faixa * 20, c[2] + faixa * 15];
  })),
);
const ASSINATURAS = Array.from({ length: 5 }, (_, i) =>
  salvarImagem(`carga-assinatura-${i + 1}.png`, png(360, 120, (x, y) => {
    const f = 60 + 28 * Math.sin(x / (9 + i * 2)) * Math.cos(x / (31 + i * 5)) + (x / 12) * (i % 2 ? 1 : -0.4);
    return Math.abs(y - f) < 2 && x > 20 && x < 340 ? [3, 42, 71] : [255, 255, 255];
  })),
);

// ---------- contextos (quem executa cada ação) ----------
const sr = createEntities({ serviceRole: true });
const ctxDe = (email) => {
  const u = findUser(email);
  if (!u) throw new Error(`Usuário ${email} não encontrado`);
  const user = publicUser(u);
  return { user, req: { headers: { "user-agent": "Carga de dados (popular.js)" } }, sr, entities: createEntities({ user }) };
};
const ADMIN = ctxDe(store.all("User").find((u) => u.role === "admin").email);

// ---------- pessoas ----------
const P = (Nome, user, extra = {}) => ({ Nome, Email: `${user}@sol.local`, ...extra });
const PESSOAS = {
  Inspetor: [P("Carlos Mendes", "carlos.mendes"), P("Patrícia Rocha", "patricia.rocha"), P("Rafael Lima", "rafael.lima"), P("Juliana Costa", "juliana.costa"), P("Eduardo Alves", "eduardo.alves")],
  Auditor: [P("Renata Figueiredo", "renata.figueiredo", { Cargo: "Auditora Líder", Tipo: "Interno" }), P("Marcelo Tavares", "marcelo.tavares", { Cargo: "Auditor", Tipo: "Externo" })],
  Responsavel: [["Ana Paula Souza", "ana.souza"], ["Bruno Ferreira", "bruno.ferreira"], ["Camila Ribeiro", "camila.ribeiro"], ["Daniel Martins", "daniel.martins"], ["Fernanda Gomes", "fernanda.gomes"], ["Gustavo Pereira", "gustavo.pereira"], ["Helena Barbosa", "helena.barbosa"], ["Igor Carvalho", "igor.carvalho"]].map(([n, u]) => P(n, u, { Cargo: "Supervisor(a) de Área" })),
  Facilitador: [["Jéssica Nunes", "jessica.nunes"], ["Leonardo Dias", "leonardo.dias"], ["Mariana Teixeira", "mariana.teixeira"], ["Otávio Moreira", "otavio.moreira"]].map(([n, u]) => P(n, u, { Cargo: "Técnico(a) de Segurança" })),
  Lider: [["Paulo Henrique Silva", "paulo.silva"], ["Queila Araújo", "queila.araujo"], ["Ricardo Lopes", "ricardo.lopes"], ["Sabrina Melo", "sabrina.melo"]].map(([n, u]) => P(n, u, { Cargo: "Líder de Turno" })),
  Gestor: [["Thiago Cardoso", "thiago.cardoso"], ["Vanessa Pinto", "vanessa.pinto"], ["Wagner Rezende", "wagner.rezende"], ["Yasmin Freitas", "yasmin.freitas"]].map(([n, u]) => P(n, u, { Cargo: "Gerente de Produção" })),
  ResponsavelSgi: [["Aline Castro", "aline.castro"], ["Beatriz Rangel", "beatriz.rangel"], ["César Duarte", "cesar.duarte"]].map(([n, u]) => P(n, u, { Cargo: "Analista SGI" })),
};
const areasIds = store.all("Area").map((a) => a.id);
const criados = {};
for (const [ent, lista] of Object.entries(PESSOAS)) {
  criados[ent] = [];
  for (const p of lista) {
    const existente = store.all(ent).find((x) => x.Email === p.Email);
    const dados = ent === "Inspetor" ? { Nome: p.Nome, Email: p.Email, AreaId: sorteio(areasIds) } : p;
    criados[ent].push(existente || (await admin.salvarCadastro(ADMIN, { entidade: ent, dados })));
  }
}
console.log(`[popular] pessoas: ${Object.values(criados).flat().length}`);

// ---------- calendário de agendamentos ----------
async function tipo(Tipo, Programa, Descricao) {
  return store.all("TipoDeInspecao").find((t) => t.Tipo === Tipo && t.Programa === Programa)
    || (await admin.salvarCadastro(ADMIN, { entidade: "TipoDeInspecao", dados: { Tipo, Programa, Descricao } }));
}
const m = (mes, dia) => `${ANO}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const CALENDARIO = [
  ["SOL", "1ª Inspeção", m(1, 12), m(1, 30), m(2, 2), m(3, 2)],
  ["SOL", "2ª Inspeção", m(3, 9), m(3, 27), m(3, 30), m(4, 28)],
  ["SOL", "3ª Inspeção", m(5, 11), m(5, 29), m(6, 1), m(6, 30)],
  ["SOL", "4ª Inspeção", m(7, 6), m(7, 24), m(7, 27), m(8, 25)],
  ["SOL", "5ª Inspeção", m(9, 8), m(9, 25), m(9, 28), m(10, 27)],
  ["SOL", "6ª Inspeção", somaDias(hoje, -14), somaDias(hoje, 11), hoje, somaDias(hoje, 30)],
  ["GRD", "Diagnóstico", m(2, 9), m(2, 27), m(3, 2), m(3, 31)],
  ["GRD", "1ª Avaliação", m(5, 4), m(5, 22), m(5, 25), m(6, 24)],
  ["GRD", "2ª Avaliação", m(8, 3), m(8, 21), m(8, 24), m(9, 23)],
  ["GRD", "3ª Avaliação", somaDias(hoje, -14), somaDias(hoje, 11), hoje, somaDias(hoje, 30)],
  ["SGI", "Auditoria 1º Semestre", m(6, 1), m(6, 19), m(6, 22), m(7, 22)],
  ["SGI", "Auditoria Interna", somaDias(hoje, -14), somaDias(hoje, 11), hoje, somaDias(hoje, 30)],
];
const janelas = [];
for (const [prog, nome, i1, i2, p1, p2] of CALENDARIO) {
  const t = await tipo(nome, prog, prog === "SOL" ? "Inspeção bimestral SOL" : prog === "GRD" ? "Avaliação trimestral GRD" : "Auditoria do SGI");
  await admin.salvarAgendamento(ADMIN, { tipoDeInspecaoId: t.id, ano: ANO, etapa: "Inspeção", dtInicial: i1, dtFinal: i2 });
  await admin.salvarAgendamento(ADMIN, { tipoDeInspecaoId: t.id, ano: ANO, etapa: "Preenchimento do PA", dtInicial: p1, dtFinal: p2 });
  janelas.push({ prog, nome, ini: i1, fim: i2 < hoje ? i2 : hoje, paFim: p2, atual: i2 >= hoje });
}
console.log(`[popular] agendamentos: ${janelas.length}`);

// ---------- locais e vínculos ----------
const dv = await admin.dadosVinculos(ADMIN);
const porUnidade = {};
for (const l of dv.locais) (porUnidade[l.NomeUnidade] ||= []).push(l);
const vinculadosDemo = new Set(dv.vinculos.map((v) => v.UnidadeAreaProcessoId));
const locais = [...dv.locais.filter((l) => vinculadosDemo.has(l.UnidadeAreaProcessoId))];
for (const lista of Object.values(porUnidade)) for (const l of embaralhar(lista).slice(0, 3)) if (!locais.includes(l)) locais.push(l);
async function vincular(uapId, papel, pessoa) {
  if (dv.vinculos.some((v) => v.UnidadeAreaProcessoId === uapId && v.Papel === papel && v.PessoaId === pessoa.id)) return;
  await admin.vincularPessoa(ADMIN, { uapId, papel, pessoaId: pessoa.id }).catch(() => {});
}
for (const [i, l] of locais.entries()) {
  const id = l.UnidadeAreaProcessoId;
  await vincular(id, "Responsável", criados.Responsavel[i % 8]);
  if (i % 2 === 0) await vincular(id, "Facilitador", criados.Facilitador[i % 4]);
  await vincular(id, "Líder", criados.Lider[i % 4]);
  await vincular(id, "Gestor", criados.Gestor[(i + 1) % 4]);
  if (!UNIDADES_SEM_SGI.includes(l.NomeUnidade)) await vincular(id, "Responsável SGI", criados.ResponsavelSgi[i % 3]);
}
const vinculos = store.all("Vinculo");
console.log(`[popular] locais com vínculo: ${locais.length} · vínculos: ${vinculos.length}`);

// ---------- textos ----------
const OBS_SOL = ["Material fora do lugar demarcado", "Extintor com lacre rompido", "Piso com resíduo de produto", "Sinalização desbotada", "Cabos sem fixação", "Lixeira sem identificação", "Ferramentas sobre a bancada", "Vazamento próximo à válvula", "Iluminação deficiente no corredor", "EPI guardado em local inadequado"];
const EVID_GRD = ["Evidenciado em registro do SE Suite", "Conferido no quadro de gestão à vista", "Verificado no controle de processo", "Planilha de indicadores atualizada", "Evidenciado em ata de reunião", "Treinamento registrado no DD00721", "Não evidenciado registro no período", "Pendência em atraso no SE Suite", "Documento desatualizado (revisão vencida)"];
const ACOES = ["Reorganizar o local e demarcar áreas de armazenamento", "Substituir o item danificado e registrar no checklist diário", "Treinar a equipe no procedimento aplicável", "Abrir nota de manutenção para correção definitiva", "Atualizar o documento e divulgar à equipe", "Incluir verificação na rotina de 5S do turno", "Realizar limpeza e eliminar a fonte do problema", "Revisar a sinalização da área"];
const AREAS_EXEC = ["Manutenção", "Produção", "Segurança do Trabalho", "Qualidade", "Facilities", "Logística"];
const EXECUTORES = ["José Ribeiro", "Marcos Antunes", "Luciana Prado", "Equipe do turno A", "Equipe do turno B", "Roberto Campos", "Sandra Vieira"];
const APONT = ["Registro de calibração vencido", "Procedimento não disponível no posto", "Ação corretiva aberta sem prazo", "Treinamento não evidenciado", "Indicador sem análise crítica"];
const avaliadores = criados.Inspetor;

// ---------- respostas ----------
function respostasSol(checklist, q) {
  return checklist.map((it) => {
    const r = rnd() < 0.06 ? "N/A" : rnd() < q ? "Sim" : "Não";
    return { Id: it.Id, Resposta: r, ItemObservacao: r === "Não" ? sorteio(OBS_SOL) : "", Fotos: r === "Não" ? [sorteio(FOTOS)] : [] };
  });
}
function respostasGrd(checklist, q) {
  return checklist.map((it) => {
    const r = rnd() < q ? "Sim" : "Não";
    return { Id: it.Id, Resposta: r, ItemObservacao: r === "Sim" ? sorteio(EVID_GRD.slice(0, 6)) : sorteio(EVID_GRD.slice(6)), Fotos: rnd() < 0.15 ? [sorteio(FOTOS)] : [] };
  });
}
function respostasSgi(checklist) {
  return checklist.map((it) => {
    const x = rnd();
    const r = x < 0.6 ? "Conforme" : x < 0.7 ? "Ponto Positivo" : x < 0.8 ? "Ponto de Melhoria" : x < 0.88 ? "Não Conformidade Menor" : x < 0.92 ? "Não Conformidade Maior" : "N/A";
    const ap = ["Ponto de Melhoria", "Não Conformidade Menor", "Não Conformidade Maior"].includes(r);
    return {
      Id: it.Id, Resposta: r,
      EvidenciasObjetivas: r === "N/A" ? "" : "Verificado em campo e em registros",
      DescricaoApontamento: ap ? sorteio(APONT) : "", ReferenciaNormativa: ap ? "ISO 9001 / 14001 / 45001" : "", SugestaoDeAdequacao: ap ? "Tratar no plano de ação da área" : "",
      Fotos: ap && rnd() < 0.5 ? [sorteio(FOTOS)] : [],
    };
  });
}

// ---------- inspeções ----------
const dataNaJanela = (j) => {
  const ini = new Date(`${j.ini}T12:00:00`), fim = new Date(`${j.fim}T12:00:00`);
  return somaDias(j.ini, entre(0, Math.max(0, Math.round((fim - ini) / 86400000))));
};
const criadas = [];
let emAberto = 0;
const vinculoDe = (uap, prog) => vinculos.filter((v) => v.UnidadeAreaProcessoId === uap && v.Programa === prog);

async function inspecionar(prog, j, local, { parcial = false } = {}) {
  const uapId = local.UnidadeAreaProcessoId;
  const insp = prog === "SGI" ? criados.Auditor[entre(0, 1)] : sorteio(avaliadores);
  const ctx = ctxDe(insp.Email);
  const normas = prog === "SGI" ? embaralhar(normasDisponiveis(local.NomeArea)).slice(0, entre(1, 3)) : [];
  const form = await inspecao.abrirFormulario(ctx, { programa: prog, uapId, normas });
  const q = sorteio([0.55, 0.65, 0.72, 0.8, 0.86, 0.9, 0.94, 0.98]);
  let respostas = prog === "SOL" ? respostasSol(form.checklist, q) : prog === "GRD" ? respostasGrd(form.checklist, q) : respostasSgi(form.checklist);
  const data = dataNaJanela(j);
  const outro = sorteio(avaliadores.filter((a) => a.Nome !== insp.Nome));
  const cabecalho = {
    Data: data,
    RespAcompanhamento: sorteio(["José Ribeiro", "Marcos Antunes", "Luciana Prado", "Roberto Campos", "Sandra Vieira", "Felipe Moura"]),
    Cargo: sorteio(["Operador", "Supervisor", "Técnico", "Encarregado"]),
    Inspetor1: insp.Nome, Inspetor2: outro.Nome, Avaliador: insp.Nome,
    Auditor: insp.Nome, EquipeEntrevistada: embaralhar(["Operador de turno", "Supervisor da área", "Técnico de manutenção", "Analista de qualidade"]).slice(0, 2).join(";"),
    Observacao: rnd() < 0.4 ? sorteio(["Área em reforma parcial", "Turno com equipe reduzida", "Boa evolução em relação à inspeção anterior", "Atenção à organização do almoxarifado"]) : "",
  };
  if (parcial) {
    respostas = respostas.slice(0, Math.floor(respostas.length / 2));
    const r = await inspecao.salvarParcial(ctx, { programa: prog, uapId, normas, cabecalho, respostas });
    emAberto++;
    return r.id;
  }
  const r = await inspecao.finalizar(ctx, { programa: prog, uapId, normas, cabecalho, respostas, assinaturaUrl: prog === "SGI" ? null : sorteio(ASSINATURAS) });
  criadas.push({ id: r.id, prog, j, data, uapId });
  return r.id;
}

for (const j of janelas) {
  const qtd = j.prog === "SOL" ? (j.atual ? 9 : 12) : j.prog === "GRD" ? (j.atual ? 6 : 8) : (j.atual ? 3 : 5);
  const elegiveis = locais.filter((l) => j.prog !== "SGI" || !UNIDADES_SEM_SGI.includes(l.NomeUnidade));
  const escolhidos = embaralhar(elegiveis).slice(0, qtd);
  for (const l of escolhidos) await inspecionar(j.prog, j, l);
  if (j.atual && j.prog !== "SOL") {
    // avaliações/auditorias em andamento (salvas parcialmente) em locais sem inspeção finalizada no período
    for (const l of embaralhar(elegiveis.filter((x) => !escolhidos.includes(x))).slice(0, 2)) await inspecionar(j.prog, j, l, { parcial: true });
  }
  console.log(`[popular] ${j.prog} ${j.nome}: ${qtd} finalizadas`);
}

// ---------- planos de ação ----------
let planos = 0;
for (const c of criadas.filter((x) => x.prog !== "SGI")) {
  const insp = store.get("Inspecao", c.id);
  const nc = itensNaoConformes(c.prog, insp.Checklist);
  const pessoas = vinculoDe(c.uapId, c.prog);
  if (!pessoas.length) continue;
  const passado = c.j.paFim < hoje;
  const areaEmDia = passado && rnd() < 0.6; // ~60% das áreas concluem todos os planos dentro do prazo
  for (const item of nc) {
    const x = rnd();
    const estado = areaEmDia ? "Finalizado" : passado ? (x < 0.7 ? "Finalizado" : x < 0.85 ? "Em andamento" : null) : (x < 0.25 ? "Finalizado" : x < 0.55 ? "Em andamento" : null);
    if (!estado) continue;
    const ctx = ctxDe(sorteio(pessoas).Email);
    const base = {
      inspecaoId: c.id, itemRef: String(item.Id), Acao: sorteio(ACOES), Data: somaDias(c.data, entre(7, 40)), Status: "Em andamento",
      RespExec: sorteio(EXECUTORES), AreaResponsavel: sorteio(AREAS_EXEC), OrdemDeServico: rnd() < 0.4 ? `OS-${entre(100000, 999999)}` : "", Fotos: rnd() < 0.3 ? [sorteio(FOTOS)] : [],
    };
    await plano.salvar(ctx, base);
    if (estado === "Finalizado") await plano.salvar(ctx, { ...base, Status: "Finalizado", Acao: `${base.Acao}. Ação concluída e verificada.`, Fotos: rnd() < 0.4 ? [sorteio(FOTOS)] : [] });
    planos++;
  }
  // e-mail de plano de ação já disparado para os períodos encerrados
  if (passado) store.update("Inspecao", c.id, { Disparado: true, DataDisparo: `${somaDias(c.data, 3)}T09:00:00.000Z` });
}
console.log(`[popular] planos de ação: ${planos}`);

// ---------- inativações ----------
const motivos = ["Inspeção registrada em duplicidade.", "Área estava em parada programada no dia da inspeção.", "Inspeção realizada na área errada; refeita em seguida."];
let inativadas = 0;
for (const c of embaralhar(criadas.filter((x) => !x.j.atual && x.prog !== "SGI")).slice(0, 3)) {
  await admin.inativarInspecao(ADMIN, { id: c.id, motivo: motivos[inativadas] });
  inativadas++;
}

// ---------- resumo ----------
const ind = await admin.indicadores(ADMIN);
console.log("\n[popular] Concluído:");
console.log(`  Inspeções finalizadas: ${criadas.length} (SOL ${criadas.filter((x) => x.prog === "SOL").length}, GRD ${criadas.filter((x) => x.prog === "GRD").length}, SGI ${criadas.filter((x) => x.prog === "SGI").length})`);
console.log(`  Em aberto: ${emAberto} · Inativadas: ${inativadas}`);
console.log(`  Planos de ação: ${ind.PlanoDeAcaoFinalizado} finalizados, ${ind.PlanoDeAcaoEmAndamento} em andamento, ${ind.TotalItensNaoIniciados} não iniciados`);
for (const pp of ind.porPrograma) console.log(`  ${pp.programa}: ${pp.inspecoes} inspeções ativas, ${pp.emAtraso} com plano em atraso`);
console.log("  Usuários de teste para os preenchedores: veja Admin → Usuários (ex.: ana.souza@sol.local, paulo.silva@sol.local).");
