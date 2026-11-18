// Registro das funções de servidor chamadas pelo frontend via base44.functions.invoke("<grupo>.<nome>", dados).
// No Base44 cada uma vira uma server function (createServerFn em src/lib/*-fns.js) ou backend function.
import { getAccess } from "../lib/access.js";
import * as admin from "./admin.js";
import * as inspecao from "./inspecao.js";
import * as plano from "./plano.js";

async function contexto(ctx) {
  const a = await getAccess(ctx);
  return { nome: a.nome, email: a.email, isAdmin: a.isAdmin, isInspetor: a.isInspetor, isAuditor: a.isAuditor, isPreenchedor: a.isPreenchedor };
}

const grupos = { admin, inspecao, plano };

export const functions = { contexto };
for (const [g, mod] of Object.entries(grupos)) {
  for (const [nome, fn] of Object.entries(mod)) if (typeof fn === "function") functions[`${g}.${nome}`] = fn;
}
