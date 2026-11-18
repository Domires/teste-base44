import { base44 } from "@/api/base44Client";

// Reduz fotos do celular antes do envio (máx. 1600px, JPEG 80%) — melhora o uso em rede móvel.
// Só imagens comuns são reduzidas; os demais arquivos vão como estão.
const REDUZIVEIS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/bmp"];
async function comprimir(file, max = 1600) {
  if (!REDUZIVEIS.includes(file.type)) return null;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

// data:...;base64 -> File (o UploadFile do Base44 recebe um File)
async function paraArquivo(dataUrl, nome) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], nome, { type: blob.type });
}

// Envia para o armazenamento público do Base44 (Core.UploadFile) e devolve a URL do arquivo.
export async function enviarArquivo(file) {
  if (file.size > TAMANHO_MAXIMO) throw new Error(`"${file.name}" tem mais de 25 MB.`);
  const dataUrl = await comprimir(file);
  const envio = dataUrl ? await paraArquivo(dataUrl, file.name.replace(/\.[^.]*$/, "") + ".jpg") : file;
  const { file_url } = await base44.integrations.Core.UploadFile({ file: envio });
  return file_url;
}

// Assinatura (canvas -> data URL PNG)
export async function enviarDataUrl(dataUrl, nome = "assinatura.png") {
  const { file_url } = await base44.integrations.Core.UploadFile({ file: await paraArquivo(dataUrl, nome) });
  return file_url;
}

// ---- exibição de anexos (as evidências são guardadas só como URL) ----
const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp", "gif"];
export const extensao = (url) => (/\.([a-z0-9]{1,10})(?:[?#].*)?$/i.exec(String(url))?.[1] || "").toLowerCase();
export const ehImagem = (url) => String(url).startsWith("data:image/") || EXT_IMAGEM.includes(extensao(url));
// ".../<id>_Relatorio_final.xlsx" -> nome do arquivo (sem o prefixo de identificação, quando houver)
export function nomeArquivo(url) {
  const ultimo = decodeURIComponent(String(url).split(/[?#]/)[0].split("/").pop() || "arquivo");
  return ultimo.replace(/^[0-9a-f-]{36}(__)?/i, "") || ultimo;
}
