// Camada de entidades com a MESMA interface do SDK do Base44:
//   base44.entities.Nome.list(sort, limit) / filter(query, sort, limit) / get(id)
//   create(data) / bulkCreate([...]) / update(id, data) / delete(id) / deleteMany(query)
// Os esquemas e as regras de acesso (rls) vêm de base44/entities/*.jsonc — os mesmos arquivos que o Base44 usa.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { store } from "./db.js";
import { ENTITIES_DIR } from "./paths.js";
import { HttpError } from "./http.js";

const stripJsonComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

export const schemas = Object.fromEntries(
  readdirSync(ENTITIES_DIR)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => {
      const s = JSON.parse(stripJsonComments(readFileSync(path.join(ENTITIES_DIR, f), "utf8")));
      return [s.name || path.basename(f).replace(/\.jsonc?$/, ""), s];
    }),
);

// ---------- consulta ----------
const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const eq = (a, b) => (typeof a === "string" && typeof b === "string" ? norm(a) === norm(b) : a === b);

function matchValue(value, cond) {
  if (cond && typeof cond === "object" && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case "$in": return (arg || []).some((x) => (Array.isArray(value) ? value.some((v) => eq(v, x)) : eq(value, x)));
        case "$nin": return !(arg || []).some((x) => eq(value, x));
        case "$ne": return !eq(value, arg);
        case "$gt": return value != null && value > arg;
        case "$gte": return value != null && value >= arg;
        case "$lt": return value != null && value < arg;
        case "$lte": return value != null && value <= arg;
        case "$exists": return arg ? value != null && value !== "" : value == null || value === "";
        case "$regex": return typeof value === "string" && new RegExp(arg, cond.$options || "i").test(value);
        case "$options": return true;
        default: return false;
      }
    });
  }
  if (Array.isArray(value) && !Array.isArray(cond)) return value.some((v) => eq(v, cond));
  if (cond == null) return value == null || value === "";
  return eq(value, cond);
}

export function matches(record, query = {}) {
  return Object.entries(query || {}).every(([key, cond]) => {
    if (key === "$or") return cond.some((q) => matches(record, q));
    if (key === "$and") return cond.every((q) => matches(record, q));
    return matchValue(record[key], cond);
  });
}

function sortRecords(rows, sort) {
  if (!sort) return rows;
  const keys = String(sort).split(",").map((k) => k.trim()).filter(Boolean);
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const desc = k.startsWith("-");
      const f = desc ? k.slice(1) : k;
      const va = a[f] ?? "";
      const vb = b[f] ?? "";
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

// ---------- regras de acesso (rls do .jsonc) ----------
function interpolate(v, user) {
  if (typeof v !== "string") return v;
  return v.replace(/\{\{\s*user\.(\w+)\s*\}\}/g, (_, k) => (user?.[k] ?? ""));
}

export function evalRule(rule, user, record) {
  if (rule === undefined || rule === true) return true;
  if (rule === false || rule == null) return false;
  if (!user) return false;
  return Object.entries(rule).every(([key, cond]) => {
    if (key === "$or") return cond.some((r) => evalRule(r, user, record));
    if (key === "$and") return cond.every((r) => evalRule(r, user, record));
    if (key === "user_condition") return Object.entries(cond).every(([k, v]) => eq(user[k], interpolate(v, user)));
    const field = key.startsWith("data.") ? key.slice(5) : key;
    return record ? eq(record[field], interpolate(cond, user)) : false;
  });
}

// ---------- validação ----------
function validate(name, data, { partial = false } = {}) {
  const schema = schemas[name];
  if (!schema) return;
  const props = schema.properties || {};
  if (!partial) {
    for (const r of schema.required || []) {
      if (data[r] === undefined || data[r] === null || data[r] === "") throw new HttpError(400, `${name}: campo obrigatório "${r}" não informado.`);
    }
  }
  for (const [k, v] of Object.entries(data)) {
    const p = props[k];
    if (!p || v === null || v === undefined || v === "") continue;
    if (p.enum && !p.enum.includes(v)) throw new HttpError(400, `${name}: valor inválido para "${k}".`);
    if (p.type === "number" && typeof v !== "number") data[k] = Number(v);
    if (p.type === "boolean" && typeof v !== "boolean") data[k] = v === true || v === "true" || v === 1 || v === "1";
  }
  // aplica defaults
  if (!partial) for (const [k, p] of Object.entries(props)) if (data[k] === undefined && p.default !== undefined) data[k] = p.default;
}

// ---------- cliente ----------
function parseArgs(a, b) {
  // aceita filter(q, "-campo", 50) e filter(q, { sort, limit, skip })
  if (a && typeof a === "object") return { sort: a.sort, limit: a.limit, skip: a.skip };
  return { sort: a, limit: b };
}

function entityClient(name, { user, serviceRole }) {
  const schema = schemas[name];
  if (!schema && name !== "User") throw new HttpError(404, `Entidade desconhecida: ${name}`);
  const rls = serviceRole ? {} : schema?.rls || {};
  const can = (op, record) => serviceRole || evalRule(rls[op], user, record);

  const read = (query, sortOrOpts, lim) => {
    const { sort, limit, skip } = parseArgs(sortOrOpts, lim);
    let rows = store.all(name).filter((r) => can("read", r) && matches(r, query));
    rows = sortRecords(rows, sort || "-created_date");
    if (skip) rows = rows.slice(Number(skip));
    if (limit) rows = rows.slice(0, Number(limit));
    return rows;
  };

  return {
    async list(sort, limit) {
      return read({}, sort, limit);
    },
    async filter(query, sort, limit) {
      return read(query, sort, limit);
    },
    async get(id) {
      const r = store.get(name, id);
      if (!r || !can("read", r)) throw new HttpError(404, `${name} não encontrado(a).`);
      return r;
    },
    async create(data) {
      const d = { ...data };
      validate(name, d);
      if (!can("create", d)) throw new HttpError(403, "Sem permissão para criar este registro.");
      return store.insert(name, d, user?.email || null);
    },
    async bulkCreate(list) {
      const out = [];
      for (const d of list) out.push(await this.create(d));
      return out;
    },
    async update(id, data) {
      const cur = store.get(name, id);
      if (!cur) throw new HttpError(404, `${name} não encontrado(a).`);
      if (!can("update", cur)) throw new HttpError(403, "Sem permissão para alterar este registro.");
      const d = { ...data };
      validate(name, d, { partial: true });
      return store.update(name, id, d);
    },
    async delete(id) {
      const cur = store.get(name, id);
      if (!cur) return { success: true };
      if (!can("delete", cur)) throw new HttpError(403, "Sem permissão para excluir este registro.");
      store.remove(name, id);
      return { success: true };
    },
    async deleteMany(query) {
      const rows = store.all(name).filter((r) => matches(r, query));
      for (const r of rows) await this.delete(r.id);
      return { deleted: rows.length };
    },
    schema: () => schema,
  };
}

// Cria um "base44.entities" — com serviceRole: true ignora as regras de acesso (igual a base44.asServiceRole).
export function createEntities(opts) {
  return new Proxy({}, { get: (_, name) => (typeof name === "string" ? entityClient(name, opts) : undefined) });
}
