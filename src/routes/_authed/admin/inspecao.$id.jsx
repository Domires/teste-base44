import { useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, CalendarDays, MailCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgePrograma, Etiqueta, LegendaPA, PageHeader, Secao } from "@/components/comum";
import BotaoPA from "@/components/plano/BotaoPA";
import { Carregando, Erro, Vazio } from "@/components/Estados";
import InspecaoDetalhe, { ItemLeitura } from "@/components/InspecaoDetalhe";
import PlanoForm from "@/components/plano/PlanoForm";
import { adminFns } from "@/lib/fns";
import { fmtData, fmtDataHora } from "@/lib/format";
import { itensNaoConformes } from "@/lib/scores";

// Detalhe da inspeção no Admin (ContainerViewInspecao + ContainerVisualizarPA). "Imprimir" gera o PDF pelo navegador.
export const Route = createFileRoute("/_authed/admin/inspecao/$id")({
  component: DetalheAdmin,
});

function DetalheAdmin() {
  const { id } = Route.useParams();
  const router = useRouter();
  const q = useQuery({ queryKey: ["admin", "inspecao", id], queryFn: () => adminFns.obterInspecao({ id }) });
  const [itemSel, setItemSel] = useState(null);
  const insp = q.data;
  const nc = useMemo(() => (insp ? itensNaoConformes(insp.TipoDeFormulario, insp.Checklist).map((it) => ({ ...it, indice: it.indice || insp.Checklist.indexOf(it) + 1 })) : []), [insp]);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  const planoDe = (it) => insp.Planos.find((p) => String(p.ItemRef) === String(it.Id));

  return (
    <div className="space-y-4">
      <button onClick={() => router.history.back()} className="no-print -ml-1.5 mb-4 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Inspeções
      </button>
      <PageHeader
        titulo={`${insp.Unidade} · ${insp.Area}`}
        acoes={
          <div className="no-print flex gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
          </div>
        }
      >
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
          <BadgePrograma programa={insp.TipoDeFormulario} />
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtData(insp.Data)}</span>
          {insp.EmAberto && <Etiqueta tom="alerta" ponto>Em aberto</Etiqueta>}
          {insp.Inativado && <Etiqueta tom="perigo" ponto>Inativada em {fmtData(insp.dtInativacao)} por {insp.Inativador}</Etiqueta>}
          {insp.Disparado && <span className="inline-flex items-center gap-1.5"><MailCheck className="h-3.5 w-3.5" />e-mail enviado em {fmtDataHora(insp.DataDisparo)}</span>}
        </div>
      </PageHeader>
      {insp.Inativado && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><div><div className="font-medium text-red-800">Motivo da inativação</div><div className="mt-0.5 text-red-900/80">{insp.MotivoInativacao}</div></div></div>
      )}
      <Tabs defaultValue="inspecao">
        <TabsList className="no-print">
          <TabsTrigger value="inspecao">Inspeção</TabsTrigger>
          {!insp.EmAberto && <TabsTrigger value="pa">Plano de Ação <span className="rounded-full bg-muted px-1.5 py-px text-[11px] tabular-nums text-muted-foreground">{insp.Planos.length}/{nc.length}</span></TabsTrigger>}
        </TabsList>
        <TabsContent value="inspecao">
          <InspecaoDetalhe insp={insp} />
        </TabsContent>
        <TabsContent value="pa">
          <Secao titulo="Itens não conformes" descricao="Planos de ação preenchidos pelos responsáveis da área" acoes={<LegendaPA />} corpoClassName="p-0">
            {!nc.length ? <div className="p-5"><Vazio texto="Nenhum item não conforme." /></div> : nc.map((it) => {
              const pl = planoDe(it);
              return (
                <ItemLeitura key={it.Id} programa={insp.TipoDeFormulario} item={it}>
                  <BotaoPA plano={pl} onClick={() => setItemSel(it)} disabled={!pl}>{pl ? "Plano de Ação" : "Não preenchido"}</BotaoPA>
                </ItemLeitura>
              );
            })}
          </Secao>
        </TabsContent>
      </Tabs>
      <PlanoForm aberto={!!itemSel} onClose={() => setItemSel(null)} item={itemSel} plano={itemSel ? planoDe(itemSel) : null} programa={insp.TipoDeFormulario} somenteLeitura />
    </div>
  );
}
