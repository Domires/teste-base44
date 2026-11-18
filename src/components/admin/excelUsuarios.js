// Excel de Usuários e acessos: o usuário é identificado pelo e-mail (sem ID na planilha).
import { baixarExcel, dataArquivo, normalizarChave } from "@/lib/excel";

const COLUNAS = [{ titulo: "E-mail", largura: 36 }, { titulo: "Nome", largura: 32 }, { titulo: "Perfil", largura: 16 }];
const PERFIS = { administrador: "admin", admin: "admin", usuario: "user", user: "user" };
const ROTULO_PERFIL = { admin: "Administrador", user: "Usuário" };
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INSTRUCOES = [
  ["E-mail", "Obrigatório. Identifica o usuário: se já existir, o cadastro é atualizado; senão, é criado."],
  ["Nome", "Opcional. Em branco mantém o nome atual."],
  ["Perfil", "Opcional. Administrador ou Usuário. Em branco mantém o perfil atual (usuário novo fica como Usuário)."],
  ["", "Administrador dá acesso ao Admin. Inspetores, auditores e responsáveis recebem acesso pelos cadastros e vínculos."],
  ["", "A importação não remove usuários; para remover, use a tela de Usuários e acessos."],
];

export async function exportarUsuarios(usuarios, apenasModelo = false) {
  const linhas = apenasModelo ? [] : usuarios.map((u) => [u.email, u.full_name || "", ROTULO_PERFIL[u.role] || "Usuário"]);
  await baixarExcel({ arquivo: `${apenasModelo ? "modelo" : "cadastro"}-usuarios-${dataArquivo()}.xlsx`, colunas: COLUNAS, linhas, instrucoes: INSTRUCOES });
}

// Validação prévia no navegador (o servidor valida de novo ao gravar)
export function interpretarUsuarios(planilha, usuarios, emailLogado) {
  const pres = new Set(planilha.cabecalhos.map(normalizarChave));
  if (!pres.has(normalizarChave("E-mail"))) throw new Error('A planilha não tem a coluna "E-mail". Baixe o modelo para ver o formato.');
  const ler = (l, c) => String(l.valores[normalizarChave(c)] ?? "").trim();
  const porEmail = new Map(usuarios.map((u) => [u.email.toLowerCase(), u]));
  const vistos = new Set();
  return planilha.linhas.map((l) => {
    const email = ler(l, "E-mail").toLowerCase();
    const nome = ler(l, "Nome");
    const perfilTxt = ler(l, "Perfil");
    const role = perfilTxt ? PERFIS[normalizarChave(perfilTxt)] : null;
    const erros = [];
    if (!email) erros.push("E-mail é obrigatório");
    else if (!EMAIL_OK.test(email)) erros.push(`E-mail inválido: "${email}"`);
    else if (vistos.has(email)) erros.push("E-mail repetido na planilha");
    vistos.add(email);
    if (perfilTxt && !role) erros.push(`Perfil "${perfilTxt}" inválido (use Administrador ou Usuário)`);
    const atual = porEmail.get(email);
    if (atual && emailLogado && email === emailLogado.toLowerCase() && role === "user") erros.push("Você não pode remover seu próprio perfil de administrador");
    const roleFinal = role || atual?.role || "user";
    const resumo = [email, nome || atual?.full_name, ROTULO_PERFIL[roleFinal]].filter(Boolean).join(" · ");
    return { linha: l.__linha, acao: erros.length ? "erro" : atual ? "atualizar" : "novo", dados: { email, full_name: nome || null, role }, resumo, erros };
  });
}
