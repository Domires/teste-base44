// Envio de e-mails (equivalente ao conector Office 365 "Enviar um email (V2)" dos fluxos),
// pela integração nativa do Base44: Core.SendEmail({ to, subject, html }).
//   - `to` aceita UM endereço por chamada (quem chama envia um e-mail por destinatário);
//   - não há campo de importância/prioridade;
//   - a plataforma sempre envia para usuários cadastrados no app; para outros endereços exige plano pago
//     e domínio próprio conectado.
import modeloPlanoDeAcao from "@/emails/PlanoDeAcao.html?raw";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const MODELOS = { PlanoDeAcao: modeloPlanoDeAcao };

// Modelo HTML padrão (src/emails/<nome>.html), sem o comentário de documentação do topo.
// O admin pode substituí-lo em Configurar e-mails; vazio volta para este padrão.
// (Fica fora de base44/emails/, que no Base44 é a pasta dos modelos MJML da plataforma.)
export function modeloPadrao(name) {
  return String(MODELOS[name] || "").replace(/^(<!doctype html>\s*)<!--[\s\S]*?-->\s*/i, "$1");
}

// MODO TESTE (configurado pelo Admin em Programação › Configurar e-mails — entidade ConfiguracaoEmail):
// o e-mail vai SOMENTE para os destinatários de teste; o assunto ganha "[TESTE]" e o corpo mostra para quem iria de verdade.
export function marcarTeste(subject, html, originais) {
  const aviso = `<div style="margin:0 0 16px;padding:10px 14px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;font:13px/1.45 Arial,sans-serif;border-radius:8px">
<b>E-mail de teste</b> — no envio real iria para: ${esc(originais.join("; "))}</div>`;
  const corpo = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + aviso) : aviso + html;
  return { subject: `[TESTE] ${subject}`, html: corpo };
}

// Um destinatário por chamada. Lança erro se a plataforma recusar o envio.
// `integrations` = context.getBase44().asServiceRole.integrations (quem chama já validou o admin).
export async function sendEmail(integrations, { to, subject, html }) {
  to = String(to || "").trim();
  if (!to) throw new Error("Destinatário não informado.");
  const r = await integrations.Core.SendEmail({ to, subject, html });
  if (r && r.success === false) throw new Error(r.error || r.message || "Envio recusado pela plataforma.");
  return { sent: true };
}
