import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Eye, Gauge, Info, ListTodo, Lock, PenLine, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LegendaPA, LogoPrograma, PageHeader, Secao, Trilha } from "@/components/comum";
import { Carregando, Erro, Vazio } from "@/components/Estados";
import InspecaoDetalhe, { CabecalhoInspecao, ItemLeitura } from "@/components/InspecaoDetalhe";
import ResultadoInspecao from "@/components/ResultadoInspecao";
import PlanoForm from "@/components/plano/PlanoForm";
import BotaoPA from "@/components/plano/BotaoPA";
import { planoFns } from "@/lib/fns";
import { fmtData } from "@/lib/format";

// ScreenPlanoDeAcao — também é o destino do link enviado por e-mail (/plano-acao/<id>)
export const Route = createFileRoute("/_authed/plano-acao/$inspecaoId")({
  component: PlanoDeAcao,
});

function PlanoDeAcao() {
  const { inspecaoId } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["plano", "inspecao", inspecaoId], queryFn: () => planoFns.obter({ inspecaoId }) });
  const [itemSel, setItemSel] = useState(null);
  const [verTudo, setVerTudo] = useState(false);

  const d = q.data;
  const itens = useMemo(() => {
    if (!d?.inspecao) return [];
    const nc = new Set(d.naoConformes);
    return (d.inspecao.Checklist || []).map((it, idx) => ({ ...it, indice: it.indice || idx + 1 })).filter((it) => nc.has(String(it.Id)));
  }, [d]);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  if (d.erro) return <ErroAcesso d={d} />;

  const insp = d.inspecao;
  const p = insp.TipoDeFormulario;
  const planoDe = (it) => d.planos.find((x) => String(x.ItemRef) === String(it.Id));

  async function salvar(f) {
    await planoFns.salvar({ inspecaoId, itemRef: itemSel.Id, ...f });
    toast.success("Plano de ação enviado");
    setItemSel(null);
    await qc.invalidateQueries({ queryKey: ["plano"] });
  }

  const finalizados = itens.filter((it) => planoDe(it)?.Status === "Finalizado").length;
  const andamento = itens.filter((it) => planoDe(it) && planoDe(it).Status !== "Finalizado").length;

  return (
    <div className="space-y-6">
      <div>
        <Trilha
          itens={[
            { rotulo: "Resultado e Plano de Ação", to: "/plano-acao" },
            { rotulo: p === "SOL" ? "Inspeções SOL" : "Avaliações GRD", to: "/plano-acao/lista", search: { programa: p } },
            { rotulo: `${insp.Unidade} · ${insp.Area}` },
          ]}
        />
        <PageHeader
          titulo={`${insp.Unidade} · ${insp.Area}`}
          className="mb-0"
          acoes={<LogoPrograma programa={p} className="hidden h-10 sm:block" />}
        >
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
            <span>Resultado e Plano de Ação — {p === "SOL" ? "Inspeção do Programa SOL" : "Avaliação do Programa GRD"}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtData(insp.Data)}</span>
            {d.prazo?.fim && (
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Prazo para preenchimento: {fmtData(d.prazo.inicio)} - {fmtData(d.prazo.fim)}</span>
            )}
          </div>
        </PageHeader>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Secao titulo="Resultado" icone={Gauge}>
            <ResultadoInspecao programa={p} r={insp} />
          </Secao>

          <Secao
            titulo="Itens não conformes"
            descricao={itens.length ? `${itens.length} ${itens.length === 1 ? "item precisa" : "itens precisam"} de plano de ação · ${finalizados} finalizado(s), ${andamento} em andamento` : undefined}
            icone={ListTodo}
            acoes={<LegendaPA />}
            corpoClassName="p-0"
          >
            {!itens.length ? <div className="p-5"><Vazio texto="Nenhum item não conforme nesta inspeção." /></div> : itens.map((it) => (
              <ItemLeitura key={it.Id} programa={p} item={it}>
                <BotaoPA plano={planoDe(it)} onClick={() => setItemSel(it)} />
              </ItemLeitura>
            ))}
          </Secao>
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <Secao titulo="Dados da inspeção" icone={Info}>
            <CabecalhoInspecao insp={insp} tipoInspecao={d.tipoInspecao} lateral />
            <Button variant="outline" className="mt-5 w-full" onClick={() => setVerTudo(true)}><Eye className="h-4 w-4" /> Visualizar Inspeção Completa</Button>
          </Secao>
          {insp.AssinaturaUrl && (
            <Secao titulo="Assinatura" descricao={insp.RespAcompanhamento} icone={PenLine}>
              <img src={insp.AssinaturaUrl} alt="Assinatura" className="mx-auto max-h-32 w-full rounded-lg border bg-white object-contain" />
            </Secao>
          )}
        </div>
      </div>

      <PlanoForm aberto={!!itemSel} onClose={() => setItemSel(null)} item={itemSel} plano={itemSel ? planoDe(itemSel) : null} programa={p} usuario={d.usuario} onSalvar={salvar} />

      <Dialog open={verTudo} onOpenChange={setVerTudo}>
        <DialogContent className="max-h-[92vh] overflow-y-auto bg-background sm:max-w-4xl">
          <DialogHeader><DialogTitle>Inspeção completa</DialogTitle></DialogHeader>
          <InspecaoDetalhe insp={insp} tipoInspecao={d.tipoInspecao} compacto />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ErroAcesso({ d }) {
  const msgs = {
    vinculo: ["Sem Acesso!", "Você não possui acesso a essa inspeção!", Lock],
    inativada: ["Inspeção inativada!", d.motivo || "Inspeção inativada pelo administrador.", ShieldOff],
    "em-aberto": ["Inspeção em andamento", "Esta inspeção ainda não foi finalizada pelo inspetor.", Lock],
    "nao-encontrada": ["Inspeção não encontrada", "O link pode estar incorreto ou a inspeção foi removida.", Lock],
  };
  const [titulo, motivo, Icone] = msgs[d.erro] || msgs["nao-encontrada"];
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border bg-card p-8 text-center shadow-card">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50"><Icone className="h-6 w-6 text-destructive" /></span>
      <h1 className="mt-5 text-xl font-semibold">{titulo}</h1>
      <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm"><b>Motivo:</b> {motivo}</div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Em caso de dúvidas, por favor, entre em contato através do e-mail: <a className="font-medium text-primary underline underline-offset-4" href={`mailto:${d.contato}`}>{d.contato}</a>
      </p>
      <Button asChild variant="outline" className="mt-6"><Link to="/">Voltar ao Início</Link></Button>
    </div>
  );
}
