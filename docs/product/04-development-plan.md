# Plano de Desenvolvimento — MVP do App de Gravação e Transcrição de Consultas Psiquiátricas

**Versão:** 0.1
**Data:** 17 de abril de 2026
**Base:** PRD v0.2 + UX Specs v0.1 + Conceito de MVP v0.1
**Status:** Plano inicial para execução

---

## 1. Objetivo & Hipótese

**Hipótese central (resumida — ver MVP v0.1 §1 para detalhe):**

> Psiquiatras que gravam e transcrevem suas consultas com nosso produto economizam tempo real de documentação pós-consulta em relação ao método atual (digitação manual).

**Critério técnico inegociável:** transcrição em PT-BR com WER ≤ 10% em ambiente real de consultório. Abaixo disso, a hipótese falha por construção.

**Aprendizado primário esperado:** se os psiquiatras percebem economia de tempo após 2-4 semanas de uso.

---

## 2. Público-Alvo

**1 a 5 psiquiatras** em teste fechado, recrutados diretamente.

**Estado atual do recrutamento:** 1-2 confirmados; restante a recrutar em paralelo ao desenvolvimento.

_Detalhe completo da persona em MVP v0.1 §2._

---

## 3. Funcionalidades Essenciais (resumo)

**Dentro do MVP:** login por e-mail/senha, cadastro de pacientes com histórico, fluxo de consentimento (checkbox + detecção automática do trecho), gravação com pausa/retomar/marcadores/Wake Lock/notas complementares, processamento assíncrono com notificação por e-mail, transcrição literal, resumo estruturado em template psiquiátrico (Histórico, EEM, Medicações, CID-10, Conduta), edição inline + edição da transcrição, exportação em PDF, exclusão automatizada de consultas individuais e da conta.

**Fora do MVP:** Sign in with Apple/Google, Web Push, PWA instalável, offline-first, destaque de trechos de risco, suporte multi-browser amplo, modo escuro, acessibilidade plena, integrações externas, multi-tenant.

_Lista completa com rastreabilidade para RFs em MVP v0.1 §4._

---

## 4. Stack Tecnológico

### 4.1 Frontend / PWA

| Componente | Tecnologia |
|------------|-----------|
| Framework | Next.js 16 (App Router) |
| Linguagem | TypeScript |
| Estilização | TailwindCSS |
| Biblioteca de componentes | shadcn/ui |
| Geração de UI a partir das UX Specs | v0.dev + Claude Code |
| Estado do servidor | TanStack Query |
| Estado global da gravação | Zustand (persistido em IndexedDB) |
| Formulários | React Hook Form + Zod |
| Gravação de áudio | MediaRecorder API nativa |
| Wake lock | Screen Wake Lock API (com fallback a validar no spike) |

### 4.2 Backend / API

| Componente | Tecnologia |
|------------|-----------|
| Runtime | Node.js (dentro do próprio Next.js via Route Handlers) |
| ORM | Prisma |
| Banco de dados | PostgreSQL |
| Autenticação | NextAuth (Auth.js) — provider credentials |
| Fila de jobs | BullMQ |
| Broker da fila | Redis |
| Validação de schemas | Zod (compartilhado com front) |
| E-mails transacionais | Resend ou Postmark (a decidir) |

### 4.3 Processamento assíncrono e IA

| Componente | Tecnologia |
|------------|-----------|
| Transcrição (áudio → texto PT-BR) | Google Cloud Speech-to-Text, região `southamerica-east1` (São Paulo) |
| LLM para resumo SOAP — primário | **Gemini 2.5 Pro via Vertex AI** (região São Paulo) |
| LLM para resumo SOAP — fallback mais barato | **Gemini 2.5 Flash via Vertex AI** (mesma região) |
| LLM para resumo SOAP — terceira opção validada no Spike 2 | Maritaca Sabiá 4 (referência comparativa) |
| Armazenamento de áudio | Google Cloud Storage, bucket em região Brasil |
| Worker de processamento | Mesmo container Docker do app Next.js (BullMQ consumer) |

**Justificativa da consolidação no Google Cloud:** todo o stack de IA e infra fica em um único provedor, com região São Paulo nativa. Isso reduz fricção operacional (single billing, IAM unificado, menos credenciais), atende RNF-02 do PRD sem configurações especiais, e mantém opção de trocar para Maritaca no futuro se for estratégico. Maritaca permanece como referência no Spike 2 para validar empiricamente a decisão.

