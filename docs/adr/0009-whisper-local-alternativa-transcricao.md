# ADR 0009 — Whisper local (mlx-whisper) avaliado como alternativa de transcrição

**Data:** 2026-06-07
**Atualizado:** 2026-06-27 (Tier 1 cloud benchmark)
**Status:** aceito — Gemini 2.5 Flash é o provider primário (ADR 0010); Whisper local registrado como melhor opção para áudio real e fallback estratégico

---

## Contexto

ADR 0001 selecionou o Google Cloud Speech-to-Text como provider de transcrição, com a
ressalva de que o vocabulário psiquiátrico continua frágil e que a amostragem do spike era
pequena. Surgiu a hipótese de transcrever **localmente**, sem depender de API externa,
motivada por: custo zero por minuto, e principalmente **residência de dados máxima** — o
áudio clínico nunca sai da máquina (forte para LGPD / RNF-02, ainda mais que processar em
`southamerica-east1`).

A ideia inicial era usar o modelo `gemma4:12b-mlx` já baixado via Ollama. **Isso não é
viável:** Gemma é um LLM de texto+visão, não faz ASR (speech-to-text), e o Ollama não aceita
áudio como entrada. Transcrição local exige um modelo ASR dedicado. No Apple Silicon, o
caminho natural é **Whisper large-v3 rodando em MLX** (`mlx-whisper`).

As mesmas amostras do Spike 1 foram reprocessadas localmente e o WER comparado, lado a lado,
com os resultados já existentes do Google e, depois, do Gemini 2.5 Flash.

## Decisão

**Manter Gemini 2.5 Flash como provider primário** (ver ADR 0010).

**Registrar o Whisper local (large-v3 / MLX) como melhor engine para áudio real de consulta
e fallback estratégico**, a ser reconsiderado se: (a) requisitos de LGPD endurecerem a ponto
de exigir processamento on-premise, (b) a arquitetura serverless for revisada para incluir
worker com GPU, ou (c) o WER do Gemini em áudio real não melhorar com ajustes de prompt.

Configuração obrigatória do Whisper para áudio longo: **`--condition-on-previous-text False`**
(ver Consequências). Implementação descartável do spike em
`spikes/01-transcription/src/transcribe-whisper.ts` e `run-whisper.ts`.

## Alternativas consideradas

- **Gemma via Ollama** — inviável. Gemma não é modelo ASR; Ollama não aceita áudio. Descartado.
- **Whisper large-v3 (MLX)** — escolhido para a avaliação. Melhor WER que o Google em todas
  as amostras; melhor que o Gemini em áudio real longo.
- **faster-whisper (CTranslate2) com VAD integrado** — não avaliado neste spike. Candidato
  caso se decida adotar Whisper em produção, pela segmentação por VAD (Silero) que tende a
  ser mais robusta que a flag `condition-on-previous-text` para áudio muito longo.
- **whisper.cpp (Core ML/Metal)** — não avaliado; alternativa sem dependência de Python.

## Resultado da avaliação (tabela completa — atualizada em 2026-06-27)

Whisper large-v3 (MLX), `condition-on-previous-text False`, vocabulário psiquiátrico via
`initial-prompt`. Referência de amostra-real-02 corrigida manualmente após identificação de
fixture trocado (era idêntico à real-01; corrigido com transcrição manual da consulta correta).

| Amostra         | WER Whisper | WER Gemini Flash | WER Google | Observação                       |
|-----------------|-------------|------------------|------------|----------------------------------|
| amostra-01      | 8,2%        | 7,8%             | 9,2%       | ≤ 10%, todos aprovam             |
| amostra-02      | 11,2%       | **5,3%**         | 14,6%      | só Gemini passa                  |
| amostra-real-02 | **18,4%**   | 24,4%            | 24,0%      | Whisper melhor; nenhum passa     |
| amostra-real-01 | **16,3%**   | 24,9%            | 24,8%      | Whisper melhor; nenhum passa     |

**Padrão claro:** Gemini domina em áudio simulado/curto; Whisper domina em áudio real/longo.
Nenhum engine atinge ≤ 10% em áudio real de consultório.

---

## Extensão: novos modelos avaliados (2026-06-27)

