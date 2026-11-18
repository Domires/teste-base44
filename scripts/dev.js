// Sobe o backend (Node/Express, porta 3001) e o frontend (Vite, porta 5173) juntos.
// O backend é reiniciado quando algum arquivo de server/ ou base44/ é alterado (comparando a data de
// modificação — o "node --watch" no Windows reinicia em loop porque reage também à leitura dos arquivos).
import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const OBSERVAR = ["server/functions", "server/lib", "server/index.js", "server/seed.js", "base44"];

function assinatura() {
  let maior = 0;
  const visitar = (p) => {
    const s = statSync(p, { throwIfNoEntry: false });
    if (!s) return;
    if (s.isDirectory()) for (const f of readdirSync(p)) visitar(path.join(p, f));
    else maior = Math.max(maior, s.mtimeMs);
  };
  OBSERVAR.forEach(visitar);
  return maior;
}

let api;
const iniciarApi = () => {
  api = spawn(process.execPath, ["--env-file-if-exists=.env", "server/index.js"], { stdio: "inherit", env: process.env });
};
iniciarApi();
const web = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit", env: process.env });

let ultima = assinatura();
const timer = setInterval(() => {
  const atual = assinatura();
  if (atual === ultima) return;
  ultima = atual;
  console.log("[dev] alteração detectada — reiniciando a API...");
  if (api.exitCode !== null || api.signalCode !== null) return iniciarApi(); // já tinha parado (ex.: erro)
  api.once("exit", iniciarApi);
  api.kill();
}, 1000);

const sair = (code = 0) => {
  clearInterval(timer);
  api?.kill();
  web.kill();
  process.exit(code);
};
web.on("exit", (code) => sair(code || 0));
process.on("SIGINT", () => sair(0));
process.on("SIGTERM", () => sair(0));