### 4.4 Infraestrutura

| Componente | Tecnologia |
|------------|-----------|
| Containerização | Docker + docker-compose |
| Provedor de cloud | Google Cloud (alinha com Speech-to-Text e Cloud Storage, e com região São Paulo para todo o stack) |
| Hospedagem do app | Cloud Run (região `southamerica-east1`) |
| Banco de dados gerenciado | Cloud SQL for PostgreSQL (região São Paulo) |
| Redis gerenciado | Memorystore (região São Paulo) |
| CDN/assets estáticos | Cloud CDN (opcional no MVP) |
| Segredos | Secret Manager |

**Justificativa da escolha Google Cloud:** consolidar todo o stack em um provedor com região Brasil simplifica operação solo, e a transcrição (via Speech-to-Text) já está lá. Bedrock em AWS `sa-east-1` como fallback de LLM continua viável como integração externa, sem mudar o provedor principal.

### 4.5 Observabilidade (mínimo viável)

| Componente | Tecnologia |
|------------|-----------|
| Logs estruturados | Pino + Cloud Logging |
| Errors | Sentry (com scrubbing agressivo de PII) |
| Métricas básicas | Cloud Monitoring (latência, erros 5xx) |
| Alertas | E-mail para o próprio dev em falhas críticas |

### 4.6 Dev tooling

| Componente | Tecnologia |
|------------|-----------|
| Assistente de código | Claude Code |
| Geração de UI inicial | v0.dev |
| Linter / formatter | ESLint + Prettier + Biome (opcional) |
| Testes unitários | Vitest |
| Testes E2E críticos | Playwright |
| CI/CD | GitHub Actions → Cloud Run |

---

## 5. Fases de Desenvolvimento / Roadmap

O plano está dividido em **5 fases sequenciais**. Não há prazos fixos (decisão do dev solo full-time); cada fase tem **critérios de conclusão objetivos** que funcionam como checkpoints naturais antes de avançar.

### 5.1 Fase 0 — Spikes técnicos (desbloqueadores críticos)

**Objetivo:** validar as três incertezas técnicas que podem invalidar todo o resto antes de escrever uma linha de código de produto.

**Atividades:**

1. **Spike de transcrição**
   - Criar 3-5 amostras reais de áudio de consulta psiquiátrica (pode ser gravação simulada com roteiro de consulta realista, ~10-15 min cada).
   - Processar cada amostra via Google Cloud Speech-to-Text (`long` model, PT-BR, com dicionário customizado de termos clínicos psiquiátricos).
   - Medir WER manualmente em trechos amostrais de 2 minutos.
   - **Critério de sucesso:** WER ≤ 10% em pelo menos 3 das 5 amostras.

2. **Spike de LLM para resumo SOAP**
   - Com as transcrições da Spike 1, criar prompt estruturado para gerar o template psiquiátrico (Histórico, EEM, Medicações, CID-10, Conduta).
   - Rodar em **Gemini 2.5 Pro**, **Gemini 2.5 Flash** e **Maritaca Sabiá 4** com o mesmo prompt.
   - Submeter os três outputs a um psiquiatra (dos 1-2 já confirmados) para avaliação comparativa cega.
   - **Critério de sucesso:** pelo menos um dos três LLMs gera resumo considerado "útil com pequenos ajustes" pelo psiquiatra avaliador.
   - **Decisão de saída da Spike:** escolher LLM primário com base em qualidade, com Flash ou Maritaca como fallback. Documentar qualidade relativa e custo por 1000 tokens.

3. **Spike de Wake Lock API no Safari iOS**
   - Criar página HTML mínima que solicita Wake Lock e mantém gravação MediaRecorder ativa por ≥ 30 minutos.
   - Testar em iPhone real (Safari) com tela fechada manualmente (bloqueio + desbloqueio).
   - **Critério de sucesso:** gravação não é interrompida durante os 30 minutos, ou descobrir padrão de fallback funcional (ex: áudio silencioso em loop).
   - **Se falhar:** decidir se é bloqueador (adia MVP) ou se o MVP lança com aviso explícito ao médico de manter a tela ativa manualmente.

