# Conceito de MVP — App de Gravação e Transcrição de Consultas Psiquiátricas

**Versão:** 0.1
**Data:** 17 de abril de 2026
**Base:** PRD v0.2 + UX Specs v0.1
**Status:** Recorte de MVP para planejamento de desenvolvimento

---

## 1. Hipótese / Objetivo do MVP

### Hipótese central a ser validada

> **Psiquiatras que utilizam nosso produto para gravar e transcrever suas consultas economizam tempo real de documentação pós-consulta em relação ao método atual (digitação manual de prontuário).**

### Referência no PRD
Derivada do **Objetivo 2.1 (primeiro bullet):** "Reduzir o tempo que o psiquiatra gasta com documentação pós-consulta." Entre os quatro objetivos listados no PRD, este foi escolhido como **hipótese central do MVP** porque é o que um psiquiatra consegue perceber como valor já na primeira consulta gravada, é diretamente mensurável, e sustenta os demais objetivos — se o produto não economiza tempo, os demais benefícios (presença, auditabilidade, resumo analítico) perdem tração.

### Principal aprendizado esperado
- Se psiquiatras **percebem** economia real de tempo (validação qualitativa via entrevista).
- Se a **acurácia da transcrição em PT-BR ≥ 90% (WER ≤ 10%)** em ambiente real de consultório se sustenta fora de condições controladas — requisito inegociável do MVP (**RNF-04**). Abaixo desse patamar, o médico gasta mais tempo corrigindo do que economiza, e a hipótese falha por construção.
- Se o **template estruturado de psiquiatria** (SOAP adaptado com EEM, CID-10) é suficientemente útil para ser incorporado ao prontuário do médico sem grandes reescritas.

### Aprendizados explicitamente **fora** do escopo do MVP
- Viabilidade de escala (operar com centenas de médicos simultâneos).
- Adoção em outras especialidades além de psiquiatria.
- Eficácia de Web Push e notificações em produção.
- Robustez offline-first.

---

## 2. Público-Alvo (Subconjunto do MVP)

### Quem
**1 a 5 psiquiatras** em teste fechado, conhecidos e recrutados diretamente.

### Perfil (subconjunto da persona em PRD, seção 3)
- Psiquiatras em atividade (consultório particular ou clínica).
- Dispostos a participar de beta e dar feedback qualitativo denso.
- Usuários principalmente de **iPhone (Safari iOS)** — plataforma oficialmente testada no MVP.
- Com relação de confiança prévia com a equipe do produto (permite processos manuais onde automação ainda não existe).

### O que este recorte habilita
- Suporte oficial restrito a Safari iOS + Chrome desktop (sem necessidade de homologar Android, Firefox, Edge no MVP).
- Suporte manual via canal direto (sem necessidade de central de notificações ou sistema de tickets).
- Processos operacionais manuais onde não houver automação pronta (ex: exclusão de dados via back-office do banco).
- Feedback qualitativo presencial/por videoconferência em vez de instrumentação analítica pesada.

### Explicitamente **fora** do público do MVP
- Clínicas multi-profissional (o PRD já registra que multi-tenancy é V2).
- Médicos de outras especialidades.
- Pacientes como usuários diretos.
- Usuários descobertos organicamente ou via marketing.

---

## 3. Problema Resolvido (Foco do MVP)

### Problema específico atacado

> Psiquiatras gastam tempo significativo **após cada consulta** digitando prontuário, resumos e condutas — tempo que poderia ser dedicado a mais atendimentos, descanso ou qualidade da relação com o paciente.

### Recorte deliberado (o que o MVP **não** tenta resolver)

- Não tenta resolver o problema de integração com prontuários eletrônicos externos (exportação em PDF é o ponto de entrega — médico cuida manualmente do resto).
- Não tenta resolver problemas de segurança/auditoria em escala regulatória (o MVP atende a requisitos mínimos; produção completa virá depois).
- Não tenta resolver o problema da distração do médico em consulta (Objetivo 2.1 segundo bullet) — embora seja um benefício lateral possível, não é o que está sendo validado.

