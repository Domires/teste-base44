import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CadastroDialog from "@/components/admin/CadastroDialog";
import { Confirmar, PageHeader } from "@/components/comum";
import { Carregando, Erro, Vazio } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { errMsg } from "@/lib/format";

// ScreenPilares: pilares do GRD e os itens (requisitos) de cada pilar
export const Route = createFileRoute("/_authed/admin/pilares")({
  component: Pilares,
});

const CAMPOS_PILAR = [
  { nome: "Nome", rotulo: "Nome", obrigatorio: true, ajuda: "Ex.: 1º Pilar (a ordem alfabética define a ordem no checklist e na planilha)" },
  { nome: "Descricao", rotulo: "Descrição", obrigatorio: true },
  { nome: "Ordem", rotulo: "Ordem", tipo: "number" },
];
const CAMPOS_ITEM = [
  { nome: "Ordem", rotulo: "Ordem", tipo: "number" },
  { nome: "Requisito", rotulo: "Requisito", tipo: "textarea", obrigatorio: true },
  { nome: "NmrRequisito", rotulo: "Nº Requisito", obrigatorio: true },
  { nome: "NmrSubRequisito", rotulo: "Nº Sub-requisito", obrigatorio: true },
  { nome: "Ativo", rotulo: "Ativo", tipo: "bool" },
];

function Pilares() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cad", "pilares"],
    queryFn: async () => ({ pilares: await base44.entities.Pilar.list("Nome"), itens: await base44.entities.ItemGrd.list("Ordem") }),
  });
  const [aberto, setAberto] = useState(null);
  const [edit, setEdit] = useState(null); // { entidade, registro, pilarId }
  const [rm, setRm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;

  async function salvar(dados) {
    setSalvando(true);
    try {
      const extra = edit.entidade === "ItemGrd" ? { PilarId: edit.pilarId } : {};
      await adminFns.salvarCadastro({ entidade: edit.entidade, id: edit.registro?.id || null, dados: { ...dados, ...extra } });
      toast.success("Salvo com sucesso!");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["cad"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSalvando(false);
    }
  }
  async function remover() {
    try {
      await adminFns.removerCadastro({ entidade: rm.entidade, id: rm.registro.id });
      toast.success("Removido com sucesso!");
      qc.invalidateQueries({ queryKey: ["cad"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRm(null);
    }
  }

  return (
    <div>
      <PageHeader titulo="Pilares e Itens GRD" subtitulo="Checklist GRD — Gerenciamento de Rotina Diária" acoes={<Button onClick={() => setEdit({ entidade: "Pilar", registro: null })}><Plus className="h-4 w-4" /> Adicionar pilar</Button>} />
      {!q.data.pilares.length ? <Vazio /> : (
        <ul className="space-y-2">
          {q.data.pilares.map((p) => {
            const itens = q.data.itens.filter((i) => i.PilarId === p.id);
            const open = aberto === p.id;
            return (
              <li key={p.id} className="overflow-hidden superficie">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setAberto(open ? null : p.id)}>
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-semibold text-foreground">{p.Nome}</span>
                    <span className="text-sm text-muted-foreground">{p.Descricao}</span>
                    <span className="ml-auto rounded-full bg-secondary px-2 text-xs">{itens.length} itens</span>
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => setEdit({ entidade: "Pilar", registro: p })}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setRm({ entidade: "Pilar", registro: p, nome: p.Nome })}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {open && (
                  <div className="border-t bg-muted/30 px-4 py-3">
                    <ul className="divide-y rounded-md border bg-white">
                      {itens.map((i) => (
                        <li key={i.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                          <span className="w-8 shrink-0 text-muted-foreground">{i.Ordem}</span>
                          <div className="flex-1">
                            <p className={i.Ativo === false ? "text-muted-foreground line-through" : ""}>{i.Requisito}</p>
                            <p className="text-xs text-muted-foreground">Req: {i.NmrRequisito} · Sub-req: {i.NmrSubRequisito}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => setEdit({ entidade: "ItemGrd", registro: i, pilarId: p.id })}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={() => setRm({ entidade: "ItemGrd", registro: i, nome: "o item" })}><Trash2 className="h-4 w-4" /></Button>
                        </li>
                      ))}
                      {!itens.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Vazio</li>}
                    </ul>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setEdit({ entidade: "ItemGrd", registro: null, pilarId: p.id })}><Plus className="h-4 w-4" /> Adicionar item</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <CadastroDialog
        aberto={!!edit}
        onClose={() => setEdit(null)}
        titulo={edit?.entidade === "Pilar" ? (edit.registro ? "Editar pilar" : "Adicionar pilar") : edit?.registro ? "Editar item" : "Adicionar item"}
        campos={edit?.entidade === "Pilar" ? CAMPOS_PILAR : CAMPOS_ITEM}
        registro={edit?.registro}
        onSalvar={salvar}
        salvando={salvando}
      />
      <Confirmar aberto={!!rm} onOpenChange={(o) => !o && setRm(null)} titulo={`Deletar ${rm?.nome}?`} textoConfirmar="Deletar" destrutivo onConfirmar={remover} />
    </div>
  );
}