**Entregáveis da Fase 0:**
- Documento de decisões técnicas (qual modelo de transcrição, qual LLM primário, comportamento de Wake Lock).
- Relatório curto de qualidade (WER medido, exemplos de transcrição + resumo).
- Prompt inicial de sumarização SOAP psiquiátrica (versão 1, para ser evoluído).

**Checkpoint sugerido:** não avançar para a Fase 1 sem as três decisões tomadas.

---

### 5.2 Fase 1 — Fundação

**Objetivo:** ter o esqueleto do app funcionando com auth, CRUD de pacientes, layout base e infra pronta para receber o fluxo de gravação.

**Atividades:**

1. **Setup de infraestrutura**
   - Projeto Next.js 16 + TypeScript + Tailwind + shadcn.
   - Docker Compose local com Postgres + Redis.
   - Provisionar Cloud SQL, Memorystore e Cloud Run em staging.
   - Configurar Secret Manager e variáveis de ambiente.
   - CI/CD básico (GitHub Actions → Cloud Run staging).

2. **Autenticação**
   - NextAuth com credentials provider (e-mail + senha).
   - Fluxo de cadastro, login e recuperação de senha (e-mail de recuperação via Resend/Postmark).
   - Middleware de proteção de rotas autenticadas.

3. **Modelo de dados (Prisma)**
   - `User` (médico)
   - `Patient`
   - `Consultation` (com status: `recording`, `uploading`, `processing`, `ready_for_review`, `reviewed`, `failed`)
   - `AudioChunk` (referência para blob no Cloud Storage + metadata)
   - `Transcription` (texto literal + trechos destacados: consentimento)
   - `SoapSummary` (campos estruturados do template psiquiátrico)
   - `Marker` (timestamps marcados durante a gravação)

4. **Layout base do app**
   - Drawer com shadcn `Sheet`.
   - Rotas App Router: `/`, `/pacientes`, `/pacientes/novo`, `/pacientes/[id]`, `/consultas`, `/consultas/[id]`, `/configuracoes`.
   - Home placeholder com CTA "Gravar agora" (botão estático por enquanto).

5. **CRUD de pacientes (end-to-end)**
   - Tela de lista (seção UX 3.8).
   - Cadastro / edição (campos mínimos do PRD: nome, data nascimento, sexo, contato, notas).
   - Detalhes do paciente (seção UX 3.9) — sem histórico de consultas ainda.

**Critério de conclusão:**
- Médico consegue se cadastrar, fazer login, criar 3 pacientes e editá-los.
- App deploya automaticamente em staging via push na branch principal.

**Checkpoint sugerido:** gravar demonstração de 2 minutos mostrando o fluxo completo cadastro → login → CRUD de paciente antes de avançar.

---

### 5.3 Fase 2 — Pipeline de gravação e processamento (fase crítica)

**Objetivo:** ter o fluxo mais crítico do produto funcionando ponta a ponta — o médico grava uma consulta e o back-end gera transcrição + SOAP, mesmo que a UI de revisão ainda seja crua.

**Atividades:**

1. **Fluxo pré-gravação**
   - Seleção de paciente (seção UX 3.2) com último atendido no topo.
   - Confirmação de consentimento (seção UX 3.3) com checkbox obrigatório.
   - Rotas em layout sem drawer (grupo de rota `(recording)` no App Router).

2. **Tela de gravação ativa (seção UX 3.4)**
   - Integração com MediaRecorder API.
   - Timer + waveform (canvas ou lib leve tipo `wavesurfer.js`).
   - Botões: Marcar, Pausar/Retomar, Parar.
   - Modal de confirmação ao Parar.
   - Solicitação de Wake Lock ao iniciar, liberação ao pausar/parar.
   - **Chunking de áudio:** chunks de 10s persistidos em IndexedDB durante a captura.
   - Bloqueio de navegação durante gravação (`beforeunload`).

3. **Tela de notas complementares (seção UX 3.5)**
   - Reutiliza componente de gravação, sem seleção de paciente.

4. **Upload e fila de processamento**
   - Pós-encerramento: upload dos chunks para Cloud Storage (signed URLs).
   - Enfileiramento de job BullMQ com metadata da consulta.
   - Tela de "enviado, em processamento" + retorno para home.

