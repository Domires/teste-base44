import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, ListChecks, LogOut, Settings2, UserX } from "lucide-react";
import { Avatar, LogoPrograma } from "@/components/comum";
import { Carregando, Erro } from "@/components/Estados";
import { useAuth } from "@/lib/AuthContext";
import { contextoQuery } from "@/lib/fns";

// Tela Início: ponto de partida da aplicação. Mostra só as áreas do perfil do usuário.
export const Route = createFileRoute("/_authed/")({
  component: Inicio,
});

function Cartao({ to, icone: Icone, titulo, texto, rotulo }) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col rounded-2xl border bg-card p-5 shadow-card sm:[@media(max-height:640px)]:p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary ring-1 ring-inset ring-primary/10 transition group-hover:bg-primary group-hover:text-white">
        <Icone className="h-5 w-5" />
      </span>
      <h2 className="mt-4 sm:[@media(max-height:640px)]:mt-3 text-base font-semibold text-foreground">{titulo}</h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{texto}</p>
      <span className="mt-4 sm:[@media(max-height:640px)]:mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        {rotulo} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

function Inicio() {
  const { user, logout } = useAuth();
  const { data: ctx, isLoading, error, refetch } = useQuery(contextoQuery);
  if (isLoading) return <Carregando tela />;
  if (error) return <Erro erro={error} onRetry={refetch} />;
  const nada = !ctx.isInspetor && !ctx.isAuditor && !ctx.isPreenchedor && !ctx.isAdmin;
  const primeiroNome = (ctx.nome || "").split(" ")[0];
  return (
    <div className="relative flex min-h-[calc(100dvh-2.5rem)] flex-col sm:min-h-[calc(100dvh-3.5rem)]">
      {/* fundo decorativo */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(192_70%_90%/.7),transparent_70%)]" />

      <div className="flex items-center justify-between gap-4">
        <img src="/logo-icl.png" alt="ICL" className="h-8 w-auto" />
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{user.full_name || user.email}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
            <Avatar nome={user.full_name || user.email} />
            <button onClick={logout} title="Sair" aria-label="Sair" className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-destructive">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-8 sm:py-5 sm:[@media(max-height:640px)]:py-3">
        <div className="text-center">
          <h1 className="text-gradient mx-auto pb-1 text-4xl font-bold leading-tight tracking-tight sm:text-[3.25rem] sm:[@media(max-height:640px)]:text-[2.5rem]">Programa <span className="whitespace-nowrap">SOL · GRD · SGI</span></h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg [@media(max-height:640px)]:mt-1.5">
            {saudacao()}, <span className="font-medium text-foreground">{primeiroNome}</span>. Escolha por onde começar.
          </p>
        </div>

        {!nada && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:[@media(max-height:640px)]:mt-5">
            {(ctx.isInspetor || ctx.isAuditor) && (
              <Cartao to="/inspecao" icone={ClipboardCheck} titulo="Inspeção" rotulo="Iniciar" texto="Preencher checklists de inspeção SOL, avaliação GRD e auditoria SGI." />
            )}
            {ctx.isPreenchedor && (
              <Cartao to="/plano-acao" icone={ListChecks} titulo="Resultado e Plano de Ação" rotulo="Acessar" texto="Ver resultados das inspeções da sua área e preencher os planos de ação." />
            )}
            {ctx.isAdmin && <Cartao to="/admin" icone={Settings2} titulo="Administração" rotulo="Gerenciar" texto="Inspeções, cadastros, vínculos, agendamentos, disparos e logs." />}
          </div>
        )}

        {nada && (
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-card">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"><UserX className="h-5 w-5 text-muted-foreground" /></span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Seu usuário ainda não está cadastrado como inspetor, auditor ou responsável por alguma área. Procure o administrador do programa.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <span>ICL · Programa SOL · GRD · SGI</span>
        <div className="flex items-center gap-5 opacity-80">
          <LogoPrograma programa="SOL" className="h-6" />
          <LogoPrograma programa="GRD" className="h-6" />
          <LogoPrograma programa="SGI" className="h-5 text-sm" />
        </div>
      </div>
    </div>
  );
}
