# AGENTS.md — Guia para o Base44 (e outros agentes)

Este projeto é a **migração dos 3 apps Power Apps** do Programa SOL, GRD & SGI (ICL) — **Admin**, **Inspeção** e **Plano de Ação** — para **uma única aplicação web React + Node.js**.

Ele foi escrito para ficar o mais próximo possível da estrutura de um app Base44 (template TanStack). A intenção é que o Base44 **importe este projeto e faça apenas as adaptações de plataforma** listadas abaixo. **Toda a regra de negócio já está pronta e testada** — preserve-a.

## Objetivo para o Base44

1. Criar as entidades a partir de `base44/entities/*.jsonc` (já estão no formato do Base44, com `rls`).
2. Trocar o cliente local pelo SDK real (`src/api/base44Client.js`).
3. Transformar as funções de `server/functions/*.js` em server functions (`createServerFn`, em `src/lib/*-fns.js`) ou backend functions — **mantendo a mesma lógica e as mesmas validações**.
4. **O app não tem tela de login** — o usuário chega autenticado pela plataforma (SSO Microsoft / Azure AD da ICL, requisito do FSD) e é lido com `base44.auth.me()`. Remover o que simula isso localmente: `src/components/SeletorUsuarioTeste.jsx` (e seu uso na tela Início, `routes/_authed/index.jsx`), `devUser`/header `X-Dev-User` em `base44Client.js`, a rota `/api/dev/usuarios` e `server/lib/auth.js`. Em `src/routes/_authed.jsx` aplicar o portão do template (`ssr: false, beforeLoad: requireSignedIn, errorComponent: AuthGateError`).
5. Trocar o envio de e-mail local (`sendEmail` em `server/lib/email.js`, já no mesmo formato) por `base44.asServiceRole.integrations.Core.SendEmail({ to, subject, html })` — **um destinatário por chamada** (o `enviarEmailPA` já envia um e-mail por pessoa), sem campo de importância; o Base44 só envia para usuários cadastrados no app, a menos que o plano seja pago e tenha domínio próprio conectado. Não usar `template_name`/MJML: os modelos são editáveis em Configurar e-mails. Trocar o upload por `base44.integrations.Core.UploadFile`.
6. Remover o que é só do ambiente local: `server/` (depois de portar as funções), `scripts/dev.js`, `index.html`, `src/main.jsx` e `src/router.jsx` (o template TanStack Start tem os seus).

## Mapa da estrutura