---

## 4. Funcionalidades Mínimas — Dentro vs Fora

### 4.1 Funcionalidades **DENTRO** do MVP

Todas essas são mantidas porque são necessárias para testar a hipótese central ou foram explicitamente requeridas como essenciais na elicitação:

#### Autenticação e conta
- Login por **e-mail + senha apenas**.
- Conta individual por médico.
- _Referência: PRD RF-01 (parcial)._

#### Gestão de pacientes (cadastro + histórico)
- Cadastro, edição e arquivamento de pacientes.
- Histórico de consultas por paciente.
- _Referência: PRD RF-02, UX seções 3.8 e 3.9._

#### Fluxo de consentimento
- Checkbox obrigatório "Consentimento do paciente obtido: Sim/Não" antes de iniciar a gravação.
- **Detecção automática do trecho de consentimento** na transcrição (com badge verde na revisão).
- _Referência: PRD RF-03, UX seções 3.3 e 3.6._

#### Gravação de áudio
- Iniciar / **Pausar / Retomar** / Parar.
- **Marcadores de momento** durante a gravação (silenciosos, nomeação posterior na revisão).
- Ditado de **notas complementares** após o encerramento.
- **Wake Lock API** para manter tela ativa durante a gravação.
- Duração máxima: 90 minutos.
- _Referência: PRD RF-04, UX seções 3.4 e 3.5._

#### Processamento assíncrono
- Envio do áudio ao back-end após encerramento.
- Processamento gera **transcrição literal PT-BR + resumo estruturado**.
- **Notificação de resultado apenas por e-mail** (Web Push fica fora).
- SLA de 10 minutos.
- _Referência: PRD RF-05, RF-06 (parcial)._

#### Template SOAP psiquiátrico
- Histórico Psiquiátrico
- Exame do Estado Mental (EEM)
- Medicações em uso
- Hipótese diagnóstica com CID-10 (categorias F)
- Conduta / Prescrição
- _Referência: PRD RF-06._

#### Revisão e edição
- Edição inline do resumo estruturado.
- **Edição da transcrição literal** (modo edição explícito).
- Destaque visual do trecho de consentimento.
- Layout responsivo: split view desktop / tabs mobile.
- _Referência: PRD RF-08, UX seções 3.6 e 3.7._

#### Exportação em PDF
- Médico exporta o resultado final como PDF.
- _Referência: PRD RF-09._

#### Direito ao esquecimento (automatizado)
- Médico pode excluir consulta individual pelo app.
- Médico pode solicitar exclusão total da conta e dados.
- _Referência: PRD RF-10._

#### Acurácia mínima da transcrição
- **≥ 90% em PT-BR (WER ≤ 10%)** — inegociável no MVP.
- _Referência: PRD RNF-04._

#### Segurança e privacidade mínimas
- TLS em trânsito.
- Criptografia em repouso.
- Hospedagem no Brasil.
- Retenção de áudio: 30 dias (apagamento automático).
- Isolamento de dados por médico.
- _Referência: PRD RNF-01, RNF-02, RNF-03._

#### Telas do MVP (correspondência com UX Specs)

| Tela | Seção UX |
|------|----------|
| Login | 1.1 |
| Home (com card de pendência) | 3.1 |
| Seleção de paciente | 3.2 |
| Confirmação de consentimento | 3.3 |
| Gravação ativa | 3.4 |
| Notas complementares | 3.5 |
| Revisão (mobile + desktop) | 3.6 + 3.7 |
| Lista de pacientes | 3.8 |
| Detalhes do paciente | 3.9 |
| Lista de consultas | 3.10 |
| Configurações (versão reduzida) | 3.12 (parcial) |

