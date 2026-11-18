import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Mail, MailX, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo, Etiqueta, LogoPrograma, NativeSelect, PageHeader, Secao } from "@/components/comum";
import { Overlay } from "@/components/Estados";
import AvisoModoTeste from "@/components/AvisoModoTeste";
import { adminFns } from "@/lib/fns";
import { MESES, anosDisponiveis } from "@/lib/constantes";
import { errMsg, fmtData } from "@/lib/format";
import { cn } from "@/lib/utils";

// ScreenDisparosSol + ScreenDisparosGrd numa só tela: o usuário escolhe o programa e dispara.
// SOL: por mês/ano e unidade (ou todas). GRD: por tipo de inspeção e ano.
export const Route = createFileRoute("/_authed/admin/disparos")({
  validateSearch: (s) => ({ programa: s.programa === "GRD" ? "GRD" : "SOL" }),
  component: Disparos,
});

function Disparos() {
  const { programa } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setPrograma = (p) => navigate({ search: { programa: p }, replace: true });
  const hoje = new Date();
  const [mes, setMes] = useState(String(hoje.getMonth() + 1));
  const [ano, setAno] = useState(String(hoje.getFullYear()));
  const [unidade, setUnidade] = useState("");
  const [todas, setTodas] = useState(false);
  const [tipoId, setTipoId] = useState("");
  const [pendencias, setPendencias] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState(null); // resumo do último disparo
  const unidades = useQuery({ queryKey: ["cad", "Unidade"], queryFn: () => base44.entities.Unidade.list("Nome") });
  const tipos = useQuery({ queryKey: ["cad", "TipoDeInspecao"], queryFn: () => base44.entities.TipoDeInspecao.list("Tipo") });

  async function disparar(forcar = false) {
    setOcupado(true);
    try {
      const r =
        programa === "SOL"
          ? await adminFns.dispararSol({ mes: Number(mes), ano: Number(ano), unidade: todas ? null : unidade, forcar })
          : await adminFns.dispararGrd({ ano: Number(ano), tipoDeInspecaoId: tipoId, forcar });
      if (r.pendencias) return setPendencias(r.pendencias);
      setPendencias(null);
      setResultado(r);
      if (r.enviados || !r.total) toast.success(r.modoTeste ? `Fluxo disparado em MODO TESTE: ${r.enviados} e-mail(s) enviados para ${r.destinatariosTeste.join(", ")}.` : `Fluxo disparado! ${r.enviados} de ${r.total} inspeção(ões) com e-mail enviado.`);
      if (r.falhas) toast.error(`${r.falhas} e-mail(s) falharam no envio — os demais seguiram normalmente. Detalhes abaixo e em Logs.`, { duration: 8000 });
      if (r.parciais) toast.warning(`${r.parciais} inspeção(ões) com destinatário(s) que não receberam o e-mail (os demais receberam). Detalhes abaixo e em Logs.`, { duration: 8000 });
      if (r.semVinculo) toast.warning(`${r.semVinculo} inspeção(ões) sem responsáveis vinculados não receberam e-mail.`);
      if (r.naoConfigurado) toast.warning(`${r.naoConfigurado} e-mail(s) não enviados: o servidor de e-mail (SMTP) não está configurado.`, { description: "As mensagens foram gravadas em server/data/outbox e as inspeções não foram marcadas como enviadas." });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setOcupado(false);
    }
  }

  const podeDisparar = programa === "SOL" ? mes && ano && (todas || unidade) : ano && tipoId;

  return (
    <div className="max-w-2xl">
      {ocupado && <Overlay texto="Disparando e-mails..." />}
      <PageHeader titulo="Disparos" subtitulo="Envia o e-mail de Resultado e Plano de Ação para os responsáveis das áreas inspecionadas." />
      <AvisoModoTeste className="mb-4" />
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">Programa:</span>
        <div role="radiogroup" aria-label="Programa" className="inline-flex rounded-lg border bg-white p-1 shadow-sm">
          {["SOL", "GRD"].map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={programa === p}
              onClick={() => { setPrograma(p); setPendencias(null); setResultado(null); }}
              className={cn("flex items-center gap-2 rounded-md border-2 px-4 py-1.5 text-sm font-semibold transition", programa === p ? "border-primary bg-primary/10 text-foreground" : "border-transparent text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100")}
            >
              <LogoPrograma programa={p} className="h-5" /> {p}
            </button>
          ))}
        </div>
      </div>
      <Secao titulo={<span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Disparar Email — Resultado e Plano de Ação</span>}>
        <p className="mb-4 text-sm text-muted-foreground">
          {programa === "SOL"
            ? "Esse fluxo verifica as inspeções realizadas de acordo com o mês/ano selecionado e dispara um e-mail para os responsáveis das áreas que foram inspecionadas nesse período."
            : "Esse fluxo verifica as avaliações realizadas de acordo com o tipo e ano selecionado e dispara um e-mail para os responsáveis das áreas que foram avaliadas nesse período."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {programa === "SOL" ? (
            <>
              <Campo rotulo="Mês"><NativeSelect value={mes} onChange={setMes} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} /></Campo>
              <Campo rotulo="Ano"><NativeSelect value={ano} onChange={setAno} options={anosDisponiveis(hoje.getFullYear()).map(String)} /></Campo>
              <Campo rotulo="Unidade"><NativeSelect value={unidade} onChange={setUnidade} disabled={todas} options={(unidades.data || []).map((u) => u.Nome)} /></Campo>
              <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={todas} onCheckedChange={(c) => setTodas(!!c)} /> Todas Unidades</label>
            </>
          ) : (
            <>
              <Campo rotulo="Tipo"><NativeSelect value={tipoId} onChange={setTipoId} options={(tipos.data || []).filter((t) => t.Programa === "GRD").map((t) => ({ value: t.id, label: t.Tipo }))} /></Campo>
              <Campo rotulo="Ano"><NativeSelect value={ano} onChange={setAno} options={anosDisponiveis(hoje.getFullYear()).map(String)} /></Campo>
            </>
          )}
        </div>
        <Button className="mt-4" disabled={!podeDisparar} onClick={() => disparar(false)}><Send className="h-4 w-4" /> Disparar</Button>
      </Secao>

      {resultado && <ResultadoDisparo r={resultado} />}

      <Dialog open={!!pendencias} onOpenChange={(o) => !o && setPendencias(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Existem unidades com áreas sem responsáveis vinculados!</DialogTitle>
            <DialogDescription>As áreas abaixo não receberão o e-mail. Vincule responsáveis em Admin → Vínculos ou dispare mesmo assim.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-md border text-sm">
            {(pendencias || []).map((p) => (
              <li key={`${p.Unidade}-${p.Area}`} className="flex justify-between px-3 py-1.5"><span>{p.Unidade}</span><span className="text-muted-foreground">{p.Area}</span></li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendencias(null)}>Cancelar</Button>
            <Button onClick={() => disparar(true)}>Disparar mesmo assim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Resumo do último disparo: cada inspeção tem sua situação; falhas não interrompem o lote.
const SITUACAO = {
  enviado: { rotulo: "Enviado", tom: "sucesso" },
  falha: { rotulo: "Falha no envio", tom: "perigo" },
  "sem-vinculo": { rotulo: "Sem vínculo", tom: "alerta" },
  "nao-configurado": { rotulo: "SMTP não configurado", tom: "neutro" },
  parcial: { rotulo: "Enviado em parte", tom: "alerta" },
};
function ResultadoDisparo({ r }) {
  const cards = [
    { k: "enviados", rotulo: "Enviados", icone: CheckCircle2, cor: "text-success" },
    { k: "falhas", rotulo: "Falhas", icone: MailX, cor: "text-destructive" },
    { k: "semVinculo", rotulo: "Sem vínculo", icone: Unlink, cor: "text-warning" },
  ];
  // inclui os enviados em que algum destinatário não recebeu (um e-mail por destinatário)
  const problemas = (r.resultados || []).filter((x) => x.situacao !== "enviado" || x.falhasDestinatarios?.length)
    .map((x) => (x.situacao === "enviado" ? { ...x, situacao: "parcial", motivo: `Não receberam: ${x.falhasDestinatarios.map((f) => `${f.email} (${f.motivo})`).join("; ")}` } : x));
  return (
    <Secao className="mt-6" titulo="Resultado do disparo" descricao={`${r.total} inspeção(ões) no período`} corpoClassName="p-0">
      <div className="grid grid-cols-3 divide-x border-b">
        {cards.map(({ k, rotulo, icone: Icone, cor }) => (
          <div key={k} className="flex items-center gap-3 px-5 py-4">
            <Icone className={cn("h-5 w-5 shrink-0", r[k] ? cor : "text-muted-foreground/50")} />
            <div><div className="text-xl font-semibold tabular-nums">{r[k] || 0}</div><div className="text-xs text-muted-foreground">{rotulo}</div></div>
          </div>
        ))}
      </div>
      {r.modoTeste && (
        <p className="border-b bg-amber-50 px-5 py-3 text-[13px] text-amber-900">
          <b>Modo teste:</b> os e-mails "enviados" foram somente para {r.destinatariosTeste.join(", ")}. As inspeções não foram marcadas como "e-mail enviado".
        </p>
      )}
      {r.naoConfigurado > 0 && (
        <p className="border-b bg-muted/40 px-5 py-3 text-[13px] text-muted-foreground">
          {r.naoConfigurado} e-mail(s) não foram enviados porque o servidor de e-mail (SMTP) não está configurado. As mensagens foram gravadas em <code>server/data/outbox</code> e as inspeções não foram marcadas como enviadas.
        </p>
      )}
      {problemas.length > 0 ? (
        <ul className="divide-y" aria-label="Inspeções não enviadas">
          {problemas.map((x) => (
            <li key={x.inspecaoId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm" data-situacao={x.situacao}>
              <div className="min-w-0">
                <div className="font-medium">{x.unidade} · {x.area} <span className="font-normal text-muted-foreground">· {fmtData(x.data)}</span></div>
                {(x.situacao === "falha" || x.situacao === "parcial") && <div className="mt-0.5 break-words text-xs text-destructive">{x.motivo}</div>}
              </div>
              <Etiqueta tom={SITUACAO[x.situacao]?.tom}>{SITUACAO[x.situacao]?.rotulo || x.situacao}</Etiqueta>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">{r.total ? "Todos os e-mails foram enviados." : "Nenhuma inspeção no período selecionado."}</p>
      )}
      {r.falhas > 0 && <p className="border-t px-5 py-3 text-xs text-muted-foreground">Cada falha foi registrada em Admin → Logs. Você pode disparar novamente: as inspeções já enviadas receberão o e-mail de novo.</p>}
    </Secao>
  );
}
