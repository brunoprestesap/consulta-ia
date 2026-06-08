# ADR 0009 — Whisper local (mlx-whisper) avaliado como alternativa de transcrição

**Data:** 2026-06-07
**Status:** aceito — Google STT permanece o provider primário (ADR 0001 / ADR 0007); Whisper local registrado como alternativa validada e fallback estratégico

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
com os resultados já existentes do Google.

## Decisão

**Manter o Google Cloud Speech-to-Text como provider primário** (coerente com a consolidação
em Google Cloud — ADR 0007 — e com a arquitetura serverless em Cloud Run, sem GPU).

**Registrar o Whisper local (large-v3 / MLX) como alternativa tecnicamente validada e
fallback estratégico**, a ser reconsiderada se: (a) o WER do Google estagnar acima de 10%
em mais amostras, (b) custo de transcrição escalar, ou (c) requisitos de LGPD endurecerem a
ponto de exigir processamento on-premise.

Configuração obrigatória do Whisper para áudio longo: **`--condition-on-previous-text False`**
(ver Consequências). Implementação descartável do spike em
`spikes/01-transcription/src/transcribe-whisper.ts` e `run-whisper.ts`.

## Alternativas consideradas

- **Gemma via Ollama** — inviável. Gemma não é modelo ASR; Ollama não aceita áudio. Descartado.
- **Whisper large-v3 (MLX)** — escolhido para a avaliação. Melhor WER que o Google em todas
  as amostras válidas, custo zero, dados locais.
- **faster-whisper (CTranslate2) com VAD integrado** — não avaliado neste spike. Candidato
  caso se decida adotar Whisper em produção, pela segmentação por VAD (Silero) que tende a
  ser mais robusta que a flag `condition-on-previous-text` para áudio muito longo.
- **whisper.cpp (Core ML/Metal)** — não avaliado; alternativa sem dependência de Python.

## Resultado da avaliação

Whisper large-v3 (MLX), `condition-on-previous-text False`, vocabulário psiquiátrico via
`initial-prompt`:

| Amostra         | WER Whisper | WER Google | Observação                          |
|-----------------|-------------|------------|-------------------------------------|
| amostra-01      | 8,2%        | 9,2%       | ≤ 10%, melhor que Google            |
| amostra-02      | 11,2%       | 14,6%      | acima de 10%, melhor que Google     |
| amostra-real-01 | 16,3%       | 24,8%      | áudio real de 77 min; bem melhor    |
| amostra-real-02 | n/a         | —          | fixture inválido, excluído¹         |

Whisper foi **consistentemente melhor que o Google** nas amostras válidas, a custo zero e
sem enviar áudio para fora. Ainda assim, só a amostra-01 fica ≤ 10% — áudio real (ruído,
sobreposição de falas) é difícil para ambos os motores.

¹ `reference/amostra-real-02.txt` está trocado: é idêntico ao da real-01 (≈9.964 palavras
para 10 min de áudio = ~988 wpm, fisicamente impossível). O áudio `amostra-real-02.m4a` é de
outra consulta. O `run-whisper` detecta o descompasso (> 250 wpm) e exclui a amostra do
veredito. **Pendência:** gerar a referência correta para esse áudio.

## Consequências

### Positivas
- **Alternativa de transcrição validada** com WER melhor que o provider atual em todas as
  amostras comparáveis, a custo marginal zero.
- **Residência de dados máxima:** áudio nunca sai da máquina — opção forte caso a LGPD/jurídico
  endureça requisitos.
- **Independência de billing e de disponibilidade regional de API** (o gargalo de v2/chirp_2
  fora do BR descrito no ADR 0001 deixa de existir).

### Negativas / riscos
- **Conflita com a arquitetura serverless atual:** Cloud Run não tem GPU e o modelo (~3 GB)
  precisa carregar em memória. Adotar Whisper em produção exigiria repensar o runtime de
  processamento (worker com GPU/Apple Silicon, ou CPU com latência maior).
- **Bug de loop em áudio longo:** sem `--condition-on-previous-text False`, o Whisper realimenta
  o próprio texto e entra em loop infinito (`"Não. Não. Não..."`), derrubando o WER da
  amostra-real-01 de **16,3% → 90,4%**. A flag é obrigatória; para áudio muito longo, VAD
  (faster-whisper) seria mais robusto.
- **Vocabulário médico ainda imperfeito** (mesmo limite do Google), mitigado parcialmente pelo
  `initial-prompt` com os termos psiquiátricos.
- **Latência local:** ~7 min de processamento para 77 min de áudio no Apple Silicon de dev;
  varia conforme hardware do worker em produção.

### Neutras / a monitorar
- Decisão atrelada ao ADR 0007 (consolidação Google Cloud). Se a estratégia de provedor único
  for revista, o Whisper local sobe de "fallback" para candidato real a primário.
- Se faster-whisper + VAD for avaliado e superar a robustez da flag, atualizar esta decisão.

## Referências

- ADR 0001 — Provider de transcrição PT-BR (Google STT, decisão primária)
- ADR 0007 — Consolidação do stack em Google Cloud
- Spike 1 — `spikes/01-transcription/` (scripts `transcribe-whisper.ts`, `run-whisper.ts`, README com setup e tabela)
- [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) — Whisper em Apple MLX
- Modelo: `mlx-community/whisper-large-v3-mlx` (Hugging Face)
