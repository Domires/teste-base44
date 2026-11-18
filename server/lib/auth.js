// Identificação do usuário — SOMENTE no ambiente local.
// No Base44 não existe tela de login no app: o usuário já chega autenticado pela plataforma (SSO Microsoft /
// Azure AD) e é obtido com base44.auth.me() (no servidor: requireUser / context.user). Este arquivo não deve ser portado.
//
// Localmente, o usuário atual é:
//   1) o e-mail do header "X-Dev-User" (seletor "Usuário de teste" no topo da tela), se existir na entidade User;
//   2) senão, DEV_USER_EMAIL (padrão: o administrador criado na carga inicial).
import { store } from "./db.js";
import { HttpError } from "./http.js";

const DEV_USER_EMAIL = (process.env.DEV_USER_EMAIL || process.env.ADMIN_EMAIL || "admin@sol.local").toLowerCase();

export const findUser = (email) => store.all("User").find((u) => u.email?.toLowerCase() === String(email || "").trim().toLowerCase()) || null;

export const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role || "user", created_date: u.created_date });

export function userFromRequest(req) {
  const u = findUser(req.headers["x-dev-user"]) || findUser(DEV_USER_EMAIL);
  return u ? publicUser(u) : null;
}

export function requireUser(req) {
  if (!req.user) throw new HttpError(401, "Usuário não identificado.");
  return req.user;
}
