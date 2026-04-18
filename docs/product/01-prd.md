# PRD — App de Gravação e Transcrição de Consultas Psiquiátricas

**Versão:** 0.2 (rascunho)
**Data:** 17 de abril de 2026
**Status:** Em elicitação / sujeito a validação

---

## 1. Introdução / Visão Geral

**Progressive Web App (PWA) multi-plataforma** que permite ao médico psiquiatra **gravar o áudio de uma consulta**, obter **transcrição literal em português do Brasil** e um **resumo clínico estruturado** gerado automaticamente por IA no back-end próprio.

O produto busca reduzir o tempo gasto pelo médico com documentação manual, melhorar a qualidade da relação médico-paciente (permitindo que o médico mantenha contato visual em vez de digitar durante a anamnese) e produzir um registro auditável da consulta. O resultado final é um PDF exportável contendo transcrição e resumo estruturado, que o médico pode arquivar ou enviar ao paciente.

Como PWA, a aplicação funciona em **iPhone, Android, desktop e qualquer dispositivo com navegador moderno**, podendo ser instalada na tela inicial para experiência próxima à de um app nativo.

O foco inicial (MVP) é a especialidade **Psiquiatria**, pelas particularidades de sigilo, estrutura de anamnese e necessidade de acompanhamento longitudinal que essa especialidade demanda.

---

## 2. Objetivos / Metas

**Objetivos de produto:**

- Reduzir o tempo que o psiquiatra gasta com documentação pós-consulta.
- Melhorar a presença do médico durante a consulta, eliminando a necessidade de digitar em tempo real.
- Criar registro auditável e confiável de cada consulta.
- Entregar ao médico um resumo analítico estruturado pronto para revisão e exportação.

**Metas SMART (a validar após pesquisa com usuários reais):**

- Atingir **10 consultas gravadas por médico por semana** em média entre usuários ativos nos primeiros 3 meses após lançamento.
- Garantir **acurácia de transcrição ≥ 90%** (WER ≤ 10%) em PT-BR para áudio de consulta em ambiente de consultório.
- Entregar o resultado (transcrição + resumo) em **no máximo 10 minutos** após o fim da gravação.

---

## 3. Público-Alvo / Personas de Usuário

**Usuário primário: Médico psiquiatra (individual)**

- Atua em consultório particular ou clínica.
- Faz consultas de 30 a 50 minutos em média.
- Atende pacientes recorrentes ao longo de meses/anos.
- Valoriza privacidade, sigilo profissional e conformidade com CFM e LGPD.
- Acessa o PWA principalmente via iPhone, mas também pode usar Android, tablet ou desktop.
- Gerencia os próprios dados — o MVP **não** é multi-tenant (não atende clínicas com múltiplos profissionais compartilhando base de pacientes).

**Usuário secundário: Paciente**

- Não opera o aplicativo diretamente.
- Fornece consentimento verbal gravado no início de cada consulta.
- Pode receber o PDF exportado da consulta, a critério do médico.

---

## 4. Histórias de Usuário / Casos de Uso

### Gestão de pacientes
- **US-01:** Como médico, quero cadastrar um novo paciente com informações básicas para associar consultas a ele ao longo do tempo.
- **US-02:** Como médico, quero visualizar a lista dos meus pacientes e o histórico de consultas de cada um.

### Gravação de consulta
- **US-03:** Como médico, quero selecionar um paciente existente (ou cadastrar um novo) antes de iniciar a gravação.
- **US-04:** Como médico, quero confirmar no app que obtive o consentimento antes de iniciar a gravação, como etapa obrigatória.
- **US-05:** Como médico, quero iniciar a gravação e capturar o consentimento verbal do paciente como parte do áudio.
- **US-06:** Como médico, quero pausar e retomar a gravação durante a consulta, sem perder o áudio já capturado.
- **US-07:** Como médico, quero marcar momentos importantes durante a consulta com um toque, para facilitar a revisão posterior.
- **US-08:** Como médico, quero ditar notas adicionais ao final da consulta (ex: impressões pessoais) que serão processadas junto com o áudio principal.
- **US-09:** Como médico, quero encerrar a gravação e poder fechar o navegador/app, recebendo notificação quando o processamento estiver pronto.
- **US-16:** Como médico, quero que a tela permaneça ativa automaticamente durante a gravação, para não perder áudio por bloqueio de tela.

