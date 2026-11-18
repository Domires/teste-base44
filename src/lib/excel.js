// Leitura e geração de planilhas Excel (.xlsx) no NAVEGADOR — funciona igual no ambiente local e no Base44.
// As bibliotecas são carregadas sob demanda (só quando o usuário exporta/importa).

export const normalizarChave = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const AZUL = "#04C4D9";

/**
 * Gera e baixa um .xlsx.
 * colunas: [{ titulo, largura? }]; linhas: array de arrays de valores; instrucoes: [[campo, descrição], ...] (aba extra)
 */
export async function baixarExcel({ arquivo, colunas, linhas, instrucoes }) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const cab = colunas.map((c) => ({ value: c.titulo, fontWeight: "bold", color: "#FFFFFF", backgroundColor: AZUL }));
  const corpo = linhas.map((l) => l.map((v) => ({ value: v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Sim" : "Não") : v })));
  const abas = [{ data: [cab, ...corpo], sheet: "Dados", columns: colunas.map((c) => ({ width: c.largura || Math.max(12, Math.min(60, c.titulo.length + 6)) })), stickyRowsCount: 1 }];
  if (instrucoes?.length) {
    abas.push({
      data: [
        [{ value: "Coluna", fontWeight: "bold", color: "#FFFFFF", backgroundColor: AZUL }, { value: "Como preencher", fontWeight: "bold", color: "#FFFFFF", backgroundColor: AZUL }],
        ...instrucoes.map(([a, b]) => [{ value: a, fontWeight: "bold" }, { value: b }]),
      ],
      sheet: "Instruções",
      columns: [{ width: 28 }, { width: 110 }],
    });
  }
  await writeXlsxFile(abas).toFile(arquivo);
}

/**
 * Lê a primeira aba de um .xlsx. Retorna { cabecalhos: [texto], linhas: [{ __linha, valores: { chaveNormalizada: valor } }] }.
 * A primeira linha preenchida é o cabeçalho; linhas totalmente vazias são ignoradas.
 */
export async function lerExcel(arquivo) {
  if (!/\.xlsx$/i.test(arquivo.name)) throw new Error("Envie um arquivo Excel no formato .xlsx.");
  if (arquivo.size > 10 * 1024 * 1024) throw new Error("Arquivo maior que 10 MB.");
  const { readSheet } = await import("read-excel-file/browser");
  const dados = await readSheet(arquivo);
  const vazio = (v) => v === null || v === undefined || String(v).trim() === "";
  const iCab = dados.findIndex((l) => l.some((v) => !vazio(v)));
  if (iCab < 0) throw new Error("A planilha está vazia.");
  const cabecalhos = dados[iCab].map((v) => String(v ?? "").trim());
  const linhas = [];
  for (let i = iCab + 1; i < dados.length; i++) {
    const l = dados[i];
    if (!l || l.every(vazio)) continue;
    const valores = {};
    cabecalhos.forEach((c, j) => {
      if (c) valores[normalizarChave(c)] = l[j] instanceof Date ? l[j].toISOString().slice(0, 10) : l[j];
    });
    linhas.push({ __linha: i + 1, valores });
  }
  return { cabecalhos, linhas };
}

export const dataArquivo = () => new Date().toISOString().slice(0, 10);
