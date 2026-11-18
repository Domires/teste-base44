import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Layout sem cabeçalho global: a navegação parte da tela Início (/).
// A Administração tem layout próprio com menu lateral (routes/_authed/admin.jsx) e ocupa a tela toda;
// as demais áreas (Início, Inspeção, Plano de Ação) usam um contêiner centralizado.
export default function AppShell({ children }) {
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const admin = caminho.startsWith("/admin");
  // Início: cabe em 100% da altura da tela (sem a folga inferior das outras páginas)
  const inicio = caminho === "/";
  return (
    <main className="min-h-screen print:p-0">
      {admin ? children : <div className={cn("mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8 lg:px-8 print:p-0", inicio ? "pb-5 sm:pb-6" : "pb-24")}>{children}</div>}
    </main>
  );
}

// Link "← Início" (menu do Admin e tela de acesso restrito)
export function VoltarInicio({ className }) {
  return (
    <Link
      to="/"
      className={cn("no-print inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground", className)}
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Início
    </Link>
  );
}