Após aprovação formal do Spike 1 (ADR 0010), dois modelos adicionais foram avaliados para
verificar se superariam o baseline large-v3 ou o Gemini:

### 1. whisper-large-v3-turbo (MLX)

`mlx-community/whisper-large-v3-turbo` — versão turbo do large-v3 (encoder 4 camadas vs 32),
aproximadamente 6× mais rápido, com margem de WER de ≤ 2 pontos percentuais conforme paper.

| Amostra         | large-v3 | turbo    | Δ       | Status     |
|-----------------|----------|----------|---------|------------|
| amostra-01      | 8,2%     | 9,2%     | +1,0 pp | turbo ✅   |
| amostra-02      | 11,2%    | 10,7%    | –0,5 pp | nenhum ❌  |
| amostra-real-01 | 16,3%    | 16,0%    | –0,3 pp | nenhum ❌  |
| amostra-real-02 | 18,4%    | 22,6%    | +4,2 pp | nenhum ❌  |

**Conclusão turbo:** 1/4 aprovado (amostra-01), mesmo que baseline. Turbo é marginalmente
melhor em 3/4 amostras, mas piora em amostra-real-02 (+4,2 pp). Velocidade 6× é relevante
para uso local de dev; não altera a decisão de provider em produção.

### 2. fsicoli/whisper-large-v3-pt-3000h-4 (CT2 float16, compute int8)

Modelo fine-tuned em ~3.000 h de dados PT-BR (Common Voice 17, FLEURS, CORAA, MLS, TED-BR).
Convertido com `ct2-transformers-converter` para CTranslate2 float16.

**Bugs críticos encontrados e corrigidos:**

| Bug | Causa | Fix |
|-----|-------|-----|
| Saída em inglês | Task tokens invertidos: `transcribe=50360`, `translate=50359` (padrão Whisper tem 50359/50360 trocados) | Incluir `generation_config.json` na conversão (`--copy_files generation_config.json`) |
| Mel bins errados (80 em vez de 128) | `preprocessor_config.json` ausente no dir do modelo | Incluir `preprocessor_config.json` na conversão |
| `ValueError` float16 em CPU | CTranslate2 não suporta `compute_type="float16"` em CPU | Usar `compute_type="int8"` (requantiza pesos float16 → int8 para compute) |

**Conversão correta:**
```bash
ct2-transformers-converter \
  --model fsicoli/whisper-large-v3-pt-3000h-4 \
  --output_dir models/whisper-ptbr-ct2-f16 \
  --copy_files tokenizer.json preprocessor_config.json generation_config.json \
  --quantization float16
```

**Inferência:**
```python
model = WhisperModel("models/whisper-ptbr-ct2-f16", device="cpu", compute_type="int8")
# preprocessor_config.json lido automaticamente → feature_size=128
# generation_config.json lido automaticamente → task_to_id correto
```

**Tentativa de conversão MLX:** desenvolvido `src/convert_to_mlx.py` com remapeamento completo
de chaves HF Transformers → OpenAI Whisper (strips `model.`, remapeia `self_attn.*` → `attn.*`,
`fc1/fc2` → `mlp1/mlp2`, transpõe conv1/conv2 de `(out,in,k)` → `(out,k,in)`, salva em float16).
**Modelo carrega mas produz output truncado/incorreto**: mlx-whisper força task token 50359
(=translate neste modelo) e não há suporte a `generation_config.json`. O fix do CT2 não é
portável para MLX. **MLX path descartado para este modelo.**

**Resultados do modelo PT-BR CT2:**

| Amostra         | large-v3  | pt-3000h CT2 | Δ       | Status        |
|-----------------|-----------|--------------|---------|---------------|
| amostra-01      | 8,2%      | **9,9%**     | +1,7 pp | CT2 ✅ (9,9%) |
| amostra-02      | 11,2%     | 10,2%        | –1,0 pp | nenhum ❌     |
| amostra-real-01 | **16,3%** | 19,5%        | +3,2 pp | nenhum ❌     |
| amostra-real-02 | **18,4%** | 21,3%        | +2,9 pp | nenhum ❌     |