5. **Worker de processamento**
   - Consumer BullMQ no mesmo container do app.
   - Pipeline do job:
     - Baixa chunks do Cloud Storage.
     - Concatena em um único áudio.
     - Envia para Google Cloud Speech-to-Text (long-running operation).
     - Recebe transcrição + timestamps.
     - **Detecta trecho de consentimento** (heurística: primeiros 60s + match de palavras-chave; refinar se necessário).
     - Envia transcrição ao LLM escolhido na Fase 0 com prompt de SOAP psiquiátrico.
     - Persiste `Transcription` e `SoapSummary` no Postgres.
     - Atualiza status da consulta para `ready_for_review`.
     - Dispara e-mail de notificação ao médico com link direto para a revisão.

6. **Detecção automática do trecho de consentimento**
   - Implementação inicial: matching de frases-chave ("autoriza", "consente", "permite", "sim") nos primeiros 60-90s da transcrição.
   - Se encontrado, marca offset inicial e final no `Transcription`.
   - Se não encontrado, consulta vai para `ready_for_review` com flag `consentimento_nao_detectado` (exibida na revisão como aviso).

7. **Tratamento de falhas**
   - Job falhou no upload → retry automático do BullMQ (3 tentativas com backoff exponencial).
   - Job falhou no processamento → consulta marcada como `failed`, e-mail de erro ao médico.
   - Upload parcial (perda de conexão) → retoma do último chunk confirmado.

**Critério de conclusão:**
- O dev consegue simular uma consulta de 15 minutos em um iPhone real, encerrar, fechar o navegador, e receber um e-mail com link de revisão contendo transcrição literal + resumo SOAP preenchido.

**Checkpoint sugerido:** gravar uma consulta simulada de 15-20 minutos com um dos psiquiatras confirmados, processar, e apresentar o resultado bruto. Feedback qualitativo aqui vai calibrar prompt e parâmetros antes da Fase 3.

---

### 5.4 Fase 3 — Revisão e exportação (fechamento do valor)

**Objetivo:** entregar ao médico o valor final prometido — revisar, editar e exportar em PDF.

**Atividades:**

1. **Tela de revisão mobile (seção UX 3.6)**
   - Tabs: Resumo | Transcrição.
   - Badge verde de consentimento detectado (ou aviso em âmbar se não detectado).
   - Edição inline do resumo (cada campo é editável ao clicar).
   - Modo de edição explícito na transcrição (botão Editar → Salvar/Cancelar).

2. **Tela de revisão desktop (seção UX 3.7)**
   - Split view com resumo à esquerda e transcrição à direita.
   - Auto-salvamento (debounce de 2s).

3. **Exportação em PDF**
   - Geração server-side com Puppeteer ou `@react-pdf/renderer` (a decidir).
   - Template: cabeçalho com nome do médico + CRM, dados da consulta, resumo estruturado, transcrição completa, destaque visual do trecho de consentimento.
   - Download direto ou compartilhamento (navegador).

4. **Lista de consultas (seção UX 3.10)**
   - Filtros: Todas / Pendentes / Processando / Revisadas.
   - Busca por nome do paciente.
   - Item clicável → revisão.

5. **Home funcional (seção UX 3.1)**
   - Card "Consulta pendente de revisão" quando houver.
   - Lista das últimas 3-5 consultas concluídas.

6. **Histórico de consultas na tela de detalhes do paciente**
   - Lista cronológica ligada à seção UX 3.9.

7. **Finalização da consulta**
   - Botão "Finalizar revisão" marca como `reviewed`.
   - Consulta finalizada ainda pode ser reaberta para edição (decisão: sem bloqueio no MVP).

**Critério de conclusão:**
- Fluxo completo funciona: abrir app → gravar → receber e-mail → revisar → editar → exportar PDF → arquivar.

**Checkpoint sugerido:** repetir a gravação simulada com psiquiatra da Fase 2, agora completando o fluxo até o PDF. Ajustar prompt do LLM com base em quais campos ele mais edita.

---

### 5.5 Fase 4 — Hardening + beta fechado

**Objetivo:** robustecer, documentar legalmente, recrutar psiquiatras restantes e lançar.

**Atividades:**

1. **Exclusão automatizada (LGPD)**
   - Tela de exclusão individual de consulta em Configurações (com confirmação dupla + digite "EXCLUIR").
   - Tela de exclusão total de conta (cascata em todas as tabelas + remove áudio do Cloud Storage + invalidação de sessão).
   - Job automático de remoção de áudio após 30 dias (BullMQ com job agendado).
   - Política de privacidade + termos de uso publicados em rotas dedicadas.

