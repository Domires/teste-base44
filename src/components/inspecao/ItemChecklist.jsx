import { memo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RESPOSTAS, SGI_RESPOSTAS_COM_APONTAMENTO, normasSgiTexto } from "@/lib/scores";
import FotosItem from "./FotosItem";

const COR = {
  Sim: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20",
  Conforme: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20",
  "Ponto Positivo": "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/20",
  "Não": "bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/20",
  "Não Conformidade Maior": "bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/20",
  "Não Conformidade Menor": "bg-orange-500 text-white border-orange-500 shadow-sm shadow-orange-500/20",
  "Ponto de Melhoria": "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/20",
  "N/A": "bg-slate-600 text-white border-slate-600 shadow-sm shadow-slate-600/20",
};

export function OpcoesResposta({ opcoes, valor, onChange, disabled }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={valor === o}
          disabled={disabled}
          onClick={() => onChange(valor === o ? "" : o)}
          className={cn(
            "h-9 min-w-16 rounded-lg border px-4 text-sm font-medium transition",
            valor === o ? COR[o] : "border-input bg-white text-foreground/80 shadow-xs hover:border-foreground/25 hover:bg-muted/50 hover:text-foreground",
            disabled && "cursor-default opacity-80",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const Meta = ({ rotulo, valor }) =>
  valor ? (
    <span className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground/70">{rotulo}</span> {valor}
    </span>
  ) : null;

function ItemChecklist({ programa, item, resposta = {}, onChange, erro }) {
  const r = resposta.Resposta || "";
  const set = (patch) => onChange(item.Id, patch);

  return (
    <div id={`item-${item.Id}`} className={cn("relative scroll-mt-28 space-y-3 border-b px-5 py-5 last:border-b-0 sm:[&>*:not(:first-child)]:pl-9", erro && "bg-red-50/60 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-destructive")}>
      <p className="flex gap-3 text-[15px] font-medium leading-snug text-foreground">
        <span className={cn("mt-px flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-xs font-semibold tabular-nums", r ? "bg-secondary text-primary" : "bg-muted text-muted-foreground")}>{item.indice}<span className="sr-only">.</span></span>
        <span>{item.Requisito || item.Questao}</span>
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {programa === "SOL" && (<><Meta rotulo="Categoria:" valor={item.Categoria} /><Meta rotulo="Subcategoria:" valor={item.Subcategoria} /></>)}
        {programa === "GRD" && (<><Meta rotulo="Req:" valor={item.NmrRequisito} /><Meta rotulo="Sub-req:" valor={item.NmrSubRequisito} /><Meta rotulo={`${item.PilarNome}:`} valor={item.PilarDescricao} /></>)}
        {programa === "SGI" && (<><Meta rotulo="Procedimento:" valor={item.Procedimento} /><Meta rotulo="Norma/Disciplina:" valor={normasSgiTexto(item)} /></>)}
      </div>

      <OpcoesResposta
        opcoes={RESPOSTAS[programa]}
        valor={r}
        onChange={(v) => {
          // SOL: ao sair de "Não" limpa observação e evidências (RemoveIf colTeste3/testeUp + Reset(ItemObs))
          if (programa === "SOL" && v !== "Não") set({ Resposta: v, ItemObservacao: "", Fotos: [] });
          else set({ Resposta: v });
        }}
      />

      {programa === "SOL" && r === "Não" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Adicionar Observações:</label>
          <Input value={resposta.ItemObservacao || ""} onChange={(e) => set({ ItemObservacao: e.target.value })} placeholder="Breve descrição..." maxLength={4000} />
          <label className="text-xs font-semibold text-muted-foreground">Adicionar Evidências: <span className="text-destructive">*</span></label>
          <FotosItem fotos={resposta.Fotos} onChange={(Fotos) => set({ Fotos })} />
        </div>
      )}

      {programa === "GRD" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Evidência: <span className="text-destructive">*</span></label>
          <Textarea rows={2} value={resposta.ItemObservacao || ""} onChange={(e) => set({ ItemObservacao: e.target.value })} placeholder="Descrição..." maxLength={4000} />
          <label className="text-xs font-semibold text-muted-foreground">Fotos (opcional):</label>
          <FotosItem fotos={resposta.Fotos} onChange={(Fotos) => set({ Fotos })} />
        </div>
      )}

      {programa === "SGI" && r && r !== "N/A" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {SGI_RESPOSTAS_COM_APONTAMENTO.includes(r) && (
            <>
              <CampoTexto rotulo="Descrição do Apontamento" obrig valor={resposta.DescricaoApontamento} onChange={(v) => set({ DescricaoApontamento: v })} />
              <CampoTexto rotulo="Referência Normativa" valor={resposta.ReferenciaNormativa} onChange={(v) => set({ ReferenciaNormativa: v })} />
            </>
          )}
          <CampoTexto rotulo="Evidências Objetivas" valor={resposta.EvidenciasObjetivas} onChange={(v) => set({ EvidenciasObjetivas: v })} />
          {SGI_RESPOSTAS_COM_APONTAMENTO.includes(r) && (
            <CampoTexto rotulo="Sugestão de Adequação" valor={resposta.SugestaoDeAdequacao} onChange={(v) => set({ SugestaoDeAdequacao: v })} />
          )}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Evidências (fotos e arquivos de qualquer tipo, até 25 MB cada):</label>
            <FotosItem fotos={resposta.Fotos} onChange={(Fotos) => set({ Fotos })} qualquerArquivo />
          </div>
        </div>
      )}
    </div>
  );
}

function CampoTexto({ rotulo, valor, onChange, obrig }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">
        {rotulo}: {obrig && <span className="text-destructive">*</span>}
      </label>
      <Textarea rows={2} value={valor || ""} onChange={(e) => onChange(e.target.value)} placeholder={`${rotulo}...`} maxLength={4000} />
    </div>
  );
}

export default memo(ItemChecklist);
