// Conversão entre os cadastros (components/admin/cadastros.js) e planilhas Excel.
// O usuário nunca vê IDs: o registro é identificado pela chave natural (cfg.unico — e-mail, nome, sigla...).
import { normalizarChave } from "@/lib/excel";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const opcoesDe = (c) => (c.opcoes || []).map((o) => (typeof o === "object" ? o : { value: o, label: o }));
const vazio = (v) => v === null || v === undefined || String(v).trim() === "";
const rotuloDe = (cfg, nome) => cfg.campos.find((c) => c.nome === nome)?.rotulo || nome;

export function colunasExcel(cfg) {
  return cfg.campos.map((c) => ({ chave: c.nome, titulo: c.rotulo, campo: c, largura: c.tipo === "textarea" ? 60 : undefined }));
}

function nomeDaFonte(c, valor, fontes) {
  if (!c.fonte || c.valor) return valor;
  const r = (fontes?.[c.fonte] || []).find((x) => x.id === valor);
  return r ? r.Nome : "";
}

export function linhasExportacao(cfg, registros, fontes) {
  return registros.map((r) =>
    colunasExcel(cfg).map(({ campo: c }) => {
      const v = r[c.nome];
      if (c.tipo === "bool") return v !== false;
      if (c.fonte) return nomeDaFonte(c, v, fontes) ?? "";
      if (c.opcoes) return opcoesDe(c).find((o) => o.value === v)?.label ?? v ?? "";
      return v ?? "";
    }),
  );
}

export function instrucoesExcel(cfg) {
  const chave = [].concat(cfg.unico || []).map((u) => rotuloDe(cfg, u)).join(" + ");
  const linhas = [["Como funciona", `Cada linha é identificada por ${chave}: se já existir um registro com esse valor, ele é ATUALIZADO; se não existir, é CRIADO. Nada é removido pela importação.`]];
  for (const c of cfg.campos) {
    let txt = c.obrigatorio ? "Obrigatório. " : "Opcional. ";
    if ([].concat(cfg.unico || []).includes(c.nome)) txt += "Identifica o registro (não pode se repetir na planilha). ";
    if (c.tipo === "email") txt += "E-mail válido. ";
    if (c.tipo === "number") txt += "Número. ";
    if (c.tipo === "bool") txt += "Sim ou Não (em branco = Sim). ";
    if (c.opcoes) txt += `Valores aceitos: ${opcoesDe(c).map((o) => o.label).join(", ")}. `;
    if (c.fonte === "Area") txt += c.valor ? "Nome de uma área cadastrada (em branco = todas). " : "Nome ou sigla de uma área cadastrada. ";
    if (c.ajuda) txt += c.ajuda;
    linhas.push([c.rotulo, txt.trim()]);
  }
  return linhas;
}

function converter(c, bruto, fontes) {
  if (vazio(bruto)) return { valor: c.tipo === "bool" ? true : "" };
  const s = String(bruto).trim();
  if (c.tipo === "number") {
    const n = Number(String(bruto).replace(",", "."));
    return Number.isFinite(n) ? { valor: n } : { erro: `${c.rotulo}: "${s}" não é um número` };
  }
  if (c.tipo === "bool") {
    const k = normalizarChave(s);
    if (["sim", "s", "true", "1", "x", "ativo", "verdadeiro"].includes(k)) return { valor: true };
    if (["nao", "n", "false", "0", "inativo", "falso"].includes(k)) return { valor: false };
    return { erro: `${c.rotulo}: use Sim ou Não` };
  }
  if (c.tipo === "email") {
    const e = s.toLowerCase();
    return EMAIL_RE.test(e) ? { valor: e } : { erro: `${c.rotulo}: "${s}" não é um e-mail válido` };
  }
  if (c.opcoes) {
    const o = opcoesDe(c).find((x) => normalizarChave(x.value) === normalizarChave(s) || normalizarChave(x.label) === normalizarChave(s));
    return o ? { valor: o.value } : { erro: `${c.rotulo}: "${s}" inválido (use ${opcoesDe(c).map((x) => x.label).join(", ")})` };
  }
  if (c.fonte) {
    const r = (fontes?.[c.fonte] || []).find((x) => normalizarChave(x.Nome) === normalizarChave(s) || normalizarChave(x.Sigla) === normalizarChave(s));
    if (!r) return { erro: `${c.rotulo}: "${s}" não está cadastrado(a)` };
    return { valor: c.valor ? r[c.valor] : r.id };
  }
  return { valor: s };
}

/**
 * Interpreta as linhas lidas da planilha.
 * Retorna [{ linha, acao: "novo" | "atualizar" | "erro", id (interno), dados, resumo, erros }]
 */
export function interpretarPlanilha(cfg, planilha, existentes, fontes) {
  const cols = colunasExcel(cfg);
  const presentes = new Set(planilha.cabecalhos.map(normalizarChave));
  const colPresente = (col) => presentes.has(normalizarChave(col.titulo)) || presentes.has(normalizarChave(col.chave));
  const ler = (linha, col) => linha.valores[normalizarChave(col.titulo)] ?? linha.valores[normalizarChave(col.chave)];
  const unico = [].concat(cfg.unico || []);
  const faltando = cols.filter((col) => (col.campo.obrigatorio || unico.includes(col.chave)) && !colPresente(col)).map((c) => c.titulo);
  if (faltando.length) throw new Error(`A planilha não tem a(s) coluna(s) obrigatória(s): ${faltando.join(", ")}. Baixe o modelo para ver o formato.`);

  const chaveUnica = (d) => (unico.length && unico.every((u) => !vazio(d[u])) ? unico.map((u) => normalizarChave(d[u])).join("|") : null);
  const porChave = new Map(existentes.map((r) => [chaveUnica(r), r]).filter(([k]) => k));
  const vistos = new Map();

  return planilha.linhas.map((linha) => {
    const erros = [];
    const dados = {};
    for (const col of cols.filter(colPresente)) {
      const r = converter(col.campo, ler(linha, col), fontes);
      if (r.erro) erros.push(r.erro);
      else dados[col.chave] = r.valor;
    }
    const k = chaveUnica(dados);
    const alvo = k ? porChave.get(k) || null : null;
    // ao atualizar, a chave mantém a grafia já cadastrada (ex.: "UNIDADE X" na planilha não renomeia "Unidade X")
    if (alvo) for (const u of unico) dados[u] = alvo[u];
    if (k) {
      if (vistos.has(k)) erros.push(`Repetido na planilha: mesmo ${unico.map((u) => rotuloDe(cfg, u)).join(" + ")} da linha ${vistos.get(k)}`);
      else vistos.set(k, linha.__linha);
    }
    // obrigatórios: em registro novo todos; em atualização, os que vieram vazios na planilha
    for (const c of cfg.campos.filter((x) => x.obrigatorio)) {
      if (vazio(dados[c.nome]) && (!alvo || c.nome in dados)) erros.push(`${c.rotulo} é obrigatório`);
    }
    const resumo = cfg.colunas
      .map((c) => {
        const campo = cfg.campos.find((x) => x.nome === c);
        const v = dados[c] ?? alvo?.[c];
        return campo?.fonte && !campo.valor ? nomeDaFonte(campo, v, fontes) : campo?.tipo === "bool" ? (v === false ? "Não" : "Sim") : v;
      })
      .filter((v) => !vazio(v))
      .join(" · ");
    return { linha: linha.__linha, acao: erros.length ? "erro" : alvo ? "atualizar" : "novo", id: alvo?.id || null, dados, resumo, erros };
  });
}
