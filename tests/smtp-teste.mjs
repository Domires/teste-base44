// Servidor SMTP mínimo, só para os testes de ponta a ponta.
// - Recebe os e-mails de verdade (o app envia via nodemailer, como em produção) e grava cada mensagem
//   decodificada em <pasta>/<data>.html no mesmo formato do "outbox" (<!-- PARA --> / <!-- ASSUNTO --> / corpo).
// - Simula falha do servidor de e-mail: mensagem para qualquer endereço com "falha-smtp" é recusada (554).
import net from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const decodeQP = (s) => {
  const semQuebras = s.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < semQuebras.length; i++) {
    if (semQuebras[i] === "=" && /^[0-9A-F]{2}$/i.test(semQuebras.slice(i + 1, i + 3))) { bytes.push(parseInt(semQuebras.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(...Buffer.from(semQuebras[i], "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
};
// =?UTF-8?Q?...?= / =?UTF-8?B?...?= (assunto)
const decodeHeader = (v) =>
  v.replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([QB])\?([^?]*)\?=/gi, (_, _cs, enc, txt) =>
    enc.toUpperCase() === "B" ? Buffer.from(txt, "base64").toString("utf8") : decodeQP(txt.replace(/_/g, " ")));

function decodificar(raw) {
  const fim = raw.search(/\r?\n\r?\n/);
  const cab = raw.slice(0, fim).replace(/\r?\n[ \t]+/g, " ");
  const corpo = raw.slice(fim).replace(/^\r?\n\r?\n/, "");
  const h = (n) => (new RegExp(`^${n}:\\s*(.*)$`, "im").exec(cab) || [])[1] || "";
  const cte = h("Content-Transfer-Encoding").toLowerCase();
  const html = cte === "base64" ? Buffer.from(corpo.replace(/\s+/g, ""), "base64").toString("utf8") : cte === "quoted-printable" ? decodeQP(corpo) : corpo;
  
  return { assunto: decodeHeader(h("Subject")), html };
}

export function iniciarSmtpTeste(pasta) {
  mkdirSync(pasta, { recursive: true });
  let n = 0;
  const server = net.createServer((sock) => {
    let buf = "", modoDados = false, para = [], dados = "";
    const responder = (l) => sock.write(`${l}\r\n`);
    responder("220 smtp-teste ESMTP");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      while (true) {
        if (modoDados) {
          const fimDados = buf.indexOf("\r\n.\r\n");
          if (fimDados < 0) return;
          dados += buf.slice(0, fimDados);
          buf = buf.slice(fimDados + 5);
          modoDados = false;
          if (para.some((p) => p.includes("falha-smtp"))) responder("554 5.7.1 Mensagem recusada pelo servidor de teste");
          else {
            const { assunto, html } = decodificar(dados.replace(/^\.\./gm, "."));
            const nome = `${new Date().toISOString().replace(/[:.]/g, "-")}-${String(++n).padStart(4, "0")}.html`;
            writeFileSync(path.join(pasta, nome), `<!-- PARA: ${para.join("; ")} -->\n<!-- ASSUNTO: ${assunto} -->\n${html}`);
            responder("250 2.0.0 OK");
          }
          dados = "";
          para = [];
          continue;
        }
        const i = buf.indexOf("\r\n");
        if (i < 0) return;
        const linha = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const cmd = linha.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") responder("250 smtp-teste");
        else if (cmd === "MAIL") { para = []; responder("250 OK"); }
        else if (cmd === "RCPT") { para.push((/<([^>]*)>/.exec(linha) || [])[1] || ""); responder("250 OK"); }
        else if (cmd === "DATA") { modoDados = true; responder("354 Fim com <CRLF>.<CRLF>"); }
        else if (cmd === "RSET") { para = []; responder("250 OK"); }
        else if (cmd === "NOOP") responder("250 OK");
        else if (cmd === "QUIT") { responder("221 Tchau"); sock.end(); return; }
        else responder("502 Comando não suportado");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ porta: server.address().port, fechar: () => server.close() })));
}
