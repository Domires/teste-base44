// Servidor Node.js (Express) — expõe uma API no mesmo formato do Base44:
//   /api/auth/*                         -> base44.auth
//   /api/entities/:Entidade[/:id]       -> base44.entities.Entidade.list/filter/get/create/update/delete
//   /api/functions/:nome                -> base44.functions.invoke(nome, dados)
//   /api/integrations/Core/UploadFile   -> base44.integrations.Core.UploadFile
//   /uploads/*                          -> arquivos enviados
// Em produção também serve o frontend compilado (dist/).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import express from "express";
import { publicUser, requireUser, userFromRequest } from "./lib/auth.js";
import { store } from "./lib/db.js";
import { createEntities, schemas } from "./lib/entities.js";
import { HttpError, asyncRoute } from "./lib/http.js";
import { DIST_DIR, UPLOADS_DIR } from "./lib/paths.js";
import { functions } from "./functions/index.js";
import { seedIfEmpty } from "./seed.js";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
const app = express();
app.set("trust proxy", true);
// O upload recebe o arquivo em base64 (até 25 MB de arquivo ≈ 34 MB de JSON); o resto da API fica em 15 MB.
const UPLOAD_PATH = "/api/integrations/Core/UploadFile";
const jsonPadrao = express.json({ limit: "15mb" });
const jsonUpload = express.json({ limit: "36mb" });
app.use((req, res, next) => (req.path === UPLOAD_PATH ? jsonUpload : jsonPadrao)(req, res, next));
mkdirSync(UPLOADS_DIR, { recursive: true });

// usuário atual (ver lib/auth.js)
app.use((req, _res, next) => {
  req.user = userFromRequest(req);
  next();
});

const contextFor = (req) => {
  const user = req.user;
  const entities = createEntities({ user, serviceRole: false });
  const sr = createEntities({ user, serviceRole: true });
  return { req, user, base44: { entities, asServiceRole: { entities: sr } }, entities, sr };
};

// ---------- auth (sem login: o usuário vem da plataforma no Base44; aqui, de lib/auth.js) ----------
app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Usuário não identificado." });
  res.json(req.user);
});

app.put("/api/auth/me", asyncRoute(async (req, res) => {
  const u = requireUser(req);
  const full_name = String(req.body?.full_name || "").slice(0, 200);
  store.update("User", u.id, { full_name });
  res.json({ ...u, full_name });
}));

// Somente local: lista de usuários para o seletor "Usuário de teste" (simula quem está logado no Base44).
app.get("/api/dev/usuarios", (_req, res) => {
  res.json(store.all("User").map(publicUser).sort((a, b) => a.email.localeCompare(b.email)));
});

// ---------- entities ----------
const parseJSON = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    throw new HttpError(400, "Parâmetro 'q' inválido.");
  }
};

app.get("/api/entities/:entity", asyncRoute(async (req, res) => {
  requireUser(req);
  const e = contextFor(req).entities[req.params.entity];
  const q = parseJSON(req.query.q, {});
  res.json(await e.filter(q, req.query.sort, req.query.limit ? Number(req.query.limit) : undefined));
}));
app.get("/api/entities/:entity/:id", asyncRoute(async (req, res) => {
  requireUser(req);
  res.json(await contextFor(req).entities[req.params.entity].get(req.params.id));
}));
app.post("/api/entities/:entity", asyncRoute(async (req, res) => {
  requireUser(req);
  const e = contextFor(req).entities[req.params.entity];
  res.json(Array.isArray(req.body) ? await e.bulkCreate(req.body) : await e.create(req.body || {}));
}));
app.put("/api/entities/:entity/:id", asyncRoute(async (req, res) => {
  requireUser(req);
  res.json(await contextFor(req).entities[req.params.entity].update(req.params.id, req.body || {}));
}));
app.delete("/api/entities/:entity/:id", asyncRoute(async (req, res) => {
  requireUser(req);
  res.json(await contextFor(req).entities[req.params.entity].delete(req.params.id));
}));
app.get("/api/schemas", (req, res) => {
  requireUser(req);
  res.json(schemas);
});

// ---------- functions ----------
app.post("/api/functions/:name", asyncRoute(async (req, res) => {
  requireUser(req);
  const fn = functions[req.params.name];
  if (!fn) throw new HttpError(404, `Função desconhecida: ${req.params.name}`);
  const data = await fn(contextFor(req), req.body ?? {});
  res.json({ data });
}));

// ---------- integrations: upload ----------
// Aceita qualquer tipo de arquivo (evidências do SGI podem ser planilhas, documentos, vídeos...).
// O nome original vai no final da URL (<uuid>__<nome>.<ext>) para ser exibido na tela.
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
const MAX_UPLOAD = 25 * 1024 * 1024;
const limparNome = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[._]+|[._]+$/g, "");
app.post(UPLOAD_PATH, asyncRoute(async (req, res) => {
  requireUser(req);
  const m = /^data:([^;,]*)(?:;[^,]*)?;base64,(.*)$/s.exec(String(req.body?.dataUrl || ""));
  if (!m) throw new HttpError(400, "Arquivo inválido.");
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) throw new HttpError(400, "Arquivo vazio.");
  if (buf.length > MAX_UPLOAD) throw new HttpError(413, "Arquivo maior que 25 MB.");
  const original = limparNome(req.body?.fileName);
  const extNome = (/\.([a-z0-9]{1,10})$/i.exec(original)?.[1] || "").toLowerCase();
  const ext = extNome || MIME_EXT[m[1]] || "bin";
  const base = original.replace(/\.[^.]*$/, "").slice(0, 80);
  const name = `${randomUUID()}${base ? `__${base}` : ""}.${ext}`;
  writeFileSync(path.join(UPLOADS_DIR, name), buf);
  res.json({ file_url: `/uploads/${name}` });
}));
// Imagens e PDF abrem no navegador; qualquer outro tipo é sempre baixado (nunca executado na origem do app).
const EXIBIVEIS = new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf"]);
app.use("/uploads", express.static(UPLOADS_DIR, {
  maxAge: "7d",
  fallthrough: false,
  setHeaders(res, arquivo) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const ext = path.extname(arquivo).slice(1).toLowerCase();
    if (!EXIBIVEIS.has(ext)) {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${path.basename(arquivo).replace(/^[0-9a-f-]{36}__/, "")}"`);
      res.setHeader("Content-Security-Policy", "sandbox");
    }
  },
}));

// ---------- frontend compilado ----------
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
}

// ---------- erros ----------
app.use((req, res) => res.status(404).json({ message: "Rota não encontrada." }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.name === "ZodError") {
    const msg = err.issues?.map((i) => i.message).join("; ") || "Dados inválidos.";
    return res.status(400).json({ message: msg });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 ? "Erro interno no servidor." : err.message });
});

await seedIfEmpty();
app.listen(PORT, () => console.log(`[api] Programa SOL, GRD & SGI ouvindo em http://localhost:${PORT}`));
