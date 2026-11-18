// Equivalente ao RegistrarAtividade_sp chamado pelos fluxos do Power Automate.
import { store } from "./db.js";

function sistemaOperacional(ua = "") {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os/i.test(ua)) return "MacOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Desconhecido";
}

export function registrarAtividade(ctx, { aplicacao, acao, funcao, modelo, status = true, descricao }) {
  try {
    const ua = ctx.req?.headers?.["user-agent"] || "";
    store.insert("LogAuditoria", {
      Aplicacao: aplicacao,
      Acao: acao,
      Funcao: funcao,
      Modelo: modelo ? JSON.stringify(modelo).slice(0, 20000) : "",
      Status: !!status,
      Descricao: descricao || (status ? "Sucesso" : "Erro"),
      Data: new Date().toISOString(),
      UserName: ctx.user?.full_name || "",
      UserEmail: ctx.user?.email || "",
      SistemaOperacional: sistemaOperacional(ua),
      UserAgent: ua.slice(0, 500),
    }, ctx.user?.email);
  } catch (e) {
    console.error("[log] falha ao registrar atividade", e);
  }
}
