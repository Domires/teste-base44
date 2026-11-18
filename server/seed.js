// Carga inicial do banco local.
// - Itens SOL: planilha FR00612 (Check-list de avaliação do Programa SOL)
// - Itens GRD e pilares: planilha "Check List - 2a. Avaliação - ENS"
// - Unidades/Áreas/Processos: base_avaliacoes_grd_atualizado.xlsx
// Uso: npm run seed (só se o banco estiver vazio) | npm run seed:reset (apaga tudo e recarrega)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { store } from "./lib/db.js";
import { schemas } from "./lib/entities.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(here, "seed-data.json"), "utf8"));

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function siglaUnica(nome, usadas, tam = 3) {
  const romano = { I: "1", II: "2", III: "3" };
  const partes = semAcento(nome).toUpperCase().split(/\s+/);
  const sufixo = romano[partes[partes.length - 1]] || "";
  let base = partes.filter((p) => !romano[p]).join("").replace(/[^A-Z]/g, "").slice(0, tam) + sufixo;
  let s = base, n = 2;
  while (usadas.has(s)) s = `${base}${n++}`;
  usadas.add(s);
  return s;
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@sol.local").toLowerCase();

function carregar() {
  const ins = (e, d) => store.insert(e, d, "seed");
  const ano = new Date().getFullYear();

  // Usuários
  ins("User", { email: ADMIN_EMAIL, full_name: "Administrador", role: "admin" });
  ins("User", { email: "inspetor@sol.local", full_name: "Inspetor Demonstração", role: "user" });
  ins("User", { email: "preenchedor@sol.local", full_name: "Preenchedor Demonstração", role: "user" });

  // Unidades / Áreas / Processos / Locais
  const sigU = new Set(), sigA = new Set();
  const unidades = new Map(), areas = new Map(), processos = new Map();
  for (const l of seed.locais) {
    if (!unidades.has(l.Unidade)) unidades.set(l.Unidade, ins("Unidade", { Nome: l.Unidade, Sigla: siglaUnica(l.Unidade, sigU), Escopo: "" }));
    if (!areas.has(l.Area)) areas.set(l.Area, ins("Area", { Nome: l.Area, Sigla: siglaUnica(l.Area, sigA) }));
    if (!processos.has(l.Processo)) processos.set(l.Processo, ins("Processo", { Nome: l.Processo }));
  }
  if (!areas.has("Manutenção")) areas.set("Manutenção", ins("Area", { Nome: "Manutenção", Sigla: siglaUnica("Manutenção", sigA) }));
  const locais = seed.locais.map((l) =>
    ins("UnidadeAreaProcesso", { UnidadeId: unidades.get(l.Unidade).id, AreaId: areas.get(l.Area).id, ProcessoId: processos.get(l.Processo).id }),
  );

  // Checklist SOL
  seed.sol.forEach((i, idx) => ins("ItemSol", { Ordem: idx + 1, Requisito: i.Requisito, Categoria: i.Categoria, Subcategoria: i.Subcategoria, Ativo: true }));

  // Pilares e checklist GRD
  const nomesPilares = [...new Set(seed.grd.map((i) => i.Pilar))];
  const pilares = new Map(nomesPilares.map((desc, idx) => [desc, ins("Pilar", { Nome: `${idx + 1}º Pilar`, Descricao: desc.toUpperCase(), Ordem: idx + 1 })]));
  seed.grd.forEach((i, idx) =>
    ins("ItemGrd", { Ordem: idx + 1, Requisito: i.Requisito, NmrRequisito: i.NmrRequisito, NmrSubRequisito: i.NmrSubRequisito, PilarId: pilares.get(i.Pilar).id, Ativo: true }),
  );

  // Questões SGI (EXEMPLOS — substituir pelas questões reais pela tela Admin > Questões Auditoria)
  const sgi = [
    { Questao: "Os procedimentos operacionais da área estão atualizados e disponíveis no local de trabalho?", Procedimento: "PG00001 - Controle de Documentos", ISO9001: "7.5", ISO14001: "7.5", ISO45001: "7.5", PROCESSO: "Documentação" },
    { Questao: "Os aspectos e impactos ambientais da área estão identificados e controlados?", Procedimento: "PG00002 - Aspectos e Impactos", ISO14001: "6.1.2" },
    { Questao: "Os perigos e riscos da atividade estão identificados no inventário de riscos?", Procedimento: "PG00003 - Perigos e Riscos", ISO45001: "6.1.2" },
    { Questao: "As ações corretivas abertas para a área estão dentro do prazo?", Procedimento: "PG00004 - Ação Corretiva", ISO9001: "10.2", CAPA: "Prazo das ações" },
    { Questao: "O bloqueio de energias (LOTOTO) é aplicado conforme procedimento nas intervenções?", Procedimento: "PG00005 - LOTOTO", LOTOTO: "Aplicação do bloqueio", Area: "Manutenção" },
  ];
  sgi.forEach((q, idx) => ins("ItemSgi", { Ordem: idx + 1, Area: "", Ativo: true, ...q }));

  // Tipos de inspeção e agendamentos do ano corrente (janela aberta hoje para os três programas)
  const tipos = [
    ["1ª Inspeção", "Inspeção bimestral SOL", "SOL"], ["2ª Inspeção", "Inspeção bimestral SOL", "SOL"],
    ["Diagnóstico", "Diagnóstico anual GRD", "GRD"], ["1ª Avaliação", "Avaliação trimestral GRD", "GRD"],
    ["Auditoria Interna", "Auditoria interna SGI", "SGI"],
  ].map(([Tipo, Descricao, Programa]) => ins("TipoDeInspecao", { Tipo, Descricao, Programa }));
  const hoje = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const add = (n) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n);
  for (const t of tipos.filter((t) => ["1ª Inspeção", "1ª Avaliação", "Auditoria Interna"].includes(t.Tipo))) {
    ins("Agendamento", { TipoDeInspecaoId: t.id, Ano: Number(iso(add(-10)).slice(0, 4)), InspecaoDtInicial: iso(add(-10)), InspecaoDtFinal: iso(add(20)), PaDtInicial: iso(add(0)), PaDtFinal: iso(add(30)) });
  }

  // Pessoas de demonstração
  const area0 = areas.get(seed.locais[0].Area);
  ins("Inspetor", { Nome: "Inspetor Demonstração", Email: "inspetor@sol.local", AreaId: area0.id });
  ins("Inspetor", { Nome: "Segundo Inspetor", Email: "inspetor2@sol.local", AreaId: area0.id });
  ins("Auditor", { Nome: "Inspetor Demonstração", Email: "inspetor@sol.local", Cargo: "Auditor Interno", Tipo: "Interno" });
  const resp = ins("Responsavel", { Nome: "Preenchedor Demonstração", Email: "preenchedor@sol.local", Cargo: "Supervisor" });
  const lider = ins("Lider", { Nome: "Preenchedor Demonstração", Email: "preenchedor@sol.local", Cargo: "Supervisor" });
  const rsgi = ins("ResponsavelSgi", { Nome: "Preenchedor Demonstração", Email: "preenchedor@sol.local", Cargo: "Supervisor" });
  for (const l of locais.slice(0, 3)) {
    ins("Vinculo", { UnidadeAreaProcessoId: l.id, Programa: "SOL", Papel: "Responsável", PessoaId: resp.id, Nome: resp.Nome, Email: resp.Email, Cargo: resp.Cargo });
    ins("Vinculo", { UnidadeAreaProcessoId: l.id, Programa: "GRD", Papel: "Líder", PessoaId: lider.id, Nome: lider.Nome, Email: lider.Email, Cargo: lider.Cargo });
    ins("Vinculo", { UnidadeAreaProcessoId: l.id, Programa: "SGI", Papel: "Responsável SGI", PessoaId: rsgi.id, Nome: rsgi.Nome, Email: rsgi.Email, Cargo: rsgi.Cargo });
  }
  return { ano };
}

export async function seedIfEmpty() {
  if (store.all("User").length) return false;
  store.transaction(carregar);
  console.log(`[seed] Banco inicializado. Usuários: ${ADMIN_EMAIL} (admin), inspetor@sol.local, preenchedor@sol.local`);
  return true;
}

// Execução direta: node server/seed.js [--reset]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--reset")) {
    for (const name of Object.keys(schemas)) store.clear(name);
    store.clear("User");
    console.log("[seed] Dados apagados.");
  }
  const ok = await seedIfEmpty();
  if (!ok) console.log("[seed] Banco já possui dados — nada a fazer (use --reset para recarregar).");
}
