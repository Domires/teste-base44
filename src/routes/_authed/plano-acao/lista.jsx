import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContadoresPA, Etiqueta, LogoPrograma, MarcaPrograma, PageHeader, SeloPrazo, Trilha } from "@/components/comum";
import { Carregando, Erro, Vazio } from "@/components/Estados";
import FiltrosInspecoes, { FILTRO_INICIAL, aplicarFiltrosLocais, filtrosServidor } from "@/components/FiltrosInspecoes";
import { planoFns } from "@/lib/fns";
import { fmtData } from "@/lib/format";

// ScreenSelecao_1 (Listagem) do app Plano de Ação
const INICIAL_PA = { ...FILTRO_INICIAL, ano: "" };

export const Route = createFileRoute("/_authed/plano-acao/lista")({
  validateSearch: (s) => ({ programa: s.programa === "GRD" ? "GRD" : "SOL" }),
  component: ListaPA,
});

function ListaPA() {
  const { programa } = Route.useSearch();
  const [f, setF] = useState(INICIAL_PA);
  const params = { ...filtrosServidor(f), programa };
  const q = useQuery({ queryKey: ["plano", "lista", params], queryFn: () => planoFns.listar(params) });
  const lista = aplicarFiltrosLocais(q.data || [], f);
  const titulo = programa === "SOL" ? "Inspeções do Programa SOL" : "Avaliações do Programa GRD";

  return (
    <div>
      <Trilha itens={[{ rotulo: "Resultado e Plano de Ação", to: "/plano-acao" }, { rotulo: programa === "SOL" ? "Inspeções SOL" : "Avaliações GRD" }]} />
      <PageHeader
        titulo={titulo}
        subtitulo={q.isLoading ? "Carregando…" : `${lista.length} ${programa === "SOL" ? "inspeção(ões)" : "avaliação(ões)"} da sua área · Resultado e Plano de Ação`}
        acoes={<LogoPrograma programa={programa} className="hidden h-10 sm:block" />}
      />
      <FiltrosInspecoes f={f} setF={setF} lista={q.data || []} inicial={INICIAL_PA} />
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} onRetry={q.refetch} /> : !lista.length ? <Vazio /> : (
        <ul className="superficie divide-y overflow-hidden">
          {lista.map((i) => (
            <li key={i.InspecaoId} className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <MarcaPrograma programa={programa} className="hidden sm:flex" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Link to="/plano-acao/$inspecaoId" params={{ inspecaoId: i.InspecaoId }} className="text-[15px] font-semibold text-foreground hover:text-primary">
                      {i.NomeUnidade} · {i.NomeArea}
                    </Link>
                    {i.TipoDeInspecao && <Etiqueta>{i.TipoDeInspecao}</Etiqueta>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{programa === "SOL" ? "Data da inspeção" : "Data da avaliação"}: {fmtData(i.Data)}</span>
                    {i.PreenchimentoDtInicial && (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />Prazo para preenchimento: <span className="tabular-nums">{fmtData(i.PreenchimentoDtInicial)} – {fmtData(i.PreenchimentoDtFinal)}</span>
                        <SeloPrazo atraso={i.EmAtraso} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Plano de Ação</span>
                  <ContadoresPA naoIniciados={i.ItensPANaoIniciados} emAndamento={i.PlanoDeAcaoEmAndamento} finalizados={i.PlanoDeAcaoFinalizado} />
                </div>
                <Button asChild size="sm" className="w-full sm:w-auto">
                  <Link to="/plano-acao/$inspecaoId" params={{ inspecaoId: i.InspecaoId }}>Plano de Ação <ChevronRight className="h-4 w-4" /></Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