### 4.2 Funcionalidades **FORA** do MVP

Explicitamente excluídas — ficam para V2 ou posterior:

#### Autenticação social
- ❌ Sign in with Apple
- ❌ Login com Google
- _Justificativa: 3-5 médicos recrutados diretamente não precisam de OAuth; reduz complexidade de NextAuth no MVP._

#### Notificações
- ❌ Web Push API
- ❌ Central de Notificações (tela dedicada)
- _Justificativa: e-mail resolve com 3-5 usuários; Web Push em PWA iOS é complexo e não valida a hipótese de economia de tempo._

#### PWA avançado
- ❌ Instalação obrigatória como PWA (manifest + service worker + prompt de instalação)
- ❌ Funcionamento offline da gravação (IndexedDB + Service Worker queue)
- ❌ Onboarding dedicado de instalação PWA
- _Justificativa: web responsivo cobre o teste; offline e push dependem de PWA instalado. Fica para quando houver adoção mais ampla._

#### Destaque automático de trechos de risco (RF-07)
- ❌ Identificação de ideação suicida / auto-lesão / hetero-lesão
- ❌ Banner "⚠️ Trechos de atenção identificados"
- _Justificativa: feature de IA adicional que não testa a hipótese central de economia de tempo. Crítica para produção em psiquiatria, mas pode ser compensada no MVP com revisão integral pelo médico._

#### Compatibilidade multi-plataforma
- ❌ Suporte oficial a Android, Firefox, Edge
- ❌ Testes de compatibilidade em múltiplos browsers
- _Justificativa: MVP oficial apenas em Safari iOS e Chrome desktop. Outros navegadores podem funcionar, mas sem garantia._

#### UX e acessibilidade plenas
- ❌ Modo escuro
- ❌ Certificação WCAG 2.1 AA completa
- ❌ Pull-to-refresh, animações sofisticadas, microinterações
- ❌ Ilustrações de estados vazios
- _Justificativa: refinamentos após validação da hipótese._

#### Gestão e operação
- ❌ Timeline de evolução do paciente
- ❌ Integrações com prontuários eletrônicos (Memed, iClinic)
- ❌ Assinatura digital do PDF (ICP-Brasil)
- ❌ Multi-tenant / clínicas
- ❌ Suporte a outras especialidades além de psiquiatria
- ❌ Ajuda / Suporte in-app
- _Justificativa: PRD já lista esses itens como V2+._

#### Mensageria e observabilidade
- ❌ Central de notificações in-app
- ❌ Telemetria de uso (Posthog, Mixpanel)
- ❌ Observabilidade robusta em produção
- _Justificativa: feedback qualitativo direto com 3-5 usuários substitui instrumentação no MVP._

---

## 5. Restrições Principais

### Técnicas
- **Stack fixa:** Next.js 16 + TypeScript + TailwindCSS + shadcn/ui + NextAuth + PostgreSQL + Docker (_PRD RNF-09_).
- **Hospedagem obrigatoriamente no Brasil** (_PRD RNF-02_).
- **Modelo de transcrição ainda a definir:** decisão crítica em aberto que bloqueia estimativa de custo/prazo (_PRD Seção 9_).
- **Limitações conhecidas do Safari iOS:** suporte inconsistente ao Wake Lock API. Pode ser necessário fallback (áudio silencioso em loop) como técnica de contingência. Exigirá spike técnico antes do início da implementação.

### Operacionais
- **Suporte manual** aos 1-5 médicos beta (canal direto, sem sistema de tickets).
- **Recrutamento manual** dos psiquiatras — sem funil de marketing.
- **Processos de back-office manuais** onde não houver UI ainda (ex: investigação de erros de processamento, migração de dados).

### Compliance (mínimo absoluto mantido)
- LGPD — base legal explícita (consentimento + tutela da saúde).
- CFM — respeito ao Código de Ética Médica quanto a prontuário digital.
- Termo de uso e política de privacidade publicados desde o dia 1.

