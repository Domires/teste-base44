import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCircle2, CircleDashed, ClipboardList, ListChecks, Loader, UserCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { MarcaPrograma, PageHeader, Secao } from "@/components/comum";
import { Carregando, Erro } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { cn } from "@/lib/utils";

// ScreenHome do Admin (Indicadores_vw)
export const Route = createFileRoute("/_authed/admin/")({
  component: AdminHome,
});

const num = (v) => (v ?? 0).toLocaleString("pt-BR");

// Indicador: rótulo, número em destaque e ícone discreto
const Indicador = ({ titulo, valor, icone: Icone }) => (
  <div className="superficie flex flex-col gap-3 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <span className="text-[13px] font-medium text-muted-foreground">{titulo}</span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/60"><Icone className="h-4 w-4" /></span>
    </div>
    <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground sm:text-3xl">{num(valor)}</span>
  </div>
);

const STATUS = [
  { k: "TotalItensNaoIniciados", titulo: "Planos de Ação Não Iniciados", curto: "Não iniciados", cor: "bg-destructive", icone: CircleDashed, texto: "text-destructive" },
  { k: "PlanoDeAcaoEmAndamento", titulo: "Planos de Ação em Andamento", curto: "Em andamento", cor: "bg-warning", icone: Loader, texto: "text-warning" },
  { k: "PlanoDeAcaoFinalizado", titulo: "Planos de Ação Finalizados", curto: "Finalizados", cor: "bg-success", icone: CheckCircle2, texto: "text-success" },
];

function AdminHome() {
  const q = useQuery({ queryKey: ["admin", "indicadores"], queryFn: () => adminFns.indicadores() });
  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const totalPA = STATUS.reduce((s, x) => s + (d[x.k] || 0), 0);
  const pct = (v) => (totalPA ? Math.round(((v || 0) / totalPA) * 100) : 0);
  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Painel"
        subtitulo="Visão geral do Programa SOL, GRD & SGI"
        acoes={
          <Link to="/admin/inspecoes" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-white shadow-xs transition hover:bg-primary/90">
            Ver inspeções <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador titulo="Inspeções Realizadas" valor={d.TotalInspecao} icone={ClipboardList} />
        <Indicador titulo="Inspetores" valor={d.TotalInspetor} icone={UserCheck} />
        <Indicador titulo="Itens" valor={d.TotalItem} icone={ListChecks} />
        <Indicador titulo="Unidades" valor={d.TotalUnidade} icone={Building2} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
        <Secao titulo="Planos de Ação" descricao={`${num(totalPA)} itens no total · SOL e GRD`} className="min-w-0">
          {/* barra de distribuição */}
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={STATUS.map((s) => `${s.curto}: ${d[s.k] || 0}`).join(", ")}>
            {STATUS.map((s) => (d[s.k] ? <div key={s.k} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.cor)} style={{ width: `${pct(d[s.k])}%` }} title={`${s.curto}: ${d[s.k]}`} /> : null))}
          </div>
          <ul className="mt-5 divide-y">
            {STATUS.map((s) => (
              <li key={s.k} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.cor)} />
                <span className="flex-1 text-sm text-foreground/80">{s.titulo}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{pct(d[s.k])}%</span>
                <span className="w-14 text-right text-lg font-semibold tabular-nums">{num(d[s.k])}</span>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Por programa" descricao="Inspeções realizadas e situação dos planos de ação" className="min-w-0" corpoClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="th">Programa</th><th className="th text-right">Inspeções</th><th className="th text-right">Não iniciados</th><th className="th text-right">Em andamento</th><th className="th text-right">Finalizados</th><th className="th text-right">Em atraso</th>
                </tr>
              </thead>
              <tbody>
                {d.porPrograma.map((p) => (
                  <tr key={p.programa} className="border-b tabular-nums last:border-0 [&>td]:px-4 [&>td]:py-3">
                    <td>
                      <span className="flex items-center gap-3 font-medium"><MarcaPrograma programa={p.programa} className="h-8 w-8" />{p.programa}</span>
                    </td>
                    <td className="text-right font-medium">{num(p.inspecoes)}</td>
                    {p.temPlanoDeAcao ? (
                      <>
                        <td className="text-right">{num(p.naoIniciados)}</td><td className="text-right">{num(p.emAndamento)}</td><td className="text-right">{num(p.finalizados)}</td>
                        <td className="text-right">
                          {p.emAtraso ? <span className="inline-flex items-center gap-1.5 font-semibold text-destructive"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{num(p.emAtraso)}</span> : <span className="text-muted-foreground">0</span>}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="text-right text-xs text-muted-foreground">Sem plano de ação</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>
    </div>
  );
}
