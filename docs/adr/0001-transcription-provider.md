# ADR 0001 — Provider de transcrição PT-BR

**Data:** 2026-04-19
**Status:** aceito provisoriamente — reavaliação formal pendente das 5 amostras completas

---

## Contexto

O produto exige transcrição literal de consultas psiquiátricas em PT-BR com WER ≤ 10% (critério inegociável definido no PRD). Adicionalmente, o RNF-02 exige que o processamento de áudio aconteça em território brasileiro (residência de dados). O Spike 1 foi conduzido para validar essa hipótese e selecionar o provider antes de iniciar a Fase 1.

Foram processadas 2 amostras de áudio reais de consultas (123s e 92s), validando WER contra referências manualmente revisadas.

## Decisão

Usar **Google Cloud Speech-to-Text v1**, modelo `latest_long`, em `southamerica-east1`, com **chunking de 50 segundos e overlap de 5 segundos** entre chunks. Diarização de 2 falantes habilitada. Vocabulário psiquiátrico canônico em `speechContexts` com boost 15.

A concatenação dos chunks usa deduplicação por timestamp das palavras (palavras com `startTime` no meio do overlap são atribuídas a apenas um chunk), não por fuzzy text matching.

Implementação consolidada em `spikes/01-transcription/src/transcribe.ts`.

## Alternativas consideradas

- **Speech-to-Text v2 com modelo `long`** — bloqueado: a região `southamerica-east1` não está disponível na API v2 (verificado via `GET /v2/projects/{id}/locations`, retorna 17 regiões, nenhuma no Brasil). Usar v2 exigiria mover processamento para `us-central1` ou `eu`, violando RNF-02.

- **Modelo `chirp_2` (qualidade superior em pt-BR)** — bloqueado pela mesma razão: disponível apenas em `us-central1`, `europe-west4` e similares.

- **Modelo v1 `medical_conversation`** — rejeitado pela API com `INVALID_ARGUMENT: The medical model is currently not supported for language : pt-BR`. Modelo médico do Google só atende inglês.

- **`latest_long` v1 sem chunking (single-file)** — produz bug de degradação silenciosa em arquivos > ~80s: o STT cobre toda a duração temporal, mas a densidade de palavras cai pela metade no segundo terço e a quase zero no último, perdendo conteúdo clínico crítico (prescrições, CID-10). Documentado em `spikes/01-transcription/src/diagnose-truncation.ts`. Causa raiz não identificada; áudio íntegro e diarização não são responsáveis.

- **Outros providers (Deepgram, AssemblyAI, Azure Speech)** — não avaliados neste spike. Backlog para reavaliação caso WER fique estagnado acima do limite após mais amostras.

## Consequências

### Positivas
- **Atende RNF-02:** áudio nunca sai de `southamerica-east1`.
- **Custo previsível e baixo:** ~US$ 0,016/min faturado pelo Google; no spike o total foi US$ 0,061 para 3,8 min de áudio.
- **Contorna o bug do `latest_long`:** chunking de 50s elimina a degradação observada em arquivos longos. Amostra-01 (123s) saiu de 28,6% WER → 9,2% WER após a mudança.
- **Estável e reprodutível:** dois runs consecutivos produzem o mesmo output (sem variação randômica observável).
- **Compatibilidade preservada:** `transcribe()` mantém a mesma assinatura pública, `run-all.ts` continua funcionando sem alterações.

### Negativas
- **Pipeline mais complexo:** chunking adiciona dependência de `ffmpeg` no ambiente, extração temporária de chunks em `os.tmpdir()`, e múltiplas chamadas ao GCS + STT por arquivo.
- **Latência maior:** processamento sequencial de N chunks soma N janelas de longRunningRecognize. Amostra-01 passou de 31s → 54s. Paralelização por chunk é trivial mas ainda não implementada.
- **Custo marginalmente maior:** overlap faz cobrar ~5–10s extras de áudio por arquivo. No spike: +US$ 0,002 em amostra-01.
- **Vocabulário técnico continua frágil:** medicações como `escitalopram`, `clonazepam`, `sertralina` ainda saem foneticamente erradas em fala rápida (ex: `colonizar Pan` no lugar de `clonazepam`). Tentativas de reforçar via `speechContexts` com boost 20 e variações fonéticas não trouxeram ganho mensurável e introduziram regressões pontuais. Hipótese atual: limitação intrínseca do `latest_long` em pt-BR para vocabulário médico. Dado que `medical_conversation` não suporta pt-BR, esse gap só fecha com (a) outro provider, (b) modelo v2 fora do BR + revisão de RNF-02, ou (c) pós-processamento de mapeamento fonético no nosso código.
- **Amostragem do spike é pequena (2 áudios curtos):** apenas amostra-01 passou (9,2%); amostra-02 ficou em 14,6% por causa do problema de vocabulário acima. Critério do PRD exige WER ≤ 10% em pelo menos N de M amostras representativas — N e M precisam ser definidos com mais áudios antes de declarar o spike formalmente aprovado.

### Neutras / a monitorar
- **Bug do `latest_long` é inerente ao modelo, não diagnosticado:** contornamos com chunking, mas se o Google atualizar o modelo ou se arquivos com características diferentes acionarem outra falha, podemos ter surpresas. Vale monitorar densidade de palavras/segundo por chunk em produção como sinal de alerta.
- **Disponibilidade de Speech-to-Text v2 em `southamerica-east1`:** se passar a existir, abre caminho para modelos melhores em pt-BR sem violar RNF-02.
- **Revisão de RNF-02 por LGPD/jurídico:** se aprovado processamento de áudio fora do BR, abre caminho para `chirp_2` em `us-central1` (qualidade comprovadamente superior).
- **Atualização do modelo `latest_long` pelo Google:** se o bug de degradação for corrigido upstream, podemos remover a complexidade de chunking.
- **Reavaliação formal:** esta decisão deve ser revisitada se 3 ou mais novas amostras forem processadas e o WER médio ficar acima de 10%.

## Referências

- PRD v0.2 — RNF-02 (hospedagem obrigatoriamente no Brasil) e critério WER ≤ 10%
- ADR 0007 — Consolidação do stack em Google Cloud (define Speech-to-Text como provider de transcrição)
- Spike 1 — `spikes/01-transcription/` (resultados, scripts de diagnóstico, referências manuais)
- `spikes/01-transcription/src/diagnose-truncation.ts` — evidência do bug de degradação do `latest_long` em arquivos > ~80s
- `spikes/01-transcription/src/diagnose-no-diarization.ts` — descarta diarização como causa do bug
- [Speech-to-Text v2 — locations supported](https://cloud.google.com/speech-to-text/v2/docs/speech-to-text-supported-languages) (verificado em 2026-04-19; `southamerica-east1` ausente)
- [Speech-to-Text v1 — pricing](https://cloud.google.com/speech-to-text/pricing) (modelo Long: US$ 0,016/min)
