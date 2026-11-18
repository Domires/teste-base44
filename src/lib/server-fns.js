// Server function única que as páginas chamam (via src/lib/fns.js): exige usuário logado (requireUser) e
// executa a função pedida pelo nome ("inspecao.abrirFormulario", "admin.dispararSol"...), registrada em
// src/lib/servidor/registro.server.js. Cada função faz a própria checagem de perfil (getAccess / admin) e
// valida os dados com zod antes de usar o acesso de serviço (asServiceRole).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { functions } from "@/lib/servidor/registro.server";

// Erros esperados (validação, permissão, regra de negócio) voltam como { ok: false, erro } para a página
// mostrar a mensagem; erros inesperados são relançados para o Base44 registrar (error-capture).
function erroEsperado(err) {
  if (err?.name === "ZodError" || (Array.isArray(err?.issues) && !err?.status)) {
    return { status: 400, message: err.issues.map((i) => i.message).join("; ") || "Dados inválidos." };
  }
  const status = Number(err?.status) || 0;
  if (status >= 400 && status < 500) return { status, message: err.message || `Erro ${status}` };
  return null;
}

export const chamarFuncao = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ nome: z.string().max(80), dados: z.any().optional() }))
  .handler(async ({ data, context }) => {
    const fn = Object.hasOwn(functions, data.nome) ? functions[data.nome] : null;
    if (!fn) return { ok: false, erro: { status: 404, message: `Função desconhecida: ${data.nome}` } };
    const base44 = context.getBase44();
    const servico = base44.asServiceRole;
    const ctx = {
      user: context.user,
      base44, // cliente como o usuário logado (ex.: auth.inviteUser feito pelo admin)
      sr: servico.entities, // entidades com acesso de serviço — usado só depois da checagem de perfil
      integrations: servico.integrations, // Core.SendEmail
      userAgent: getRequest()?.headers.get("user-agent") || "",
      pendentes: [], // gravações de log em andamento: terminam antes da resposta
    };
    try {
      const resultado = await fn(ctx, data.dados ?? {});
      await Promise.all(ctx.pendentes);
      return { ok: true, data: resultado ?? null };
    } catch (err) {
      await Promise.all(ctx.pendentes);
      const erro = erroEsperado(err);
      if (erro) return { ok: false, erro };
      throw err;
    }
  });
