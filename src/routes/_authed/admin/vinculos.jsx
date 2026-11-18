import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronRight, Download, Plus, Search, Trash2, Upload, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Campo, Confirmar, NativeSelect, PageHeader } from "@/components/comum";
import { Carregando, Erro, Overlay, Vazio } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { errMsg } from "@/lib/format";
import { cn } from "@/lib/utils";
import ImportarExcelDialog from "@/components/admin/ImportarExcelDialog";
import { exportarVinculos, interpretarVinculos } from "@/components/admin/excelVinculos";

// ScreenVinculos: Unidade → Áreas (Unidade×Área×Processo) → Responsáveis por programa (SOL / GRD / SGI)
export const Route = createFileRoute("/_authed/admin/vinculos")({
  component: Vinculos,
});

const PAPEIS = { SOL: ["Responsável", "Facilitador"], GRD: ["Líder", "Gestor"], SGI: ["Responsável SGI"] };

function Vinculos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "vinculos"], queryFn: () => adminFns.dadosVinculos() });
  const [unidadeId, setUnidadeId] = useState(null);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null);
  const [programa, setPrograma] = useState("SOL");
  const [dlg, setDlg] = useState(null); // {tipo:'area'} | {tipo:'pessoa', uap} | {tipo:'rmArea', uap} | {tipo:'rmPessoa', v}
  const [ocupado, setOcupado] = useState(false);
  const [importando, setImportando] = useState(false);

  const d = q.data;
  const unidade = d?.unidades.find((u) => u.id === (unidadeId || d?.unidades[0]?.id));
  const areas = useMemo(
    () => (d?.locais || []).filter((l) => l.UnidadeId === unidade?.id && (!busca || l.NomeArea.toLowerCase().startsWith(busca.toLowerCase()))),
    [d, unidade, busca],
  );

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;

  async function exec(fn, msg) {
    setOcupado(true);
    try {
      await fn();
      toast.success(msg);
      setDlg(null);
      await qc.invalidateQueries({ queryKey: ["admin", "vinculos"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setOcupado(false);
    }
  }

  const vinculosDe = (uap) => d.vinculos.filter((v) => v.UnidadeAreaProcessoId === uap && v.Programa === programa);
  const contagem = (uap, p) => d.vinculos.filter((v) => v.UnidadeAreaProcessoId === uap && v.Programa === p).length;

  return (
    <div>
      {ocupado && <Overlay texto="Salvando..." />}
      <PageHeader
        titulo="Vínculos"
        subtitulo="Vincule áreas às unidades e defina quem recebe e preenche os planos de ação de cada programa."
        acoes={
          <>
            <Button variant="outline" onClick={() => exportarVinculos(d).catch((e) => toast.error(errMsg(e)))}><Download className="h-4 w-4" /> Exportar Excel</Button>
            <Button variant="outline" onClick={() => setImportando(true)}><Upload className="h-4 w-4" /> Importar Excel</Button>
          </>
        }
      />
      <ImportarExcelDialog
        aberto={importando}
        onClose={() => setImportando(false)}
        titulo="Importar Vínculos do Excel"
        descricao="Vincula áreas às unidades e pessoas às áreas em massa. Nada é desvinculado pela importação."
        regra="Unidade, Área e Processo pelo nome (ou sigla); a pessoa pelo e-mail. Vínculos que já existem são mantidos."
        onModelo={() => exportarVinculos(d, true).catch((e) => toast.error(errMsg(e)))}
        interpretar={(planilha) => interpretarVinculos(planilha, d)}
        enviar={async (itens) => {
          const r = await adminFns.importarVinculos({ linhas: itens.map((i) => ({ linha: i.linha, ...i.dados })) });
          qc.invalidateQueries({ queryKey: ["admin", "vinculos"] });
          return {
            mensagens: [`${r.locaisCriados} área(s) vinculada(s) a unidades.`, `${r.vinculosCriados} pessoa(s) vinculada(s).`, r.processosAjustados ? `${r.processosAjustados} processo(s) ajustado(s).` : "", r.jaExistiam ? `${r.jaExistiam} vínculo(s) já existiam.` : ""].filter(Boolean),
            erros: r.erros,
          };
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="overflow-hidden superficie">
          <div className="border-b bg-muted/60 px-4 py-2.5 text-xs font-medium text-muted-foreground">Unidade</div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {d.unidades.map((u) => (
              <li key={u.id}>
                <button onClick={() => { setUnidadeId(u.id); setAberta(null); }} className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted", u.id === unidade?.id && "bg-secondary font-semibold")}>
                  <Building2 className="h-4 w-4 text-primary" /> <span className="flex-1">{u.Nome}</span> <span className="text-xs text-muted-foreground">{u.Sigla}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="superficie">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <h2 className="flex-1 font-bold text-foreground">Áreas de {unidade?.Nome}</h2>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 w-48 pl-8" placeholder="Pesquisar área" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => setDlg({ tipo: "area" })} disabled={!unidade}><Plus className="h-4 w-4" /> Vincular área</Button>
          </div>
          {!areas.length ? <Vazio /> : (
            <ul className="divide-y">
              {areas.map((a) => {
                const open = aberta === a.UnidadeAreaProcessoId;
                return (
                  <li key={a.UnidadeAreaProcessoId}>
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setAberta(open ? null : a.UnidadeAreaProcessoId)}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium">{a.NomeArea}</span>
                        <span className="text-xs text-muted-foreground">{a.NomeProcesso}</span>
                      </button>
                      <span className="hidden gap-1 text-[11px] sm:flex">
                        {["SOL", "GRD", "SGI"].map((p) => (
                          <span key={p} className={cn("rounded-md px-1.5 py-0.5 ring-1 ring-inset", contagem(a.UnidadeAreaProcessoId, p) ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-muted-foreground ring-slate-200")}>
                            {p} {contagem(a.UnidadeAreaProcessoId, p)}
                          </span>
                        ))}
                      </span>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" title="Desvincular área" onClick={() => setDlg({ tipo: "rmArea", uap: a })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    {open && (
                      <div className="space-y-3 bg-muted/40 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Tabs value={programa} onValueChange={setPrograma}>
                            <TabsList>{["SOL", "GRD", "SGI"].map((p) => <TabsTrigger key={p} value={p}>{p}</TabsTrigger>)}</TabsList>
                          </Tabs>
                          <Button size="sm" variant="outline" onClick={() => setDlg({ tipo: "pessoa", uap: a })}><UserPlus className="h-4 w-4" /> Vincular</Button>
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground">{programa === "SOL" ? "Responsáveis e Facilitadores" : programa === "GRD" ? "Gestores e Líderes" : "Responsáveis SGI"}</div>
                        {!vinculosDe(a.UnidadeAreaProcessoId).length ? (
                          <p className="text-sm text-muted-foreground">Nenhuma pessoa vinculada — os e-mails deste programa não terão destinatário.</p>
                        ) : (
                          <ul className="divide-y rounded-md border bg-white">
                            {vinculosDe(a.UnidadeAreaProcessoId).map((v) => (
                              <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <span className="w-28 shrink-0 text-xs font-semibold text-primary">{v.Papel}</span>
                                <span className="flex-1">{v.Nome} <span className="text-xs text-muted-foreground">{v.Email} · {v.Cargo}</span></span>
                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" title="Desvincular" onClick={() => setDlg({ tipo: "rmPessoa", v })}><X className="h-4 w-4" /></Button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {dlg?.tipo === "area" && (
        <VincularArea d={d} unidade={unidade} onClose={() => setDlg(null)} onSalvar={(x) => exec(() => adminFns.vincularLocal({ unidadeId: unidade.id, ...x }), "Vínculo Unidade-Área-Processo realizado com sucesso!")} />
      )}
      {dlg?.tipo === "pessoa" && (
        <VincularPessoa d={d} uap={dlg.uap} programa={programa} onClose={() => setDlg(null)} onSalvar={(x) => exec(() => adminFns.vincularPessoa({ uapId: dlg.uap.UnidadeAreaProcessoId, ...x }), `${x.papel} vinculado(a) à área com sucesso!`)} />
      )}
      <Confirmar
        aberto={dlg?.tipo === "rmPessoa"}
        onOpenChange={(o) => !o && setDlg(null)}
        titulo="Desvincular Responsável"
        descricao="Desvincular todos os responsáveis de uma área resultará na perda de destinos para as inspeções realizadas neste local. É recomendável deixar no mínimo 2 responsáveis! Deseja continuar?"
        textoConfirmar="Confirmar"
        destrutivo
        onConfirmar={() => exec(() => adminFns.desvincularPessoa({ vinculoId: dlg.v.id }), "Desvinculado com sucesso!")}
      />
      <Confirmar
        aberto={dlg?.tipo === "rmArea"}
        onOpenChange={(o) => !o && setDlg(null)}
        titulo={`Desvincular a área ${dlg?.uap?.NomeArea || ""}?`}
        descricao="A área deixará de aparecer para inspeção nesta unidade e todos os responsáveis vinculados a ela serão removidos. As inspeções já realizadas não são apagadas."
        textoConfirmar="Confirmar"
        destrutivo
        onConfirmar={() => exec(() => adminFns.desvincularLocal({ uapId: dlg.uap.UnidadeAreaProcessoId }), "Área desvinculada.")}
      />
    </div>
  );
}

function VincularArea({ d, unidade, onClose, onSalvar }) {
  const [areaId, setAreaId] = useState("");
  const [processoId, setProcessoId] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular área à unidade {unidade.Nome}</DialogTitle></DialogHeader>
        <Campo rotulo="Área"><NativeSelect value={areaId} onChange={setAreaId} options={d.areas.map((a) => ({ value: a.id, label: a.Nome }))} /></Campo>
        <Campo rotulo="Processo"><NativeSelect value={processoId} onChange={setProcessoId} options={d.processos.map((p) => ({ value: p.id, label: p.Nome }))} /></Campo>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!areaId || !processoId} onClick={() => onSalvar({ areaId, processoId })}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VincularPessoa({ d, uap, programa, onClose, onSalvar }) {
  const [papel, setPapel] = useState(PAPEIS[programa][0]);
  const [pessoaId, setPessoaId] = useState("");
  const pessoas = d.pessoas[papel] || [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular à área {uap.NomeArea} ({programa})</DialogTitle></DialogHeader>
        <Campo rotulo="Papel"><NativeSelect value={papel} onChange={(v) => { setPapel(v); setPessoaId(""); }} options={PAPEIS[programa]} allowEmpty={false} /></Campo>
        <Campo rotulo={papel}>
          <NativeSelect value={pessoaId} onChange={setPessoaId} options={pessoas.map((p) => ({ value: p.id, label: `${p.Nome} — ${p.Email}` }))} placeholder={pessoas.length ? "Selecionar" : "Nenhum cadastro — cadastre em Pessoas"} />
        </Campo>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!pessoaId} onClick={() => onSalvar({ papel, pessoaId })}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