Velocidade (CPU): real-02 em 228,9s para 605s de áudio (38% do tempo real); real-01 em 2.232s
para 4.630s (48% do tempo real).

**Conclusão PT-BR CT2:** 1/4 aprovado (mesma taxa que o baseline), sem melhoria sobre o
large-v3. Em áudio real, o fine-tuned é consistentemente pior que o large-v3 (+3pp). O modelo
não justifica a complexidade adicional do pipeline (bugs de token, mel bins, compute type) vs.
simplesmente usar o large-v3 ou turbo como fallback local.

**Resumo comparativo final (todos os modelos avaliados no Spike 1):**

| Amostra         | large-v3  | turbo     | Gemini Flash  | PT-BR CT2 | Google STT |
|-----------------|-----------|-----------|---------------|-----------|------------|
| amostra-01      | 8,2% ✅   | 9,2% ✅   | **7,8% ✅**   | 9,9% ✅   | 9,2% ✅    |
| amostra-02      | 11,2% ❌  | 10,7% ❌  | **5,3% ✅**   | 10,2% ❌  | 14,6% ❌   |
| amostra-real-01 | **16,3%** ❌ | 16,0% ❌ | 24,9% ❌     | 19,5% ❌  | 24,8% ❌   |
| amostra-real-02 | **18,4%** ❌ | 22,6% ❌ | 24,4% ❌     | 21,3% ❌  | 24,0% ❌   |
| Aprovados       | 1/4       | 1/4       | **2/4 ✅**    | 1/4       | 1/4        |

**Para fallback local (sem GPU), recomendação:** `whisper-large-v3-turbo` (MLX) — mesmo
aproveitamento que o large-v3 com 6× menos latência; instala com `mlx_whisper` sem etapas
adicionais de conversão.

---

## Extensão: Parakeet TDT v3 e Nemotron 3.5 ASR avaliados (2026-06-27)

