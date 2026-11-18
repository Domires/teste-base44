import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Braces, Code2, Columns2, Eye, FlaskConical, Info, Mail, RotateCcw, Save, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Campo, Confirmar, Etiqueta, PageHeader, Secao } from "@/components/comum";
import { Carregando, Erro, Overlay } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { errMsg, fmtDataHora } from "@/lib/format";
import { EXEMPLO_VARIAVEIS, LIMITES, MARCADOR_LINK, TIPOS_MODELO, VARIAVEIS_EMAIL, montarEmail, variaveisDesconhecidas } from "@/lib/emailModelo";
import { cn } from "@/lib/utils";

// Configurar e-mails (Admin › Programação):
//  - Modo teste: todos os envios vão somente para os destinatários de teste.
//  - Modelos do e-mail de Resultado e Plano de Ação: individual (tela Inspeções) e em lote (Disparos),
//    com assunto, importância e corpo em HTML (variáveis {{...}}), com pré-visualização.
const ABAS = ["teste", "individual", "lote"];
export const Route = createFileRoute("/_authed/admin/configurar-emails")({
  validateSearch: (s) => ({ aba: ABAS.includes(s.aba) ? s.aba : "teste" }),
  component: ConfigurarEmails,
});

const CHAVE = ["admin", "configEmail"];

