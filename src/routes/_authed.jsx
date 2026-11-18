import { Outlet, createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/AppShell";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";

// Portão de login do Base44: todas as páginas do app ficam em src/routes/_authed/.
// O usuário entra pelo login da plataforma (SSO); quem não está logado vai para /login e volta para a página
// pedida; quem está logado no Base44 mas não é usuário deste app vê a tela "acesso não concedido".
// ssr: false — as páginas dependem do usuário logado e renderizam só no navegador.
export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
