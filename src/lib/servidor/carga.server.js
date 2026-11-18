// Carga inicial dos cadastros (o banco do Base44 começa vazio). Dados reais das planilhas da pasta Documentação:
// - Unidades / Áreas / Processos / locais: base_avaliacoes_grd_atualizado.xlsx (8 unidades, 31 áreas, 66 locais)
// - Itens SOL: planilha FR00612 (31 itens)
// - Pilares e itens GRD: planilha "Check List - 2a. Avaliação - ENS" (36 itens)
// Não carrega pessoas, vínculos, tipos de inspeção, agendamentos nem questões SGI: esses são cadastrados pelo Admin.
import dadosTexto from "./dados-iniciais.json?raw";

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function siglaUnica(nome, usadas, tam = 3) {
  const romano = { I: "1", II: "2", III: "3" };
  const partes = semAcento(nome).toUpperCase().split(/\s+/);
  const sufixo = romano[partes[partes.length - 1]] || "";
  const base = partes.filter((p) => !romano[p]).join("").replace(/[^A-Z]/g, "").slice(0, tam) + sufixo;
  let s = base, n = 2;
  while (usadas.has(s)) s = `${base}${n++}`;
  usadas.add(s);
  return s;
}

// Entidades que precisam estar vazias para a carga (evita duplicar cadastros)
export const ENTIDADES_DA_CARGA = ["Unidade", "Area", "Processo", "UnidadeAreaProcesso", "ItemSol", "Pilar", "ItemGrd"];

export async function cadastrosVazios(sr) {
  const contagens = await Promise.all(ENTIDADES_DA_CARGA.map((e) => sr[e].list(undefined, 1)));
  return contagens.every((r) => !r.length);
}

// Cria os registros; devolve as quantidades por entidade.
export async function carregar(sr) {
  const dados = JSON.parse(dadosTexto);
  const sigU = new Set(), sigA = new Set();
  const nomesU = [...new Set(dados.locais.map((l) => l.Unidade))];
  const nomesA = [...new Set(dados.locais.map((l) => l.Area))];
  const nomesP = [...new Set(dados.locais.map((l) => l.Processo))];
  const porNome = (lista) => new Map(lista.map((r) => [r.Nome, r]));
  const U = porNome(await sr.Unidade.bulkCreate(nomesU.map((Nome) => ({ Nome, Sigla: siglaUnica(Nome, sigU), Escopo: "" }))));
  const A = porNome(await sr.Area.bulkCreate(nomesA.map((Nome) => ({ Nome, Sigla: siglaUnica(Nome, sigA) }))));
  const P = porNome(await sr.Processo.bulkCreate(nomesP.map((Nome) => ({ Nome }))));
  const locais = await sr.UnidadeAreaProcesso.bulkCreate(
    dados.locais.map((l) => ({ UnidadeId: U.get(l.Unidade).id, AreaId: A.get(l.Area).id, ProcessoId: P.get(l.Processo).id })),
  );
  const sol = await sr.ItemSol.bulkCreate(
    dados.sol.map((i, idx) => ({ Ordem: idx + 1, Requisito: i.Requisito, Categoria: i.Categoria, Subcategoria: i.Subcategoria, Ativo: true })),
  );
  const nomesPilares = [...new Set(dados.grd.map((i) => i.Pilar))];
  const pilaresCriados = await sr.Pilar.bulkCreate(nomesPilares.map((desc, idx) => ({ Nome: `${idx + 1}º Pilar`, Descricao: desc.toUpperCase(), Ordem: idx + 1 })));
  const pilarDe = new Map(nomesPilares.map((desc, idx) => [desc, pilaresCriados[idx]]));
  const grd = await sr.ItemGrd.bulkCreate(
    dados.grd.map((i, idx) => ({ Ordem: idx + 1, Requisito: i.Requisito, NmrRequisito: i.NmrRequisito, NmrSubRequisito: i.NmrSubRequisito, PilarId: pilarDe.get(i.Pilar).id, Ativo: true })),
  );
  return { unidades: U.size, areas: A.size, processos: P.size, locais: locais.length, itensSol: sol.length, pilares: pilaresCriados.length, itensGrd: grd.length };
}