2. **Hardening de segurança**
   - Rate limiting nas rotas críticas (login, upload).
   - Content-Security-Policy restritivo.
   - Headers de segurança (Helmet equivalente no Next.js).
   - Revisão de logs para garantir que nenhum conteúdo de transcrição vai para Cloud Logging.
   - Scrubbing de PII no Sentry.

3. **Onboarding básico**
   - Tela de boas-vindas após primeiro login explicando o produto em 3 passos.
   - Tour rápido no primeiro acesso à Home (tooltip no CTA Gravar).
   - Tutorial em vídeo curto (~2 min) gravado pelo dev.

4. **Recrutamento dos psiquiatras restantes**
   - Documento de convite + termo de consentimento para o beta.
   - Agendar kick-off individual com cada um.
   - Criar canal de suporte direto (WhatsApp ou e-mail).

5. **Testes finais**
   - Testes E2E com Playwright cobrindo o fluxo crítico (login → gravação → revisão → PDF).
   - Teste de carga leve (simular 5 consultas sendo processadas em paralelo).
   - Teste em iPhone real (diversos modelos se possível) + Chrome desktop.
   - Teste de recuperação de falhas (simular queda de internet no meio da gravação).

6. **Configuração de produção**
   - Domínio próprio + SSL.
   - Backup automático do Postgres (diário).
   - Alertas de Cloud Monitoring (5xx, latência alta, fila crescendo sem consumir).
   - Runbook mínimo para os cenários de falha mais prováveis.

7. **Lançamento do beta**
   - Kick-off com cada psiquiatra (15-30 min individual).
   - Primeira consulta acompanhada (gravação simulada) para garantir que o médico consegue operar.
   - Canal de suporte aberto.

**Critério de conclusão:**
- Todos os 3-5 psiquiatras estão usando o produto em consultas reais.
- Nenhum incidente crítico nas primeiras 48 horas pós-lançamento.

---

## 6. Estratégia de Testes

### 6.1 Testes automatizados

| Tipo | Cobertura-alvo |
|------|----------------|
| **Unitários (Vitest)** | Lógica de negócio pura: detecção de consentimento, validações Zod, helpers de formatação |
| **Integração (Vitest + DB em container)** | Operações Prisma, encadeamento de jobs BullMQ, geração de PDF |
| **E2E (Playwright)** | Fluxo crítico completo: login → cadastro de paciente → gravação simulada (mock do MediaRecorder) → revisão → exportação |

Cobertura não é meta — o que importa é cobrir os caminhos críticos onde uma regressão derruba o produto.

### 6.2 Testes manuais / com usuário

| Momento | Teste |
|---------|-------|
| Fim da Fase 0 | Transcrição + LLM com psiquiatra avaliador (qualitativo) |
| Fim da Fase 2 | Gravação simulada completa com 1 psiquiatra + feedback do resumo bruto |
| Fim da Fase 3 | Fluxo fim a fim com 1 psiquiatra, incluindo revisão e PDF |
| Semana 1 do beta | Acompanhamento diário, calls curtas com cada médico |
| Semana 2-4 do beta | Entrevistas estruturadas (ver seção 8) |

### 6.3 Teste em dispositivo real

O dev precisa ter sempre à mão:
- 1 iPhone (modelo compatível com iOS 16.4+) — plataforma primária.
- 1 notebook com Chrome.
- Acesso remoto ao dispositivo do psiquiatra (TeamViewer ou similar) para suporte.

---

## 7. Deploy / Lançamento

### 7.1 Ambientes

| Ambiente | Propósito |
|----------|-----------|
| **Local** | Desenvolvimento via Docker Compose |
| **Staging** | Cloud Run deploy automático em cada push na branch principal |
| **Produção** | Cloud Run deploy manual (aprovação do dev) via tag git |

### 7.2 Pipeline CI/CD (GitHub Actions)

1. Push na branch → lint + type-check + testes unitários.
2. Se passar → build da imagem Docker + push para Artifact Registry.
3. Deploy em staging automático.
4. Testes E2E contra staging.
5. Deploy em produção apenas com tag `v*` manualmente aplicada.

### 7.3 Lançamento do beta

