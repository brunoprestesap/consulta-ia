# ADR 0001 — Provider de transcrição PT-BR

**Data:** 2026-04-19
**Atualizado:** 2026-06-27
**Status:** substituído por ADR 0010

---

## Contexto

O produto exige transcrição literal de consultas psiquiátricas em PT-BR com WER ≤ 10% (critério inegociável definido no PRD). Adicionalmente, o RNF-02 exige que o processamento de áudio aconteça em território brasileiro (residência de dados). O Spike 1 foi conduzido para validar essa hipótese e selecionar o provider antes de iniciar a Fase 1.

## Decisão original (2026-04-19)

Usar **Google Cloud Speech-to-Text v1**, modelo `latest_long`, em `southamerica-east1`, com **chunking de 50 segundos e overlap de 5 segundos** entre chunks. Diarização de 2 falantes habilitada. Vocabulário psiquiátrico canônico em `speechContexts` com boost 15.

Esta decisão foi aceita provisoriamente enquanto a amostragem do spike era pequena (2 amostras).

## Reavaliação formal (2026-06-27)

Spike 1 concluído com 4 amostras (2 simuladas, 2 reais) e 3 engines avaliados. Resultados finais:

| Amostra | Duração | Google STT | Whisper local | Gemini 2.5 Flash |
|---|---|---|---|---|
| amostra-01 | 2,1 min | 9,2% ✅ | 8,2% ✅ | **7,8% ✅** |
| amostra-02 | 1,5 min | 14,6% ❌ | 11,2% ❌ | **5,3% ✅** |
| amostra-real-02 | 10,1 min | 24,0% ❌ | 18,4% ❌ | 24,4% ❌ |
| amostra-real-01 | 77,2 min | 24,8% ❌ | 16,3% ❌ | 24,9% ❌ |
| **Aprovadas (≤ 10%)** | | **1/4** | **1/4** | **2/4** ✅ |

Critério do spike: ≥ 2 amostras com WER ≤ 10%. Apenas o **Gemini 2.5 Flash** atinge esse critério.

**Google STT v1 não passa no critério formal.** Esta decisão é substituída por ADR 0010.

## Alternativas consideradas e descartadas

- **Speech-to-Text v2 / Chirp 2 / Chirp 3** — bloqueados: `southamerica-east1` não está disponível em nenhum desses modelos (verificado em 2026-06-27; Chirp 3 GA desde out/2025 mas disponível apenas em `us` e `eu` multi-region). Violaria RNF-02.
- **Modelo v1 `medical_conversation`** — rejeitado pela API: não suporta pt-BR.
- **`latest_long` v1 sem chunking** — bug de degradação silenciosa em arquivos > ~80s (documentado em `diagnose-truncation.ts`).
- **Gemini 2.5 Flash** — vencedor da reavaliação. Ver ADR 0010.
- **Whisper local (large-v3 / MLX)** — melhor em áudio real (16,3% vs 24,8% do Google), mas conflita com arquitetura serverless. Ver ADR 0009.

## Referências

- ADR 0010 — Gemini 2.5 Flash como engine de transcrição (decisão substituta)
- ADR 0009 — Whisper local avaliado como alternativa de transcrição
- ADR 0007 — Consolidação do stack em Google Cloud
- Spike 1 — `spikes/01-transcription/` (scripts, resultados, referências manuais)
- `spikes/01-transcription/src/diagnose-truncation.ts` — evidência do bug de degradação