### Revisão e exportação
- **US-10:** Como médico, quero revisar a transcrição literal e o resumo estruturado, podendo editá-los antes de salvar.
- **US-11:** Como médico, quero identificar facilmente na transcrição o trecho onde o consentimento foi obtido.
- **US-12:** Como médico, quero que trechos de risco (ideação suicida, auto ou heterolesão) sejam destacados automaticamente para que eu não os perca na revisão.
- **US-13:** Como médico, quero exportar o resultado final como PDF para arquivar ou enviar ao paciente.

### Conta e privacidade
- **US-14:** Como médico, quero fazer login usando e-mail/senha, Sign in with Apple ou Google.
- **US-15:** Como médico, quero excluir permanentemente uma consulta específica (direito ao esquecimento) a pedido do paciente ou por iniciativa própria.
- **US-17:** Como médico, quero instalar o PWA na tela inicial do meu dispositivo para ter experiência mais próxima de um app nativo e habilitar notificações push.

---

## 5. Requisitos Funcionais

### RF-01 — Autenticação e conta
- O app deve suportar login via **e-mail + senha**, **Sign in with Apple** e **Login com Google**.
- Arquitetura de autenticação deve permitir adicionar outros provedores no futuro.
- Cada médico possui uma conta individual com dados isolados.

### RF-02 — Cadastro e gestão de pacientes
- O médico pode cadastrar, editar e arquivar pacientes.
- Cada paciente possui histórico de consultas associado.
- Não há integração com agenda externa no MVP.

### RF-03 — Fluxo de consentimento
- Antes de iniciar qualquer gravação, o app deve apresentar tela obrigatória de confirmação com a pergunta **"Consentimento do paciente obtido: Sim / Não"**.
- Apenas respondendo "Sim" a gravação é habilitada.
- Durante a transcrição, o sistema deve **identificar e destacar automaticamente** o trecho do consentimento verbal.

### RF-04 — Gravação de áudio
- A gravação é iniciada com um toque após a confirmação de consentimento.
- Implementada via **MediaRecorder API** do navegador.
- O app suporta **pausar e retomar** a gravação.
- O app permite ao médico **marcar momentos importantes** durante a gravação (timestamps com um toque).
- Ao final, o médico pode **ditar notas complementares** que são anexadas ao áudio principal como segmento separado.
- **Duração máxima suportada:** 90 minutos.
- **Wake Lock:** enquanto houver gravação ativa, o app deve solicitar o **Screen Wake Lock API** para manter a tela ativa e evitar que o bloqueio automático do dispositivo interrompa a captura de áudio. O lock deve ser liberado assim que a gravação encerrar.
- **Chunking e persistência local:** o áudio deve ser gravado em chunks e persistido localmente (IndexedDB) durante a captura, para resiliência em caso de falha do navegador.
- **Funcionamento offline:** a gravação deve funcionar sem conexão; o envio ao back-end ocorre quando a conectividade for restabelecida, via Service Worker com fila de sincronização.

### RF-05 — Processamento assíncrono e notificação
- Após o encerramento da gravação, o áudio é enviado ao back-end para processamento.
- O médico pode fechar o navegador/PWA.
- **Notificação primária: Web Push API** — o médico recebe notificação push quando o resultado estiver pronto (exige PWA instalado na tela inicial e permissão concedida).
- **Fallback obrigatório: e-mail** — caso o dispositivo/navegador não suporte Web Push, ou caso o usuário não tenha concedido permissão, uma notificação por e-mail é enviada com link para acessar o resultado.
- **SLA:** resultado entregue em até 10 minutos após fim da gravação.

### RF-06 — Transcrição e resumo estruturado
- O back-end gera transcrição literal em PT-BR a partir do áudio.
- O back-end gera resumo estruturado no **template específico de psiquiatria**, contemplando no mínimo:
  - Histórico Psiquiátrico
  - Exame do Estado Mental (EEM)
  - Medicações em uso
  - Hipótese diagnóstica (com CID-10, categorias F)
  - Conduta / Prescrição
