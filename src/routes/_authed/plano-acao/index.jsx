import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { LogoPrograma, PageHeader, Trilha } from "@/components/comum";

// ScreenSelecao do app Plano de Ação
export const Route = createFileRoute("/_authed/plano-acao/")({
  // link alternativo por parâmetro de URL: /plano-acao?inspecao=<id> abre o plano de ação da inspeção
  validateSearch: (s) => (s.inspecao ? { inspecao: String(s.inspecao) } : {}),
  beforeLoad: ({ search }) => {
    if (search.inspecao) throw redirect({ to: "/plano-acao/$inspecaoId", params: { inspecaoId: search.inspecao }, replace: true });
  },
  component: SelecaoPA,
});

const OPCOES = [
  ["SOL", "Inspeções SOL", "Resultado das inspeções do Programa SOL e planos de ação dos itens não conformes."],
  ["GRD", "Avaliações GRD", "Resultado das avaliações do Programa GRD e planos de ação dos itens não atendidos."],
];

function SelecaoPA() {
  return (
    <div className="mx-auto max-w-4xl">
      <Trilha itens={[{ rotulo: "Resultado e Plano de Ação" }]} />
      <PageHeader titulo="Resultado e Plano de Ação" subtitulo="Inspeções do Programa SOL e Avaliações do Programa GRD da sua área" />
      <div className="grid gap-4 sm:grid-cols-2">
        {OPCOES.map(([p, t, d]) => (
          <Link
            key={p}
            to="/plano-acao/lista"
            search={{ programa: p }}
            className="group flex flex-col rounded-2xl border bg-card shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
          >
            <div className="flex h-40 items-center justify-center rounded-t-2xl border-b bg-gradient-to-b from-muted/60 to-white">
              <LogoPrograma programa={p} className="h-20 transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div className="flex flex-1 flex-col p-6">
              <span className="text-lg font-semibold text-foreground">{t}</span>
              <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{d}</span>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Ver inspeções <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