- **Soft launch:** apenas os 1-2 psiquiatras já confirmados recebem acesso primeiro. 1 semana de uso real para detectar bugs críticos antes de ampliar.
- **Ampliação:** após 1 semana estável, ativar acesso para os 3-5 psiquiatras completos.
- **Comunicação:** termo de beta-tester assinado com cada psiquiatra, deixando claro que é ambiente de teste e que áudio é excluído após 30 dias.

---

## 8. Métricas de Sucesso

### 8.1 Métrica primária (hipótese)

**Tempo autopercebido de documentação antes vs. depois**, coletado em entrevista após 2-4 semanas de uso.

**Critério:** pelo menos 3 dos 5 psiquiatras relatam economia ≥ 20% de tempo autorrelatada.

### 8.2 Métricas de apoio (instrumentação básica)

| Métrica | Como medir |
|---------|-----------|
| Consultas gravadas por médico por semana | Query no Postgres (agrupamento por médico + semana) |
| Taxa de conclusão do fluxo (gravou → exportou PDF) | Funil simples no banco |
| Tempo médio de revisão (entre `ready_for_review` e `reviewed`) | Timestamps no banco |
| Taxa de falha de processamento | Status `failed` / total |
| Acurácia da transcrição (amostral) | Medição manual em 2-3 consultas aleatórias por semana |
| Quais campos do SOAP são mais editados | Diff entre versão gerada e versão final |

### 8.3 Métricas qualitativas (entrevistas)

- O médico recomendaria a um colega? (NPS simplificado 0-10)
- Qual foi a pior coisa que aconteceu no uso?
- Qual foi o momento "aha"?
- O PDF gerado é incorporado no prontuário real ou reescrito?
- Quais fricções o médico encontrou?

### 8.4 Critérios de falha (kill criteria)

O MVP é considerado **falho** se após 4 semanas de beta:
- Nenhum psiquiatra relatar economia de tempo perceptível, **ou**
- Acurácia da transcrição ficar consistentemente abaixo de 90%, **ou**
- Mais de 2 dos 5 abandonarem uso espontaneamente nas primeiras 2 semanas.

Em caso de falha, reabrir o Conceito de MVP antes de continuar qualquer desenvolvimento.

---

## 9. Riscos & Mitigação

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|-------|--------------|---------|-----------|
| R1 | Transcrição em PT-BR não atinge WER ≤ 10% em áudio real de consulta | Média | **Alto** (invalida a hipótese) | Fase 0 — Spike 1 antes de qualquer outra coisa. Testar dicionário customizado e modelo `long`. Plano B: avaliar Whisper self-hosted. |
| R2 | Wake Lock API inconsistente no Safari iOS | Alta | Alto (áudio perdido) | Fase 0 — Spike 3. Fallback de áudio silencioso em loop. Aviso explícito ao médico como último recurso. |
| R3 | LLM gera SOAP psiquiátrico de qualidade insuficiente | Média | Alto | Fase 0 — Spike 2 comparando Gemini 2.5 Pro, Gemini 2.5 Flash e Maritaca Sabiá 4. Prompt evoluído iterativamente. Feedback qualitativo dos psiquiatras nas Fases 2 e 3. |
| R4 | Dev solo sem prazo arrasta o projeto | Média | Médio | Checkpoints sugeridos ao fim de cada fase com demo obrigatória. Recrutar psiquiatras em paralelo (pressão social ao ter compromisso assumido). |
| R5 | Falta de psiquiatras dispostos a testar | Média | Alto | Começar recrutamento **agora**, não ao fim do desenvolvimento. Cada conversa confirma hipóteses do produto. |
| R6 | LGPD — vazamento de dados sensíveis de saúde | Baixa | **Crítico** | Criptografia em trânsito e repouso. Scrubbing de logs. Sentry com PII scrubber. Revisão de segurança antes do beta. Termo de beta explícito com cada médico. |
| R7 | Custo de APIs explodir sem controle | Baixa | Baixo (orçamento sem limite no MVP) | Alertas de faturamento no GCP. Cap de 100 consultas/semana/médico no back-end como circuit breaker. |
| R8 | Psiquiatra grava consulta mas detecção de consentimento falha | Média | Médio | UI aviso explícito quando não detecta. Exigência de checkbox ainda é a guarda legal primária. |
| R9 | Falha de upload após consulta de 60 min | Média | Alto (dados perdidos) | Chunks persistidos em IndexedDB durante captura. Retry automático. UI de "sincronizando" visível. |
| R10 | Gemini não atende qualidade esperada | Baixa | Baixo (já mitigado) | Spike 2 valida três LLMs em paralelo. Se Gemini Pro falhar, Flash ou Maritaca entram como alternativas. |

