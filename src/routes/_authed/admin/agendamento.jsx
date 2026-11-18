import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrograma, Campo, Confirmar, PageHeader, Secao } from "@/components/comum";
import { Carregando, Erro, Vazio } from "@/components/Estados";
import { adminFns } from "@/lib/fns";
import { errMsg, fmtData } from "@/lib/format";
import { EXIGIR_AGENDAMENTO } from "@/lib/constantes";
import { cn } from "@/lib/utils";

// ScreenAgendamento: por Tipo de Inspeção e ano, define o período da Inspeção e o prazo de Preenchimento do PA.
export const Route = createFileRoute("/_authed/admin/agendamento")({
  component: Agendamento,
});

const ETAPAS = [
  { etapa: "Inspeção", ini: "InspecaoDtInicial", fim: "InspecaoDtFinal" },
  { etapa: "Preenchimento do PA", ini: "PaDtInicial", fim: "PaDtFinal" },
];

// Programas que só podem ser iniciados dentro de um período agendado (regra configurável em constantes.js)
const exigem = Object.keys(EXIGIR_AGENDAMENTO).filter((p) => EXIGIR_AGENDAMENTO[p]);

function Agendamento() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "agendamentos"], queryFn: () => adminFns.listarAgendamentos() });
  const [ano, setAno] = useState(new Date().getFullYear());
  const [sel, setSel] = useState(null); // { tipo, etapa }
  const [datas, setDatas] = useState({ ini: "", fim: "" });
  const [rm, setRm] = useState(null);

  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} onRetry={q.refetch} />;
  const agDe = (tipoId) => q.data.agendamentos.find((a) => a.TipoDeInspecaoId === tipoId && Number(a.Ano) === ano);

  function selecionar(tipo, e) {
    const ag = agDe(tipo.id);
    setSel({ tipo, etapa: e.etapa });
    setDatas({ ini: ag?.[e.ini] || "", fim: ag?.[e.fim] || "" });
  }

  async function salvar() {
    try {
      await adminFns.salvarAgendamento({ tipoDeInspecaoId: sel.tipo.id, ano, etapa: sel.etapa, dtInicial: datas.ini, dtFinal: datas.fim });
      toast.success("Prazo salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function limpar() {
    try {
      await adminFns.limparAgendamento({ tipoDeInspecaoId: rm.tipo.id, ano, etapa: rm.etapa });
      toast.success("Agendamento removido.");
      if (sel?.tipo.id === rm.tipo.id) setSel(null);
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRm(null);
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Agendamento"
        subtitulo={`Defina, para cada tipo de inspeção e ano, o período de inspeção e o prazo de preenchimento do plano de ação.${exigem.length ? ` ${exigem.join(" e ")} só pode${exigem.length > 1 ? "m" : ""} ser iniciado${exigem.length > 1 ? "s" : ""} dentro de um período de inspeção agendado.` : ""}`}
        acoes={
          <div className="flex items-center gap-1 rounded-lg border bg-card px-2 py-1">
            <Button variant="ghost" size="icon" onClick={() => setAno((a) => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-14 text-center font-bold">{ano}</span>
            <Button variant="ghost" size="icon" onClick={() => setAno((a) => a + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Secao titulo="Tipos de Inspeção">
          {!q.data.tipos.length ? <Vazio texto="Cadastre os Tipos de Inspeção primeiro." /> : (
            <div className="space-y-3">
              {q.data.tipos.map((t) => {
                const ag = agDe(t.id);
                return (
                  <div key={t.id} className="rounded-lg border">
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                      <CalendarRange className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{t.Tipo}</span>
                      <BadgePrograma programa={t.Programa} />
                      <span className="truncate text-xs text-muted-foreground">{t.Descricao}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {ETAPAS.map((e) => {
                          const ativo = sel?.tipo.id === t.id && sel.etapa === e.etapa;
                          return (
                            <tr key={e.etapa} className={cn("cursor-pointer border-b last:border-0 hover:bg-secondary/50", ativo && "bg-secondary")} onClick={() => selecionar(t, e)}>
                              <td className="px-3 py-2 font-medium">{e.etapa}</td>
                              <td className="px-3 py-2">{fmtData(ag?.[e.ini]) || <span className="text-muted-foreground">Vazio</span>}</td>
                              <td className="px-3 py-2">{fmtData(ag?.[e.fim]) || <span className="text-muted-foreground">Vazio</span>}</td>
                              <td className="w-10 px-2 text-right">
                                {ag?.[e.ini] && (
                                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:bg-red-50 hover:text-destructive" onClick={(ev) => { ev.stopPropagation(); setRm({ tipo: t, etapa: e.etapa }); }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </Secao>
        <Secao titulo={sel ? `${sel.tipo.Tipo} — ${sel.etapa}` : "Selecione um tipo de inspeção e agendamento!"}>
          {sel && (
            <div className="space-y-3">
              <Campo rotulo="Data Inicial"><Input type="date" value={datas.ini} onChange={(e) => setDatas((d) => ({ ...d, ini: e.target.value }))} /></Campo>
              <Campo rotulo="Data Final"><Input type="date" value={datas.fim} min={datas.ini} onChange={(e) => setDatas((d) => ({ ...d, fim: e.target.value }))} /></Campo>
              <Button className="w-full" disabled={!datas.ini || !datas.fim} onClick={salvar}>
                {agDe(sel.tipo.id)?.[ETAPAS.find((e) => e.etapa === sel.etapa).ini] ? "Atualizar" : "Salvar"}
              </Button>
              {sel.etapa === "Preenchimento do PA" && !agDe(sel.tipo.id) && <p className="text-xs text-warning">Cadastre primeiro o período de Inspeção deste tipo/ano.</p>}
            </div>
          )}
        </Secao>
      </div>
      <Confirmar
        aberto={!!rm}
        onOpenChange={(o) => !o && setRm(null)}
        titulo="Remover agendamento?"
        descricao={rm?.etapa === "Inspeção" ? "Remove o agendamento inteiro (inspeção e prazo do plano de ação) deste tipo/ano." : "Remove o prazo de preenchimento do plano de ação."}
        textoConfirmar="Remover"
        destrutivo
        onConfirmar={limpar}
      />
    </div>
  );
}
