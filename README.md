# Programa SOL, GRD & SGI — Formulário Digital

Aplicação web (React + Node.js) que substitui os três apps Power Apps do programa:

| App original | Quem usa | Onde ficou |
| --- | --- | --- |
| **Inspeção** | Inspetores (SOL), avaliadores (GRD) e auditores (SGI), no celular/tablet | menu **Inspeção** |
| **Plano de Ação** | Responsáveis/facilitadores (SOL) e líderes/gestores (GRD) das áreas | menu **Plano de Ação** (e link do e-mail) |
| **Admin** | Administradores do programa | menu **Administração** |

O menu mostra só o que cada pessoa pode usar: admin pelo perfil do usuário; inspetor/auditor pelo cadastro do e-mail; preenchedor pelos vínculos com as áreas.

## Rodar localmente

Requisitos: **Node.js 22.13 ou superior** (usa o SQLite embutido do Node).

```bash
npm install
npm run dev
```

- Aplicação: http://localhost:5173
- API: http://localhost:3001

Na primeira execução o banco (`server/data/app.db`) é criado com:

- os **31 itens do checklist SOL** (planilha FR00612), os **36 itens GRD em 5 pilares** e as **8 unidades / 66 áreas** reais (planilhas da pasta Documentação);
- 5 questões SGI **de exemplo** (substitua em Admin → Questões Auditoria SGI);
- tipos de inspeção e agendamentos abertos para hoje;
- usuários de teste: `admin@sol.local` (Administrador), `inspetor@sol.local` (Inspetor + Auditor) e `preenchedor@sol.local` (Responsável SOL, Líder GRD e Resp. SGI nas 3 primeiras áreas).

**Não há tela de login.** No Base44 o usuário já chega autenticado pela plataforma (SSO Microsoft) e o app só consulta quem está logado. Localmente o app entra automaticamente como administrador; para testar outro perfil, use o seletor **"Usuário de teste"** no canto superior direito (existe só no ambiente local).

Outros comandos:

```bash
npm run build        # compila o frontend em dist/
npm start            # sobe só o servidor (serve também o dist/ compilado) — porta 3001
npm run seed:reset   # apaga o banco local e recarrega os dados iniciais
npm run popular      # gera 1 ano de uso: ~110 inspeções SOL/GRD/SGI e ~570 planos de ação
```

Variáveis opcionais: veja `.env.example` (SMTP para enviar e-mails de verdade; sem SMTP os e-mails ficam salvos em `server/data/outbox/`).

## Testes

```bash
npm run build
npm run test:e2e
```

Sobe servidores temporários com banco novo (não mexe no seu banco local) e executa:

- `tests/e2e-api.mjs`: 34 verificações das regras de negócio pela API;
- `tests/e2e-interface.mjs`: 231 verificações usando o app num navegador (Edge/Chrome, caminho em `BROWSER_PATH`), com cliques, digitação, upload de fotos e assinatura: cadastros, vínculos, agendamento, inspeção SOL, avaliação GRD (parcial, continuação e "Nova Avaliação"), auditoria SGI, rascunho local, edição/inativação/descarte no Admin, e-mails e disparos, planilhas, plano de ação SOL e GRD pelo link do e-mail, controle de acesso, indicadores e logs.

## Estrutura

```
base44/entities/     entidades (formato Base44, com regras de acesso)
src/emails/          modelo padrão do e-mail de Resultado e Plano de Ação (HTML)
src/routes/          páginas (rotas por arquivo)
src/components/      componentes (ui/ = shadcn)
src/lib/             camada de dados (fns.js), regras de cálculo (scores.js), utilidades
src/api/             cliente compatível com o SDK do Base44
server/functions/    regras de negócio do servidor (antigos fluxos Power Automate / procedures)
server/lib/          infraestrutura local (banco, usuário simulado, e-mail, views)
```

## Levar para o Base44

Leia o **`AGENTS.md`** — ele descreve o que adaptar. Para gerar o .zip **sem** arquivos locais, exclua `node_modules/`, `dist/` e `server/data/`. No PowerShell, a partir da pasta acima do projeto:

```powershell
Compress-Archive -Path sol-grd-sgi\* -DestinationPath sol-grd-sgi.zip -Force
```

(antes, apague ou mova `sol-grd-sgi\node_modules`, `sol-grd-sgi\dist` e `sol-grd-sgi\server\data`).

## Diferenças em relação ao Power Apps

- Uma única aplicação, com perfis, no lugar de três apps.
- Fotos e assinaturas viram arquivos (URLs), não mais base64 dentro do SQL.
- Os vínculos de responsáveis (5 tabelas) viraram uma entidade só, `Vinculo`.
- Rascunho automático no celular: o formulário de inspeção é salvo no aparelho enquanto é preenchido (requisito de cache do FSD) e é restaurado se a página fechar.
- Os scores são recalculados no servidor ao finalizar (o navegador só mostra a prévia).
- Planilhas SOL/GRD: em vez do Office Script, o Admin exporta CSV com as mesmas colunas.
- PDF da inspeção (que estava "Em manutenção"): Admin → Inspeção → **Imprimir / PDF**.
- SGI ganhou o botão **Finalizar** (no original só havia Salvar).
- Equipe entrevistada (SGI): e-mails digitados, em vez da busca no Office 365.
- Descritivo do plano de ação em texto simples (o Power Apps usava editor rico; textos antigos em HTML são exibidos sem as tags).
- Cadastros (locais, áreas, processos, pessoas, tipos, itens) Vínculos e Usuários e acessos têm **Exportar Excel** e **Importar Excel** (modelo com aba de instruções, prévia linha a linha antes de gravar; a importação inclui/atualiza, nunca remove).
- Filtros de listagem: padrão = ano atual, todos os meses (no original, o mês atual).
