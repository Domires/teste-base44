# AGENTS.md

## Project Context

This is a Base44 app repository built with **TanStack Start** (React 19, plain JavaScript — no TypeScript): file-based routes, server functions and server routes, server-side rendering by default. Treat it as user-owned application code, keep changes focused on the user's request, and preserve the conventions below.

Start with `README.md` for local setup and the publish workflow.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/routes/__root.jsx`: the HTML document (`<html>`, `<head>` via `HeadContent`, `<Scripts />`) and the providers. There is **no `index.html`**.
- `src/routes/*.jsx`: one page per file (`index.jsx` → `/`, `posts.$id.jsx` → `/posts/$id`). `src/routes/api/*.js`: server routes (raw HTTP endpoints). `src/routeTree.gen.ts` is generated on every dev/build run — never edit or commit it (it is the one TypeScript file, owned by the router plugin).
- `src/lib/server-fns.js`: where server functions (`createServerFn`), the data layer pages call, go. The starter has none yet: create the file with the first one.
- `src/start.js`: the Start instance; it applies `src/lib/auth-middleware.js` — `authMiddleware` to every server function and `base44RequestMiddleware` to every request — so each server function and server route handler gets `context.getBase44()` (returns a server-side SDK client acting as the visitor, created on first call) without opting in. Only call it when the handler needs Base44 — it requires the platform headers, and a handler that never calls it must still answer without them.
- `src/server.js`, `src/lib/error-capture.js` and `src/lib/error-capture.server.js`: Base44 managed files that report the app's server errors to Base44, so its owner sees them as alerts. Each carries a version marker and Base44 replaces it with newer versions: never edit, move or delete them, keep `src/server.js` as `main` in `wrangler.jsonc`, and keep the two error-capture middlewares first in `src/start.js`. They change nothing a visitor gets back.
- `src/lib/auth-middleware.js`: the server-side SDK client, built from the platform headers with `createClientFromRequest` and handed to every server function and server route as `context.getBase44()`. `src/api/base44Client.js`: the browser SDK client, same as the Base44 SPA template — leave it at that path, the builder tooling probes it.
- `src/lib/AuthContext.jsx`: client-side session (`useAuth()`: `user`, `isAuthenticated`, `isLoadingAuth`, `authError`, `refresh`, `logout`, `navigateToLogin`), resolved after hydration as `authQuery` in the router's QueryClient (one `/me` call per page load when an access token is present, none for anonymous visitors; shared with the login gate, which reads it from the router context).
- `src/components/auth/`: auth boilerplate — the auth pages and a login gate. Nothing imports it until you wire it in; see **Adding Authentication**.
- `__root.jsx` renders `<Base44Scripts />` (from `base44:document`, a virtual module the Base44 Vite plugin serves) in `<body>` right before `<Scripts />`: the builder and analytics hooks an `index.html` app gets injected. Keep it there — never in `head()`, and not after `<Scripts />` (module scripts run in document order, so the error handlers must come before the app entry). Keep `data-react-root` on `<body>` too; the builder's preview bridge reads it.
- App chrome: the starter has none. A shared header or nav is a component the app writes, rendered around `<Outlet />` by a layout route, so the auth pages stay outside it: `__root.jsx` while the app has no auth routes; `_authed.jsx` once it has them, with gated pages under `_authed/`; and if it also keeps public pages, a pathless `_site.jsx` rendering the same component, with those pages under `_site/`. The home page (`/`) is one file — `index.jsx`, `_authed/index.jsx` or `_site/index.jsx`: move it there, never copy it.
- `src/components/ui/`: shadcn/ui kit (JSX, shared with the Base44 SPA template). `src/index.css` + `tailwind.config.js`: design tokens.
- `vite.config.js`: `base44()` (sandbox/platform wiring), `cloudflare({ viteEnvironment: { name: "ssr" } })`, `tanstackStart()`, `react()`. The Cloudflare plugin runs the server in `workerd` and emits the build Base44's publish reads. Do not remove or reorder any of them. Keep `PREBUNDLE`: Vite bundles every runtime dependency in `package.json` at startup, for the browser and the server, so a package first imported mid-session can't make the server render load a second React. A new dependency joins it automatically.
- `wrangler.jsonc`: the Worker's entry (`src/server.js`), compatibility date and `nodejs_compat`. Keep `main` and `nodejs_compat`. Bindings and `vars` in it are not deployed: secrets come from the Base44 dashboard / `base44 secrets set`.

## Adding Authentication

The starter ships no sign-in UI and no auth routes. `AuthProvider` resolves the visitor and `useAuth()` exposes it; everything else is boilerplate in `src/components/auth/` that renders nothing until a route or the header uses it. Wire in only what the app needs, and keep the components' flows, SDK calls and `returnTo` handling when you restyle them.

- **Sign-in entry point**: a Sign in button calls `useAuth().navigateToLogin()`, which sends the visitor to `/login` and back to the current page; Sign out calls `useAuth().logout()`. On an app with its own auth pages `/login` is the app's route below; otherwise the platform serves it.
- **Gated pages**: create the login gate once, then put every page that requires a session under `src/routes/_authed/` (`_authed/dashboard.jsx` → `/dashboard`). The gate resolves the session before any child loader runs, sends a signed-out visitor to `/login?returnTo=…` and shows the not-registered screen to a Base44 user who is not a user of this app; children read the visitor with `Route.useRouteContext().user`. Never re-implement the gate in a page.

```jsx
// src/routes/_authed.jsx
import { createFileRoute } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";

export const Route = createFileRoute("/_authed")({ ssr: false, beforeLoad: requireSignedIn, errorComponent: AuthGateError });
```

- **The app's own auth pages** (an app with custom auth, which serves `/login` itself instead of the platform): create all five routes together, even when only one was asked for — each page links to the others, the reset email targets `/reset-password` and a Google or SSO sign-in that needs MFA comes back to `/mfa`. Each route file only wires a page component from `src/components/auth/`:

| Route file | Path | Component |
| --- | --- | --- |
| `src/routes/login.jsx` | `/login` | `LoginPage` |
| `src/routes/register.jsx` | `/register` | `RegisterPage` (register → email code → `verifyOtp` → `setToken`; never sign in right after `register`, the account is unverified) |
| `src/routes/forgot-password.jsx` | `/forgot-password` | `ForgotPasswordPage` |
| `src/routes/reset-password.jsx` | `/reset-password` | `ResetPasswordPage` (reads `?token=`) |
| `src/routes/mfa.jsx` | `/mfa` | `MfaPage` (finishes a sign-in that needs MFA; opened directly, the two-factor authentication settings) |

```jsx
// src/routes/login.jsx — the other three follow the same shape
import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/auth/LoginPage";

export const Route = createFileRoute("/login")({ ssr: false, head: () => ({ meta: [{ title: "Sign in" }] }), component: LoginPage });
```

  These pages render full-screen: keep them outside any layout route that renders app chrome (header, nav). Every page honors a same-origin `returnTo` (and the platform's `from_url`) via `safeReturnTo()` from `src/lib/authReturnTo.js` — keep that, never hardcode `/`. Sign-in goes through `loginWithMfa` (`src/lib/authMfa.js`) and `signInWithProvider` (`src/lib/authMfaFlow.js`). When the app requires MFA, `LoginPage` and `RegisterPage` return `<MfaScreen><MfaFlow … /></MfaScreen>` in place of the whole page (`MfaFlow` and `MfaManage` are card content: never nest them in another card), and `MfaManage` on `/mfa` enables, replaces and disables methods. Link to `/mfa` and add a forget-remembered-devices control (`session.forgetDevices`) only when asked; the link usually belongs on the profile or account page. Restyle or translate those screens, but keep every step and their `session-record-block` wrapper, which keeps codes out of session recordings; never edit the two helpers, call the MFA API directly or build other MFA screens.
- **MCP consent**: an app with an MCP server needs `src/routes/oauth/consent.jsx` (`/oauth/consent`) rendering `ConsentPage`, with `ssr: false`. It handles the signed-out case itself, so keep it outside `_authed/`.

## Server Security

- Every server function and every server route is a public HTTP endpoint: anyone can call it directly, with any input, without going through your pages. A page's `beforeLoad`, redirect or hidden button protects nothing on the server.
- `authMiddleware` only forwards the visitor's token; it does not reject anyone. A server function that needs a signed-in caller adds `.middleware([requireUser])` (from `src/lib/auth-middleware.js`) and reads `context.user`. Then check that this user may touch the records it asks for (owner, membership or role) before reading or changing them.
- Validate input with `.validator(...)` (zod is installed) — never trust ids, emails or roles sent by the caller.
- `context.getBase44().asServiceRole` bypasses every entity access rule. Use it only after `requireUser` plus an ownership/role check, or in a webhook that verifies its signature — never in a handler an anonymous caller reaches, and never to "fix" a page that renders empty for anonymous visitors.
- Bound every input of a credit-spending function: `.max()` on strings and arrays, `z.enum` for choices.
- The app's own code calls the server only through server functions, never by fetching one of its own routes. A server route (`src/routes/api/*`) is for a URL something else requests: a webhook or callback another service calls, a link or image the browser loads by itself (`<a href>`, `<img src>`), a feed or a public API. Those requests carry no visitor token, so such a route is public, verifies a webhook signature, or checks a short-lived signed token a server function issued. A route whose callers do send a Base44 token adds `server: { middleware: [requireUserRoute], handlers }` (from `src/lib/auth-middleware.js`): it answers anonymous callers with 401 and sets `context.user`. Put it only on `src/routes/api/*` files — a route's middleware also runs for every route under it.
- Never forward, log or return incoming request headers: the platform's request headers carry a service credential for this app.
- Secrets: set them with `base44 secrets set` and read them in server code only, with `import { secrets } from "base44:runtime"` → `secrets.get("NAME")` (never `process.env`). Anything under `import.meta.env.VITE_*` is compiled into the browser bundle — never put a secret there.
- A route that opts into shared caching (`Cache-Control: public` / `s-maxage` in `headers()`) must render the same HTML for everyone: no per-user data and no `asServiceRole` reads in its loader.

## AI Features

- TanStack AI is installed (`@tanstack/ai`, `@tanstack/ai-openai`, `@tanstack/ai-react`) and runs on the Base44 AI gateway: no API key, usage billed to the app's AI credits. In server code only, build the adapter with `gatewayModel(context.getBase44())` from `src/lib/ai.server.js`. It calls the gateway as the app (service role), since an owner can restrict the gateway to server-side calls, so authenticate the caller before calling it. Tools keep using `context.getBase44()` and act as the caller. Keep model `"automatic"` unless the task needs a specific one; named models cost more credits.
- Every AI call spends the app owner's credits, so an AI endpoint follows the Server Security rules above: sign-in required, input validated, and the loop bounded with `agentLoopStrategy: maxIterations(n)`.
- A chat UI streams from a server function: its handler returns the `chat(...)` stream, and `useChat` reads it through `fetcher`. Tools are ordinary server code and run as the signed-in caller:

```js
// src/lib/chat.js
import { chat, maxIterations, toolDefinition } from "@tanstack/ai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gatewayModel } from "@/lib/ai.server";
import { requireUser } from "@/lib/auth-middleware";

export const chatWithAssistant = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ messages: z.array(z.any()).max(40) }))
  .handler(({ data, context }) => {
    const base44 = context.getBase44();
    const listOrders = toolDefinition({
      name: "listOrders",
      description: "The caller's recent orders, optionally filtered by status",
      inputSchema: z.object({ status: z.string().optional() }),
    }).server(({ status }) => base44.entities.Order.filter(status ? { status } : {}, "-created_date", 20));

    return chat({
      adapter: gatewayModel(base44),
      messages: data.messages,
      systemPrompts: ["You help customers with their orders."],
      tools: [listOrders],
      agentLoopStrategy: maxIterations(5),
    });
  });
```

- In the page, `useChat` streams the reply. Messages are `{ id, role, parts }`; render `part.content` for `part.type === "text"`. Give the page `ssr: false`, as for any per-user page.

```jsx
import { useChat } from "@tanstack/ai-react";
import { chatWithAssistant } from "@/lib/chat";

const { messages, sendMessage, isLoading } = useChat({
  // send only the recent history: the server caps it, and a long chat would otherwise fail every turn
  fetcher: ({ messages }, { signal }) => chatWithAssistant({ data: { messages: messages.slice(-40) }, signal }),
});
```

- For AI work without a chat (summaries, classification, background agents), call `chat({ adapter, messages, stream: false })` inside a server function and return its result, or pass `outputSchema` (a zod schema) for typed JSON.

## Working Notes

- `npm run dev` runs the TanStack dev server (Vite); server code runs in `workerd`, exactly as in production.
- `npm run build` emits `dist/client` (static assets), `dist/server` (the Worker) and `.wrangler/deploy/config.json` (what publish reads). Never commit any of them.
- Read secrets inside a handler with `secrets.get("NAME")` from `base44:runtime`. Never from client code.
- Data flows through the router: `loader` + `Route.useLoaderData()` for reads, `useServerFn` + TanStack Query mutations for writes. Every server function and server route already runs as the caller through `context.getBase44()`. The router creates the `QueryClient` per request (`src/router.jsx`); never share one across requests with a module-level client. To read through TanStack Query instead, prefetch in the loader with `context.queryClient.ensureQueryData(options)` and read the same options with `useSuspenseQuery` in the component: `setupRouterSsrQueryIntegration` sends the server-fetched cache to the browser, so it is not fetched twice. That cache is embedded in the HTML, so the shared-cache rule above applies to it.
- `ssr: false` only on pages that need the signed-in user, so personal data never lands in cacheable HTML, and on the auth pages and `oauth/consent` as wired above; every other page (home, listings, details, tools, pages with only browser state) stays SSR'd and may opt into edge caching via the route's `headers()` (`Cache-Control: public, s-maxage=…`).
- Server and first client render must match: read `window`, `document` and browser storage only in effects and handlers (never in render or a `useState` initializer), and format dates and numbers with an explicit locale and time zone.
- `/api/apps/**`, `/api/app-logs/**` and `/ws-user-apps/**` belong to the Base44 platform API — never define routes under them.
- When working locally, prefer the Base44 CLI (`base44 dev`, `base44 deploy`, `base44 secrets set`) over adding npm scripts for Base44 tasks.
- Run `npm run lint` before finishing code changes. Write JavaScript/JSX only — no `.ts`/`.tsx` files and no type annotations (the generated `src/routeTree.gen.ts` is the sole exception and is never hand-edited).

---

# Projeto: Programa SOL, GRD & SGI (ICL)

Migração dos **3 apps Power Apps** do Programa SOL, GRD & SGI — **Admin**, **Inspeção** e **Plano de Ação** — para **um único app Base44** (TanStack Start). **Toda a regra de negócio está pronta e foi testada** — preserve-a. Textos da interface em português (pt-BR).

## Como está organizado

| Pasta / arquivo | O que é |
| --- | --- |
| `base44/entities/*.jsonc` | 23 entidades (`properties`, `required`, `rls`). `User` é a entidade nativa (perfis `admin` / `user`) |
| `src/routes/_authed.jsx` | Portão de login (`requireSignedIn`, `ssr: false`). **Todas** as páginas ficam em `src/routes/_authed/`. O usuário entra pelo login da plataforma (SSO); não há telas de login próprias |
| `src/routes/_authed/...` | Páginas: Início (`index.jsx`), Inspeção, Plano de Ação e Administração (menu lateral em `admin.jsx`) |
| `src/lib/server-fns.js` | **Server function única `chamarFuncao`** (`requireUser`): recebe `{ nome, dados }` e executa a função registrada com esse nome. Erros esperados (validação, permissão, regra) voltam como `{ ok: false, erro }`; inesperados são relançados para o error-capture |
| `src/lib/servidor/*.server.js` | Regras do servidor (só rodam no Worker): `inspecao.server.js`, `plano.server.js`, `admin.server.js`, `registro.server.js` (lista de funções), `access.server.js` (perfis), `views.server.js` (equivalentes das VIEWS SQL), `inspecoes.server.js` (resumo/contagem de PA, prazo e atraso), `log.server.js` (`LogAuditoria`), `email.server.js` (`Core.SendEmail`) |
| `src/lib/fns.js` | Camada de dados das páginas (`inspecaoFns`, `planoFns`, `adminFns`): cada função chama `chamarFuncao` com o nome `"grupo.nome"` |
| `src/lib/scores.js`, `src/lib/emailModelo.js`, `src/lib/constantes.js` | JS puro usado no navegador **e** no servidor: scores SOL, métricas GRD, filtro SGI, colunas dinâmicas de pilares, modelos de e-mail, parâmetros de negócio |
| `src/emails/PlanoDeAcao.html` | Modelo **padrão** do e-mail "Resultado e Plano de Ação" (HTML com `{{variavel}}`, importado com `?raw`). Fica fora de `base44/emails/` (pasta dos modelos MJML da plataforma): os modelos são editáveis pelo admin |
| `src/lib/servidor/carga.server.js` + `dados-iniciais.json` | **Carga inicial** (`admin.carregarDadosIniciais`): o banco do Base44 começa vazio; no Painel do Admin, com os cadastros vazios, aparece "Carregar dados iniciais" (8 unidades, 31 áreas, 66 locais, 31 itens SOL, pilares e 36 itens GRD). Só roda com esses cadastros vazios |
| `src/lib/upload.js` | Fotos/arquivos → `base44.integrations.Core.UploadFile({ file })` (fotos reduzidas para 1600px antes do envio) |
| `src/lib/excel.js`, `components/admin/excel*.js` | Exportar/Importar Excel no **navegador** (`read-excel-file`, `write-excel-file`) |
| `src/components/comum.jsx`, `src/index.css`, `tailwind.config.js` | Sistema visual (tokens azul-petróleo ICL, fonte Inter, `PageHeader`, `Secao`, `Trilha`, `Etiqueta`, `MarcaPrograma`...) |
| `docs/` | Diagrama de entidades (DER) |

### Como uma função do servidor é escrita

Toda função em `src/lib/servidor/*.server.js` recebe `(ctx, dados)`, valida com zod e checa o perfil **antes** de usar o acesso de serviço:

```js
export async function finalizar(ctx, data) {
  const d = payload.parse(data);           // validação zod
  const a = await getAccess(ctx);          // perfil do usuário (admin / inspetor / auditor / preenchedor)
  exigir(podeUsar(a, d.programa));         // autorização — nunca remova
  await ctx.sr.Inspecao.update(id, {...}); // ctx.sr = asServiceRole.entities
}
```

`ctx` (montado em `chamarFuncao`): `user` (`context.user`), `sr` (`asServiceRole.entities`), `integrations` (`asServiceRole.integrations`), `base44` (cliente como o usuário logado — usado em `auth.inviteUser`), `userAgent`, `pendentes` (logs que terminam antes da resposta). Para uma função nova: escreva-a num `*.server.js`, exporte-a (o registro inclui todas as funções exportadas dos módulos) e adicione a chamada em `src/lib/fns.js`.

### Usuários

`User` é nativo: não se cria usuário pelas entidades. Novo usuário = **convite** (`auth.inviteUser(email, role)`, feito como o admin logado) — na tela Usuários, na importação por Excel e ao cadastrar Inspetores, Auditores, Responsáveis etc. (quem ainda não é usuário é convidado; falha no convite vai para o Log). Nome e perfil se alteram com `asServiceRole.entities.User.update`; o e-mail de um usuário existente não muda. Convidados só aparecem na lista depois de aceitar.

### E-mail

`Core.SendEmail({ to, subject, html })` — **um destinatário por chamada** (`enviarEmailPA` envia um e-mail por pessoa), sem campo de importância. A plataforma sempre envia para usuários do app; para outros endereços exige plano pago com domínio próprio.

## Regras de negócio (resumo — detalhes nos comentários do código)

- **Perfis**: Admin = `User.role === "admin"`. Inspetor = e-mail em `Inspetor`; Auditor = e-mail em `Auditor` (SGI); Preenchedor = e-mail em `Vinculo`. Só inspetor/auditor/admin abre a Inspeção; só admin abre a Administração; o Plano de Ação só mostra as áreas vinculadas ao usuário (admin vê tudo).
- **SOL** (inspeção): Sim / Não / N/A. Item "Não" exige foto. Sem salvamento parcial. Scores em `calcularSol` — **fiel ao app original**: Score Empresa conta categorias `E` e `S`; Score Total = Empresa + Colaborador; N/A não conta; valores truncados em 2 casas. Status: RUIM < 60 ≤ REGULAR < 70 ≤ BOM < 80 ≤ ÓTIMO < 90 ≤ EXCELENTE. Assinatura obrigatória.
- **GRD** (avaliação): Sim / Não, evidência (texto) obrigatória, fotos opcionais. Pode salvar parcial e continuar; "Nova Avaliação" pede confirmação antes de descartar. Só inicia dentro de um **Agendamento** vigente (`EXIGIR_AGENDAMENTO`). Métricas por pilar e total (`calcularGrd`). Assinatura obrigatória.
- **SGI** (auditoria): 6 respostas (NC Maior/Menor, Ponto de Melhoria, Ponto Positivo, Conforme, N/A). Questões filtradas por área e Norma/Disciplina (`filtrarItensSgi`). **Só existe o botão Salvar**. **Um registro por Unidade/Área + Norma/Disciplina + ano** (campo `Ano`): no mesmo ano, pergunta **Continuar** ou **Nova Avaliação** (com confirmação); num ano novo começa outra e as anteriores ficam só para consulta. Evidências aceitam **qualquer tipo de arquivo** (até 25 MB). Regras em `inspecao.server.js` (`sgiDoAno`, `anoSgi`).
- **Plano de Ação** (SOL e GRD): um plano por item não conforme; Em andamento → Finalizado (finalizado fica bloqueado). Enquanto "Em andamento" todos os campos seguem editáveis (inclusive remover fotos); "Resp. pelo preenchimento" é quem criou o plano. O link do e-mail abre `/plano-acao/<id>` ou `/plano-acao?inspecao=<id>`.
- **Admin**: indicadores; inspeções (ativas / em aberto / inativas), editar, inativar com motivo; e-mail de PA por inspeção, por mês/unidade (SOL) e por tipo/ano (GRD) — avisa áreas sem responsáveis; situação por inspeção `enviado` / `falha` / `sem-vinculo`; **só `enviado` marca a inspeção como enviada** (basta um destinatário receber; quem não recebeu aparece em `falhasDestinatarios` — "Enviado em parte"); cada falha vai para o Log e o lote continua. **Configurar e-mails**: modo teste (tudo vai só para os destinatários de teste, com `[TESTE]`, sem marcar como enviada) e modelos editáveis (assunto + HTML) do e-mail individual e do e-mail em lote, com variáveis `{{...}}` (`VARIAVEIS_EMAIL`; **não há `{{link}}`**: o link é fixo no corpo, `https://SEU-APP/plano-acao/{{id_inspecao}}` — o editor avisa enquanto `SEU-APP` não for trocado). Cadastros, vínculos, agendamento, logs, usuários, planilhas SOL/GRD (no GRD as colunas de pilar são **dinâmicas** — `pilaresDaPlanilha`).

## Mapeamento Power Apps → este projeto

| Power Apps / Power Automate | Aqui |
| --- | --- |
| Inspeção › ScreenSelecao | `src/routes/_authed/inspecao/index.jsx` |
| Inspeção › ScreenInspecaoSOL / ScreenAvaliacaoGRD / ScreenAuditoriaSGI | `src/routes/_authed/inspecao/formulario.jsx` + `components/inspecao/*` |
| Plano de Ação › ScreenSelecao / ScreenSelecao_1 / ScreenPlanoDeAcao | `src/routes/_authed/plano-acao/index.jsx`, `lista.jsx`, `$inspecaoId.jsx` |
| Admin › ScreenHome | `src/routes/_authed/admin/index.jsx` |
| Admin › ScreenInspecoes / Inativadas / EmAberto | `src/routes/_authed/admin/inspecoes.jsx` (filtro "Situação") + `inspecao.$id.jsx` |
| Admin › telas de cadastro (Itens, Unidades, Áreas, Inspetores, Auditores, Responsáveis, Facilitadores, Gestores, Líderes, Responsáveis SGI, Tipos, Questões SGI) | `src/routes/_authed/admin/cadastros.$entidade.jsx` (config em `components/admin/cadastros.js`) |
| Admin › ScreenPilares / ScreenVinculos / ScreenAgendamento / ScreenLogs | `pilares.jsx` / `vinculos.jsx` / `agendamento.jsx` / `logs.jsx` |
| Admin › ScreenDisparosSol / ScreenDisparosGrd | `src/routes/_authed/admin/disparos.jsx` |
| *(novo)* Admin › Configurar e-mails / Usuários | `configurar-emails.jsx` (entidade `ConfiguracaoEmail`) / `usuarios.jsx` |
| ObterInspecaoEmAndamento / InspecaoParcialTransaction / InspecaoTransaction / DeletarInspecaoParcialTransaction | `inspecao.verificarEmAndamento` / `inspecao.salvarParcial` / `inspecao.finalizar` / `inspecao.descartarParcial` |
| FiltrarItemSgi_sp | `filtrarItensSgi` (`scores.js`) |
| ObterInspecoesDosPreenchedores / VerificarRespVinculo / ObterInspecao_sp | `plano.listar` / checagem em `plano.obter` |
| PlanoDeAcaoTransaction / EditarPlanoDeAcaoTransaction | `plano.salvar` |
| ListarInspecoes / EditarInspecaoTransaction | `admin.listarInspecoes` / `admin.editarInspecao` |
| EnviarPAporAreaSelecionada / EnviarPAPorUnidadeMesAno / EnviarPAporMesAno / EnviarPAporTipoAno | `admin.enviarPAInspecao` / `admin.dispararSol` / `admin.dispararGrd` |
| PreencherPlanilhaSol / GRD_PreencherPlanilha | `admin.exportarPlanilha` |
| RegistrarAtividade_sp | `registrarAtividade` (`log.server.js`) |
| Tabelas Resp/Facilitador/Gestor/Lider/RespSgi × UnidadeAreaProcesso | Entidade única `Vinculo` (Programa + Papel) |
| Evidencia / PlanoDeAcaoFoto / Assinatura (base64 no SQL) | URLs de arquivo em `Checklist[].Fotos`, `PlanoDeAcao.Fotos`, `Inspecao.AssinaturaUrl` |

## Convenções do projeto

- Datas no formato `AAAA-MM-DD` nas entidades, exibidas como `DD/MM/AAAA`.
- A versão anterior (React + Node/Express local, com testes ponta a ponta) está na branch `main` do repositório, como referência.
