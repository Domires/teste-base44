// Modelos dos e-mails de "Resultado e Plano de Ação" — JS puro, usado no servidor (envio) e no navegador (pré-visualização).
// Dois modelos editáveis em Admin › Programação › Configurar e-mails:
//   individual = envio de uma inspeção pela tela Inspeções · lote = Disparos SOL/GRD.
// Assunto e corpo aceitam variáveis {{nome}}. No corpo (HTML) os valores são escapados; o HTML do modelo é usado como está.

export const TIPOS_MODELO = {
  individual: { rotulo: "E-mail individual", descricao: "Enviado pela tela Inspeções, para a inspeção selecionada." },
  lote: { rotulo: "E-mail em lote", descricao: "Enviado pela tela Disparos (SOL por mês/unidade, GRD por tipo/ano)." },
};


export const VARIAVEIS_EMAIL = [
  { chave: "programa", descricao: "Sigla do programa", exemplo: "SOL" },
  { chave: "titulo_programa", descricao: "Nome do programa por extenso", exemplo: "Inspeção do Programa SOL" },
  { chave: "programa_descricao", descricao: "Programa com código", exemplo: "Programa SOL (PG00107)" },
  { chave: "tipo_texto", descricao: "inspeção / avaliação", exemplo: "inspeção" },
  { chave: "unidade", descricao: "Unidade", exemplo: "Jacareí II" },
  { chave: "area", descricao: "Área", exemplo: "Expedição" },
  { chave: "processo", descricao: "Processo", exemplo: "Logística" },
  { chave: "data", descricao: "Data da inspeção", exemplo: "18/11/2026" },
  { chave: "resultado", descricao: "Resultado (status/score ou % de atendimento)", exemplo: "BOM — Score Total 78,5%" },
  { chave: "nao_conformes", descricao: "Quantidade de itens não conformes", exemplo: "4" },
  { chave: "id_inspecao", descricao: "Código da inspeção (para o link fixo: https://SEU-APP/plano-acao/{{id_inspecao}})", exemplo: "6a1f0c2e9b" },
  { chave: "contato", descricao: "E-mail de contato", exemplo: "contato@exemplo.com" },
];
export const EXEMPLO_VARIAVEIS = Object.fromEntries(VARIAVEIS_EMAIL.map((v) => [v.chave, v.exemplo]));

export const ASSUNTO_PADRAO = "Resultado e Plano de Ação - {{titulo_programa}} - {{unidade}} - {{area}} - {{data}}";
export const LIMITES = { assunto: 300, corpo: 200_000 };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Substitui {{variavel}}. html=true escapa os valores (corpo); no assunto vão como texto. Variáveis desconhecidas ficam como estão. */
export function aplicarModelo(texto, vars, { html = false } = {}) {
  return String(texto ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? (html ? esc(vars[k]) : String(vars[k] ?? "")) : m));
}

/** Variáveis usadas no texto que não existem (para avisar quem edita). */
export function variaveisDesconhecidas(...textos) {
  const validas = new Set(VARIAVEIS_EMAIL.map((v) => v.chave));
  const usadas = textos.flatMap((t) => [...String(t ?? "").matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]));
  return [...new Set(usadas.filter((k) => !validas.has(k)))];
}

/** Monta { assunto, corpo } a partir do modelo (campos vazios = padrão). */
export function montarEmail(modelo, padrao, vars) {
  const assunto = aplicarModelo(modelo?.Assunto?.trim() || padrao.Assunto, vars).replace(/[\r\n]+/g, " ").trim();
  const corpo = aplicarModelo(modelo?.Corpo?.trim() ? modelo.Corpo : padrao.Corpo, vars, { html: true });
  return { assunto, corpo };
}

// Marcador do modelo padrão: o admin troca pelo endereço real do app (o link é fixo no corpo, sem variável).
export const MARCADOR_LINK = "SEU-APP";
