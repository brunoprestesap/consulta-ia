# ADR 0010 — Gemini 2.5 Flash como engine de transcrição PT-BR

**Data:** 2026-06-27
**Status:** aceito — substitui ADR 0001

---

## Contexto

ADR 0001 escolheu Google Cloud Speech-to-Text v1 (`latest_long`) como provider de transcrição,
mas com amostragem pequena (2 amostras) e status provisório. A reavaliação formal do Spike 1
foi conduzida com 4 amostras (2 simuladas, 2 reais de consultório) e 3 engines comparados:
Google STT v1, Whisper local (large-v3/MLX) e Gemini 2.5 Flash via Vertex AI.

Durante a avaliação, verificou-se que os modelos Chirp 2 e Chirp 3 **não estão disponíveis
em `southamerica-east1`** (verificado em 2026-06-27; ambos restringem-se a regiões `us` e
`eu`), de modo que a única opção Google STT viável no Brasil permanece o `latest_long` v1.

O Gemini 2.5 Flash — já presente na stack definida para o SOAP (Spike 2) — foi avaliado como
transcritor usando a API de áudio nativa (`inlineData`/`fileData`) via `@google/genai`.

## Resultados do Spike 1 (reavaliação completa)

| Amostra | Duração | Gemini Flash | Whisper local | Google STT |
|---|---|---|---|---|
| amostra-01 (simulada) | 2,1 min | **7,8% ✅** | 8,2% ✅ | 9,2% ✅ |
| amostra-02 (simulada) | 1,5 min | **5,3% ✅** | 11,2% ❌ | 14,6% ❌ |
| amostra-real-02 | 10,1 min | 24,4% ❌ | **18,4% ❌** | 24,0% ❌ |
| amostra-real-01 | 77,2 min | 24,9% ❌ | **16,3% ❌** | 24,8% ❌ |
| **Aprovadas (≤ 10%)** | | **2/4 ✅** | 1/4 | 1/4 |

Critério do spike: ≥ 2 amostras válidas com WER ≤ 10%. **Apenas o Gemini 2.5 Flash atinge
esse critério.** Spike 1 formalmente aprovado com o Gemini como engine principal.

## Decisão

Usar **Gemini 2.5 Flash via Vertex AI**, região `southamerica-east1`, como engine de transcrição
PT-BR em produção.

**Configuração crítica:** `thinkingConfig: { thinkingBudget: 0 }` é **obrigatória** em toda
chamada de transcrição. Sem ela, o Gemini vaza raciocínio interno (THINKALOUD) no output,
inflando o WER em até 46 pontos percentuais (observado na amostra-real-01 antes da correção).

**Estratégia de envio:**
- Arquivos < 19 MB: `inlineData` (base64 inline na requisição)
- Arquivos ≥ 19 MB: upload para GCS + `fileData` com URI `gs://`

**Custo estimado:** ~US$ 0,010/min de áudio (estimativa conservadora cobrindo tokens de
entrada e saída). Para áudio médio de consultório de 40 min: ~US$ 0,40/consulta.

Implementação do spike em `spikes/01-transcription/src/transcribe-gemini.ts` (descartável).
A implementação de produção será desenvolvida na Fase 1 como Route Handler + BullMQ job.

## Alternativas descartadas

- **Google STT v1 `latest_long`** — 1/4 amostras passa WER ≤ 10%; vocabulário médico frágil
  (ex: `clonazepam` → `colonizar Pan`); bug de degradação em arquivos > 80s contornado por
  chunking mas com complexidade adicional. Descartado como primário; pode ser mantido como
  fallback de emergência.

- **Google STT v2 / Chirp 2 / Chirp 3** — bloqueados por ausência de `southamerica-east1`.
  Chirp 3 (GA out/2025) ainda restrito a regiões `us`/`eu`. Violaria RNF-02 de residência
  de dados no Brasil. Monitorar disponibilidade futura.

