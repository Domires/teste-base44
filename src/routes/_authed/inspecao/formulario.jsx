import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eraser, LogOut, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Confirmar, LogoPrograma } from "@/components/comum";
import { Carregando, Erro, Overlay } from "@/components/Estados";
import Cabecalho from "@/components/inspecao/Cabecalho";
import ItemChecklist from "@/components/inspecao/ItemChecklist";
import SignaturePad from "@/components/inspecao/SignaturePad";
import ResultadoInspecao from "@/components/ResultadoInspecao";
import { inspecaoFns } from "@/lib/fns";
import { PROGRAMA_INFO } from "@/lib/constantes";
import { SGI_RESPOSTAS_COM_APONTAMENTO, calcularGrd, calcularSol } from "@/lib/scores";
import { errMsg, hojeISO } from "@/lib/format";
import { enviarDataUrl } from "@/lib/upload";

// ScreenInspecaoSOL / ScreenAvaliacaoGRD / ScreenAuditoriaSGI
export const Route = createFileRoute("/_authed/inspecao/formulario")({
  validateSearch: (s) => ({
    programa: ["SOL", "GRD", "SGI"].includes(s.programa) ? s.programa : "SOL",
    uap: String(s.uap || ""),
    normas: s.normas ? String(s.normas) : "",
    id: s.id ? String(s.id) : undefined,
  }),
  component: Formulario,
});

const CAB_VAZIO = { Data: "", RespAcompanhamento: "", Cargo: "", Inspetor1: "", Inspetor2: "", Avaliador: "", Auditor: "", EquipeEntrevistada: "", Observacao: "" };

// Rascunho local (FSD: cache em JSON no dispositivo para não perder dados no celular)
const chaveRascunho = (s) => `rascunho:${s.programa}:${s.uap}:${s.normas}:${s.id || "novo"}`;
const lerRascunho = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const gravarRascunho = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço */ } };
const apagarRascunho = (k) => { try { localStorage.removeItem(k); } catch { /* */ } };

