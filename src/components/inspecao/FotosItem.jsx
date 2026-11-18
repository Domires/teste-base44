import { useRef, useState } from "react";
import { Camera, Download, File, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo, Loader2, Paperclip, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ehImagem, enviarArquivo, extensao, nomeArquivo } from "@/lib/upload";
import { errMsg } from "@/lib/format";
import { cn } from "@/lib/utils";

// Ícone por tipo de arquivo (anexos que não são imagem)
const GRUPOS = [
  [FileSpreadsheet, ["xls", "xlsx", "xlsm", "csv", "ods"], "text-emerald-600"],
  [FileText, ["pdf", "doc", "docx", "odt", "rtf", "txt", "ppt", "pptx", "odp", "md"], "text-sky-600"],
  [FileVideo, ["mp4", "mov", "avi", "mkv", "webm", "wmv", "3gp"], "text-violet-600"],
  [FileAudio, ["mp3", "wav", "ogg", "m4a", "aac", "opus"], "text-amber-600"],
  [FileArchive, ["zip", "rar", "7z", "tar", "gz"], "text-orange-600"],
];
function iconeDe(url) {
  const ext = extensao(url);
  const g = GRUPOS.find(([, exts]) => exts.includes(ext));
  return g ? { Icone: g[0], cor: g[2], ext } : { Icone: File, cor: "text-muted-foreground", ext };
}

// Cartão de um anexo que não é imagem: ícone, nome e extensão; clique baixa/abre o arquivo.
function CartaoArquivo({ url, tamanho = "h-20 w-20", children }) {
  const { Icone, cor, ext } = iconeDe(url);
  const nome = nomeArquivo(url);
  return (
    <div className={cn("group relative overflow-hidden rounded-md border bg-white", tamanho)}>
      <a href={url} target="_blank" rel="noopener noreferrer" download={nome} title={`Baixar ${nome}`} aria-label={`Baixar ${nome}`} data-anexo={nome}
        className="flex h-full w-full flex-col items-center justify-center gap-1 px-1.5 text-center transition hover:bg-muted/60">
        <Icone className={cn("h-6 w-6 shrink-0", cor)} />
        <span className="line-clamp-2 w-full break-all text-[10px] leading-tight text-foreground/80">{nome}</span>
        {ext && <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{ext}</span>}
      </a>
      <Download className="pointer-events-none absolute bottom-1 right-1 h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      {children}
    </div>
  );
}

function Ampliar({ url, onClose }) {
  return (
    <Dialog open={!!url} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-2">
        <DialogTitle className="sr-only">Foto</DialogTitle>
        {url && <img src={url} alt="Evidência ampliada" className="max-h-[80vh] w-full rounded object-contain" />}
      </DialogContent>
    </Dialog>
  );
}

// Galeria de evidências (AddMedia + galeria do Power Apps). Faz upload na hora e guarda só as URLs.
// qualquerArquivo = aceita qualquer tipo de arquivo (SGI); senão, somente imagens.
export default function FotosItem({ fotos = [], onChange, disabled, max = 10, rotulo, qualquerArquivo = false }) {
  const input = useRef(null);
  const [enviando, setEnviando] = useState(0);
  const [zoom, setZoom] = useState(null);

  async function selecionar(e) {
    const files = [...(e.target.files || [])].slice(0, max - fotos.length);
    e.target.value = "";
    if (!files.length) return;
    setEnviando((n) => n + files.length);
    const novas = [];
    for (const f of files) {
      try {
        if (!qualquerArquivo && !f.type.startsWith("image/")) throw new Error(`"${f.name}" não é uma imagem.`);
        novas.push(await enviarArquivo(f));
      } catch (err) {
        toast.error(`Falha ao enviar ${qualquerArquivo ? "arquivo" : "foto"}: ${errMsg(err)}`);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    if (novas.length) onChange([...fotos, ...novas]);
  }

  const remover = (url) => (
    <button type="button" onClick={() => onChange(fotos.filter((f) => f !== url))} className="absolute right-1 top-1 rounded bg-destructive p-1 text-white" aria-label={ehImagem(url) ? "Remover foto" : `Remover ${nomeArquivo(url)}`}>
      <X className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {fotos.map((url) =>
        ehImagem(url) ? (
          <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-md border bg-muted">
            <img src={url} alt="Evidência" className="h-full w-full object-cover" loading="lazy" />
            <button type="button" onClick={() => setZoom(url)} className="absolute bottom-1 left-1 rounded bg-black/50 p-1 text-white" aria-label="Ampliar">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {!disabled && remover(url)}
          </div>
        ) : (
          <CartaoArquivo key={url} url={url}>{!disabled && remover(url)}</CartaoArquivo>
        ),
      )}
      {Array.from({ length: enviando }).map((_, i) => (
        <div key={`up${i}`} className="flex h-20 w-20 items-center justify-center rounded-md border bg-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ))}
      {!disabled && fotos.length + enviando < max && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/50 text-xs font-medium text-foreground hover:bg-primary/5"
          >
            {qualquerArquivo ? <Paperclip className="h-5 w-5 text-primary" /> : <Camera className="h-5 w-5 text-primary" />}
            {rotulo || (qualquerArquivo ? "Anexar" : "Carregar")}
          </button>
          <input ref={input} type="file" accept={qualquerArquivo ? undefined : "image/*"} multiple className="hidden" onChange={selecionar} />
        </>
      )}
      <Ampliar url={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

// Somente leitura: miniaturas das imagens + cartões dos demais arquivos.
export function GaleriaFotos({ fotos = [] }) {
  const [zoom, setZoom] = useState(null);
  if (!fotos.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {fotos.map((url) =>
        ehImagem(url) ? (
          <button key={url} type="button" onClick={() => setZoom(url)} className="h-16 w-16 overflow-hidden rounded-lg border bg-muted ring-offset-2 transition hover:ring-2 hover:ring-primary/40">
            <img src={url} alt="Foto" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ) : (
          <CartaoArquivo key={url} url={url} tamanho="h-16 w-24" />
        ),
      )}
      <Ampliar url={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}