### Priorização
- **Acurácia da transcrição é a única métrica técnica inegociável.** Se a tecnologia escolhida não atingir WER ≤ 10% em áudio real de consultório em PT-BR, o MVP não vai ao ar — porque testaria uma hipótese impossível.

---

## 6. Métricas de Sucesso do MVP

Dado o tamanho da amostra (1-5 médicos), métricas são majoritariamente **qualitativas**, complementadas por indicadores quantitativos simples.

### Métrica primária (valida a hipótese)
- **Tempo autopercebido de documentação pós-consulta antes vs. depois do produto**, coletado em entrevista com cada psiquiatra após 2-4 semanas de uso.
- **Critério de sucesso:** pelo menos 3 dos 5 psiquiatras relatam economia de tempo perceptível (≥ 20% de redução autorrelatada).

### Métricas quantitativas de apoio
- **Nº de consultas gravadas por médico por semana** (_PRD seção 8 — métrica principal originalmente proposta_).
- **Taxa de conclusão do fluxo completo** (gravação → revisão → exportação em PDF).
- **Tempo médio que o médico gasta revisando/editando o resumo** — quanto menor, mais confiável a transcrição.
- **Acurácia média da transcrição** medida em amostra aleatória de consultas (WER medido manualmente em trechos curtos).

### Critérios qualitativos
- O médico **recomendaria** o produto a um colega? (NPS simplificado).
- O médico **incorpora** o PDF no prontuário dele sem grandes reescritas?
- Quais campos do resumo estruturado são **mais editados** (indicador de qualidade do template)?
- Quais fricções surgem no fluxo de gravação (pausar/retomar/marcar são usados de fato)?

### Critério de falha (kill criteria)
O MVP é considerado **falho e deve ser repensado** se:
- Nenhum dos psiquiatras relatar economia de tempo perceptível após 4 semanas, **ou**
- Acurácia da transcrição ficar consistentemente abaixo de 90% em condições reais, **ou**
- Mais de 2 dos 5 psiquiatras abandonarem o uso espontaneamente nas primeiras 2 semanas.

---

## 7. Notas de Realidade (contexto honesto para planejamento)

Estas observações não alteram o escopo decidido — servem como registro de pontos a acompanhar durante a execução.

- **Este MVP preserva cerca de 80% do produto completo.** O recorte foi conservador por escolha explícita. Espera-se prazo de desenvolvimento proporcional — provavelmente 3-4x maior do que um MVP mais enxuto. Vale planejar com expectativas alinhadas.

- **"Detecção automática do trecho de consentimento" e "direito ao esquecimento automatizado"** foram mantidos apesar da recomendação de corte. Ambos envolvem complexidade não trivial (o primeiro depende de classificação por IA/NLP, ainda não especificada; o segundo depende de cascata correta em múltiplas tabelas e propagação em backups). Recomenda-se tratá-los como **épicos próprios** com espaço adequado no cronograma.

- **A escolha da tecnologia de transcrição (PRD Seção 9) é o desbloqueador crítico.** Toda a hipótese do MVP se apoia em acurácia ≥ 90%. Sugere-se fazer um **spike técnico dedicado** como primeira atividade, comparando opções (Whisper self-hosted em infra Brasil, APIs nacionais, serviços gerenciados com região Brasil) em áudio real de consulta psiquiátrica antes de qualquer outra implementação.

- **Spike técnico do Wake Lock API no Safari iOS** também vale antes de implementar a tela de gravação, dada a inconsistência histórica de suporte.

---

## 8. Histórico de Revisões

| Versão | Data | Alterações |
|--------|------|------------|
| 0.1 | 17/04/2026 | Conceito de MVP inicial derivado do PRD v0.2 e UX Specs v0.1. Caminho conservador escolhido pelo usuário (Opção 1 na elicitação). |
