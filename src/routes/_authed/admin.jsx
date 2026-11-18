import { useState } from "react";
import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock, Menu, X } from "lucide-react";
import { VoltarInicio } from "@/components/AppShell";
import { Avatar } from "@/components/comum";
import { Carregando } from "@/components/Estados";
import { MENU_ADMIN } from "@/components/menu";
import { contextoQuery } from "@/lib/fns";
import { cn } from "@/lib/utils";

// Área de Administração (app Admin do Power Apps) — a única com menu lateral.
export const Route = createFileRoute("/_authed/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { data: ctx, isLoading } = useQuery(contextoQuery);
  const [aberto, setAberto] = useState(false);
  // fecha o menu do celular ao navegar
  const caminho = useRouterState({ select: (s) => s.location.href });
  const [ultimo, setUltimo] = useState(caminho);
  if (caminho !== ultimo) {
    setUltimo(caminho);
    if (aberto) setAberto(false);
  }

  if (isLoading) return <Carregando tela />;
  if (!ctx?.isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <VoltarInicio className="mb-4" />
        <div className="superficie flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Lock className="h-5 w-5 text-muted-foreground" /></span>
          <p className="text-sm text-muted-foreground">Acesso restrito aos administradores.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen lg:pl-64 print:pl-0">
      {/* barra do celular */}
      <div className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur lg:hidden">
        <button className="-ml-1.5 rounded-md p-1.5 text-foreground/80 hover:bg-muted" onClick={() => setAberto(true)} aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </button>
        <img src="/logo-icl.png" alt="ICL" className="h-6 w-auto" />
        <span className="h-4 w-px bg-border" />
        <span className="text-sm font-semibold">Administração</span>
      </div>
      {aberto && <div className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] lg:hidden" onClick={() => setAberto(false)} />}

      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform duration-200 lg:translate-x-0",
          aberto ? "translate-x-0 shadow-pop" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-5">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo-icl.png" alt="ICL" className="h-7 w-auto" />
            <span className="h-6 w-px bg-border" />
            <div className="min-w-0 leading-tight">
              <div className="text-[13px] font-semibold leading-snug text-foreground">Programa <span className="whitespace-nowrap">SOL · GRD · SGI</span></div>
              <div className="truncate text-[11px] text-muted-foreground">Administração</div>
            </div>
          </div>
          <button className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden" onClick={() => setAberto(false)} aria-label="Fechar menu"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-3 pt-3">
          <VoltarInicio className="w-full px-2.5 py-1.5" />
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-3">
          {MENU_ADMIN.map((g) => (
            <div key={g.grupo}>
              <div className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{g.grupo}</div>
              <div className="space-y-px">
                {g.itens.map((i) => (
                  <Link
                    key={i.label}
                    to={i.to}
                    params={i.params}
                    search={i.search}
                    activeOptions={{ exact: !!i.exact, includeSearch: !!i.search }}
                    className="group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
                    activeProps={{ className: "!bg-secondary !text-secondary-foreground font-medium" }}
                  >
                    {i.icone && <i.icone className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground/70 group-data-[status=active]:text-primary" aria-hidden="true" />}
                    <span className="truncate">{i.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3 border-t px-4 py-3">
          <Avatar nome={ctx.nome || ctx.email} className="h-8 w-8" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-medium">{ctx.nome}</div>
            <div className="truncate text-[11px] text-muted-foreground">{ctx.email}</div>
          </div>
        </div>
      </aside>

      <div className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-9 print:p-0">
        <Outlet />
      </div>
    </div>
  );
}
