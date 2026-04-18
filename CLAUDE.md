# CLAUDE.md

Este arquivo é lido automaticamente pelo Claude Code ao iniciar cada sessão. Ele contém o contexto operacional mínimo que Claude precisa ter sempre presente.

**Leitura adicional obrigatória quando relevante:** `docs/product/` contém PRD, UX Specs, Conceito de MVP e Plano de Desenvolvimento. Consulte-os antes de propor soluções que afetem produto, UX ou escopo.

---

## Estado atual do projeto

**Fase atual:** Fase 0 — Spikes técnicos (pré-desenvolvimento).

Nada de código de aplicação ainda. Os três spikes da Fase 0 precisam ser executados antes de iniciar a Fase 1 (fundação do Next.js). Ver `docs/spikes/`.

**Ordem de execução dos spikes:**
1. Spike 1 — Transcrição (Google Cloud Speech-to-Text, PT-BR, WER ≤ 10%) — em `docs/spikes/spike-01-transcription.md`
2. Spike 2 — LLM para resumo SOAP psiquiátrico (Maritaca Sabiá 4 primário, Claude Bedrock fallback)
3. Spike 3 — Wake Lock API no Safari iOS

Scripts de spike vivem em `spikes/<nome-do-spike>/` (pasta a ser criada quando cada spike começar) e são descartáveis — não vão para o app final.

---

## O que este produto é

PWA multi-plataforma para psiquiatras gravarem consultas e receberem transcrição literal em PT-BR + resumo estruturado SOAP. Detalhes completos em `docs/product/01-prd.md`.

**Hipótese central do MVP:** psiquiatras economizam tempo real de documentação usando o produto. Só isto está sendo validado.

**Critério técnico inegociável:** transcrição PT-BR com WER ≤ 10%. Se o Spike 1 falhar, o projeto pausa.

---

## Stack técnica oficial (não improvisar)

### Frontend / PWA
- **Next.js 16** (App Router)
- **TypeScript**
- **TailwindCSS**
- **shadcn/ui** (componentes via `npx shadcn@latest add <nome>`)
- **TanStack Query** para estado do servidor
- **Zustand** para estado global da gravação (persistido em IndexedDB)
- **React Hook Form + Zod** para formulários

### Backend
- **Node.js** dentro do próprio Next.js (Route Handlers em `app/api/`)
- **Prisma** como ORM
- **PostgreSQL** (Cloud SQL em produção, Docker Compose em dev)
- **NextAuth (Auth.js)** — apenas credentials provider (e-mail + senha) no MVP
- **BullMQ** para fila de jobs
- **Redis** como broker (Memorystore em produção, Docker Compose em dev)
- **Zod** compartilhado entre front e back para validação

### IA e processamento
- **Google Cloud Speech-to-Text** (região `southamerica-east1`) para transcrição
- **Gemini 2.5 Pro via Vertex AI** (região `southamerica-east1`) como LLM primário para resumo SOAP
- **Gemini 2.5 Flash via Vertex AI** como fallback mais barato/rápido (mesma região)
- **Maritaca Sabiá 4** avaliado como terceira opção no Spike 2 para comparação
- **Google Cloud Storage** para armazenar áudio (mesma região)

### Infra
- **Docker** + **docker-compose** para desenvolvimento local
- **Google Cloud Run** (região São Paulo) para produção
- **Cloud SQL**, **Memorystore**, **Cloud Storage**, **Secret Manager** — todos em região São Paulo
- **GitHub Actions** para CI/CD

### Tooling
- **ESLint + Prettier**
- **Vitest** para unitários e integração
- **Playwright** para E2E do fluxo crítico

---

## Convenções de código

### Estrutura de pastas (App Router)

```
app/
├── (auth)/              # login, cadastro, recuperação de senha
├── (app)/               # rotas autenticadas com drawer
│   ├── layout.tsx
│   ├── page.tsx         # Home
│   ├── pacientes/
│   ├── consultas/
│   ├── notificacoes/    # FORA do MVP — não implementar agora
│   └── configuracoes/
├── (recording)/         # rotas sem drawer (fluxo de gravação modal)
│   └── gravar/
│       ├── paciente/
│       ├── consentimento/
│       ├── ativa/
│       └── notas/
└── api/                 # route handlers
```

### Padrões

- **Server Components por padrão.** Só marcar `"use client"` quando estritamente necessário (gravação, formulários interativos, hooks de estado).
- **Server Actions** para mutações simples; **Route Handlers** (`app/api/`) para integrações externas, webhooks e endpoints consumidos por jobs.
- **Validação:** toda entrada da rede passa por Zod antes de tocar o banco.
- **Prisma:** schema único em `prisma/schema.prisma`. Migrations versionadas no git.
- **Segredos:** nunca em código. Sempre `process.env.X` com validação via Zod em `lib/env.ts`.
- **Imports absolutos:** usar `@/` apontando para a raiz do `src/`.

### Commits

Formato Conventional Commits:
- `feat:` nova funcionalidade
- `fix:` correção de bug
- `chore:` tarefa de manutenção (deps, config)
- `refactor:` refatoração sem mudança de comportamento
- `docs:` mudanças só em documentação
- `test:` adição ou correção de testes

