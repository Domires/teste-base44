import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "server", "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const OUTBOX_DIR = path.join(DATA_DIR, "outbox");
export const ENTITIES_DIR = path.join(ROOT_DIR, "base44", "entities");
export const EMAILS_DIR = path.join(ROOT_DIR, "src", "emails");
export const DIST_DIR = path.join(ROOT_DIR, "dist");