| Pasta / arquivo | O que é | No Base44 |
| --- | --- | --- |
| `base44/entities/*.jsonc` | 23 entidades com `properties`, `required` e `rls` | Usar como estão |
| `src/emails/PlanoDeAcao.html` | Modelo **padrão** do e-mail "Resultado e Plano de Ação" (`{{variavel}}`). O admin pode substituí-lo em Configurar e-mails (entidade `ConfiguracaoEmail`) | Manter como HTML: o corpo editado também é HTML puro, montado por `montarEmail` (`src/lib/emailModelo.js`). Fica fora de `base44/emails/`, que no Base44 é a pasta dos modelos MJML da plataforma |
| `src/routes/` | Rotas por arquivo (TanStack Router) — mesmos nomes do template: `__root.jsx`, `_authed.jsx`, `_authed/...` (sem página de login) | Usar como estão; adicionar `ssr: false` nas páginas de `_authed` |
| `src/components/AppShell.jsx`, `src/components/menu.js` | Layout **sem cabeçalho**. A navegação parte da tela **Início** (`src/routes/_authed/index.jsx`), com cartões por perfil; Inspeção e Plano de Ação usam a trilha de navegação `Trilha` (Início › …, em `comum.jsx`); só a Administração tem menu lateral fixo (`MENU_ADMIN`, em `routes/_authed/admin.jsx`, com "← Início" via `VoltarInicio`) | Usar como estão |
| `src/index.css`, `tailwind.config.js`, `src/components/comum.jsx` | Sistema visual: tokens de cor (base neutra + azul-petróleo ICL; verde/âmbar/vermelho só para status), fonte Inter, sombras `shadow-xs/card/pop`, classes `.superficie`, `.select-nativo`, `.th`; componentes `PageHeader`, `Secao`, `Trilha`, `Etiqueta` (badge com tons), `MarcaPrograma`, `Avatar`, `ContadoresPA`, `SeloPrazo`; `plano/BotaoPA.jsx` (botão do plano colorido pela situação, com `data-situacao`) | Usar como estão |
| `src/components/ui/` | Kit shadcn/ui (mesmo do template) | Usar como está |
| `src/api/base44Client.js` | **Cliente local com a MESMA interface do `@base44/sdk`** | Substituir por `createClient(...)` (instrução no topo do arquivo) |
| `src/lib/fns.js` | Camada de dados das páginas (`inspecaoFns`, `planoFns`, `adminFns`) — cada função chama `base44.functions.invoke("grupo.nome")` | Trocar cada `call("grupo.nome")` pela server function equivalente (mesmo nome e mesmos parâmetros) |
| `server/functions/inspecao.js` | Regras do app Inspeção | → `src/lib/inspecao-fns.js` (createServerFn) |
| `server/functions/plano.js` | Regras do app Plano de Ação | → `src/lib/plano-fns.js` |
| `server/functions/admin.js` | Regras do app Admin | → `src/lib/admin-fns.js` |
| `server/lib/views.js` | Equivalentes das VIEWS SQL (UnidadeAreaProcesso_vw etc.) | Copiar para `src/lib/*.server.js` |
| `server/lib/inspecoes.js` | Resumo de inspeções / contagem de planos / prazo e atraso | Copiar para `src/lib/*.server.js` |
| `server/lib/access.js` | Perfis Admin / Inspetor / Auditor / Preenchedor | Copiar; usar `context.user` do `requireUser` |
| `server/lib/log.js` | `RegistrarAtividade_sp` → entidade `LogAuditoria` | Copiar |
| `server/lib/entities.js`, `db.js`, `auth.js`, `email.js`, `index.js`, `seed.js` | Infra local (banco SQLite, usuário simulado, SMTP, HTTP) | **Não portar** — a plataforma já oferece |
| `src/lib/scores.js` | Cálculo de scores SOL, métricas GRD, filtro SGI — JS puro usado no navegador e no servidor | Usar como está |
| `src/lib/excel.js`, `components/admin/excelCadastros.js`, `excelVinculos.js`, `excelUsuarios.js`, `ImportarExcelDialog.jsx` | Exportar/Importar Excel (.xlsx) dos cadastros, vínculos e usuários — lido e gerado no NAVEGADOR (`read-excel-file`, `write-excel-file`); a gravação usa `admin.importarCadastro` / `admin.importarVinculos` / `admin.importarUsuarios` (no Base44, a importação de usuários vira convites/papéis da plataforma) | Usar como estão (sem dependência de servidor) |
| `src/lib/constantes.js` | Parâmetros de negócio (agendamento obrigatório, unidades sem SGI, e-mail de contato) | Usar como está |

### Como as funções do servidor estão escritas

Toda função recebe `(ctx, data)`:

```js
export async function finalizar(ctx, data) {
  const d = payload.parse(data);           // validação zod
  const a = await getAccess(ctx);          // perfil do usuário
  exigir(podeUsar(a, d.programa));         // autorização
  const { sr } = ctx;                      // sr = entidades com acesso de serviço
  await sr.Inspecao.update(id, {...});     // mesma API do SDK
}
```

`ctx` tem `user` (mesmo formato de `base44.auth.me()`), `sr` (= `base44.asServiceRole.entities`) e `entities` (como o usuário, com RLS). Para portar:

```js
export const finalizar = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(payload)
  .handler(async ({ data, context }) => {
    const sr = context.getBase44().asServiceRole.entities;
    // ...corpo idêntico, usando context.user no lugar de ctx.user
  });
```

**Regra de segurança mantida:** toda função que usa `sr` (service role) primeiro chama `getAccess` e `exigir(...)`. Não remova essas checagens.

### Diferenças da API de entidades

O cliente local aceita `filter(query, "-campo", limite)` e operadores `$in`, `$ne`, `$gte`, `$lte`, `$or`, `$exists`. Se algum operador não existir no SDK, filtre em memória (os volumes são pequenos: ~260 usuários, centenas de inspeções/ano).

## Regras de negócio (resumo — detalhes nos comentários do código)