function ConfigurarEmails() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = useQuery({ queryKey: CHAVE, queryFn: () => adminFns.obterConfigEmail() });
  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  const c = q.data;
  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        titulo="Configurar e-mails"
        subtitulo="Modo teste e modelos do e-mail de Resultado e Plano de Ação."
        acoes={c.ModoTeste ? <Etiqueta tom="alerta" ponto>Modo teste ATIVO</Etiqueta> : <Etiqueta tom="sucesso" ponto>Envio normal</Etiqueta>}
      />
      <Tabs value={aba} onValueChange={(v) => navigate({ search: { aba: v }, replace: true })}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="teste"><FlaskConical className="h-4 w-4" /> Modo teste</TabsTrigger>
          {Object.entries(TIPOS_MODELO).map(([tipo, t]) => (
            <TabsTrigger key={tipo} value={tipo}>
              <Mail className="h-4 w-4" /> <span className="hidden sm:inline">{t.rotulo}</span><span className="sm:hidden">{tipo === "lote" ? "Em lote" : "Individual"}</span>
              {c.modelos[tipo].personalizado && <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">editado</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="teste"><ModoTeste c={c} /></TabsContent>
        {Object.keys(TIPOS_MODELO).map((tipo) => (
          <TabsContent key={tipo} value={tipo}>
            {/* key: recarrega o editor quando o modelo salvo muda */}
            <EditorModelo key={`${tipo}-${c.updated_date}`} tipo={tipo} c={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------- Modo teste
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const separar = (s) => String(s).split(/[;,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

function ModoTeste({ c }) {
  const qc = useQueryClient();
  const [ligado, setLigado] = useState(c.ModoTeste);
  const [lista, setLista] = useState(c.DestinatariosTeste);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setLigado(c.ModoTeste); setLista(c.DestinatariosTeste); }, [c.ModoTeste, c.DestinatariosTeste]);

  const invalidoNoTexto = separar(texto).filter((e) => !emailValido(e));
  function adicionar() {
    const novos = separar(texto);
    if (!novos.length) return;
    const ruins = novos.filter((e) => !emailValido(e));
    if (ruins.length) return toast.error(`E-mail inválido: ${ruins.join(", ")}`);
    setLista((l) => [...new Set([...l, ...novos])]);
    setTexto("");
  }
  const alterado = ligado !== c.ModoTeste || lista.join(";") !== c.DestinatariosTeste.join(";") || separar(texto).length > 0;

  async function salvar() {
    const pendentes = separar(texto);
    if (pendentes.some((e) => !emailValido(e))) return toast.error(`E-mail inválido: ${invalidoNoTexto.join(", ")}`);
    const destinatarios = [...new Set([...lista, ...pendentes])];
    if (ligado && !destinatarios.length) return toast.error("Informe ao menos um destinatário para ligar o modo teste.");
    setSalvando(true);
    try {
      await adminFns.salvarConfigEmail({ ModoTeste: ligado, DestinatariosTeste: destinatarios });
      setTexto("");
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast.success(ligado ? "Modo teste ligado: os e-mails irão somente para os destinatários de teste." : "Modo teste desligado: os e-mails irão para os responsáveis das áreas.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {salvando && <Overlay texto="Salvando..." />}
      <Secao titulo="Modo teste" icone={FlaskConical} className="min-w-0">
        <label className={cn("flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition", ligado ? "border-amber-300 bg-amber-50/70" : "bg-white")}>
          <span>
            <span className="block text-sm font-semibold">Rodar os envios de e-mail no modo teste</span>
            <span className="mt-1 block text-[13px] text-muted-foreground">
              {ligado
                ? "Ligado: os responsáveis das áreas NÃO recebem os e-mails. Eles vão somente para os destinatários abaixo."
                : "Desligado: os e-mails vão normalmente para os responsáveis vinculados a cada área."}
            </span>
          </span>
          <Switch checked={ligado} onCheckedChange={setLigado} aria-label="Modo teste" className="mt-0.5" />
        </label>

        <div className={cn("mt-5 space-y-2", !ligado && "opacity-60")}>
          <div className="field-label">Destinatários de teste</div>
          {lista.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Destinatários de teste">
              {lista.map((e) => (
                <li key={e} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[13px] font-medium text-secondary-foreground">
                  <Mail className="h-3.5 w-3.5 opacity-60" />{e}
                  <button type="button" onClick={() => setLista((l) => l.filter((x) => x !== e))} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remover ${e}`}><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Nenhum destinatário de teste.</p>
          )}
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="email"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === ";" || e.key === ",") && (e.preventDefault(), adicionar())}
              placeholder="email@exemplo.com (Enter para adicionar; vários separados por ;)"
              aria-label="Adicionar destinatário de teste"
              aria-invalid={invalidoNoTexto.length > 0}
              className={invalidoNoTexto.length ? "border-red-300" : ""}
            />
            <Button type="button" variant="outline" onClick={adicionar} disabled={!texto.trim()}>Adicionar</Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">{c.updated_date ? `Última alteração: ${fmtDataHora(c.updated_date)}` : "Ainda não configurado"}</span>
          <Button onClick={salvar} disabled={!alterado || salvando}><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      </Secao>

      <Secao titulo="Como funciona" icone={Info}>
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-foreground/80">
          <li>Vale para o e-mail individual (tela Inspeções) e para os Disparos SOL/GRD.</li>
          <li>O assunto recebe o prefixo <b>[TESTE]</b> e o e-mail mostra, no topo, para quem iria no envio real.</li>
          <li>No modo teste as inspeções <b>não</b> são marcadas como "e-mail enviado".</li>
          <li>Áreas sem responsáveis vinculados continuam sem envio, como no envio real.</li>
          <li>Ligar/desligar fica registrado em Logs do Sistema.</li>
        </ul>
      </Secao>
    </div>
  );
}

// ---------------------------------------------------------------- Editor de modelo
function inserirNoCursor(el, texto, valor, setValor) {
  if (!el) return setValor(valor + texto);
  const ini = el.selectionStart ?? valor.length, fim = el.selectionEnd ?? valor.length;
  setValor(valor.slice(0, ini) + texto + valor.slice(fim));
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + texto.length, ini + texto.length); });
}

function EditorModelo({ tipo, c }) {
  const qc = useQueryClient();
  const salvo = c.modelos[tipo];
  const inicial = useMemo(() => ({
    Assunto: salvo.Assunto || c.padrao.Assunto,
    Corpo: salvo.Corpo || c.padrao.Corpo,
  }), [salvo, c.padrao]);
  const [m, setM] = useState(inicial);
  // lado | codigo | previa — "lado a lado" só em telas largas
  const [modo, setModo] = useState(() => (typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches ? "lado" : "codigo"));
  const [salvando, setSalvando] = useState(false);
  const [confirmRestaurar, setConfirmRestaurar] = useState(false);
  const ultimoCampo = useRef("Corpo");
  const refs = { Assunto: useRef(null), Corpo: useRef(null) };
  const set = (k) => (v) => setM((x) => ({ ...x, [k]: v }));

  const alterado = m.Assunto !== inicial.Assunto || m.Corpo !== inicial.Corpo;
  const desconhecidas = variaveisDesconhecidas(m.Assunto, m.Corpo);
  const previa = useMemo(() => montarEmail(m, c.padrao, EXEMPLO_VARIAVEIS), [m, c.padrao]);
  const vazio = !m.Corpo.trim();
  const semEndereco = (vazio ? c.padrao?.Corpo ?? "" : m.Corpo).includes(MARCADOR_LINK);

  function inserir(chave) {
    const campo = ultimoCampo.current;
    inserirNoCursor(refs[campo].current, `{{${chave}}}`, m[campo], set(campo));
  }

  async function salvar(restaurar = false) {
    setSalvando(true);
    try {
      const r = await adminFns.salvarModeloEmail({ tipo, ...m, restaurar });
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast.success(restaurar ? `${TIPOS_MODELO[tipo].rotulo}: modelo padrão restaurado.` : `${TIPOS_MODELO[tipo].rotulo} salvo.`);
      if (!restaurar && r.avisos?.length) toast.warning(`Variáveis desconhecidas mantidas como texto: ${r.avisos.map((v) => `{{${v}}}`).join(", ")}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSalvando(false);
      setConfirmRestaurar(false);
    }
  }

  return (
    <div className="space-y-6" data-editor-modelo={tipo}>
      {salvando && <Overlay texto="Salvando..." />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{TIPOS_MODELO[tipo].descricao}</p>
        {salvo.personalizado ? <Etiqueta tom="info" ponto>Modelo personalizado</Etiqueta> : <Etiqueta ponto>Modelo padrão</Etiqueta>}
      </div>

      <Secao titulo="Assunto" corpoClassName="p-5">
        <Campo rotulo="Assunto">
          <Input
            ref={refs.Assunto}
            value={m.Assunto}
            onChange={(e) => set("Assunto")(e.target.value)}
            onFocus={() => (ultimoCampo.current = "Assunto")}
            maxLength={LIMITES.assunto}
            aria-label="Assunto do e-mail"
          />
        </Campo>
      </Secao>

      <Secao
        titulo="Corpo do e-mail (HTML)"
        descricao="Escreva ou cole HTML. Clique numa variável para inseri-la onde está o cursor."
        corpoClassName="p-0"
        acoes={
          <div role="radiogroup" aria-label="Visualização" className="inline-flex rounded-lg border bg-white p-0.5 shadow-xs">
            {[["codigo", Code2, "HTML"], ["lado", Columns2, "Lado a lado"], ["previa", Eye, "Pré-visualização"]].map(([v, Icone, rot]) => (
              <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => setModo(v)} title={rot}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition", modo === v ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground", v === "lado" && "hidden lg:inline-flex")}>
                <Icone className="h-3.5 w-3.5" /><span className="hidden sm:inline">{rot}</span>
              </button>
            ))}
          </div>
        }
      >
        {/* variáveis */}
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-5 py-3">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Braces className="h-3.5 w-3.5" /> Variáveis:</span>
          {VARIAVEIS_EMAIL.map((v) => (
            <button key={v.chave} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(v.chave)} title={`${v.descricao} — ex.: ${v.exemplo}`}
              className="rounded-md border bg-white px-2 py-0.5 font-mono text-[11px] text-foreground/80 shadow-xs transition hover:border-primary/40 hover:text-primary">
              {`{{${v.chave}}}`}
            </button>
          ))}
        </div>

        <div className={cn("grid", modo === "lado" && "lg:grid-cols-2 lg:divide-x")}>
          <div className={cn(modo === "previa" && "hidden", modo === "lado" && "max-lg:hidden")}>
            <textarea
              ref={refs.Corpo}
              value={m.Corpo}
              onChange={(e) => set("Corpo")(e.target.value)}
              onFocus={() => (ultimoCampo.current = "Corpo")}
              spellCheck={false}
              maxLength={LIMITES.corpo}
              aria-label="Corpo do e-mail em HTML"
              className="block h-[520px] w-full resize-y bg-slate-950 p-4 font-mono text-[12px] leading-relaxed text-slate-100 caret-sky-300 focus:outline-none"
            />
          </div>
          <div className={cn("min-w-0 bg-[#eef3f5]", modo === "codigo" && "hidden")}>
            <div className="space-y-1 border-b bg-white px-4 py-2.5 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Assunto:</span>
                <span className="font-medium" data-previa-assunto="">{previa.assunto}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Pré-visualização com dados de exemplo</div>
            </div>
            <iframe title="Pré-visualização do e-mail" sandbox="" srcDoc={previa.corpo} className="block h-[468px] w-full bg-white" />
          </div>
        </div>

        {(desconhecidas.length > 0 || vazio || semEndereco) && (
          <div className="flex items-start gap-2 border-t bg-amber-50 px-5 py-3 text-[13px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {vazio && <>Corpo vazio: será usado o modelo padrão. </>}
              {semEndereco && <>Troque <code className="mx-0.5 rounded bg-amber-100 px-1">{MARCADOR_LINK}</code> pelo endereço do app no link do corpo (ex.: https://meuapp.base44.app/plano-acao/{"{{id_inspecao}}"}). </>}
              {desconhecidas.length > 0 && <>Variáveis desconhecidas (ficarão como texto no e-mail): {desconhecidas.map((v) => <code key={v} className="mx-0.5 rounded bg-amber-100 px-1">{`{{${v}}}`}</code>)}</>}
            </span>
          </div>
        )}
      </Secao>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/90 px-4 py-3 shadow-pop backdrop-blur">
        <Button variant="ghost" onClick={() => setConfirmRestaurar(true)} disabled={!salvo.personalizado || salvando}><RotateCcw className="h-4 w-4" /> Restaurar padrão</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setM(inicial)} disabled={!alterado || salvando}><Undo2 className="h-4 w-4" /> Descartar alterações</Button>
          <Button onClick={() => salvar(false)} disabled={!alterado || salvando}><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      </div>

      <Confirmar
        aberto={confirmRestaurar}
        onOpenChange={setConfirmRestaurar}
        titulo={`Restaurar o modelo padrão do ${TIPOS_MODELO[tipo].rotulo.toLowerCase()}?`}
        descricao="O assunto, a importância e o corpo personalizados serão descartados e o modelo padrão voltará a ser usado."
        textoConfirmar="Restaurar padrão"
        destrutivo
        onConfirmar={() => salvar(true)}
      />
    </div>
  );
}
