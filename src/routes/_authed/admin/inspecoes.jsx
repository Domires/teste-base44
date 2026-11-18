import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarDays, Download, Eye, Gauge, MailCheck, Pencil, Send, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Etiqueta, MarcaPrograma, SeloPrazo, BadgePrograma, Campo, Confirmar, ContadoresPA, NativeSelect, PageHeader, Valor } from "@/components/comum";
import { Carregando, Erro, Overlay, Vazio } from "@/components/Estados";
import FiltrosInspecoes, { FILTRO_INICIAL, aplicarFiltrosLocais, filtrosServidor } from "@/components/FiltrosInspecoes";
import { adminFns, inspecaoFns } from "@/lib/fns";
import { useConfigEmail } from "@/components/AvisoModoTeste";
import { baixarCsv, errMsg, fmtData, fmtPct } from "@/lib/format";

// ScreenInspecoes + ScreenInspecoesInativadas + ScreenInspecoesEmAberto numa só tela (filtro "Situação")
export const Route = createFileRoute("/_authed/admin/inspecoes")({
  validateSearch: (s) => ({ situacao: ["ativas", "inativadas", "emAberto", "todas"].includes(s.situacao) ? s.situacao : "ativas" }),
  component: Inspecoes,
});

function Inspecoes() {
  const { situacao } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setSituacao = (v) => navigate({ search: { situacao: v }, replace: true });
  const qc = useQueryClient();
  const cfgEmail = useConfigEmail().data;
  const [f, setF] = useState(FILTRO_INICIAL);
  const params = { situacao, ...filtrosServidor(f) };
  const q = useQuery({ queryKey: ["admin", "inspecoes", params], queryFn: () => adminFns.listarInspecoes(params) });
  const lista = aplicarFiltrosLocais(q.data || [], f);
  const [acao, setAcao] = useState(null); // { tipo, item }
  const [ocupado, setOcupado] = useState(false);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["admin"] });
  async function executar(fn, msg) {
    setOcupado(true);
    try {
      const r = await fn();
      // e-mail: sem servidor de e-mail configurado a mensagem só é gravada (não marca como enviada)
      if (r?.situacao === "nao-configurado") toast.warning("E-mail não enviado: o servidor de e-mail (SMTP) não está configurado.", { description: "A mensagem foi gravada em server/data/outbox e a inspeção não foi marcada como enviada." });
      else if (r?.falhasDestinatarios?.length) toast.warning(`${msg} Mas não receberam: ${r.falhasDestinatarios.map((f) => f.email).join(", ")}.`, { description: r.falhasDestinatarios.map((f) => `${f.email}: ${f.motivo}`).join(" | "), duration: 8000 });
      else toast.success(msg);
      setAcao(null);
      recarregar();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setOcupado(false);
    }
  }

  async function exportar(programa) {
    try {
      const r = await adminFns.exportarPlanilha({ programa, ano: f.ano ? Number(f.ano) : null, mes: f.mes ? Number(f.mes) : null });
      if (!r.linhas.length) return toast.info("Nenhuma inspeção no período selecionado.");
      baixarCsv(`planilha-${programa.toLowerCase()}-${f.ano || "todos"}${f.mes ? `-${f.mes}` : ""}.csv`, r.colunas, r.linhas);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div>
      {ocupado && <Overlay texto="Processando..." />}
      <PageHeader
        titulo="Inspeções e Plano de Ação"
        subtitulo={q.isLoading ? "Carregando…" : `${lista.length} registro(s) · inspeções SOL, avaliações GRD e auditorias SGI`}
        acoes={(
          <>
            <Button variant="outline" size="sm" onClick={() => exportar("SOL")}><Download className="h-4 w-4" /> Planilha SOL</Button>
            <Button variant="outline" size="sm" onClick={() => exportar("GRD")}><Download className="h-4 w-4" /> Planilha GRD</Button>
          </>
        )}
      />
      <FiltrosInspecoes f={f} setF={setF} lista={q.data || []} mostrarPrograma mostrarPrazo={situacao === "ativas"} mostrarStatusPA={situacao !== "emAberto"} situacao={situacao} setSituacao={setSituacao} />
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} onRetry={q.refetch} /> : !lista.length ? <Vazio /> : (
        <ul className="superficie divide-y overflow-hidden">
          {lista.map((i) => (
            <li key={i.InspecaoId} className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-muted/30 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <MarcaPrograma programa={i.TipoDeFormulario} className="hidden sm:flex" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <Link to="/admin/inspecao/$id" params={{ id: i.InspecaoId }} className="text-[15px] font-semibold text-foreground hover:text-primary hover:underline hover:underline-offset-4">
                      {i.NomeUnidade} · {i.NomeArea}
                    </Link>
                    <BadgePrograma programa={i.TipoDeFormulario} />
                    {i.TipoDeInspecao && <Etiqueta>{i.TipoDeInspecao}</Etiqueta>}
                    {i.EmAberto && <Etiqueta tom="alerta" ponto>Em aberto</Etiqueta>}
                    {i.Inativado && <Etiqueta tom="perigo" ponto>Inativa</Etiqueta>}
                    {i.Disparado && <Etiqueta tom="info"><MailCheck className="h-3 w-3" />e-mail enviado</Etiqueta>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5" title={i.TipoDeFormulario === "SOL" ? "Data da inspeção" : "Data da avaliação"}><CalendarDays className="h-3.5 w-3.5" />{fmtData(i.Data)}</span>
                    {i.Avaliador && <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{i.Avaliador}</span>}
                    {i.TipoDeFormulario === "SOL" && i.Status && (
                      <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /><span className="font-medium text-foreground">{i.Status}</span> {fmtPct(i.ScoreTotal)}</span>
                    )}
                    {i.TipoDeFormulario === "GRD" && !i.EmAberto && (
                      <span className="inline-flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Atendimento <span className="font-medium text-foreground">{fmtPct(i.Atendimento)}</span></span>
                    )}
                  </div>
                  {!i.EmAberto && i.TemPlanoDeAcao && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dashed pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-medium">Plano de Ação</span>
                        <ContadoresPA naoIniciados={i.ItensPANaoIniciados} emAndamento={i.PlanoDeAcaoEmAndamento} finalizados={i.PlanoDeAcaoFinalizado} />
                      </span>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-medium">Prazo para preenchimento</span>
                        <span className="tabular-nums text-foreground/80">{i.PreenchimentoDtInicial ? `${fmtData(i.PreenchimentoDtInicial)} – ${fmtData(i.PreenchimentoDtFinal)}` : "Não Definido!"}</span>
                        {i.PreenchimentoDtInicial && <SeloPrazo atraso={i.EmAtraso} />}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button asChild size="sm" variant="outline" className="mr-1"><Link to="/admin/inspecao/$id" params={{ id: i.InspecaoId }}><Eye className="h-4 w-4" /> {i.EmAberto ? "Inspeção" : "Inspeção e PA"}</Link></Button>
                {!i.EmAberto && !i.Inativado && (
                  <>
                    <IconBtn titulo="Enviar plano de ação por e-mail" onClick={() => setAcao({ tipo: "enviar", item: i })}><Send className="h-4 w-4" /></IconBtn>
                    <IconBtn titulo="Editar inspeção" onClick={() => setAcao({ tipo: "editar", item: i })}><Pencil className="h-4 w-4" /></IconBtn>
                    <IconBtn titulo="Inativar inspeção" onClick={() => setAcao({ tipo: "inativar", item: i })} destrutivo><Ban className="h-4 w-4" /></IconBtn>
                  </>
                )}
                {i.EmAberto && (
                  <IconBtn titulo="Descartar avaliação" onClick={() => setAcao({ tipo: "descartar", item: i })} destrutivo><Trash2 className="h-4 w-4" /></IconBtn>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Confirmar
        aberto={acao?.tipo === "enviar"}
        onOpenChange={(o) => !o && setAcao(null)}
        titulo="Preenchimento do Plano de Ação"
        descricao={acao && (cfgEmail?.ModoTeste
          ? `MODO TESTE: o e-mail de ${acao.item.NomeUnidade} · ${acao.item.NomeArea} (${fmtData(acao.item.Data)}) irá somente para ${cfgEmail.DestinatariosTeste.join(", ")} — os responsáveis não receberão. Enviar?`
          : `Enviar e-mail de Resultado e Plano de Ação para os responsáveis de ${acao.item.NomeUnidade} · ${acao.item.NomeArea} (${fmtData(acao.item.Data)})?`)}
        textoConfirmar="Enviar"
        onConfirmar={() => executar(() => adminFns.enviarPAInspecao({ id: acao.item.InspecaoId }), cfgEmail?.ModoTeste ? `E-mail de teste enviado para ${cfgEmail.DestinatariosTeste.join(", ")}.` : "Preenchimento do Plano de Ação Enviado!")}
      />
      <Confirmar
        aberto={acao?.tipo === "descartar"}
        onOpenChange={(o) => !o && setAcao(null)}
        titulo="Descartar Avaliação?"
        descricao={acao && `${acao.item.NomeUnidade} · ${acao.item.NomeArea} — ${fmtData(acao.item.Data)}. Esta ação não pode ser desfeita.`}
        textoConfirmar="Descartar"
        destrutivo
        onConfirmar={() => executar(() => adminFns.descartarEmAberto({ id: acao.item.InspecaoId }), "Avaliação descartada.")}
      />
      {acao?.tipo === "inativar" && <InativarDialog item={acao.item} onClose={() => setAcao(null)} onConfirm={(motivo) => executar(() => adminFns.inativarInspecao({ id: acao.item.InspecaoId, motivo }), "Inspeção inativada com sucesso!")} />}
      {acao?.tipo === "editar" && <EditarDialog item={acao.item} onClose={() => setAcao(null)} onSalvo={() => { setAcao(null); recarregar(); }} />}
    </div>
  );
}

const IconBtn = ({ titulo, onClick, children, destrutivo }) => (
  <Button variant="ghost" size="icon" title={titulo} aria-label={titulo} onClick={onClick} className={destrutivo ? "h-8 w-8 text-muted-foreground hover:bg-red-50 hover:text-destructive" : "h-8 w-8 text-muted-foreground"}>
    {children}
  </Button>
);

function InativarDialog({ item, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Inativar Inspeção</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3">
          <Valor rotulo="Unidade" valor={item.NomeUnidade} /><Valor rotulo="Área" valor={item.NomeArea} /><Valor rotulo="Data" valor={fmtData(item.Data)} />
        </div>
        <Campo rotulo="Motivo"><Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={4000} /></Campo>
        <p className="text-xs text-muted-foreground">O motivo será exibido aos responsáveis que acessarem o plano de ação.</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={!motivo.trim()} onClick={() => onConfirm(motivo.trim())}>Inativar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ContainerEditarInspecao (EditarInspecaoTransaction)
function EditarDialog({ item, onClose, onSalvo }) {
  const det = useQuery({ queryKey: ["admin", "inspecao", item.InspecaoId], queryFn: () => adminFns.obterInspecao({ id: item.InspecaoId }) });
  const sel = useQuery({ queryKey: ["inspecao", "selecao"], queryFn: () => inspecaoFns.dadosSelecao() });
  const [f, setF] = useState(null);
  const [salvando, setSalvando] = useState(false);
  if (det.data && sel.data && !f) {
    const i = det.data;
    const loc = sel.data.locais.find((l) => l.UnidadeAreaProcessoId === i.UnidadeAreaProcessoId);
    setF({ unidadeId: loc?.UnidadeId || "", uapId: i.UnidadeAreaProcessoId, Data: i.Data, RespAcompanhamento: i.RespAcompanhamento || "", Cargo: i.Cargo || "", Inspetor1: i.Inspetor1 || "", Inspetor2: i.Inspetor2 || "", Avaliador: i.Avaliador || "", Observacao: i.Observacao || "" });
  }
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const p = item.TipoDeFormulario;
  async function salvar() {
    setSalvando(true);
    try {
      await adminFns.editarInspecao({ id: item.InspecaoId, ...f });
      toast.success("Inspeção atualizada com sucesso!");
      onSalvo();
    } catch (e) {
      toast.error(`Erro ao atualizar inspeção! ${errMsg(e)}`);
    } finally {
      setSalvando(false);
    }
  }
  const areas = sel.data?.locais.filter((l) => l.UnidadeId === f?.unidadeId) || [];
  const processo = areas.find((a) => a.UnidadeAreaProcessoId === f?.uapId)?.NomeProcesso;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Editar Inspeção</DialogTitle></DialogHeader>
        {!f ? <Carregando /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Unidade"><NativeSelect value={f.unidadeId} onChange={(v) => setF((s) => ({ ...s, unidadeId: v, uapId: "" }))} options={sel.data.unidades.map((u) => ({ value: u.id, label: u.Nome }))} /></Campo>
            <Campo rotulo="Área"><NativeSelect value={f.uapId} onChange={set("uapId")} options={areas.map((a) => ({ value: a.UnidadeAreaProcessoId, label: a.NomeArea }))} /></Campo>
            <Campo rotulo="Processo"><div className="flex h-9 items-center rounded-lg border bg-muted/60 px-3 text-sm text-muted-foreground">{processo || "—"}</div></Campo>
            <Campo rotulo="Data"><Input type="date" value={f.Data} onChange={(e) => set("Data")(e.target.value)} /></Campo>
            <Campo rotulo="Resp. Acompanhamento"><Input value={f.RespAcompanhamento} onChange={(e) => set("RespAcompanhamento")(e.target.value)} /></Campo>
            <Campo rotulo="Cargo"><Input value={f.Cargo} onChange={(e) => set("Cargo")(e.target.value)} /></Campo>
            {p === "SOL" && (<>
              <Campo rotulo="Inspetor 1"><Input value={f.Inspetor1} onChange={(e) => set("Inspetor1")(e.target.value)} /></Campo>
              <Campo rotulo="Inspetor 2"><Input value={f.Inspetor2} onChange={(e) => set("Inspetor2")(e.target.value)} /></Campo>
            </>)}
            {p === "GRD" && <Campo rotulo="Avaliador"><Input value={f.Avaliador} onChange={(e) => set("Avaliador")(e.target.value)} /></Campo>}
            <Campo rotulo="Observações" className="sm:col-span-2"><Textarea rows={3} value={f.Observacao} onChange={(e) => set("Observacao")(e.target.value)} /></Campo>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!f?.uapId || !f?.Data || salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