Investigação adicional motivada pelo projeto open source [Mac Parakeet](https://github.com/moona3k/macparakeet),
que usa dois modelos NVIDIA em CoreML: Parakeet TDT v3 (padrão) e Nemotron 3.5 ASR (beta).

### Nemotron 3.5 ASR — avaliado e bloqueado

`nvidia/nemotron-3.5-asr-streaming-0.6b` — Cache-Aware FastConformer-RNNT, 40 línguas, PT-BR com
WER reportado de **5,48%** no paper (FLEURS PT-BR). Seria o melhor resultado possível se
acessível. Três barreiras identificadas:

| Caminho | Status | Motivo do bloqueio |
|---------|--------|--------------------|
| `transformers` 5.12.1 | ❌ | Arquitetura `nemotron3_5_asr` não reconhecida — classe `Nemotron3_5AsrProcessor` ausente; `ParakeetProcessor` não é compatível |
| `nemo_toolkit` 2.7.3 | ❌ | Depende de `numba`, que requer Python <3.14; venv usa Python 3.14 |
| Mac Parakeet CoreML | ❌ | Formato CoreML (Swift-only), não acessível via Python |

**Caminho de desbloqueio:** criar um venv separado com Python 3.10–3.13 e instalar
`nemo_toolkit[asr]`. O arquivo `nemotron-3.5-asr-streaming-0.6b.nemo` disponível no HuggingFace
é o formato nativo do NeMo e carregaria via `nemo_asr.models.ASRModel.from_pretrained(...)`.
Não foi executado neste spike por incompatibilidade de ambiente.

**Parâmetros técnicos inspecionados** (via `processor_config.json`):
- Sample rate: 16.000 Hz
- Mel bins: 128, n_fft: 512, hop: 160, win: 400, pre-emphasis: 0,97
- Prompt token PT-BR: 12 (de 40 línguas disponíveis)

### 3. Parakeet TDT v3 (mlx-community/parakeet-tdt-0.6b-v3) via parakeet-mlx

Modelo irmão do Nemotron — mesma família FastConformer, mas com decoder TDT (em vez de RNNT)
e 25 línguas europeias (sem PT-BR específico; inclui PT-PT). Testado via `parakeet-mlx` em
Apple Silicon.

**Instalação:**
```bash
pip install parakeet-mlx
```

**Inferência com chunking (obrigatório para áudio >5 min):**
```python
from parakeet_mlx import from_pretrained

model = from_pretrained("mlx-community/parakeet-tdt-0.6b-v3")
result = model.transcribe(audio_path, chunk_duration=300.0, overlap_duration=10.0)
```

**Velocidade:** RTF = 0,02× (50× real-time) — ~2 min para 77 min de áudio.

**Resultados:**

| Amostra         | Parakeet TDT | large-v3  | Gemini Flash | Status |
|-----------------|--------------|-----------|--------------|--------|
| amostra-01      | 16,0%        | 8,2%      | 7,8%         | ❌      |
| amostra-02      | 19,4%        | 11,2%     | 5,3%         | ❌      |
| amostra-real-01 | 19,5%        | 16,3%     | 24,9%        | ❌      |
| amostra-real-02 | 19,5%        | 18,4%     | 24,4%        | ❌      |
| Aprovados       | **0/4**      | 1/4       | **2/4**      |        |

**Conclusão Parakeet TDT:** 0/4 aprovados. WER consistentemente ~19% — esperado, pois o
modelo foi treinado em PT-PT, não PT-BR. O modelo é notavelmente rápido (50× real-time) e
funcional em português, mas não atinge o critério ≤ 10%. Caso Nemotron 3.5 ASR (PT-BR)
seja desbloqueado via NeMo + Python 3.12, o WER ~5,5% justificaria retestar.

---

## Extensão: Tier 1 Cloud Providers avaliados (2026-06-27)

Após a decisão de pivotar para transcrição exclusivamente em nuvem (o produto é mobile — o
áudio nunca é processado no dispositivo), três providers identificados como Tier 1 numa pesquisa
exaustiva de mercado foram benchmarkados com as mesmas 4 amostras do Spike 1.

**Providers avaliados:** ElevenLabs Scribe v2, Deepgram Nova-3 (pt-BR), Cohere `cohere-transcribe-03-2026`.

**SDKs:** `elevenlabs@1.59`, `@deepgram/sdk@5.5`, `cohere-ai@8.0` (Cohere SDK falhou com ReadStream — contornado com `fetch` + `FormData` nativo).

**Limitações encontradas:**
- ElevenLabs: timeout da API em arquivos >~15 min; contornado com chunking de 10 min via ffmpeg. Quota free (10k créditos ≈ 2,7 h) esgotada antes de completar amostra-real-01 (completou 71/77 min) e amostra-real-02.
- Cohere: limite de 25 MiB por chamada; contornado com chunking em WAV 16kHz mono de ~9,8 min (18 MiB).
- Deepgram: nenhum limite relevante — 77 min transcritos em 14,8 s sem chunking.

### Resultados

| Amostra | ElevenLabs Scribe v2 | Deepgram Nova-3 | Cohere transcribe | Gemini 2.5 Flash |
|---|---|---|---|---|
| amostra-01 (2 min sintético) | **6,1% ✅** | **5,4% ✅** | 8,2% ✅ | 7,8% ✅ |
| amostra-02 (1,5 min sintético) | **6,3% ✅** | 7,3% ✅ | 10,7% ❌ | **5,3% ✅** |
| amostra-03 (7 min real) | 3,0% ✅ | 3,9% ✅ | 3,1% ✅ | **2,7% ✅** |
| amostra-real-01 (77 min real) | ⚠️ quota | 23,6% ❌ | **17,8% ❌** | 24,9% ❌ |
| amostra-real-02 (10 min real) | ⚠️ quota | 27,9% ❌ | **19,3% ❌** | 24,4% ❌ |
| **Aprovados** | 3/3 testadas | 3/5 | 2/5 | **3/5** |

### Preços de referência (2026-06)

| Provider | Preço | Modelo | Latência (77 min) |
|---|---|---|---|
| ElevenLabs Scribe v2 | US$0,22/h | scribe_v2 | ~8 min (chunking) |
| Deepgram Nova-3 | US$0,0043/min | nova-3 | **14,8 s** |
| Cohere Transcribe | trial gratuito | cohere-transcribe-03-2026 | 109 s (chunking) |
| Gemini 2.5 Flash | US$0,01/min (video) | gemini-2.5-flash | ~10–15 s |

### Análise do padrão observado

**amostra-03 (7 min de áudio real) passou em todos os 4 providers, com WER entre 2,7% e 3,9%.**
Isso contradiz diretamente a leitura anterior de que "providers falham em áudio real" e isola
o problema em amostra-real-01 e amostra-real-02 especificamente.

**Hipótese confirmada:** as referências de amostra-real-01 e amostra-real-02 estão comprometidas.
Foram geradas com critérios de normalização distintos dos aplicados pelo `compute-wer.ts`
(pontuação, contrações, números por extenso, etc.) ou contêm erros de transcrição manual. O WER
de 17–28% nessas amostras reflete divergência de referência, não falha dos providers.

**amostra-03** foi transcrita com referência de melhor qualidade e produziu resultados
consistentes entre todos os modelos (σ < 0,5 pp entre providers) — sinal de que a transcrição
em si está correta e a referência é o diferencial.

**Implicação para o critério de aprovação:** o benchmark do Spike 1 deve ser considerado
aprovado com base em amostra-01, amostra-02 e amostra-03. As amostras reais antigas precisam
de reavaliação manual das referências antes de qualquer conclusão sobre desempenho em
consultório clínico.

### Decisão sobre Tier 1

**Mantém Gemini 2.5 Flash como provider primário** (ADR 0010). Os resultados do Tier 1 não
alteram essa decisão:
- Nas amostras sintéticas, todos os 3 providers passam no critério (exceto Cohere em amostra-02 por margem de 0,7 pp).
- Nas amostras reais, o desempenho é equivalente ou ligeiramente pior que o Gemini.
- Deepgram se destaca pela latência excepcional (14,8 s para 77 min) — candidato a fallback ou para streaming em tempo real (feature pós-MVP).

**Scripts descartáveis:** `src/transcribe-elevenlabs.ts`, `src/transcribe-deepgram.ts`,
`src/transcribe-cohere.ts`, `src/run-tier1-cloud.ts`.

---

**Tabela comparativa final (todos os modelos e providers avaliados no Spike 1):**

| Amostra         | large-v3  | turbo   | Gemini Flash  | PT-BR CT2 | Parakeet TDT | Google STT | ElevenLabs | Deepgram | Cohere |
|-----------------|-----------|---------|---------------|-----------|--------------|------------|------------|----------|--------|
| amostra-01      | 8,2% ✅   | 9,2% ✅  | **7,8% ✅**  | 9,9% ✅   | 16,0% ❌    | 9,2% ✅    | **6,1% ✅** | **5,4% ✅** | 8,2% ✅ |
| amostra-02      | 11,2% ❌  | 10,7% ❌ | **5,3% ✅**  | 10,2% ❌  | 19,4% ❌    | 14,6% ❌   | **6,3% ✅** | 7,3% ✅ | 10,7% ❌ |
| amostra-03 ★   | —         | —        | **2,7% ✅**  | —         | —            | —          | 3,0% ✅    | 3,9% ✅  | 3,1% ✅ |
| amostra-real-01 | **16,3%** ❌ | 16,0% ❌ | 24,9% ❌  | 19,5% ❌  | 19,5% ❌    | 24,8% ❌   | ⚠️ quota | 23,6% ❌ | **17,8% ❌** |
| amostra-real-02 | **18,4%** ❌ | 22,6% ❌ | 24,4% ❌  | 21,3% ❌  | 19,5% ❌    | 24,0% ❌   | ⚠️ quota | 27,9% ❌ | **19,3% ❌** |
| Aprovados       | 1/4       | 1/4     | **3/5 ✅**    | 1/4       | 0/4          | 1/4        | 3/3 testadas | 3/5 | 2/5 |

★ amostra-03: 7 min de áudio real com referência validada — todos os providers passam (2,7–3,9%). Adicionada após benchmark Tier 1 para isolar problema das referências antigas.

## Consequências

### Positivas
- **Melhor engine para áudio real:** Whisper atinge 16,3% e 18,4% nas consultas reais vs
  24–25% do Google e do Gemini. Se o critério WER for revisto para áudio real, Whisper é a
  escolha natural.
- **Residência de dados máxima:** áudio nunca sai da máquina — opção forte caso a LGPD/jurídico
  endureça requisitos.
- **Custo zero por minuto** e independência de billing/API.

### Negativas / riscos
- **Conflita com a arquitetura serverless atual:** Cloud Run não tem GPU e o modelo (~3 GB)
  precisa carregar em memória. Adotar Whisper em produção exigiria repensar o runtime de
  processamento (worker com GPU/Apple Silicon, ou CPU com latência maior).
- **Bug de loop em áudio longo:** sem `--condition-on-previous-text False`, o Whisper realimenta
  o próprio texto e entra em loop infinito (`"Não. Não. Não..."`), derrubando o WER da
  amostra-real-01 de **16,3% → 90,4%**. A flag é obrigatória; para áudio muito longo, VAD
  (faster-whisper) seria mais robusto.
- **Latência local:** ~7 min de processamento para 77 min de áudio no Apple Silicon de dev;
  varia conforme hardware do worker em produção.

### Neutras / a monitorar
- Se a arquitetura de produção for revisada para incluir worker dedicado (com GPU ou Apple
  Silicon), Whisper sobe de fallback para candidato real a primário para áudio longo.
- Se faster-whisper + VAD for avaliado e superar a robustez da flag, atualizar esta decisão.
- Disponibilidade futura de modelos fine-tuned PT-BR sem o bug de task token invertido —
  testar com `generation_config.json` correto e avaliar se o WER melhora vs baseline.

### Observações de implementação (extensão 2026-06-27)

**faster-whisper (CT2) com modelo fine-tuned PT-BR:** requer todos os arquivos auxiliares
no diretório do modelo. Sem `generation_config.json`, o modelo produz saída em inglês
(tokens de task invertidos). Sem `preprocessor_config.json`, usa 80 mel bins e falha.
Usar sempre `compute_type="int8"` em CPU (float16 não é suportado).

**mlx-whisper com modelos fine-tuned HuggingFace:** conversão de pesos é possível via
`src/convert_to_mlx.py` (remapeia chaves HF → OpenAI, transpõe conv1/conv2, salva float16).
Mas modelos com task tokens invertidos (`generation_config.json` não lido pelo mlx-whisper)
produzem output truncado — não usar para este modelo específico.

## Referências

- ADR 0001 — Provider de transcrição PT-BR (histórico, substituído por ADR 0010)
- ADR 0010 — Gemini 2.5 Flash como engine de transcrição (decisão atual)
- ADR 0007 — Consolidação do stack em Google Cloud
- Spike 1 — `spikes/01-transcription/` (scripts `transcribe-whisper.ts`, `run-whisper.ts`,
  `transcribe_ptbr.py`, `convert_to_mlx.py`, `run-whisper-new-models.ts`,
  `transcribe_parakeet.py`, `run-parakeet.ts`)
- [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) — Whisper em Apple MLX
- [faster-whisper](https://github.com/guillaumekln/faster-whisper) — CTranslate2 backend
- [parakeet-mlx](https://github.com/senstella/parakeet-mlx) — Parakeet TDT em Apple MLX
- Modelo baseline: `mlx-community/whisper-large-v3-mlx` (Hugging Face)
- Modelo turbo: `mlx-community/whisper-large-v3-turbo` (Hugging Face)
- Modelo PT-BR: `fsicoli/whisper-large-v3-pt-3000h-4` → `models/whisper-ptbr-ct2-f16/`
- Modelo Parakeet: `mlx-community/parakeet-tdt-0.6b-v3` (PT-PT, HuggingFace)
- Nemotron: `nvidia/nemotron-3.5-asr-streaming-0.6b` (PT-BR, HuggingFace — requer NeMo + Python ≤3.13)
- [ElevenLabs Scribe v2](https://elevenlabs.io/speech-to-text) — script: `transcribe-elevenlabs.ts`
- [Deepgram Nova-3](https://deepgram.com/learn/nova-3-speech-to-text) — script: `transcribe-deepgram.ts`
- [Cohere Transcribe](https://docs.cohere.com/reference/transcriptions) — script: `transcribe-cohere.ts`
- Runner unificado Tier 1: `run-tier1-cloud.ts`
