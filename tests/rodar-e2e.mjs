// Executa as baterias de teste de ponta a ponta, cada uma num servidor próprio com banco NOVO
// (não toca no banco de desenvolvimento em server/data):
//   1) tests/e2e-api.mjs       — regras de negócio pela API (34 verificações)
//   2) tests/e2e-interface.mjs — uso completo pela interface num navegador (cliques, upload, assinatura)
// Pré-requisitos: npm run build (o servidor serve o dist/) e Microsoft Edge ou Chrome
// (caminho em BROWSER_PATH; padrão: Edge no Windows).
// Uso: npm run test:e2e [pasta-para-screenshots]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarSmtpTeste } from "./smtp-teste.mjs";

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || path.join(os.tmpdir(), "sol-grd-sgi-e2e");
if (!existsSync(path.join(PROJ, "dist", "index.html"))) {
  console.error("Rode 'npm run build' antes dos testes.");
  process.exit(1);
}

async function comServidor(port, fn) {
  const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "sol-grd-sgi-teste-"));
  // e-mails saem por SMTP de verdade para um servidor de teste, que os grava em DATA_DIR/outbox
  const smtp = await iniciarSmtpTeste(path.join(DATA_DIR, "outbox"));
  const srv = spawn(process.execPath, ["server/index.js"], {
    cwd: PROJ,
    env: { ...process.env, API_PORT: String(port), DATA_DIR, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.porta), SMTP_SECURE: "false", SMTP_USER: "", SMTP_FROM: "sol-grd-sgi@teste.local" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  srv.stdout.on("data", (d) => (log += d));
  srv.stderr.on("data", (d) => (log += d));
  await new Promise((r) => setTimeout(r, 2500));
  try {
    return await fn(`http://localhost:${port}`, DATA_DIR);
  } finally {
    srv.kill();
    smtp.fechar();
    const erros = log.split("\n").filter((l) => /Error|erro interno/i.test(l));
    if (erros.length) console.log(`\n[servidor] ${erros.length} linha(s) de erro:\n${erros.slice(0, 10).join("\n")}`);
  }
}
const rodar = (args, env = {}) =>
  new Promise((r) => spawn(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...env } }).on("exit", r));

console.log("=== 1/2 Testes da API ===");
const api = await comServidor(3094, (url) => rodar([path.join(PROJ, "tests", "e2e-api.mjs")], { API: url }));
console.log("\n=== 2/2 Testes pela interface ===");
const ui = await comServidor(3095, (url, dataDir) => rodar([path.join(PROJ, "tests", "e2e-interface.mjs"), url, OUT, dataDir, PROJ]));
console.log(`\nAPI: ${api === 0 ? "OK" : "FALHOU"} · Interface: ${ui === 0 ? "OK" : "FALHOU"} · screenshots em ${OUT}`);
process.exit(api || ui ? 1 : 0);
