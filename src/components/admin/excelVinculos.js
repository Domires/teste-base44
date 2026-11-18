// Excel dos Vínculos: uma linha por pessoa vinculada (ou por local sem ninguém vinculado).
import { baixarExcel, dataArquivo, normalizarChave } from "@/lib/excel";

export const COLUNAS_VINCULOS = [
  { titulo: "Unidade", largura: 22 }, { titulo: "Área", largura: 32 }, { titulo: "Processo", largura: 16 },
  { titulo: "Programa", largura: 11 }, { titulo: "Papel", largura: 18 }, { titulo: "Nome", largura: 30 }, { titulo: "E-mail", largura: 34 },
];
const PAPEIS = ["Responsável", "Facilitador", "Líder", "Gestor", "Responsável SGI"];
const PROGRAMA_DO_PAPEL = { "Responsável": "SOL", Facilitador: "SOL", "Líder": "GRD", Gestor: "GRD", "Responsável SGI": "SGI" };
const ORDEM_PAPEL = Object.fromEntries(PAPEIS.map((p, i) => [p, i]));

const INSTRUCOES = [
  ["Unidade", "Obrigatório. Nome ou sigla de uma unidade cadastrada."],
  ["Área", "Obrigatório. Nome ou sigla de uma área cadastrada. Se a área ainda não estiver vinculada à unidade, o vínculo é criado."],
  ["Processo", "Obrigatório. Nome de um processo cadastrado. Se a área já estiver na unidade com outro processo, o processo é atualizado."],
  ["Programa", "Informativo (é definido pelo Papel). Pode ficar em branco."],
  ["Papel", `Opcional. ${PAPEIS.join(", ")}. Deixe em branco para só vincular a área à unidade.`],
  ["Nome", "Informativo. A pessoa é identificada pelo e-mail."],
  ["E-mail", "Obrigatório quando houver Papel. A pessoa precisa estar cadastrada no papel correspondente (Pessoas no menu)."],
  ["", "A importação só inclui vínculos; para remover, use a tela de Vínculos."],
];

export async function exportarVinculos(d, apenasModelo = false) {
  const linhas = [];
  if (!apenasModelo) {
    const locais = [...d.locais].sort((a, b) => a.NomeUnidade.localeCompare(b.NomeUnidade, "pt-BR") || a.NomeArea.localeCompare(b.NomeArea, "pt-BR"));
    for (const l of locais) {
      const vs = d.vinculos.filter((v) => v.UnidadeAreaProcessoId === l.UnidadeAreaProcessoId).sort((a, b) => ORDEM_PAPEL[a.Papel] - ORDEM_PAPEL[b.Papel] || a.Nome.localeCompare(b.Nome, "pt-BR"));
      if (!vs.length) linhas.push([l.NomeUnidade, l.NomeArea, l.NomeProcesso, "", "", "", ""]);
      for (const v of vs) linhas.push([l.NomeUnidade, l.NomeArea, l.NomeProcesso, v.Programa, v.Papel, v.Nome, v.Email]);
    }
  }
  await baixarExcel({ arquivo: `${apenasModelo ? "modelo" : "cadastro"}-vinculos-${dataArquivo()}.xlsx`, colunas: COLUNAS_VINCULOS, linhas, instrucoes: INSTRUCOES });
}

// Validação prévia no navegador (o servidor valida de novo ao gravar)
export function interpretarVinculos(planilha, d) {
  const pres = new Set(planilha.cabecalhos.map(normalizarChave));
  const faltam = ["Unidade", "Área", "Processo"].filter((c) => !pres.has(normalizarChave(c)));
  if (faltam.length) throw new Error(`A planilha não tem a(s) coluna(s): ${faltam.join(", ")}. Baixe o modelo para ver o formato.`);
  const ler = (l, c) => String(l.valores[normalizarChave(c)] ?? "").trim();
  const acha = (lista, v) => lista.find((x) => normalizarChave(x.Nome) === normalizarChave(v) || (x.Sigla && normalizarChave(x.Sigla) === normalizarChave(v)));
  const vistos = new Set();
  return planilha.linhas.map((l) => {
    const dados = { Unidade: ler(l, "Unidade"), Area: ler(l, "Área"), Processo: ler(l, "Processo"), Papel: ler(l, "Papel"), Email: ler(l, "E-mail").toLowerCase() };
    const erros = [];
    const u = acha(d.unidades, dados.Unidade), a = acha(d.areas, dados.Area), p = acha(d.processos, dados.Processo);
    if (!dados.Unidade) erros.push("Unidade é obrigatória"); else if (!u) erros.push(`Unidade "${dados.Unidade}" não cadastrada`);
    if (!dados.Area) erros.push("Área é obrigatória"); else if (!a) erros.push(`Área "${dados.Area}" não cadastrada`);
    if (!dados.Processo) erros.push("Processo é obrigatório"); else if (!p) erros.push(`Processo "${dados.Processo}" não cadastrado`);
    const papel = PAPEIS.find((x) => normalizarChave(x) === normalizarChave(dados.Papel));
    let acao = "atualizar";
    if (dados.Papel || dados.Email) {
      if (!papel) erros.push(`Papel "${dados.Papel}" inválido (use ${PAPEIS.join(", ")})`);
      else if (!dados.Email) erros.push("E-mail é obrigatório quando há Papel");
      else if (!(d.pessoas[papel] || []).some((x) => normalizarChave(x.Email) === normalizarChave(dados.Email))) erros.push(`${dados.Email} não está cadastrado(a) como ${papel}`);
      dados.Papel = papel || dados.Papel;
    }
    const local = u && a ? d.locais.find((x) => x.UnidadeId === u.id && x.AreaId === a.id) : null;
    if (!erros.length) {
      const chave = [u.id, a.id, papel || "", dados.Email].join("|");
      if (vistos.has(chave)) erros.push("Linha duplicada na planilha");
      vistos.add(chave);
      const jaVinculado = papel && local && d.vinculos.some((v) => v.UnidadeAreaProcessoId === local.UnidadeAreaProcessoId && v.Papel === papel && normalizarChave(v.Email) === normalizarChave(dados.Email));
      acao = !local ? "novo" : papel && !jaVinculado ? "vincular" : "atualizar";
    }
    const resumo = [dados.Unidade, dados.Area, dados.Processo, papel && `${PROGRAMA_DO_PAPEL[papel]} · ${papel}`, dados.Email].filter(Boolean).join(" · ") + (!erros.length && acao === "novo" ? " (área nova na unidade)" : !erros.length && acao === "atualizar" ? " (sem alteração ou já vinculado)" : "");
    return { linha: l.__linha, acao: erros.length ? "erro" : acao, dados, resumo, erros };
  });
}
