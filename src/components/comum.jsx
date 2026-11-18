import { Link } from "@tanstack/react-router";
import { ChevronRight, Home, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Cabeçalho de página: título, descrição, ações à direita e (opcional) linha de metadados.
export function PageHeader({ titulo, subtitulo, acoes, children, className }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl flex-1">
        <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground">{titulo}</h1>
        {subtitulo && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitulo}</p>}
        {children}
      </div>
      {acoes && <div className="no-print flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

// Trilha de navegação (breadcrumb). O primeiro item é sempre "Início".
// itens: [{ rotulo, to?, search?, params? }] — o último é a página atual.
export function Trilha({ itens = [], className }) {
  return (
    <nav aria-label="Trilha" className={cn("no-print mb-5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground", className)}>
      <Link to="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-foreground/70 transition hover:bg-muted hover:text-foreground">
        <Home className="h-3.5 w-3.5" />Início
      </Link>
      {itens.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          {it.to ? (
            <Link to={it.to} search={it.search} params={it.params} className="truncate rounded-md px-1.5 py-1 font-medium text-foreground/70 transition hover:bg-muted hover:text-foreground">{it.rotulo}</Link>
          ) : (
            <span aria-current="page" className="truncate px-1.5 py-1 font-medium text-foreground">{it.rotulo}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// <select> nativo estilizado — melhor experiência no celular que comboboxes customizados.
export function NativeSelect({ value, onChange, options = [], placeholder = "Selecionar", className, disabled, allowEmpty = true, ...rest }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      className={cn(
        "select-nativo flex h-9 w-full rounded-lg border border-input bg-white px-3 text-sm shadow-xs transition-[border-color,box-shadow] hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground",
        !value && "text-foreground/70",
        className,
      )}
      {...rest}
    >
      {allowEmpty && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === "object" ? o.value : o;
        const l = typeof o === "object" ? o.label : o;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

// Campo de formulário: rótulo acima do controle
export function Campo({ rotulo, children, className, obrigatorio }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="field-label">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </div>
      {children}
    </div>
  );
}

// Valor somente leitura (lista de definição): rótulo pequeno e valor
export function Valor({ rotulo, valor, className }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="text-xs font-medium text-muted-foreground">{rotulo}</div>
      <div className="valor-leitura break-words">{valor || <span className="font-normal text-muted-foreground/70">—</span>}</div>
    </div>
  );
}

export function LogoPrograma({ programa, className = "h-8" }) {
  if (programa === "SOL") return <img src="/logo-sol.png" alt="SOL" className={cn("object-contain", className)} />;
  if (programa === "GRD") return <img src="/logo-grd.png" alt="GRD" className={cn("object-contain", className)} />;
  if (programa === "SGI")
    return (
      <span className={cn("inline-flex items-center gap-1 font-bold text-primary", className)}>
        <ShieldCheck className="h-full w-auto" /> SGI
      </span>
    );
  return null;
}

// Marca do programa num quadrado (listas)
export function MarcaPrograma({ programa, className }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white", className)}>
      {programa === "SGI" ? <ShieldCheck className="h-5 w-5 text-primary" aria-label="SGI" /> : <LogoPrograma programa={programa} className="h-7 w-7" />}
    </span>
  );
}

// Etiqueta (badge) com tons semânticos
const TOM = {
  neutro: "bg-slate-100 text-slate-700 ring-slate-200",
  primario: "bg-secondary text-secondary-foreground ring-primary/15",
  sucesso: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  alerta: "bg-amber-50 text-amber-800 ring-amber-200",
  perigo: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  laranja: "bg-orange-50 text-orange-700 ring-orange-200",
  SOL: "bg-amber-50 text-amber-800 ring-amber-200",
  GRD: "bg-sky-50 text-sky-800 ring-sky-200",
  SGI: "bg-secondary text-primary ring-primary/20",
};
export function Etiqueta({ tom = "neutro", children, ponto, className, ...rest }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TOM[tom], className)} {...rest}>
      {ponto && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export const BadgePrograma = ({ programa }) => <Etiqueta tom={programa} className="font-semibold">{programa}</Etiqueta>;

// Contadores de plano de ação: Não iniciado (vermelho) / Em andamento (âmbar) / Finalizado (verde)
export function ContadoresPA({ naoIniciados = 0, emAndamento = 0, finalizados = 0, semTotal }) {
  const Box = ({ n, cor, titulo }) => (
    <span
      title={titulo}
      aria-label={`${titulo}: ${n}`}
      className={cn("inline-flex h-6 min-w-7 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ring-1 ring-inset", n ? cor : "bg-white text-muted-foreground/70 ring-border")}
    >
      {n}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1">
      <Box n={naoIniciados} cor="bg-red-50 text-red-700 ring-red-200" titulo="Não iniciados" />
      <Box n={emAndamento} cor="bg-amber-50 text-amber-800 ring-amber-200" titulo="Em andamento" />
      <Box n={finalizados} cor="bg-emerald-50 text-emerald-700 ring-emerald-200" titulo="Finalizados" />
      {!semTotal && <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">Total: {naoIniciados + emAndamento + finalizados}</span>}
    </span>
  );
}

// Selo de prazo do plano de ação (mantém o texto "Em Dia!" / "Em Atraso!" dos apps originais)
export const SeloPrazo = ({ atraso }) => <Etiqueta tom={atraso ? "perigo" : "sucesso"} ponto>{atraso ? "Em Atraso!" : "Em Dia!"}</Etiqueta>;

export function LegendaPA() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /> Não preenchido</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> Em andamento</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Finalizado</span>
    </div>
  );
}

export function Confirmar({ aberto, onOpenChange, titulo, descricao, textoConfirmar = "Confirmar", destrutivo, onConfirmar }) {
  return (
    <AlertDialog open={aberto} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={destrutivo ? "bg-destructive hover:bg-destructive/90" : ""} onClick={onConfirmar}>
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Cartão de seção: cabeçalho (título, descrição, ações) separado do conteúdo
export function Secao({ titulo, descricao, children, className, acoes, icone: Icone, corpoClassName }) {
  const temCabecalho = titulo || acoes;
  return (
    <section className={cn("superficie", className)}>
      {temCabecalho && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icone && <Icone className="h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0">
              {titulo && <h2 className="text-[15px] font-semibold text-foreground">{titulo}</h2>}
              {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
            </div>
          </div>
          {acoes}
        </div>
      )}
      <div className={cn("p-5", corpoClassName)}>{children}</div>
    </section>
  );
}

// Iniciais para avatar
export const iniciais = (nome = "") =>
  nome.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

export function Avatar({ nome, className }) {
  return (
    <span aria-hidden="true" className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-600 to-sky-900 text-xs font-semibold text-white", className)}>
      {iniciais(nome)}
    </span>
  );
}
