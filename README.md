# Programa SOL, GRD & SGI — app Base44

App Base44 ([TanStack Start](https://tanstack.com/start), React 19, JavaScript) que substitui os três apps Power Apps do programa:

| App original | Quem usa | Onde ficou |
| --- | --- | --- |
| **Inspeção** | Inspetores (SOL), avaliadores (GRD) e auditores (SGI), no celular/tablet | cartão **Inspeção** da tela Início |
| **Plano de Ação** | Responsáveis/facilitadores (SOL) e líderes/gestores (GRD) das áreas | cartão **Resultado e Plano de Ação** (e link do e-mail) |
| **Admin** | Administradores do programa | cartão **Administração** |

A tela Início mostra só o que cada pessoa pode usar: admin pelo perfil do usuário; inspetor/auditor pelo cadastro do e-mail; responsável pelos vínculos com as áreas. O login é o da plataforma Base44 (SSO).

## Primeiro uso

1. Publique o app no Base44 (as entidades de `base44/entities/` são criadas pela plataforma).
2. Entre como administrador e abra **Administração**: no Painel, clique em **Carregar dados iniciais** — cria as 8 unidades, 31 áreas e 66 locais, os 31 itens do checklist SOL e os pilares e 36 itens do GRD (planilhas do programa). Só funciona com esses cadastros vazios.
3. Cadastre tipos de inspeção, agendamentos, questões SGI, inspetores, auditores e responsáveis, e faça os vínculos. Quem ainda não é usuário do app recebe um convite por e-mail ao ser cadastrado.
4. Em **Programação › Configurar e-mails**, troque `SEU-APP` pelo endereço do app no link do corpo dos e-mails e, se quiser testar antes, ligue o **Modo teste**.

## Rodar localmente

```bash
npm ci
base44 login   # uma vez por máquina
base44 link    # uma vez por cópia do projeto
base44 dev     # backend local + app juntos
```

## Compilar e publicar

```bash
npm run build         # -> dist/client (arquivos) + dist/server (o Worker)
base44 deploy         # ou publique pelo builder do Base44
```

> No Windows, se a pasta do projeto tiver `&` no caminho, os atalhos do npm falham: rode `node node_modules/vite/bin/vite.js build`.

## Estrutura

```
base44/entities/       entidades (formato Base44, com regras de acesso)
src/routes/            páginas (rotas por arquivo); todas em _authed/ (exigem login)
src/lib/server-fns.js  server function que as páginas chamam (chamarFuncao)
src/lib/servidor/      regras do servidor (*.server.js): inspeção, plano de ação, admin, e-mail, log, carga inicial
src/lib/fns.js         camada de dados das páginas
src/lib/scores.js      cálculos de score / métricas (navegador e servidor)
src/emails/            modelo padrão do e-mail de Resultado e Plano de Ação (HTML)
src/components/        componentes (ui/ = shadcn)
docs/                  diagrama de entidades (DER)
```

Detalhes da arquitetura, regras de negócio e o mapeamento Power Apps → telas estão em `AGENTS.md`. A versão anterior (React + Node/Express local, com testes ponta a ponta) está na branch `main`.