- **SOL** (inspeção): respostas Sim / Não / N/A. Item "Não" exige foto de evidência. Sem salvamento parcial. Scores calculados em `calcularSol` — **fiel ao app original**: Score Empresa conta categorias `E` e `S`; Score Total = Empresa + Colaborador. Status: RUIM < 60 ≤ REGULAR < 70 ≤ BOM < 80 ≤ ÓTIMO < 90 ≤ EXCELENTE. Assinatura obrigatória.
- **GRD** (avaliação): Sim / Não, evidência (texto) obrigatória em todos os itens, fotos opcionais. Pode salvar parcial e continuar ("Existe uma avaliação em aberto nessa área, pretende continuar?"); *Acréscimo*: "Nova Avaliação" pede confirmação antes de descartar (GRD e SGI). Só inicia dentro de um **Agendamento** vigente (`EXIGIR_AGENDAMENTO` em `src/lib/constantes.js`). Os períodos e a periodicidade de cada programa são definidos pelo Admin na tela Agendamento — não há periodicidade fixa no código. Métricas por pilar e total (`calcularGrd`). Assinatura obrigatória.
- **SGI** (auditoria): 6 respostas (NC Maior/Menor, Ponto de Melhoria, Ponto Positivo, Conforme, N/A). Questões filtradas por área e Norma/Disciplina (`filtrarItensSgi`). Auditor e Equipe Entrevistada obrigatórios. **Só existe o botão Salvar** (como no original; não há Finalizar). Há **um registro por Unidade/Área + Norma/Disciplina + ano** (campo `Ano` da Inspecao): abrir as mesmas opções no mesmo ano pergunta, como no GRD, se quer **Continuar Avaliação** ou **Nova Avaliação** (descarta a salva do ano e recomeça com os itens atuais); num ano novo começa uma auditoria nova e as dos anos anteriores ficam guardadas no seu ano, só para consulta (não editáveis). O registro salvo já conta como válido (`EmAberto: false`) nas listas/resultado do Admin. Regras em `server/functions/inspecao.js` (`sgiDoAno`, `anoSgi`).
- **Plano de Ação** (SOL e GRD): só quem está vinculado ao local (entidade `Vinculo`) acessa; inspeção inativada mostra o motivo. Um plano por item não conforme; status Em andamento → Finalizado (finalizado fica bloqueado). Enquanto "Em andamento" todos os campos (Resp. pela execução, Área, Nº da nota, data, descritivo e fotos — que podem ser removidas) seguem editáveis; "Resp. pelo preenchimento" (quem criou o plano) aparece no SOL e no GRD e não muda.
- **Admin**: indicadores, inspeções (ativas/inativadas/em aberto), editar, inativar com motivo, enviar e-mail de PA (por inspeção, por mês/unidade no SOL, por tipo/ano no GRD — avisa áreas sem responsáveis; cada e-mail tem uma situação `enviado` / `falha` / `sem-vinculo` / `nao-configurado` (sem SMTP, só gravado em `server/data/outbox`); **só `enviado` marca a inspeção como "e-mail enviado"**; é enviado **um e-mail por destinatário** (como o `SendEmail` do Base44): basta um receber para ficar `enviado`, e quem não recebeu aparece em `falhasDestinatarios` ("Enviado em parte" na tela Disparos e aviso na tela Inspeções); cada destinatário com falha é registrado no Log e o lote continua, e a tela Disparos mostra o resumo com as falhas — ver `enviarEmailPA` em `server/functions/admin.js`; reenviar é permitido), cadastros, vínculos, agendamento, logs, planilhas SOL/GRD (CSV com as colunas dos Office Scripts; no GRD as colunas de pilar são **dinâmicas** — uma por pilar, identificado pelo `PilarId` gravado nos itens da inspeção, ordenadas pela `Ordem` do cadastro; pilar renomeado mantém a coluna com o nome atual, pilar novo ganha coluna, pilar excluído fica como "<nome> (excluído)" — ver `pilaresDaPlanilha` em `src/lib/scores.js`).

## Mapeamento Power Apps → este projeto

