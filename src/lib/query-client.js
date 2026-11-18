import { QueryClient } from "@tanstack/react-query";

// One client per router: on the server getRouter() runs per request, so a shared
// client would render one visitor's cached query data into another visitor's page.
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        // 4xx (sem acesso, validação) não adianta repetir
        retry: (n, e) => n < 1 && !(e?.status >= 400 && e?.status < 500),
      },
    },
  });
