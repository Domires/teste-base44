// Armazenamento local de documentos — equivalente ao banco de entidades do Base44.
// Cada entidade (base44/entities/*.jsonc) vira uma tabela SQLite com { id, data(JSON), created_date, updated_date, created_by }.
// Usa o módulo nativo node:sqlite (Node >= 22.13), sem dependências nativas para compilar.
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./paths.js";

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, "app.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;");

const ensured = new Set();
const tableName = (entity) => `e_${entity.replace(/[^A-Za-z0-9_]/g, "")}`;

function ensure(entity) {
  if (ensured.has(entity)) return tableName(entity);
  const t = tableName(entity);
  db.exec(`CREATE TABLE IF NOT EXISTS ${t} (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    created_by TEXT
  )`);
  ensured.add(entity);
  return t;
}

const toRecord = (row) => (row ? { ...JSON.parse(row.data), id: row.id, created_date: row.created_date, updated_date: row.updated_date, created_by: row.created_by } : null);
const strip = ({ id, created_date, updated_date, created_by, ...rest }) => rest;

export const store = {
  all(entity) {
    const t = ensure(entity);
    return db.prepare(`SELECT * FROM ${t}`).all().map(toRecord);
  },
  get(entity, id) {
    const t = ensure(entity);
    return toRecord(db.prepare(`SELECT * FROM ${t} WHERE id = ?`).get(String(id)));
  },
  insert(entity, data, createdBy = null) {
    const t = ensure(entity);
    const now = new Date().toISOString();
    const id = data.id ? String(data.id) : randomUUID();
    db.prepare(`INSERT INTO ${t} (id, data, created_date, updated_date, created_by) VALUES (?, ?, ?, ?, ?)`).run(
      id, JSON.stringify(strip(data)), now, now, createdBy,
    );
    return this.get(entity, id);
  },
  update(entity, id, patch) {
    const t = ensure(entity);
    const cur = this.get(entity, id);
    if (!cur) return null;
    const next = { ...strip(cur), ...strip(patch) };
    db.prepare(`UPDATE ${t} SET data = ?, updated_date = ? WHERE id = ?`).run(JSON.stringify(next), new Date().toISOString(), String(id));
    return this.get(entity, id);
  },
  remove(entity, id) {
    const t = ensure(entity);
    return db.prepare(`DELETE FROM ${t} WHERE id = ?`).run(String(id)).changes > 0;
  },
  clear(entity) {
    const t = ensure(entity);
    db.exec(`DELETE FROM ${t}`);
  },
  transaction(fn) {
    db.exec("BEGIN");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  },
};