---

## 10. Equipe

**1 pessoa:** dev full-stack (você) + Claude Code como multiplicador de produtividade.

**Papéis acumulados pela mesma pessoa:**
- Product Owner / Product Manager
- Designer de UI (apoiado por v0.dev e shadcn)
- Dev frontend + backend
- DevOps / SRE
- QA
- Customer success dos psiquiatras beta

**Ajuda externa possível (sem custo adicional planejado no MVP):**
- 1-2 psiquiatras confirmados como avaliadores dos spikes.
- Rede pessoal para recrutamento do restante.

**Risco operacional a monitorar:** bus factor de 1. Documentar decisões técnicas à medida que são tomadas (ADRs simples em `docs/adr/`) para caso de necessidade futura de transferência.

---

## 11. Orçamento

**Sem limite relevante para o MVP** (decisão do fundador). Estimativas aproximadas de custo recorrente mensal durante o beta com 3-5 psiquiatras:

| Item | Custo estimado/mês (R$) | Observação |
|------|-------------------------|------------|
| Cloud Run + Cloud SQL + Memorystore (staging + prod) | 200-400 | Escala para baixo quando ocioso |
| Cloud Storage (áudio até 30 dias) | 20-50 | Áudio comprimido, 5 médicos × 20 consultas × ~10MB |
| Google Cloud Speech-to-Text | 200-500 | ~R$ 0,80 por minuto de áudio × volume beta |
| Vertex AI (Gemini 2.5 Pro/Flash) | 50-200 | Poucos milhões de tokens/mês no volume do beta; Flash é muito mais barato |
| Resend ou Postmark (e-mails) | 0-50 | Free tier cobre início |
| Sentry | 0 | Free tier |
| Domínio | ~80/ano | - |
| **Total estimado mensal** | **R$ 500 - R$ 1.200** | Folgado dentro do "sem limite" |

Custos pontuais:
- GitHub, Google Cloud, Maritaca: contas já existentes ou cadastros gratuitos.
- iPhone para testes: provavelmente já possuído pelo dev.

---

## 12. Próximos Passos Pós-MVP

Dependente do resultado do beta. Dois cenários principais:

### Cenário A — Hipótese validada (kill criteria não acionados)

1. **Expandir beta para 20-50 psiquiatras** antes de lançamento público.
2. Implementar features fora do MVP na ordem de maior impacto:
   - Destaque automático de trechos de risco (RF-07) — importância clínica em psiquiatria.
   - PWA instalável + Web Push — melhora retenção e notificação.
   - Sign in with Apple e Google — atrito de cadastro reduzido.
   - Funcionamento offline da gravação — robustez em consultórios com rede instável.
3. Definir **modelo de negócio** (pergunta em aberto desde o PRD).
4. Fortalecer **compliance para produção regulada** (auditoria LGPD completa, DPO, DPA com provedores).
5. Abrir segunda especialidade (provavelmente clínica geral, conforme PRD original).

### Cenário B — Hipótese refutada (kill criteria acionados)

1. Reabrir Conceito de MVP com aprendizados concretos.
2. Entrevistas profundas com os psiquiatras beta para entender o que não funcionou.
3. Possíveis pivots:
   - Se problema for acurácia: investir em modelo de transcrição especializado ou self-hosted.
   - Se problema for qualidade do SOAP: repensar template ou trocar LLM.
   - Se problema for fluxo de uso: revisar UX, talvez simplificar ainda mais o MVP.
   - Se problema for público: reconsiderar especialidade ou tipo de uso.

---

## 13. Histórico de Revisões

| Versão | Data | Alterações |
|--------|------|------------|
| 0.1 | 17/04/2026 | Plano de desenvolvimento inicial derivado de PRD v0.2 + UX v0.1 + MVP v0.1. |
| 0.2 | 18/04/2026 | LLM para resumo SOAP trocado: Gemini 2.5 Pro (primário) + Gemini 2.5 Flash (fallback barato) + Maritaca Sabiá 4 (terceira opção avaliada no Spike 2). Justificativa: consolidação total no Google Cloud reduz fricção operacional para dev solo. |
