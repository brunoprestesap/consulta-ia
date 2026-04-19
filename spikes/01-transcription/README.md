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

## Próximos passos

Ao concluir o spike, registrar a decisão em `docs/adr/0001-transcription-provider.md` conforme passo 7 da especificação.