- O template exato está sujeito a validação clínica (ver Questões em Aberto).

### RF-07 — Destaque automático de trechos de risco
- O sistema deve identificar e destacar visualmente trechos que mencionem:
  - Ideação suicida
  - Auto-lesão
  - Hetero-lesão (risco a terceiros)
- Os trechos destacados aparecem na revisão para que o médico não os perca.

### RF-08 — Revisão e edição
- O médico pode editar livremente a transcrição e o resumo estruturado antes da exportação.
- As alterações são salvas automaticamente.

### RF-09 — Exportação em PDF
- O médico pode exportar transcrição e/ou resumo estruturado em formato PDF.
- O PDF é gerado a partir da versão final revisada pelo médico.

### RF-10 — Direito ao esquecimento
- O médico pode excluir permanentemente uma consulta específica (áudio + transcrição + resumo).
- O médico pode solicitar exclusão total da sua conta e de todos os dados associados.
- A exclusão é irreversível e propagada para todos os backups em prazo a definir (considerar compliance LGPD).

### RF-11 — Histórico e timeline do paciente
- O médico pode visualizar o histórico cronológico de consultas de cada paciente.
- Timeline de evolução com features avançadas (comparativos, gráficos de evolução) fica para V2.

### RF-12 — Instalação como PWA
- O app deve atender aos critérios de instalabilidade de PWA (manifest, service worker, HTTPS).
- No primeiro acesso, o médico deve ser orientado (via onboarding) a instalar o PWA na tela inicial, especialmente em iOS, onde isso é pré-requisito para receber notificações push.
- O app deve funcionar corretamente em iPhone (Safari), Android (Chrome) e navegadores desktop modernos (Chrome, Edge, Safari, Firefox).

---

## 6. Requisitos Não Funcionais

### RNF-01 — Segurança e privacidade
- **Criptografia em trânsito:** TLS 1.2+ em toda comunicação entre app e back-end.
- **Criptografia em repouso:** áudio, transcrições e resumos armazenados criptografados no servidor.
- **Dados sensíveis (LGPD):** dados de saúde devem ser tratados conforme Art. 11 da LGPD, com base legal adequada (tutela da saúde / consentimento).
- **Isolamento de dados:** cada médico só acessa seus próprios dados.
- **Cache local do PWA:** dados sensíveis em cache local (IndexedDB) devem ser criptografados ou limpos após envio bem-sucedido ao back-end.

### RNF-02 — Localização dos dados
- Toda infraestrutura de armazenamento e processamento deve estar hospedada em **região do Brasil**.

### RNF-03 — Retenção de dados
- **Áudio original:** deletado automaticamente **30 dias após a gravação**.
- **Transcrição e resumo estruturado:** armazenados por tempo indeterminado (até solicitação de exclusão).

### RNF-04 — Desempenho
- Processamento assíncrono completo (transcrição + resumo) em até **10 minutos** após fim da gravação.
- Acurácia de transcrição em PT-BR: **≥ 90%** (WER ≤ 10%) em ambiente típico de consultório.
- Tempo de carregamento inicial do PWA: **≤ 3 segundos** em conexão 4G.

### RNF-05 — Usabilidade
- Interface responsiva, adaptada para mobile-first mas funcional em tablet e desktop.
- Fluxo de iniciar gravação deve ser concluído em no máximo **3 toques** a partir da tela inicial.
- Onboarding claro orientando a instalação como PWA e concessão de permissões (microfone, notificações).

### RNF-06 — Disponibilidade
- Back-end com disponibilidade alvo de **99,5%** mensal.

### RNF-07 — Compliance
- Conformidade com **LGPD** (Lei 13.709/2018).
- Respeito ao **Código de Ética Médica do CFM** e **Resolução CFM 1.821/2007** sobre prontuário eletrônico.
- Observância da **Lei 10.216/2001** (direitos da pessoa com transtornos mentais) para o tratamento de dados psiquiátricos.

### RNF-08 — Compatibilidade multi-plataforma
- **Dispositivos suportados:** iPhone (iOS 16.4+, necessário para Web Push), Android (Chrome 90+), desktop (Chrome, Edge, Safari, Firefox — versões dos últimos 2 anos).
- **Sem dependência de app store:** distribuição 100% via web.

