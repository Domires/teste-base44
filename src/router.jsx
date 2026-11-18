import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { NotFound, RouteError } from "@/components/Estados";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: (n, e) => n < 1 && !(e?.status >= 400 && e?.status < 500), // 4xx (sem acesso, validação) não adianta repetir
      refetchOnWindowFocus: false, staleTime: 15_000 } },
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
    scrollRestoration: true,
  });
}
