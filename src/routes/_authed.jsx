import { Outlet, createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/AppShell";
import { Carregando, Erro } from "@/components/Estados";
import { useAuth } from "@/lib/AuthContext";

// Layout das páginas que dependem do usuário logado (mesmo padrão do template Base44).
// Não há tela de login: no Base44 o usuário chega autenticado pela plataforma (SSO).
// Ao portar, adicione aqui `ssr: false, beforeLoad: requireSignedIn, errorComponent: AuthGateError` do template.
export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { isAuthenticated, isLoadingAuth, authError, refresh } = useAuth();
  if (isLoadingAuth) return <Carregando tela />;
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md p-8">
        <Erro erro={authError || { message: "Não foi possível identificar o usuário logado." }} onRetry={refresh} />
      </div>
    );
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
