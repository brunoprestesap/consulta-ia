# Spikes da Fase 0

Os três spikes abaixo são **desbloqueadores críticos** do MVP. Precisam ser executados antes de iniciar a Fase 1 (fundação do Next.js).

## Ordem de execução

1. **[Spike 1 — Transcrição](./spike-01-transcription.md)** — Google Cloud Speech-to-Text atinge WER ≤ 10% em PT-BR? _(desbloqueador mais crítico)_
2. **[Spike 2 — LLM para resumo SOAP](./spike-02-llm-soap.md)** — Maritaca Sabiá 4 gera resumo psiquiátrico de qualidade aceitável? _(depende do Spike 1 para ter transcrições como input)_
3. **[Spike 3 — Wake Lock no Safari iOS](./spike-03-wake-lock.md)** — A API mantém a tela ativa durante gravação MediaRecorder longa? _(pode rodar em paralelo com Spike 1)_

## Documentos ainda pendentes

Os spikes 2 e 3 serão documentados em detalhe quando o Spike 1 for concluído. Por enquanto, resumos:

### Spike 2 — LLM para resumo SOAP psiquiátrico

**Objetivo:** comparar Maritaca Sabiá 4 e Claude via AWS Bedrock (sa-east-1) gerando resumo SOAP a partir das transcrições do Spike 1.

**Critério de sucesso:** pelo menos um dos dois LLMs gera resumo considerado "útil com pequenos ajustes" por um psiquiatra avaliador.

### Spike 3 — Wake Lock API no Safari iOS

**Objetivo:** validar se `navigator.wakeLock.request('screen')` combinado com `MediaRecorder` mantém a gravação ativa por ≥ 30 minutos em Safari iOS, mesmo com tentativas de bloqueio de tela.

**Critério de sucesso:** gravação contínua de 30 min no iPhone real. Se falhar, avaliar fallback de áudio silencioso em loop.

---

## Regras gerais

- Código de spike é **descartável**. Não precisa ter qualidade de produção.
- Mas o **resultado** deve ser documentado em ADR (`docs/adr/`).
- Áudios e dados gerados nos spikes **não são versionados** (ver `.gitignore`).
- Se um spike passa, registrar os parâmetros finais (modelos, configs, custos) no ADR correspondente.