function Formulario() {
  const search = Route.useSearch();
  const { programa } = search;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const normas = useMemo(() => search.normas.split(";").filter(Boolean), [search.normas]);
  const q = useQuery({
    queryKey: ["inspecao", "form", search],
    queryFn: () => inspecaoFns.abrirFormulario({ programa, uapId: search.uap, normas, inspecaoId: search.id || null }),
    staleTime: Infinity,
  });

  const [cab, setCab] = useState(CAB_VAZIO);
  const [resp, setResp] = useState({});
  const [pronto, setPronto] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [resultado, setResultado] = useState(null); // abre o diálogo de resultado/assinatura
  const [assinatura, setAssinatura] = useState(null);
  const [sucesso, setSucesso] = useState(null); // "salva" | "finalizada"
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const chave = chaveRascunho(search);
  const primeiraCarga = useRef(true);

  // inicializa a partir do servidor (+ rascunho local, se houver)
  useEffect(() => {
    if (!q.data || pronto) return;
    const i = q.data.inspecao;
    const base = { ...CAB_VAZIO, Data: hojeISO() };
    if (i) for (const k of Object.keys(CAB_VAZIO)) if (i[k] && i[k] !== "Sem Observações") base[k] = i[k];
    const r = {};
    for (const it of q.data.checklist) {
      r[it.Id] = {
        Resposta: it.Resposta || "", ItemObservacao: it.ItemObservacao || "", Fotos: it.Fotos || [],
        DescricaoApontamento: it.DescricaoApontamento || "", ReferenciaNormativa: it.ReferenciaNormativa || "",
        EvidenciasObjetivas: it.EvidenciasObjetivas || "", SugestaoDeAdequacao: it.SugestaoDeAdequacao || "",
      };
    }
    const rasc = lerRascunho(chave);
    if (rasc && (!i || rasc.ts > Date.parse(i.updated_date))) {
      Object.assign(base, rasc.cab);
      for (const [id, v] of Object.entries(rasc.resp || {})) if (r[id]) r[id] = { ...r[id], ...v };
      toast.info("Rascunho salvo neste dispositivo foi restaurado.");
    }
    setCab(base);
    setResp(r);
    setPronto(true);
  }, [q.data, pronto, chave]);

  // grava rascunho local a cada alteração
  useEffect(() => {
    if (!pronto) return;
    if (primeiraCarga.current) { primeiraCarga.current = false; return; }
    const t = setTimeout(() => gravarRascunho(chave, { ts: Date.now(), cab, resp }), 400);
    return () => clearTimeout(t);
  }, [cab, resp, pronto, chave]);

  const onItem = useCallback((id, patch) => setResp((s) => ({ ...s, [id]: { ...s[id], ...patch } })), []);

  const checklist = q.data?.checklist || [];
  const checklistAtual = useMemo(() => checklist.map((it) => ({ ...it, ...resp[it.Id] })), [checklist, resp]);

  // Pendências para Enviar/Finalizar — cada mensagem diz exatamente o que falta e onde (id = item a destacar).
  const pendencias = useMemo(() => {
    const p = [];
    const vazio = (v) => !String(v || "").trim();
    const obrigatorios = {
      SOL: [["Data", "Data"], ["RespAcompanhamento", "Resp. Acompanhamento"], ["Cargo", "Cargo"], ["Inspetor1", "Inspetor 1"], ["Inspetor2", "Inspetor 2"]],
      GRD: [["Data", "Data"], ["RespAcompanhamento", "Res. Acompanhamento"], ["Cargo", "Cargo"], ["Avaliador", "Avaliador"]],
      SGI: [["Data", "Data"], ["Auditor", "Auditor"], ["EquipeEntrevistada", "Equipe Entrevistada"]],
    }[programa];
    const faltando = obrigatorios.filter(([k]) => vazio(cab[k])).map(([, rotulo]) => rotulo);
    if (faltando.length) p.push({ msg: `Preencha no cabeçalho: ${faltando.join(", ")}.`, id: "cabecalho" });

    const sem = checklistAtual.filter((i) => !i.Resposta);
    if (sem.length) p.push({ msg: `${sem.length} item(ns) sem resposta — primeiro: item ${sem[0].indice}.`, id: sem[0].Id });
    if (programa === "SOL") {
      const semFoto = checklistAtual.filter((i) => i.Resposta === "Não" && !(i.Fotos || []).length);
      if (semFoto.length) p.push({ msg: `Itens com resposta "Não" exigem foto de evidência — falta no item ${semFoto.map((i) => i.indice).join(", ")}.`, id: semFoto[0].Id });
    } else if (programa === "GRD") {
      const semEv = checklistAtual.filter((i) => vazio(i.ItemObservacao));
      if (semEv.length) p.push({ msg: `Preencha a Evidência de todos os itens — falta no item ${semEv.slice(0, 8).map((i) => i.indice).join(", ")}${semEv.length > 8 ? "..." : ""}.`, id: semEv[0].Id });
    } else {
      const semAp = checklistAtual.filter((i) => SGI_RESPOSTAS_COM_APONTAMENTO.includes(i.Resposta) && vazio(i.DescricaoApontamento));
      if (semAp.length) p.push({ msg: `Preencha a Descrição do Apontamento — falta no item ${semAp.map((i) => i.indice).join(", ")}.`, id: semAp[0].Id });
    }
    return p;
  }, [checklistAtual, cab, programa]);
  // Os campos pendentes só ficam destacados depois da primeira tentativa de envio
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const pendentes = new Set(tentouEnviar ? pendencias.map((p) => p.id).filter(Boolean) : []);

  if (q.isLoading || (q.data && !pronto)) return <Carregando texto="Carregando formulário..." />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  const dados = q.data;
  const info = PROGRAMA_INFO[programa];

  const payload = (assinaturaUrl) => ({
    programa, uapId: search.uap, inspecaoId: search.id || null, normas, cabecalho: cab, assinaturaUrl,
    respostas: Object.entries(resp).map(([Id, v]) => ({ Id, ...v })),
  });

  const sair = () => navigate({ to: "/inspecao" });

  function limpar() {
    const r = {};
    for (const it of checklist) r[it.Id] = { Resposta: "", ItemObservacao: "", Fotos: [], DescricaoApontamento: "", ReferenciaNormativa: "", EvidenciasObjetivas: "", SugestaoDeAdequacao: "" };
    setResp(r);
    setCab({ ...CAB_VAZIO, Data: hojeISO() });
    apagarRascunho(chave);
    setConfirmLimpar(false);
  }

  // Mostra todas as pendências de uma vez e leva a tela até a primeira
  function irPara(p) {
    const outras = pendencias.filter((x) => x !== p).map((x) => `• ${x.msg}`).join("\n");
    toast.error(p.msg, { description: outras || undefined, duration: 7000, style: { whiteSpace: "pre-line" } });
    if (p.id) document.getElementById(`item-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: p.id === "cabecalho" ? "start" : "center" });
  }

  function enviar() {
    setTentouEnviar(true);
    if (pendencias.length) return irPara(pendencias[0]);
    if (programa === "SOL") setResultado(calcularSol(checklistAtual));
    else if (programa === "GRD") setResultado(calcularGrd(checklistAtual));
    else setResultado({ Checklist: checklistAtual });
    setAssinatura(null);
  }

  async function salvar() {
    if (programa === "SGI" && (!String(cab.Auditor || "").trim() || !String(cab.EquipeEntrevistada || "").trim())) {
      const falta = [!String(cab.Auditor || "").trim() && "Auditor", !String(cab.EquipeEntrevistada || "").trim() && "Equipe Entrevistada"].filter(Boolean);
      return irPara({ msg: `Preencha no cabeçalho: ${falta.join(", ")}.`, id: "cabecalho" });
    }
    if (!cab.Data) return toast.error("Informe a data.");
    setOcupado("Salvando...");
    try {
      const r = await inspecaoFns.salvarParcial(payload(null));
      apagarRascunho(chave);
      qc.invalidateQueries({ queryKey: ["inspecao", "minhasEmAberto"] });
      if (!search.id) {
        primeiraCarga.current = true;
        navigate({ to: "/inspecao/formulario", search: { ...search, id: r.id }, replace: true });
      }
      setSucesso("salva");
    } catch (e) {
      toast.error(`Erro: Inspeção não salva! ${errMsg(e)}`);
    } finally {
      setOcupado("");
    }
  }

  async function finalizar() {
    setOcupado("Finalizando...");
    try {
      const url = assinatura ? await enviarDataUrl(assinatura) : null;
      await inspecaoFns.finalizar(payload(url));
      apagarRascunho(chave);
      qc.invalidateQueries({ queryKey: ["inspecao", "minhasEmAberto"] });
      setResultado(null);
      setSucesso("finalizada");
    } catch (e) {
      toast.error(`Erro: Inspeção não finalizada! ${errMsg(e)}`);
    } finally {
      setOcupado("");
    }
  }

  if (sucesso) {
    return (
      <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center shadow-card">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60"><CheckCircle2 className="h-8 w-8 text-success" /></span>
        <h1 className="text-xl font-semibold">{sucesso === "salva" ? "Inspeção Salva" : "Inspeção Finalizada"}</h1>
        <p className="text-sm text-muted-foreground">
          {sucesso !== "salva" ? `${info.tituloLongo} registrada com sucesso.`
            : programa === "SGI" ? `Ao abrir esta Unidade, Área e Norma/Disciplina novamente em ${String(cab.Data).slice(0, 4)}, você poderá continuar esta auditoria ou iniciar uma nova (descartando esta). Num ano novo, uma nova auditoria é iniciada e esta fica guardada no seu ano.`
            : "Você pode continuar depois pela tela de seleção (Minhas avaliações em aberto)."}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {sucesso === "salva" && <Button variant="outline" onClick={() => setSucesso(null)}>Continuar editando</Button>}
          <Button onClick={sair}>Voltar à seleção</Button>
        </div>
      </div>
    );
  }

  const respondidos = checklistAtual.filter((i) => i.Resposta).length;

  return (
    <div className="mx-auto max-w-3xl pb-20">
      {ocupado && <Overlay texto={ocupado} />}
      <div className="sticky top-0 z-30 -mx-4 mb-6 border-b bg-background/85 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white"><LogoPrograma programa={programa} className="h-7 w-7 text-[10px]" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">{info.tituloLongo}</h1>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={respondidos} aria-label="Itens respondidos">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${checklist.length ? (respondidos / checklist.length) * 100 : 0}%` }} />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{respondidos}/{checklist.length}</span>
            </div>
          </div>
          <button onClick={sair} className="rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-destructive" title="Sair" aria-label="Sair"><LogOut className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="space-y-6">
        <section id="item-cabecalho" className={`superficie scroll-mt-24 ${pendentes.has("cabecalho") ? "border-red-300 ring-4 ring-red-100" : ""}`}>
          <h2 className="border-b px-5 py-3.5 text-[15px] font-semibold">Identificação</h2>
          <div className="p-5"><Cabecalho programa={programa} dados={dados} cab={cab} setCab={setCab} /></div>
        </section>
        <section className="superficie">
          <h2 className="flex items-center justify-between border-b px-5 py-3.5 text-[15px] font-semibold">Checklist <span className="text-xs font-normal text-muted-foreground">{checklist.length} itens</span></h2>
          {checklist.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum item cadastrado para este formulário.</p>}
          {checklist.map((it) => (
            <ItemChecklist key={it.Id} programa={programa} item={it} resposta={resp[it.Id]} onChange={onItem} erro={pendentes.has(it.Id)} />
          ))}
        </section>
      </div>

      {/* rodapé fixo: Limpar | Salvar | Enviar (SGI: só Salvar — um registro por local/norma/ano) */}
      <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-white/90 shadow-[0_-4px_16px_-8px_rgb(16_24_40/0.12)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <span className="mr-auto text-xs text-muted-foreground">{respondidos}/{checklist.length} respondidos</span>
          <Button variant="outline" onClick={() => setConfirmLimpar(true)}><Eraser className="h-4 w-4" /> Limpar</Button>
          {programa !== "SOL" && <Button variant={programa === "SGI" ? "default" : "secondary"} onClick={salvar}><Save className="h-4 w-4" /> Salvar</Button>}
          {programa !== "SGI" && <Button onClick={enviar}><Send className="h-4 w-4" /> Enviar</Button>}
        </div>
      </div>

      <Dialog open={!!resultado} onOpenChange={(o) => !o && setResultado(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resultado</DialogTitle>
            {programa === "SGI" && <DialogDescription>Confira o resumo da auditoria antes de finalizar. Depois de finalizada ela não poderá ser editada.</DialogDescription>}
          </DialogHeader>
          {resultado && <ResultadoInspecao programa={programa} r={resultado} />}
          {programa !== "SGI" && (
            <div className="space-y-2">
              <div className="field-label">Assinatura — {cab.RespAcompanhamento}</div>
              <SignaturePad onChange={setAssinatura} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResultado(null)}>Voltar</Button>
            <Button onClick={finalizar} disabled={programa !== "SGI" && !assinatura}>Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Confirmar
        aberto={confirmLimpar}
        onOpenChange={setConfirmLimpar}
        titulo="Limpar formulário?"
        descricao="Todas as respostas, observações e fotos deste formulário serão apagadas."
        textoConfirmar="Limpar"
        destrutivo
        onConfirmar={limpar}
      />
    </div>
  );
}