- **Whisper local (large-v3/MLX)** — melhor WER em áudio real (16,3% vs 24,9% do Gemini em
  amostra-real-01), mas conflita com arquitetura serverless em Cloud Run (sem GPU). Ver ADR 0009.

- **Gemini 2.5 Pro** — testado; retorna 404 em `southamerica-east1` (não disponível na região).
  Usar Flash enquanto Pro não chegar à região São Paulo.

## Análise do gap em áudio real (WER 24%)

O Gemini atinge WER excepcional em áudio limpo (5–8%), mas regride para ~24% em áudio real
de consultório. Hipóteses:

1. **Ruído ambiente e sobreposição de falas** — microfone de smartphone em mesa, ventilação,
   falas simultâneas de paciente e médico.
2. **Vocabulário psiquiátrico** — medicações com nomes atípicos em PT-BR (`pregabalina`,
   `desvenlafaxina`) ainda geram erros, mesmo com vocabulário no prompt.
3. **Prompt genérico de "literalidade"** — o modelo pode normalizar fala espontânea
   (contrações, truncamentos) de forma diferente da referência manual.

**Mitigações a explorar na Fase 1:**
- Pré-processamento de áudio: filtro de ruído (RNNoise/WebRTC) antes da transcrição.
- Prompt específico por equipamento de captura (microfone lapela vs smartphone).
- Fine-tuning do vocabulário psiquiátrico no prompt (expandir lista de medicações com variantes
  fonéticas comuns).

## Consequências

### Positivas
- **Spike 1 aprovado:** critério WER ≤ 10% em ≥ 2 amostras atendido (7,8% e 5,3%).
- **Stack unificada:** Gemini já está na stack para SOAP (Spike 2); usar o mesmo SDK
  (`@google/genai`) e a mesma região reduz dependências operacionais.
- **Sem chunking manual:** Gemini aceita o arquivo de áudio inteiro; a complexidade de
  fragmentação/overlap do Google STT desaparece.
- **Custo competitivo:** ~US$ 0,010/min vs US$ 0,016/min do Google STT.
- **Residência de dados:** `southamerica-east1` atende RNF-02.

### Negativas
- **WER em áudio real ainda acima de 10%** (24%): o produto em produção precisará de uma
  etapa de revisão/correção pelo médico, e métricas de qualidade devem ser monitoradas com
  áudio de consultório real.
- **`thinkingBudget: 0` é frágil:** se o SDK ou a API mudar o default, a flag pode ser
  silenciosamente ignorada, reintroduzindo o vazamento de THINKALOUD. Testar regressivamente.
- **Gemini 2.5 Pro indisponível na região:** sem opção de upgrade de qualidade dentro de
  `southamerica-east1` por enquanto.
- **Dependência de Vertex AI:** adiciona `aiplatform.googleapis.com` ao conjunto de APIs
  habilitadas e exige a IAM role `roles/aiplatform.user` para a service account.

### A monitorar
- Disponibilidade de Chirp 3 (ou modelo equivalente) em `southamerica-east1`.
- Disponibilidade de Gemini 2.5 Pro em `southamerica-east1`.
- WER em áudio real com pré-processamento de ruído (validar se o gap de 24% fecha).
- Custo real em produção (estimativa baseada em tokens de áudio do pricing público).

## Referências

- ADR 0001 — Provider de transcrição PT-BR (histórico, substituído por este ADR)
- ADR 0009 — Whisper local avaliado como alternativa (fallback estratégico)
- ADR 0007 — Consolidação do stack em Google Cloud
- Spike 1 — `spikes/01-transcription/src/transcribe-gemini.ts`, `run-gemini.ts`
- [Gemini API — Audio understanding](https://ai.google.dev/gemini-api/docs/audio) (entrada nativa de áudio)
- [Vertex AI — Gemini models](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models)
- [Cloud Speech-to-Text — Regional endpoints](https://cloud.google.com/speech-to-text/docs/endpoints) (Chirp 2/3 ausentes em `southamerica-east1`)
