// Envio de e-mails (equivalente ao conector Office 365 "Enviar um email (V2)" dos fluxos).
//
// NO BASE44 este arquivo vira uma chamada da integração nativa, no mesmo formato de sendEmail abaixo:
//   await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, html });
//   - `to` aceita UM endereço por chamada (por isso quem chama envia um e-mail por destinatário);
//   - não há campo de importância/prioridade;
//   - a plataforma sempre envia para usuários cadastrados no app; para outros endereços exige plano pago
//     e domínio próprio conectado.
// Aqui (local): com SMTP_HOST configurado envia via SMTP (nodemailer); senão grava o e-mail em server/data/outbox.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { EMAILS_DIR, OUTBOX_DIR } from "./paths.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Modelo HTML padrão (src/emails/<nome>.html), sem o comentário de documentação do topo.
// O admin pode substituí-lo em Configurar e-mails; vazio volta para este padrão.
// (Fica fora de base44/emails/, que no Base44 é a pasta dos modelos MJML da plataforma.)
export function modeloPadrao(name) {
  return readFileSync(path.join(EMAILS_DIR, `${name}.html`), "utf8").replace(/^(<!doctype html>\s*)<!--[\s\S]*?-->\s*/i, "$1");
}

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // limites curtos: um servidor fora do ar vira "falha" daquele e-mail em segundos, sem travar o lote
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
  });
}

// MODO TESTE (configurado pelo Admin em Programação › Configurar e-mails — entidade ConfiguracaoEmail):
// o e-mail vai SOMENTE para os destinatários de teste; o assunto ganha "[TESTE]" e o corpo mostra para quem iria de verdade.
export function marcarTeste(subject, html, originais) {
  const aviso = `<div style="margin:0 0 16px;padding:10px 14px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;font:13px/1.45 Arial,sans-serif;border-radius:8px">
<b>E-mail de teste</b> — no envio real iria para: ${esc(originais.join("; "))}</div>`;
  const corpo = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + aviso) : aviso + html;
  return { subject: `[TESTE] ${subject}`, html: corpo };
}

// Mesmo formato do Base44: um destinatário por chamada. Lança erro se o servidor de e-mail recusar.
// Retorna { sent: true } quando enviado, ou { sent: false, outbox } quando não há SMTP configurado.
export async function sendEmail({ to, subject, html }) {
  to = String(to || "").trim();
  if (!to) throw new Error("Destinatário não informado.");
  if (transporter) {
    await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
    return { sent: true };
  }
  mkdirSync(OUTBOX_DIR, { recursive: true });
  const file = path.join(OUTBOX_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 7)}.html`);
  writeFileSync(file, `<!-- PARA: ${to} -->\n<!-- ASSUNTO: ${subject} -->\n${html}`);
  console.log(`[email] (sem SMTP) "${subject}" -> ${to} — salvo em ${file}`);
  return { sent: false, outbox: file };
}
