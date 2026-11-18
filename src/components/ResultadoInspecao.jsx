import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";
import { resumoSgi } from "@/lib/scores";

// Cores do status SOL (RUIM → EXCELENTE)
const COR_STATUS = {
  RUIM: "bg-red-50 text-red-700 ring-red-200",
  REGULAR: "bg-orange-50 text-orange-700 ring-orange-200",
  BOM: "bg-amber-50 text-amber-800 ring-amber-200",
  "ÓTIMO": "bg-sky-50 text-sky-700 ring-sky-200",
  EXCELENTE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
const corBarra = (v) => (v == null ? "bg-muted-foreground/30" : v >= 90 ? "bg-emerald-500" : v >= 75 ? "bg-sky-500" : v >= 60 ? "bg-amber-500" : v >= 40 ? "bg-orange-500" : "bg-red-500");

// Métrica: rótulo, valor e barra de progresso (0–100%)
function Metrica({ rotulo, valor, destaque, className }) {
  const n = valor == null || valor === "" || Number.isNaN(Number(valor)) ? null : Number(valor);
  return (
    <div className={cn("flex flex-col rounded-xl border bg-white p-4", destaque && "border-primary/25 bg-gradient-to-b from-secondary/70 to-white", className)}>
      <div className="text-xs font-medium text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1.5 font-semibold tabular-nums tracking-tight text-foreground", destaque ? "text-[1.75rem] leading-9" : "text-2xl leading-8")}>{fmtPct(valor)}</div>
      <div className="mt-auto pt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-[width] duration-500", corBarra(n))} style={{ width: `${Math.max(0, Math.min(100, n ?? 0))}%` }} />
        </div>
      </div>
    </div>
  );
}

const Contagem = ({ rotulo, valor, cor }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
    <span className="flex items-center gap-2.5 text-sm text-foreground/80"><span className={cn("h-2.5 w-2.5 rounded-full", cor)} />{rotulo}</span>
    <span className="text-xl font-semibold tabular-nums">{valor}</span>
  </div>
);
const COR_SGI = { Conforme: "bg-emerald-500", "Ponto Positivo": "bg-emerald-500", "Ponto de Melhoria": "bg-amber-500", "Não Conformidade Menor": "bg-orange-500", "Não Conformidade Maior": "bg-red-500" };

// r = { TipoDeFormulario, Status, ScoreTotal, ScoreEmpresa, ScoreColaborador, ScoreSeguranca, Metricas, Atendimento, Checklist }
export default function ResultadoInspecao({ programa, r }) {
  if (programa === "SOL") {
    return (
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="flex flex-col rounded-xl border bg-white p-4 sm:col-span-3">
          <div className="text-xs font-medium text-muted-foreground">Status</div>
          <span className={cn("my-auto inline-flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-lg font-semibold tracking-wide ring-1 ring-inset", COR_STATUS[r.Status] || "bg-muted text-muted-foreground ring-border")}>
            <span className="h-2 w-2 rounded-full bg-current opacity-80" />
            {r.Status || "—"}
          </span>
        </div>
        <Metrica rotulo="Score Total" valor={r.ScoreTotal} destaque className="sm:col-span-3" />
        <Metrica rotulo="Score Segurança" valor={r.ScoreSeguranca} className="sm:col-span-2" />
        <Metrica rotulo="Score Empresa" valor={r.ScoreEmpresa} className="sm:col-span-2" />
        <Metrica rotulo="Score Colaboradores/PLR" valor={r.ScoreColaborador} className="sm:col-span-2" />
      </div>
    );
  }
  if (programa === "GRD") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metrica rotulo="% Atendimento" valor={r.Atendimento} destaque />
        {(r.Metricas || []).map((m) => (
          <Metrica key={m.Pilar} rotulo={m.Pilar} valor={m.Atendimento} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {resumoSgi(r.Checklist || []).map((x) => (
        <Contagem key={x.Resposta} rotulo={x.Resposta} valor={x.Quantidade} cor={COR_SGI[x.Resposta] || "bg-slate-400"} />
      ))}
    </div>
  );
}