### Testes

- Cobertura não é meta. O que importa é testar **caminhos críticos**: detecção de consentimento, validações, encadeamento de jobs BullMQ, fluxo E2E de gravação → revisão → PDF.
- Testes unitários ao lado do arquivo: `foo.ts` + `foo.test.ts`.
- E2E em `tests/e2e/`.

---

## O que NÃO fazer (fora do MVP)

Estas features estão **explicitamente fora do MVP** conforme `docs/product/03-mvp-concept.md`. Claude não deve implementá-las nem sugerir como "oportunidade fácil":

- ❌ Sign in with Apple ou Google (só e-mail/senha no MVP)
- ❌ Web Push notifications (só e-mail)
- ❌ Central de notificações in-app
- ❌ PWA instalável (manifest, service worker, prompt de instalação)
- ❌ Funcionamento offline da gravação
- ❌ Destaque automático de trechos de risco (ideação suicida, etc.)
- ❌ Multi-tenant / clínicas
- ❌ Outras especialidades além de psiquiatria
- ❌ Integração com prontuário externo (Memed, iClinic)
- ❌ Assinatura digital ICP-Brasil
- ❌ Modo escuro
- ❌ Tela "Notificações" no drawer
- ❌ Pull-to-refresh, animações sofisticadas
- ❌ Swipe-to-delete em listas (exclusão é sempre explícita com confirmação dupla)

Se o usuário pedir explicitamente uma dessas, implementar — mas **sempre alertar** que está fora do escopo do MVP antes de começar.

---

## O que o MVP TEM (escopo positivo resumido)

- Login por e-mail + senha
- Cadastro, edição e arquivamento de pacientes com histórico
- Fluxo de consentimento: checkbox obrigatório + detecção automática do trecho no áudio
- Gravação com pausa/retomar, marcadores, notas complementares, Wake Lock
- Processamento assíncrono via BullMQ com notificação por e-mail
- Transcrição literal em PT-BR
- Resumo estruturado SOAP psiquiátrico (Histórico, EEM, Medicações, CID-10 F, Conduta)
- Revisão com edição inline do resumo + modo edição da transcrição
- Exportação em PDF
- Exclusão individual de consulta e exclusão total de conta (LGPD automatizada)
- Apagamento automático de áudio após 30 dias

---

## Segurança e LGPD (regras duras)

- **Nunca** logar conteúdo de transcrição, áudio ou qualquer dado clínico.
- **Nunca** armazenar tokens em localStorage. Sempre cookies httpOnly via NextAuth.
- **Criptografia em repouso** no banco e no Cloud Storage (default do GCP já atende).
- **TLS em trânsito** sempre.
- **Scrubbing de PII** no Sentry configurado desde o primeiro deploy.
- Áudio **nunca** cacheado em Service Worker. IndexedDB criptografado com chave derivada da sessão.
- Dados sensíveis (CPF, prontuário) **não devem aparecer** em URLs, query strings ou headers de referrer.

---

## Decisões arquiteturais

Cada decisão técnica importante deve gerar um ADR em `docs/adr/NNNN-titulo.md`. Formato mínimo:

```markdown
# ADR NNNN — Título da decisão
Data: YYYY-MM-DD
Status: proposto | aceito | substituído por ADR XXXX

## Contexto
O que motivou a decisão

## Decisão
O que foi decidido

## Consequências
Trade-offs e implicações
```

Decisões já tomadas que devem virar ADRs quando forem implementadas pela primeira vez:
- ADR 0001 — Escolha do Google Cloud Speech-to-Text para transcrição
- ADR 0002 — Escolha do Gemini (via Vertex AI, região São Paulo) como LLM primário, com Maritaca como alternativa avaliada
- ADR 0003 — BullMQ + Redis no mesmo container do app
- ADR 0004 — Next.js App Router com Server Components por padrão
- ADR 0005 — Consolidação do stack em Google Cloud (único provedor para transcrição, LLM, storage, DB, cache, hosting)

---

## Como o Claude Code deve se comportar

**Sempre que uma tarefa tocar:**
- Produto/UX/escopo → consultar `docs/product/` antes de propor solução
- Stack/infra → respeitar as escolhas acima, sem improvisar alternativas
- Fase/roadmap → respeitar a ordem de execução (spikes → Fase 1 → Fase 2 → ...)

**Sempre:**
- Prefira soluções simples. Dev é solo, tempo é caro.
- Antes de adicionar uma dependência, pergunte se é necessária.
- Se uma decisão é ambígua, pergunte ao usuário em vez de escolher por ele.
- Se detectar que algo pedido contradiz `docs/product/`, sinalize antes de executar.
- Comentários em código só quando o "porquê" não é óbvio. Evitar "o quê" redundante.

**Nunca:**
- Iniciar uma nova feature grande sem confirmar com o usuário qual fase/sprint ela pertence.
- Sugerir "enquanto estamos aqui, também podemos fazer X" se X está fora do MVP.
- Assumir que o usuário quer upgrade de versão de lib sem perguntar.
