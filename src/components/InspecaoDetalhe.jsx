import { ClipboardList, Gauge, Info, PenLine } from "lucide-react";
import { Etiqueta, Secao, Valor } from "@/components/comum";
import { GaleriaFotos } from "@/components/inspecao/FotosItem";
import ResultadoInspecao from "@/components/ResultadoInspecao";
import { fmtData } from "@/lib/format";
import { normasSgiTexto } from "@/lib/scores";
import { cn } from "@/lib/utils";

// Dados da inspeção. lateral = uma coluna (painel lateral); senão, grade responsiva.
export function CabecalhoInspecao({ insp, tipoInspecao, lateral }) {
  const p = insp.TipoDeFormulario;
  const largo = lateral ? "" : "sm:col-span-2";
  return (
    <div className={cn("grid gap-x-6 gap-y-4", lateral ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
      <Valor rotulo="Unidade" valor={insp.Unidade} />
      <Valor rotulo="Área" valor={insp.Area} />
      <Valor rotulo="Processo" valor={insp.Processo} />
      <Valor rotulo="Data" valor={fmtData(insp.Data)} />
      {p !== "SGI" && <Valor rotulo="Resp. Acompanhamento" valor={[insp.RespAcompanhamento, insp.Cargo].filter(Boolean).join(" — ")} className={lateral ? "col-span-2" : ""} />}
      {p === "SOL" && (<><Valor rotulo="Inspetor 1" valor={insp.Inspetor1} /><Valor rotulo="Inspetor 2" valor={insp.Inspetor2} /></>)}
      {p === "GRD" && <Valor rotulo="Avaliador" valor={insp.Avaliador} />}
      {p === "SGI" && (<><Valor rotulo="Auditor" valor={insp.Auditor} /><Valor rotulo="Normas/Disciplinas" valor={insp.NormaDisciplina} /><Valor rotulo="Equipe Entrevistada" valor={insp.EquipeEntrevistada?.split(";").join(", ")} className={lateral ? "col-span-2" : largo} /></>)}
      <Valor rotulo="Tipo de Inspeção" valor={tipoInspecao || insp.TipoDeInspecao} />
      <Valor rotulo="Observações" valor={insp.Observacao} className={lateral ? "col-span-2" : "sm:col-span-2 lg:col-span-4"} />
    </div>
  );
}

const tomResposta = (r) =>
  ["Sim", "Conforme", "Ponto Positivo"].includes(r) ? "sucesso" : ["Não", "Não Conformidade Maior"].includes(r) ? "perigo" : r === "Não Conformidade Menor" ? "laranja" : r === "Ponto de Melhoria" ? "alerta" : "neutro";

const NAO_CONFORME = ["Não", "Não Conformidade Maior", "Não Conformidade Menor"];

// Linha de item (somente leitura). children = ação à direita (ex.: botão do plano de ação).
export function ItemLeitura({ programa, item, children }) {
  const nc = NAO_CONFORME.includes(item.Resposta);
  const meta =
    programa === "SOL" ? `Categoria ${item.Categoria} · ${item.Subcategoria}`
    : programa === "GRD" ? `Req. ${item.NmrRequisito} · Sub-req. ${item.NmrSubRequisito} · ${item.PilarNome} ${item.PilarDescricao}`
    : [item.Procedimento, normasSgiTexto(item)].filter(Boolean).join(" · ");
  const detalhes = [
    [programa === "GRD" ? "Evidência" : "Observação", item.ItemObservacao],
    ["Descrição do apontamento", item.DescricaoApontamento],
    ["Referência normativa", item.ReferenciaNormativa],
    ["Evidências objetivas", item.EvidenciasObjetivas],
    ["Sugestão de adequação", item.SugestaoDeAdequacao],
  ].filter(([, v]) => v);
  return (
    <div className={cn("relative flex flex-wrap gap-3 border-b sm:flex-nowrap px-4 py-4 last:border-b-0 sm:gap-4 sm:px-5", nc && "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-destructive/70")}>
      <span className={cn("w-6 shrink-0 pt-px text-right text-[13px] font-medium tabular-nums", nc ? "text-destructive" : "text-muted-foreground/70")}>{item.indice}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-foreground">{item.Requisito || item.Questao}</p>
            {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
          </div>
          {item.Resposta && <Etiqueta tom={tomResposta(item.Resposta)} className="w-fit shrink-0 font-semibold">{item.Resposta}</Etiqueta>}
        </div>
        {detalhes.length > 0 && (
          <dl className="mt-3 space-y-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-[13px]">
            {detalhes.map(([r, v]) => (
              <div key={r}><dt className="inline font-medium text-foreground">{r}: </dt><dd className="inline text-foreground/80">{v}</dd></div>
            ))}
          </dl>
        )}
        <GaleriaFotos fotos={item.Fotos} />
      </div>
      {children && <div className="w-full shrink-0 pl-9 sm:w-auto sm:pl-0">{children}</div>}
    </div>
  );
}

// Visualizar Inspeção Completa. compacto = uma coluna (ex.: dentro de um diálogo).
export default function InspecaoDetalhe({ insp, tipoInspecao, compacto }) {
  const p = insp.TipoDeFormulario;
  const itens = insp.Checklist || [];
  const nNc = itens.filter((i) => NAO_CONFORME.includes(i.Resposta)).length;
  const dados = (
    <Secao titulo="Dados da inspeção" icone={Info}>
      <CabecalhoInspecao insp={insp} tipoInspecao={tipoInspecao} lateral={!compacto} />
    </Secao>
  );
  const assinatura = insp.AssinaturaUrl && (
    <Secao titulo="Assinatura" descricao={insp.RespAcompanhamento} icone={PenLine}>
      <img src={insp.AssinaturaUrl} alt="Assinatura" className="mx-auto max-h-36 w-full rounded-lg border bg-white object-contain" />
    </Secao>
  );
  return (
    <div className={cn("grid items-start gap-6", !compacto && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="min-w-0 space-y-6">
        {!insp.EmAberto && (
          <Secao titulo="Resultado" icone={Gauge}>
            <ResultadoInspecao programa={p} r={insp} />
          </Secao>
        )}
        {compacto && dados}
        <Secao
          titulo="Itens"
          descricao={`${itens.length} ${itens.length === 1 ? "item" : "itens"}${nNc ? ` · ${nNc} não conforme${nNc > 1 ? "s" : ""}` : ""}`}
          icone={ClipboardList}
          corpoClassName="p-0"
        >
          {itens.map((it, idx) => (
            <ItemLeitura key={it.Id} programa={p} item={{ ...it, indice: it.indice || idx + 1 }} />
          ))}
        </Secao>
        {compacto && assinatura}
      </div>
      {!compacto && (
        <div className="space-y-6 xl:sticky xl:top-6">
          {dados}
          {assinatura}
        </div>
      )}
    </div>
  );
}