### RNF-09 — Stack técnica de referência
- **Front-end / PWA:** Next.js 16 + TypeScript + TailwindCSS + shadcn/ui.
- **Autenticação:** NextAuth (Auth.js).
- **Banco de dados:** PostgreSQL.
- **Infraestrutura:** containerizada com Docker.
- **Hospedagem:** provedor com região Brasil (ver Questões em Aberto para decisão específica).

---

## 7. Considerações de Design / Mockups

- Mockups, wireframes e identidade visual ainda **não foram definidos**.
- Fase de design ocorrerá após aprovação deste PRD.
- Pontos de atenção para o design:
  - Fluxo de consentimento precisa ser claro e não pular etapas.
  - Tela de gravação precisa de feedback visual claro (gravando / pausado) e indicação de que a tela permanecerá ativa (wake lock).
  - Destaques de risco devem ter cor/tratamento visual que chame atenção sem ser alarmista.
  - Onboarding para instalação como PWA, especialmente em iOS (instruções "Adicionar à Tela de Início"), é crítico para habilitar notificações.
  - Design deve ser responsivo e testado em iPhone, Android e desktop.

---

## 8. Métricas de Sucesso

**Métrica principal:**
- **Nº de consultas gravadas por médico por semana** (indicador de adoção real e valor percebido).

**Métricas complementares sugeridas (a validar):**
- Taxa de conclusão do fluxo completo (gravação → revisão → exportação em PDF).
- Tempo médio gasto pelo médico revisando/editando o resumo (quanto menor, mais confiável o output).
- Taxa de instalação do PWA como proxy de engajamento.
- Taxa de retenção em 30 e 90 dias.
- NPS.

---

## 9. Questões em Aberto / Considerações Futuras

**Questões em aberto (precisam de definição):**

- **Modelo de negócio:** ainda não definido (assinatura mensal? freemium? pay-per-use?).
- **Design visual e mockups:** pendente.
- **Validação clínica do template psiquiátrico:** a estrutura proposta (Histórico, EEM, Medicações, HD com CID-10, Conduta) precisa ser validada com psiquiatras reais antes da implementação.
- **Tecnologia de transcrição:** Google Cloud Speech-to-Text (região São Paulo) escolhido como primário, validação empírica no Spike 1.
- **LLM para resumo SOAP:** Gemini 2.5 Pro via Vertex AI (região São Paulo) como primário, Gemini 2.5 Flash como fallback barato, Maritaca Sabiá 4 avaliado como referência no Spike 2. Decisão registrada em ADR 0007.
- **Provedor de hospedagem com região Brasil:** Google Cloud (consolidado) em `southamerica-east1`.
- **Prazo exato de propagação da exclusão (direito ao esquecimento) em backups:** definir SLA interno.
- **Política específica para dados de menores de idade:** consulta de adolescente tem requisitos adicionais de consentimento (responsáveis legais).
- **Comportamento de fallback quando Wake Lock API não for suportada:** decidir se bloqueia gravação, se exibe aviso ao médico, ou se aceita o risco silenciosamente.

**Considerações futuras (V2+):**

- Segunda especialidade além da psiquiatria (ex: clínica geral).
- Timeline de evolução do paciente com comparativos entre consultas.
- Integração com prontuário eletrônico (Memed, iClinic, etc.).
- Assinatura digital do PDF exportado (ICP-Brasil).
- Modo multi-tenant para clínicas com múltiplos médicos.
- Suporte a outros idiomas.
- Apps nativos (iOS/Android) caso as limitações do PWA se tornem críticas.
- Integração com agenda externa (Google Calendar, etc.).

---

## 10. Histórico de Revisões

| Versão | Data | Autor | Alterações |
|--------|------|-------|------------|
| 0.1 | 17/04/2026 | — | Rascunho inicial gerado via elicitação guiada. |
| 0.2 | 17/04/2026 | — | Mudança de iOS nativo para PWA multi-plataforma. Adicionados RF-12 (instalação PWA), Wake Lock em RF-04, Web Push + fallback e-mail em RF-05, RNF-08 (compatibilidade) e RNF-09 (stack técnica). |
