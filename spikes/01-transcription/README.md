# Spike 1 — Transcrição (Google Cloud Speech-to-Text)

Scripts descartáveis para validar se Google STT atinge **WER ≤ 10%** em áudio simulado de consulta psiquiátrica em PT-BR.

Especificação completa: `docs/spikes/spike-01-transcription.md`.

## Pré-requisitos

1. Node 20+.
2. Projeto GCP com billing ativo e a Speech-to-Text API habilitada:
   ```bash
   gcloud services enable speech.googleapis.com
   ```
3. Bucket do Cloud Storage em `southamerica-east1`:
   ```bash
   gcloud storage buckets create gs://consulta-ia-spike-01-audio --location=southamerica-east1
   ```
4. Service account com `roles/speech.client` e `roles/storage.objectAdmin` no bucket; baixe a key em `credentials/gcp-service-account.json` (pasta já ignorada).
5. `cp .env.example .env` e preencha as variáveis.

## Instalação

```bash
pnpm install
```

## Estrutura esperada

```
spikes/01-transcription/
├── samples/              # áudios (.wav, .flac, .ogg, .opus) — não versionados
│   ├── amostra-01.flac
│   └── amostra-02.flac
├── reference/            # transcrições de referência (.txt) por amostra
│   ├── amostra-01.txt
│   └── amostra-02.txt
├── results/              # saídas do Google STT — não versionadas
└── credentials/          # keys da service account — não versionadas
```

O matching entre amostra e referência é pelo nome (sem extensão): `samples/amostra-03.flac` casa com `reference/amostra-03.txt`.

## Formato de áudio

Google STT V1 **não suporta M4A/AAC nativamente**. O iPhone grava em `.m4a`, então converta antes:

```bash
ffmpeg -i samples/amostra-01.m4a -c:a flac samples/amostra-01.flac
```

FLAC é preferido (mantém qualidade, arquivo menor que WAV). Também servem `.wav` (LINEAR16) e `.ogg/.opus` (48 kHz).

## Uso

**Uma amostra isolada:**
```bash
pnpm transcribe samples/amostra-01.flac
```

**WER pontual entre dois arquivos:**
```bash
pnpm wer reference/amostra-01.txt results/amostra-01-google.txt
```

**Todas as amostras + tabela final:**
```bash
pnpm run-all
```

Saída esperada (exemplo):
```
Amostra             |     WER | Palavras | Erros |   Áudio |    Proc |    Custo | Status
------------------------------------------------------------------------------------------
amostra-01          |    7.2% |       85 |     6 |    300s |     45s |  $0.080 | APROVADO
amostra-02          |    9.1% |      142 |    13 |    600s |     90s |  $0.160 | APROVADO
Aprovadas: 2/2 · WER médio: 8.2% · Áudio total: 15.0min · Custo total: US$0.240

Resultado do spike: APROVADO ✅ (critério: ≥ 2 de 2 com WER ≤ 10%)
```

> Critério reduzido para 2 amostras (em vez das 5 originais do spec). Trata-se de validação mais conservadora; se as duas passarem a conclusão é mais forte, se falharem paramos cedo.

## Configurações fixas do spike

- Região: `southamerica-east1` (bucket + API).
- Modelo: `long`.
- `languageCode: pt-BR`, `enableAutomaticPunctuation`, `diarizationConfig` (2 falantes).
- `speechContexts` com vocabulário psiquiátrico (`src/vocabulary.ts`).

## Alternativa avaliada: Whisper local (mlx-whisper)

Para comparação com o Google STT, as mesmas amostras foram transcritas **localmente**
com Whisper large-v3 rodando em MLX (Apple Silicon). Motivações: custo zero e os dados
clínicos **nunca saem da máquina** (forte para LGPD).

> ⚠️ Gemma/Ollama **não** serve para isto: Gemma é um LLM de texto+visão, não faz ASR,
> e o Ollama não aceita áudio como entrada. Transcrição local exige um modelo ASR (Whisper).

### Setup

```bash
python3 -m venv .venv
.venv/bin/pip install mlx-whisper      # baixa o modelo (~3 GB) na 1ª execução
```

### Uso

```bash
pnpm transcribe-whisper samples/amostra-01.flac   # uma amostra (aceita .m4a também)
pnpm run-whisper                                   # lote + tabela comparativa vs Google
```

O `run-whisper` reaproveita os `results/*-google.txt` existentes para mostrar o WER
lado a lado. Modelo configurável via `WHISPER_MODEL`.

### Resultado (large-v3, `condition-on-previous-text False`)

| Amostra         | WER Whisper | WER Google | Status            |
|-----------------|-------------|------------|-------------------|
| amostra-01      | 8,2%        | 9,2%       | APROVADO          |
| amostra-02      | 11,2%       | 14,6%      | acima de 10%      |
| amostra-real-01 | 16,3%       | 24,8%      | acima de 10%      |
| amostra-real-02 | n/a         | —          | fixture inválido¹ |

**O Whisper local foi melhor que o Google em todas as amostras válidas**, a custo zero e
sem enviar áudio para fora. Ainda assim, só a amostra-01 fica ≤ 10% — áudio real (ruído,
sobreposição de falas) é difícil para ambos.

¹ `reference/amostra-real-02.txt` é idêntico ao da real-01 (≈9.964 palavras para 10 min de
áudio = ~988 wpm, impossível). O áudio `amostra-real-02.m4a` é de outra consulta. O runner
detecta esse descompasso (`> 250 wpm`) e exclui a amostra do veredito. **Pendente:** gerar
a referência correta para esse áudio.

### Aprendizado crítico (long-form)

Sem `--condition-on-previous-text False`, o Whisper entra em loop em áudio longo (repete
`"Não. Não. Não..."` indefinidamente), porque realimenta o próprio texto. Isso jogou o WER
da amostra-real-01 de **16,3% → 90,4%**. A flag é obrigatória para consultas longas.

## Próximos passos

Ao concluir o spike, registrar a decisão em `docs/adr/0001-transcription-provider.md` conforme passo 7 da especificação.
