import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/lib/format";

// Equivalente ao componente LoadScreen dos apps Power Apps
export function Carregando({ texto = "Carregando...", tela = false }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-muted-foreground ${tela ? "min-h-[60vh]" : "py-16"}`}>
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function Overlay({ texto = "Enviando..." }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 backdrop-blur-[2px]">
      <div className="flex items-center gap-3 rounded-xl border bg-white px-6 py-4 shadow-pop">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm font-medium">{texto}</span>
      </div>
    </div>
  );
}

export function Vazio({ texto = "Nenhum registro encontrado.", icone: Icone = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-14 text-center text-muted-foreground">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"><Icone className="h-5 w-5" /></span>
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function Erro({ erro, onRetry }) {
  // 403 = sem permissão (ex.: quem não é inspetor/auditor nem admin abrindo a Inspeção): não adianta tentar de novo
  if (erro?.status === 403) {
    return (
      <div data-sem-acesso className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"><Lock className="h-5 w-5 text-muted-foreground" /></span>
        <h2 className="text-base font-semibold">Sem acesso</h2>
        <p className="text-sm text-muted-foreground">{errMsg(erro)}</p>
        <Button asChild size="sm" className="mt-1"><Link to="/">Voltar ao Início</Link></Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 p-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100"><AlertTriangle className="h-5 w-5 text-destructive" /></span>
      <p className="text-sm">{errMsg(erro)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function RouteError({ error, reset }) {
  return (
    <div className="mx-auto max-w-lg p-8">
      <Erro erro={error} onRetry={reset} />
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-12 text-center">
      <span className="text-6xl font-semibold tracking-tight text-primary/25">404</span>
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço pode estar incorreto ou a página foi removida.</p>
      <Button asChild className="mt-2">
        <Link to="/">Voltar ao Início</Link>
      </Button>
    </div>
  );
}
