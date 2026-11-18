// Registro das funções de servidor chamadas pelas páginas (src/lib/fns.js → chamarFuncao em src/lib/server-fns.js).
// Cada função recebe (ctx, dados) e faz a própria checagem de acesso (getAccess / admin) e validação (zod).
import { getAccess } from "./access.server.js";
import * as admin from "./admin.server.js";
import * as inspecao from "./inspecao.server.js";
import * as plano from "./plano.server.js";

async function contexto(ctx) {
  const a = await getAccess(ctx);
  return { nome: a.nome, email: a.email, isAdmin: a.isAdmin, isInspetor: a.isInspetor, isAuditor: a.isAuditor, isPreenchedor: a.isPreenchedor };
}

// utilitários exportados pelos módulos que não são funções chamáveis pelas páginas
const NAO_EXPOSTAS = new Set(["byId", "anoSgi"]);

const grupos = { admin, inspecao, plano };

export const functions = { contexto };
for (const [g, mod] of Object.entries(grupos)) {
  for (const [nome, fn] of Object.entries(mod)) if (typeof fn === "function" && !NAO_EXPOSTAS.has(nome)) functions[`${g}.${nome}`] = fn;
}
