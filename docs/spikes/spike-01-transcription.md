# Spike 1 — Transcrição de áudio de consulta psiquiátrica

**Status:** pendente de execução
**Fase:** 0 (desbloqueador crítico)
**Responsável:** dev solo
**Duração estimada:** 2-4 dias

---

## Objetivo

Validar empiricamente se **Google Cloud Speech-to-Text**, na região São Paulo, atinge **WER ≤ 10%** em áudio simulado de consulta psiquiátrica em PT-BR.

Este spike é **desbloqueador**: se falhar, o plano de MVP atual é inviável e precisa ser revisto antes de qualquer outra coisa.

---

## Critério de sucesso

- WER médio ≤ 10% em pelo menos **3 de 5** amostras de áudio.
- Tempo de processamento compatível com o SLA do MVP (processamento total ≤ 10 min para áudio de 60 min).
- Custo por consulta dentro da faixa estimada no plano (< R$ 3 por consulta de 60 min).

## Critério de falha

- WER > 10% consistentemente, mesmo com dicionário customizado e modelo `long`.
- Latência incompatível com o SLA.
- Limitações técnicas (suporte a PT-BR ruim em áudio ruidoso, etc.) que inviabilizem uso real.

---

## Pré-requisitos

1. Conta no Google Cloud com faturamento ativado.
2. Projeto GCP criado (sugestão: `consulta-ia-spikes` — descartável).
3. Speech-to-Text API habilitada: `gcloud services enable speech.googleapis.com`.
4. Service account com permissão `roles/speech.client` e key JSON baixada.
5. Cloud Storage bucket em `southamerica-east1` para áudios longos (> 60s exigem GCS).
6. Node.js 20+ e `pnpm` ou `npm` instalados localmente.

---

## Passos detalhados

### Passo 1 — Preparar amostras de áudio

Gravar **5 áudios simulando consulta psiquiátrica** com as seguintes características:

| Amostra | Duração | Cenário |
|---------|---------|---------|
| 1 | ~5 min | Consulta curta, ambiente silencioso, 2 vozes claras |
| 2 | ~10 min | Consulta de média duração, ambiente com ruído leve (ar condicionado) |
| 3 | ~15 min | Consulta longa, incluindo termos técnicos psiquiátricos (CID-10, medicações) |
| 4 | ~10 min | Paciente com fala mais rápida ou sotaque regional |
| 5 | ~20 min | Consulta com pausas, interrupções e voz baixa em alguns trechos |

**Importante:**
- Usar **áudio simulado com roteiro**, não áudio real de paciente (LGPD).
- Gravar com iPhone (app "Gravador") para simular o dispositivo final.
- Exportar como `m4a` ou `wav`.
- Guardar em `spikes/01-transcription/samples/` (adicionar `.gitignore` para não versionar áudio).

**Roteiro sugerido** (para você ou voluntários gravarem simulando médico + "paciente"):
- Cumprimentos e consentimento verbal explícito ("você autoriza a gravação desta consulta?" / "sim, autorizo").
- Queixa principal (ex: insônia, humor deprimido).
- História da moléstia atual.
- Medicações em uso (citar nomes reais: Sertralina, Clonazepam, Fluoxetina, etc.).
- Hipótese diagnóstica mencionando CID (F32.1, F41.1, etc.).
- Conduta (ajuste de dose, encaminhamento).

### Passo 2 — Transcrição manual de referência

Para **cada amostra**, criar uma transcrição de referência 100% correta em arquivo `.txt`:

```
spikes/01-transcription/
├── samples/
│   ├── amostra-01.m4a
│   ├── amostra-02.m4a
│   └── ...
└── reference/
    ├── amostra-01.txt
    ├── amostra-02.txt
    └── ...
```

Esta transcrição é a "verdade" contra a qual o resultado da API vai ser comparado.

### Passo 3 — Script de transcrição via Google STT

Criar projeto Node.js isolado:

```bash
mkdir -p spikes/01-transcription
cd spikes/01-transcription
pnpm init
pnpm add @google-cloud/speech @google-cloud/storage dotenv
pnpm add -D typescript @types/node tsx
```

Implementar um script `transcribe.ts` que:

1. Faz upload do áudio para Cloud Storage (região `southamerica-east1`).
2. Chama a API Speech-to-Text com:
   - `languageCode: 'pt-BR'`
   - `model: 'long'` (otimizado para áudio > 1min)
   - `enableAutomaticPunctuation: true`
   - `enableSpeakerDiarization: true` + `diarizationSpeakerCount: 2`
   - `speechContexts` com vocabulário psiquiátrico customizado (ver Passo 4)
3. Espera o long-running operation terminar.
4. Salva o resultado em `results/amostra-XX-google.txt`.
5. Registra tempo de processamento e custo estimado.

### Passo 4 — Dicionário de vocabulário psiquiátrico

Criar `vocabulary.ts` com termos que melhoram reconhecimento:

```typescript
export const psychiatryVocabulary = [
  // Medicações comuns em psiquiatria
  'Sertralina', 'Fluoxetina', 'Escitalopram', 'Venlafaxina',
  'Clonazepam', 'Alprazolam', 'Diazepam',
  'Risperidona', 'Olanzapina', 'Quetiapina', 'Aripiprazol',
  'Lítio', 'Valproato', 'Lamotrigina', 'Carbamazepina',
  'Bupropiona', 'Mirtazapina', 'Trazodona',
  'Metilfenidato', 'Lisdexanfetamina',

  // CID-10 categorias F (transtornos mentais)
  'F32', 'F33', 'F41', 'F43', 'F20', 'F31', 'F42',
  'episódio depressivo', 'transtorno depressivo recorrente',
  'transtorno de ansiedade', 'transtorno bipolar',
  'esquizofrenia', 'transtorno obsessivo compulsivo',
  'transtorno de estresse pós-traumático',

  // Termos psiquiátricos frequentes
  'ideação suicida', 'auto-lesão', 'hetero-lesão',
  'anedonia', 'disforia', 'hipomania', 'mania',
  'psicomotricidade', 'ideação', 'delirante',
  'alucinação auditiva', 'alucinação visual',
  'insight', 'juízo crítico', 'afeto embotado',
  'humor deprimido', 'humor eutímico',

  // Escalas e exames
  'escala de Hamilton', 'Beck', 'PHQ-9', 'GAD-7',
  'exame do estado mental', 'EEM',

  // Termos clínicos gerais
  'anamnese', 'prontuário', 'posologia',
  'comorbidade', 'efeito colateral', 'adesão ao tratamento',
];
```

### Passo 5 — Script de medição de WER

Implementar `compute-wer.ts` que:

1. Lê transcrição de referência e resultado da API.
2. Normaliza ambas (minúsculas, remove pontuação, espaços extras).
3. Calcula Word Error Rate usando distância de Levenshtein entre palavras.

Pode usar a biblioteca `word-error-rate` ou implementar manualmente (~30 linhas).

Saída:

```
Amostra 01: WER = 7.2%  (85 palavras, 6 erros) — APROVADO
Amostra 02: WER = 11.5% (142 palavras, 16 erros) — REPROVADO
Amostra 03: WER = 9.8%  (198 palavras, 19 erros) — APROVADO
Amostra 04: WER = 13.1% (120 palavras, 16 erros) — REPROVADO
Amostra 05: WER = 8.4%  (267 palavras, 22 erros) — APROVADO

Resultado: 3 de 5 aprovados — SPIKE APROVADO ✅
WER médio: 10.0%
```

### Passo 6 — Análise qualitativa dos erros

Para cada amostra reprovada, identificar padrões:

- Erros em medicações? → aumentar dicionário.
- Erros em termos CID? → adicionar mais variações.
- Erros em fala rápida ou sobreposta? → limitação do modelo (avaliar Whisper como comparação).
- Erros de pontuação? → aceitável, não entra no WER.

### Passo 7 — Documentar decisão

Criar ADR em `docs/adr/0001-transcription-provider.md` registrando:
- Resultado do spike (WER médio, amostras aprovadas).
- Decisão: prosseguir com Google STT ou avaliar alternativa.
- Custo observado por minuto de áudio.
- Configurações finais recomendadas (model, vocabulary, etc.).

---

## Prompt para iniciar no Claude Code

Copiar e colar este bloco no Claude Code para começar o spike:

```
Estamos iniciando o Spike 1 do projeto Consulta IA. Antes de começar,
leia os seguintes arquivos para contexto completo:

1. CLAUDE.md (contexto operacional)
2. docs/spikes/spike-01-transcription.md (este spike)
3. docs/product/04-development-plan.md seção 5.1 (Fase 0)

Depois, crie a estrutura inicial do spike em `spikes/01-transcription/` com:

- package.json com dependências: @google-cloud/speech, @google-cloud/storage, dotenv, typescript, tsx, @types/node
- tsconfig.json mínimo
- .env.example com variáveis necessárias (GOOGLE_APPLICATION_CREDENTIALS, GCS_BUCKET, GCP_PROJECT_ID)
- .gitignore (node_modules, .env, samples/, results/, credentials/)
- src/transcribe.ts — script que lê áudio local, faz upload para GCS e transcreve via Speech-to-Text long-running
- src/vocabulary.ts — lista de termos psiquiátricos (já especificada no spike)
- src/compute-wer.ts — calcula WER entre referência e resultado
- src/run-all.ts — roda transcribe + compute-wer em todas as amostras e imprime tabela de resultados
- README.md explicando como usar

Use APENAS a stack oficial definida em CLAUDE.md. Não adicione dependências
extras sem me perguntar antes. Código em TypeScript, sem comentários
redundantes. Se algo no spike estiver ambíguo, pergunte antes de assumir.
```

---

## Checklist de conclusão

- [ ] 5 amostras de áudio gravadas e salvas
- [ ] 5 transcrições de referência criadas
- [ ] Script de transcrição implementado e testado
- [ ] Vocabulário customizado configurado
- [ ] Script de WER implementado
- [ ] Todas as 5 amostras processadas
- [ ] Análise qualitativa dos erros documentada
- [ ] ADR 0001 criado com a decisão
- [ ] Resultado do spike comunicado (go / no-go)

---

## Se o spike falhar

Plano B (nesta ordem de preferência):

1. **Ajustar parâmetros** — testar modelo `chirp_2` do Google (mais moderno), mais termos no vocabulário, áudio com menos ruído.
2. **Comparar com Whisper self-hosted** em cloud Brasil — adiciona semanas ao cronograma mas pode atingir qualidade superior em PT-BR.
3. **Reconsiderar a hipótese do MVP** — talvez o produto precise ser "gravação + resumo manual" em vez de "transcrição + resumo automático", o que invalida o MVP atual.

Registrar resultado honestamente em ADR 0001 e discutir antes de decidir.
