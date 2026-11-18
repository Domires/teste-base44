// Perfis de acesso (FSD 3.4): Admin, Inspetor (inclui Avaliador GRD e Auditor SGI) e Preenchedor.
// - Admin: User.role === "admin"
// - Inspetor: e-mail cadastrado em Inspetor ou Auditor
// - Preenchedor: e-mail vinculado a algum local (Vinculo) — recebe e preenche planos de ação
import { HttpError } from "./http.js";

const lower = (s) => String(s || "").trim().toLowerCase();

export async function getAccess(ctx) {
  const { user, sr } = ctx;
  if (!user) throw new HttpError(401, "Não autenticado.");
  const email = lower(user.email);
  const [insp, aud, vinc] = await Promise.all([
    sr.Inspetor.filter({ Email: email }),
    sr.Auditor.filter({ Email: email }),
    sr.Vinculo.filter({ Email: email }),
  ]);
  const isAdmin = user.role === "admin";
  return {
    email,
    nome: user.full_name || insp[0]?.Nome || aud[0]?.Nome || vinc[0]?.Nome || user.email,
    isAdmin,
    isInspetor: isAdmin || insp.length > 0,
    isAuditor: isAdmin || aud.length > 0,
    isPreenchedor: isAdmin || vinc.length > 0,
    vinculos: vinc,
  };
}

export const exigir = (cond, msg = "Você não tem permissão para esta ação.") => {
  if (!cond) throw new HttpError(403, msg);
};
