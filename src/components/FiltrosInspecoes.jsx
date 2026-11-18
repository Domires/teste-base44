import { Check, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/comum";
import { MESES, anosDisponiveis } from "@/lib/constantes";

// Barra de filtros das listagens (Unidade, Área, Mês, Ano, Tipo, Status do PA, Status do preenchimento)
export const SITUACOES = [
  { value: "ativas", label: "Ativas" },
  { value: "emAberto", label: "Em aberto" },
  { value: "inativadas", label: "Inativas" },
  { value: "todas", label: "Todas" },
];

// Status do Plano de Ação: mesmas cores dos contadores da listagem (ContadoresPA)
const STATUS_PA = [
  { k: "naoIniciado", label: "Não iniciado", cor: "bg-destructive" },
  { k: "emAndamento", label: "Em andamento", cor: "bg-warning" },
  { k: "finalizado", label: "Finalizado", cor: "bg-success" },
];

// situacao/setSituacao: filtro opcional (Admin) — Ativas, Em aberto, Inativas ou Todas
// inicial: valores de "Limpar filtros" (cada tela pode ter o seu padrão)
export default function FiltrosInspecoes({ f, setF, lista = [], mostrarPrograma, mostrarPrazo, mostrarStatusPA = true, situacao, setSituacao, inicial = FILTRO_INICIAL }) {
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const unidades = [...new Set(lista.map((i) => i.NomeUnidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const areas = [...new Set(lista.filter((i) => !f.unidade || i.NomeUnidade === f.unidade).map((i) => i.NomeArea))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const anoAtual = new Date().getFullYear();
  const chaves = ["unidade", "area", "mes", "ano", ...(mostrarPrograma ? ["programa"] : []), ...(mostrarPrazo ? ["prazo"] : []), ...(mostrarStatusPA ? STATUS_PA.map((x) => x.k) : [])];
  const ativos = chaves.filter((k) => f[k] !== inicial[k]).length;
  const limpar = () => setF((s) => ({ ...s, ...Object.fromEntries(chaves.map((k) => [k, inicial[k]])) }));

  return (
    <section aria-label="Filtros" className="superficie mb-5">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <div className="mr-auto flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Filtros</span>
          {ativos > 0 && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground ring-1 ring-inset ring-primary/15">{ativos} ativo{ativos > 1 ? "s" : ""}</span>}
        </div>
          {setSituacao && (
            <div role="tablist" aria-label="Situação" className="order-3 grid w-full grid-cols-4 rounded-lg bg-muted p-1 sm:order-2 sm:inline-flex sm:w-auto">
              {SITUACOES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="tab"
                  aria-selected={situacao === o.value}
                  data-situacao={o.value}
                  onClick={() => setSituacao(o.value)}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition sm:px-3",
                    situacao === o.value ? "bg-white text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={limpar} disabled={!ativos} className="order-2 inline-flex sm:order-3 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-40">
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 px-4 py-4 sm:grid-cols-3 xl:grid-cols-6">
        <Item rotulo="Unidade"><NativeSelect value={f.unidade} onChange={(v) => setF((s) => ({ ...s, unidade: v, area: "" }))} options={unidades} placeholder="Todas" /></Item>
        <Item rotulo="Área"><NativeSelect value={f.area} onChange={set("area")} options={areas} placeholder="Todas" /></Item>
        <Item rotulo="Mês"><NativeSelect value={f.mes} onChange={set("mes")} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} placeholder="Todos" /></Item>
        <Item rotulo="Ano"><NativeSelect value={f.ano} onChange={set("ano")} options={anosDisponiveis(anoAtual).map(String)} placeholder="Todos" /></Item>
        {mostrarPrograma && <Item rotulo="Programa"><NativeSelect value={f.programa} onChange={set("programa")} options={["SOL", "GRD", "SGI"]} placeholder="Todos" /></Item>}
        {mostrarPrazo && (
          <Item rotulo="Prazo do Plano de Ação">
            <NativeSelect value={f.prazo} onChange={set("prazo")} options={[{ value: "dia", label: "Em dia" }, { value: "atraso", label: "Em atraso" }]} placeholder="Todos" />
          </Item>
        )}
      </div>

      {mostrarStatusPA && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Status do Plano de Ação</span>
          {STATUS_PA.map(({ k, label, cor }) => (
            <button
              key={k}
              type="button"
              aria-pressed={!!f[k]}
              data-status-pa={k}
              onClick={() => set(k)(!f[k])}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition",
                f[k] ? "border-border bg-white text-foreground shadow-xs" : "border-dashed bg-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {f[k] ? <Check className="h-3.5 w-3.5 text-foreground/70" /> : <span className="h-3.5 w-3.5" />}
              <span className={cn("h-2 w-2 rounded-full", f[k] ? cor : "bg-muted-foreground/30")} />
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const Item = ({ rotulo, children }) => (
  <label className="flex min-w-0 flex-col gap-1">
    <span className="truncate text-xs font-medium text-muted-foreground">{rotulo}</span>
    {children}
  </label>
);

export const FILTRO_INICIAL = { unidade: "", area: "", mes: "", ano: String(new Date().getFullYear()), programa: "", prazo: "", naoIniciado: true, emAndamento: true, finalizado: true };

export const aplicarFiltrosLocais = (lista, f) =>
  lista.filter(
    (i) =>
      (!f.unidade || i.NomeUnidade === f.unidade) &&
      (!f.area || i.NomeArea === f.area) &&
      (!f.prazo || (i.TemPlanoDeAcao !== false && (f.prazo === "atraso" ? i.EmAtraso : !i.EmAtraso))), // prazo de PA não se aplica ao SGI
  );

export const filtrosServidor = (f) => ({
  mes: f.mes ? Number(f.mes) : null,
  ano: f.ano ? Number(f.ano) : null,
  naoIniciado: f.naoIniciado, emAndamento: f.emAndamento, finalizado: f.finalizado,
  programa: f.programa || null,
});
