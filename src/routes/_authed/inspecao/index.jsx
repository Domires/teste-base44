import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BadgePrograma, Confirmar, LogoPrograma, NativeSelect, Trilha } from "@/components/comum";
import { Carregando, Erro, Overlay } from "@/components/Estados";
import { inspecaoFns } from "@/lib/fns";
import { PROGRAMA_INFO } from "@/lib/constantes";
import { normasDisponiveis } from "@/lib/scores";
import { errMsg, fmtData, fmtDataHora } from "@/lib/format";

// ScreenSelecao do app Inspeção: Formulário → Unidade → Área (→ Norma/Disciplina no SGI) → Avançar
export const Route = createFileRoute("/_authed/inspecao/")({
  component: Selecao,
});

function Selecao() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["inspecao", "selecao"], queryFn: () => inspecaoFns.dadosSelecao() });
  const abertas = useQuery({ queryKey: ["inspecao", "minhasEmAberto"], queryFn: () => inspecaoFns.minhasEmAberto() });
  const [programa, setPrograma] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [uapId, setUapId] = useState("");
  const [normas, setNormas] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [emAndamento, setEmAndamento] = useState(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false); // GRD/SGI: confirma antes de apagar a avaliação salva

  const unidades = useMemo(() => (q.data?.unidades || []).filter((u) => programa !== "SGI" || !u.semSgi), [q.data, programa]);
  const areas = useMemo(() => (q.data?.locais || []).filter((l) => l.UnidadeId === unidadeId), [q.data, unidadeId]);
  const local = areas.find((a) => a.UnidadeAreaProcessoId === uapId);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;

  const abrir = (params) => navigate({ to: "/inspecao/formulario", search: { programa, uap: uapId, normas: normas.join(";"), ...params } });

  async function avancar() {
    if (!programa) return toast.error("Avaliação não selecionada!");
    if (!unidadeId) return toast.error("Unidade não selecionada!");
    if (!uapId) return toast.error("Área não selecionada!");
    if (programa === "SGI" && !normas.length) return toast.error("Selecione ao menos uma Norma/Disciplina!");
    setOcupado(true);
    try {
      const r = await inspecaoFns.verificarEmAndamento({ programa, uapId, normas });
      // GRD e SGI: já existe uma salva (no SGI, do mesmo ano) → continuar ou descartar e começar outra
      if (r.inspecaoId && (programa === "GRD" || programa === "SGI")) setEmAndamento({ ...r, programa });
      else {
        if (programa === "SGI") toast.info(`Nova auditoria SGI de ${r.ano}.`);
        abrir(r.inspecaoId ? { id: r.inspecaoId } : {});
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setOcupado(false);
    }
  }

  async function novaAvaliacao() {
    setConfirmarDescarte(false);
    setOcupado(true);
    try {
      await inspecaoFns.descartarParcial({ id: emAndamento.inspecaoId });
      setEmAndamento(null);
      abrir({});
    } catch (e) {
      toast.error(`Erro ao eliminar avaliação em aberto! ${errMsg(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  const titulo = programa ? PROGRAMA_INFO[programa].titulo : "SOL, GRD e SGI";

  return (
    <div className="mx-auto max-w-xl">
      <Trilha itens={[{ rotulo: "Inspeção" }]} />
      {ocupado && <Overlay texto="Verificando..." />}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="flex flex-col items-center gap-3 border-b bg-gradient-to-b from-muted/60 to-white px-6 pb-6 pt-8 text-center">
          <div className="flex h-16 items-center justify-center">
            {programa ? <LogoPrograma programa={programa} className="h-16 text-3xl" /> : <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary ring-1 ring-inset ring-primary/10"><ClipboardCheck className="h-7 w-7" /></span>}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Nova inspeção</h1>
            <p className="mt-1 text-sm text-muted-foreground">{titulo}</p>
          </div>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <Label className="field-label">Formulário</Label>
            <NativeSelect
              value={programa}
              onChange={(v) => { setPrograma(v); setUnidadeId(""); setUapId(""); setNormas([]); }}
              options={q.data.programas}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="field-label">Unidade</Label>
            <NativeSelect value={unidadeId} onChange={(v) => { setUnidadeId(v); setUapId(""); setNormas([]); }} options={unidades.map((u) => ({ value: u.id, label: u.Nome }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="field-label">Área</Label>
            <NativeSelect
              value={uapId}
              onChange={(v) => { setUapId(v); setNormas([]); }}
              disabled={!unidadeId}
              options={areas.map((a) => ({ value: a.UnidadeAreaProcessoId, label: a.NomeArea }))}
              placeholder={unidadeId && !areas.length ? "Nenhuma área vinculada" : "Selecionar"}
            />
          </div>
          {programa === "SGI" && local && (
            <div className="flex flex-col gap-1.5">
              <Label className="field-label">Norma/Disciplina</Label>
              <div className="grid grid-cols-2 gap-2">
                {normasDisponiveis(local.NomeArea).map((n) => (
                  <label key={n} className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-sm shadow-xs transition hover:border-foreground/25 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-secondary/50">
                    <Checkbox checked={normas.includes(n)} onCheckedChange={(c) => setNormas((s) => (c ? [...s, n] : s.filter((x) => x !== n)))} />
                    {n}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button className="mt-2 w-full" size="lg" onClick={avancar} disabled={ocupado}>
            Avançar {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!!abertas.data?.length && (
        <div className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-card">
          <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-[15px] font-semibold">
            <History className="h-4 w-4 text-primary" /> Minhas avaliações em aberto e auditorias SGI do ano
          </h2>
          <ul className="divide-y px-5">
            {abertas.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2 font-medium"><BadgePrograma programa={a.TipoDeFormulario} /> <span className="truncate">{a.Unidade} · {a.Area}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {a.respondidos}/{a.total} respondidos · salvo em {fmtDataHora(a.updated_date)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate({ to: "/inspecao/formulario", search: { programa: a.TipoDeFormulario, uap: a.UnidadeAreaProcessoId, normas: a.NormaDisciplina, id: a.id } })}
                >
                  Continuar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!emAndamento && !confirmarDescarte} onOpenChange={(o) => !o && setEmAndamento(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{emAndamento?.programa === "SGI" ? `Auditoria SGI de ${emAndamento.ano} em aberto!` : "Avaliação em aberto!"}</DialogTitle>
            <DialogDescription>
              {emAndamento?.programa === "SGI" ? "Já existe uma auditoria salva neste ano para esta Unidade, Área e Norma/Disciplina" : "Existe uma avaliação em aberto nessa área"}
              {emAndamento?.dataAberta ? ` (${fmtData(emAndamento.dataAberta)}` : ""}
              {emAndamento?.avaliador ? ` — ${emAndamento.avaliador})` : emAndamento?.dataAberta ? ")" : ""}, pretende continuar?
            </DialogDescription>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">
              <b>Nova Avaliação</b> descarta {emAndamento?.programa === "SGI" ? "a auditoria salva (respostas e anexos)" : "a avaliação em aberto (respostas e fotos)"} e começa uma nova do zero, com os itens atuais do cadastro.
            </p>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmarDescarte(true)}>Nova Avaliação</Button>
            <Button onClick={() => { const id = emAndamento.inspecaoId; setEmAndamento(null); abrir({ id }); }}>Continuar Avaliação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Confirmar
        aberto={confirmarDescarte}
        onOpenChange={setConfirmarDescarte}
        titulo={emAndamento?.programa === "SGI" ? `Descartar a auditoria SGI de ${emAndamento?.ano ?? ""}?` : "Descartar a avaliação GRD em aberto?"}
        descricao={
          (emAndamento?.programa === "SGI" ? "A auditoria salva" : "A avaliação GRD em aberto") +
          (emAndamento?.dataAberta ? ` em ${fmtData(emAndamento.dataAberta)}` : "") +
          (emAndamento?.avaliador ? ` por ${emAndamento.avaliador}` : "") +
          (emAndamento?.programa === "SGI"
            ? " para esta Unidade, Área e Norma/Disciplina será apagada definitivamente, com todas as respostas e anexos."
            : " nesta área será apagada definitivamente, com todas as respostas, evidências e fotos.") +
          " Esta ação não pode ser desfeita."
        }
        textoConfirmar="Descartar e iniciar nova"
        destrutivo
        onConfirmar={novaAvaliacao}
      />
    </div>
  );
}
