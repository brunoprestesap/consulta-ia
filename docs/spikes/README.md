# Spikes da Fase 0

Os três spikes abaixo são **desbloqueadores críticos** do MVP. Precisam ser executados antes de iniciar a Fase 1 (fundação do Next.js).

## Ordem de execução

1. **[Spike 1 — Transcrição](./spike-01-transcription.md)** — Google Cloud Speech-to-Text atinge WER ≤ 10% em PT-BR? _(desbloqueador mais crítico)_
2. **[Spike 2 — LLM para resumo SOAP](./spike-02-llm-soap.md)** — Maritaca Sabiá 4 gera resumo psiquiátrico de qualidade aceitável? _(depende do Spike 1 para ter transcrições como input)_
3. **[Spike 3 — Wake Lock no Safari iOS](./spike-03-wake-lock.md)** — A API mantém a tela ativa durante gravação MediaRecorder longa? _(pode rodar em paralelo com Spike 1)_

## Follow-ups gerados durante a execução

- **[Spike 4 — Chunking de áudio longo](./spike-04-chunking-audio-longo.md)** — follow-up do
  Spike 1 (não um quarto desbloqueador original). O Passo 8 do Spike 1 revelou que a transcrição
  single-call do Gemini degenera em áudio longo (77 min → WER 63,5%/328%, loops de repetição),
  enquanto áudio curto é estável. Este spike valida o chunking como correção. Ver ADR 0012.

## Documentos ainda pendentes

Os spikes 2 e 3 serão documentados em detalhe quando o Spike 1 for concluído. Por enquanto, resumos:

### Spike 2 — LLM para resumo SOAP psiquiátrico

**Objetivo:** comparar **Gemini 2.5 Pro**, **Gemini 2.5 Flash** (ambos via Vertex AI em `southamerica-east1`) e **Maritaca Sabiá 4** gerando resumo SOAP a partir das transcrições do Spike 1.

**Critério de sucesso:** pelo menos um dos três LLMs gera resumo considerado "útil com pequenos ajustes" por um psiquiatra avaliador. Decisão final leva em conta qualidade, custo por consulta e latência.

### Spike 3 — Wake Lock API no Safari iOS

**Objetivo:** validar se `navigator.wakeLock.request('screen')` combinado com `MediaRecorder` mantém a gravação ativa por ≥ 30 minutos em Safari iOS, mesmo com tentativas de bloqueio de tela.

**Critério de sucesso:** gravação contínua de 30 min no iPhone real. Se falhar, avaliar fallback de áudio silencioso em loop.

---

## Regras gerais

- Código de spike é **descartável**. Não precisa ter qualidade de produção.
- Mas o **resultado** deve ser documentado em ADR (`docs/adr/`).
- Áudios e dados gerados nos spikes **não são versionados** (ver `.gitignore`).
- Se um spike passa, registrar os parâmetros finais (modelos, configs, custos) no ADR correspondente.