| Power Apps / Power Automate | Aqui |
| --- | --- |
| Inspeção › ScreenSelecao | `src/routes/_authed/inspecao/index.jsx` |
| Inspeção › ScreenInspecaoSOL / ScreenAvaliacaoGRD / ScreenAuditoriaSGI | `src/routes/_authed/inspecao/formulario.jsx` + `components/inspecao/*` |
| Plano de Ação › ScreenSelecao / ScreenSelecao_1 / ScreenPlanoDeAcao | `src/routes/_authed/plano-acao/index.jsx`, `lista.jsx`, `$inspecaoId.jsx` |
| Admin › ScreenHome | `src/routes/_authed/admin/index.jsx` |
| Admin › ScreenInspecoes / Inativadas / EmAberto | `src/routes/_authed/admin/inspecoes.jsx` — uma tela só, com o filtro "Situação" (Ativas / Em aberto / Inativas / Todas) (+ `inspecao.$id.jsx`) |
| Admin › ScreenItens, Unidades, Areas, Inspetores, Auditores, Responsaveis, Facilitadores, Gestores, Lideres, NormaResponsaveisSgi, TipoAvaliacao, QuestoesAuditoria | `src/routes/_authed/admin/cadastros.$entidade.jsx` (config em `components/admin/cadastros.js`) |
| Admin › ScreenPilares | `src/routes/_authed/admin/pilares.jsx` |
| Admin › ScreenVinculos | `src/routes/_authed/admin/vinculos.jsx` |
| Admin › ScreenAgendamento | `src/routes/_authed/admin/agendamento.jsx` |
| Admin › ScreenDisparosSol / ScreenDisparosGrd | `src/routes/_authed/admin/disparos.jsx` |
| *(novo)* Admin › Programação › Configurar e-mails | `src/routes/_authed/admin/configurar-emails.jsx` (abas Modo teste / E-mail individual / E-mail em lote) — entidade `ConfiguracaoEmail` (registro único). **Modo teste** (`ModoTeste`, `DestinatariosTeste`): todos os e-mails de PA vão só para os destinatários de teste com `[TESTE]` no assunto e não marcam a inspeção como enviada. **Modelos** (`Assunto/Corpo` + `Individual` ou `Lote`): assunto e corpo em HTML do e-mail individual (tela Inspeções) e do e-mail em lote (Disparos), com variáveis `{{...}}` (`VARIAVEIS_EMAIL`; **não há `{{link}}`**: o link do app é fixo no corpo, `https://SEU-APP/plano-acao/{{id_inspecao}}` — o editor avisa enquanto `SEU-APP` não for trocado; `/plano-acao?inspecao=<id>` também abre o plano), pré-visualização e "Restaurar padrão"; campo vazio = padrão. Lógica em `src/lib/emailModelo.js` (compartilhada) e `configEmail`/`salvarModeloEmail`/`enviarEmailPA` em `server/functions/admin.js`. Não há campo de importância (o `SendEmail` do Base44 não tem prioridade) |
| Admin › ScreenLogs | `src/routes/_authed/admin/logs.jsx` |
| ObterInspecaoEmAndamento | `inspecao.verificarEmAndamento` |
| InspecaoParcialTransaction / InspecaoTransaction / DeletarInspecaoParcialTransaction | `inspecao.salvarParcial` / `inspecao.finalizar` / `inspecao.descartarParcial` |
| FiltrarItemSgi_sp | `filtrarItensSgi` (scores.js) |
| PreencherPlanilhaSol / GRD_PreencherPlanilha | `admin.exportarPlanilha` (o FSD prevê descontinuar a planilha; Power BI pode ler direto do banco) |
| ObterInspecoesDosPreenchedores / VerificarRespVinculo / ObterInspecao_sp | `plano.listar` / checagem em `plano.obter` |
| PlanoDeAcaoTransaction / EditarPlanoDeAcaoTransaction | `plano.salvar` |
| ListarInspecoes / EditarInspecaoTransaction | `admin.listarInspecoes` / `admin.editarInspecao` |
| EnviarPAporAreaSelecionada / EnviarPAPorUnidadeMesAno / EnviarPAporMesAno / EnviarPAporTipoAno | `admin.enviarPAInspecao` / `admin.dispararSol` / `admin.dispararGrd` |
| RegistrarAtividade_sp | `registrarAtividade` (server/lib/log.js) |
| Tabelas Resp/Facilitador/Gestor/Lider/RespSgi × UnidadeAreaProcesso | Entidade única `Vinculo` (Programa + Papel) |
| Tabelas Evidencia / PlanoDeAcaoFoto / Assinatura (base64 no SQL) | URLs de arquivo em `Checklist[].Fotos`, `PlanoDeAcao.Fotos`, `Inspecao.AssinaturaUrl`. No **SGI** as evidências aceitam **qualquer tipo de arquivo** (até 25 MB; `FotosItem qualquerArquivo`); SOL/GRD/Plano de Ação só imagens. Arquivos que não são imagem/PDF são servidos só para download (`Content-Disposition: attachment`, `nosniff`, `CSP sandbox`) |

## Convenções

- JavaScript/JSX apenas (sem TypeScript). `src/routeTree.gen.ts` é gerado — não editar.
- Textos da interface em português (pt-BR). Datas no formato `AAAA-MM-DD` no banco, exibidas como `DD/MM/AAAA`.
- Páginas com dados do usuário ficam em `src/routes/_authed/`.
