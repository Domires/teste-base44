import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, NativeSelect, Valor } from "@/components/comum";
import FotosItem, { GaleriaFotos } from "@/components/inspecao/FotosItem";
import { errMsg, fmtData, hojeISO, textoPlano } from "@/lib/format";

// Modal "Plano de ação do item N" (ContainerPlanoDeAcao do app Plano de Ação)
// Enquanto o status for "Em andamento" todos os campos (inclusive fotos) seguem editáveis; "Finalizado" trava o plano.
export default function PlanoForm({ aberto, onClose, item, plano, programa, usuario, somenteLeitura, onSalvar }) {
  const [f, setF] = useState({});
  const [salvando, setSalvando] = useState(false);
  const finalizado = plano?.Status === "Finalizado";
  const leitura = somenteLeitura || finalizado;

  useEffect(() => {
    if (!aberto) return;
    setF({
      Acao: textoPlano(plano?.Acao || ""),
      Data: plano?.Data || hojeISO(),
      Status: plano?.Status || "Em andamento",
      RespExec: plano?.RespExec || "",
      AreaResponsavel: plano?.AreaResponsavel || "",
      OrdemDeServico: plano?.OrdemDeServico && plano.OrdemDeServico !== "N/A" ? plano.OrdemDeServico : "",
      Fotos: plano?.Fotos || [],
    });
  }, [aberto, plano]);

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  async function salvar() {
    if (!f.Acao?.trim()) return toast.error("Campo 'Descritivo da ação' não preenchido!");
    if (!f.RespExec.trim()) return toast.error("Campo 'Resp. pela execução' não preenchido!");
    if (!f.AreaResponsavel.trim()) return toast.error("Campo 'Área responsável pela execução' não preenchido!");
    setSalvando(true);
    try {
      await onSalvar(f);
    } catch (e) {
      toast.error(`Erro ao enviar plano de ação! ${errMsg(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  if (!item) return null;
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Plano de ação do item {item.indice}</DialogTitle>
          <p className="text-sm text-muted-foreground">{item.Requisito || item.Questao}</p>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Data do término da ação">
            <Input type="date" value={f.Data || ""} onChange={(e) => set("Data")(e.target.value)} disabled={leitura} />
          </Campo>
          <Campo rotulo="Status">
            <NativeSelect value={f.Status} onChange={set("Status")} options={["Em andamento", "Finalizado"]} allowEmpty={false} disabled={leitura} />
          </Campo>
          <Valor rotulo="Resp. pelo preenchimento" valor={plano?.Responsavel || usuario?.nome} />
          <Campo rotulo="Resp. pela execução">
            <Input value={f.RespExec || ""} onChange={(e) => set("RespExec")(e.target.value)} placeholder="Nome do responsável" disabled={leitura} maxLength={200} />
          </Campo>
          <Campo rotulo="Área responsável pela execução">
            <Input value={f.AreaResponsavel || ""} onChange={(e) => set("AreaResponsavel")(e.target.value)} placeholder="Nome da área" disabled={leitura} maxLength={200} />
          </Campo>
          <Campo rotulo="Nº da Nota Criada">
            <Input value={f.OrdemDeServico || ""} onChange={(e) => set("OrdemDeServico")(e.target.value)} placeholder="Ordem de serviço" disabled={leitura} maxLength={100} />
          </Campo>
        </div>
        <Campo rotulo="Fotos">
          <div className="space-y-2 rounded-md border bg-white p-3">
            {leitura && <GaleriaFotos fotos={plano?.Fotos || []} />}
            {!leitura && <FotosItem fotos={f.Fotos || []} onChange={set("Fotos")} max={20} />}
            {leitura && !(plano?.Fotos || []).length && <p className="text-sm text-muted-foreground">Vazio</p>}
          </div>
        </Campo>
        <Campo rotulo="Descritivo da ação">
          <Textarea rows={6} value={f.Acao || ""} onChange={(e) => set("Acao")(e.target.value)} disabled={leitura} maxLength={10000} />
        </Campo>
        {plano && (
          <p className="text-xs text-muted-foreground">
            Preenchido por {plano.Responsavel} · última atualização {fmtData(plano.updated_date)}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {!leitura && (
            <Button onClick={salvar} disabled={salvando}>
              {plano ? "Atualizar" : "Adicionar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
