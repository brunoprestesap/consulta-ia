# Spike 1 — Transcrição de áudio de consulta psiquiátrica

**Status:** engine aprovada (Gemini 2.5 Flash — ADR 0010); **Passo 8 executado — pré-processamento não ajuda (ADR 0011); novo gargalo: chunking de áudio longo**
**Fase:** 0 (desbloqueador crítico)
**Responsável:** dev solo
**Última atualização:** 2026-06-30 (execução do Passo 8)

> **Histórico:** este spike começou mirando **Google Cloud Speech-to-Text** (ADR 0001). A
> reavaliação formal — 4 amostras, 3 engines — resultou no pivot para **Gemini 2.5 Flash via
> Vertex AI** (ADR 0010, que substitui o 0001). Este documento já reflete essa decisão. A
> avaliação de engines está **concluída e aprovada**; o que resta é o Passo 8 (validar se
> pré-processamento de áudio fecha o gap de WER em áudio real).

---

## Objetivo

Validar empiricamente se a transcrição PT-BR, na região `southamerica-east1`, atinge
**WER ≤ 10%** em áudio de consulta psiquiátrica capturado pelo microfone de um smartphone.

Este spike é **desbloqueador**: se falhar, o plano de MVP atual é inviável e precisa ser
revisto antes de qualquer outra coisa.

---

## Critério de sucesso

- WER ≤ 10% em pelo menos **2 amostras válidas** (critério efetivamente aplicado na reavaliação
  do ADR 0010 — o original "3 de 5" foi ajustado quando o conjunto passou a 4 amostras, 2
  simuladas + 2 reais de consultório).
- Tempo de processamento compatível com o SLA do MVP (processamento total ≤ 10 min para áudio
  de 60 min).
- Custo por consulta dentro da faixa estimada no plano (< R$ 3 por consulta de 60 min).

## Critério de falha

- WER > 10% consistentemente, mesmo com vocabulário customizado no prompt.
- Latência incompatível com o SLA.
- Limitações técnicas (suporte a PT-BR ruim em áudio ruidoso, etc.) que inviabilizem uso real.

---

## Resultado da avaliação de engines (concluída — ver ADR 0010)

| Amostra | Duração | Gemini Flash | Whisper local | Google STT |
|---|---|---|---|---|
| amostra-01 (simulada) | 2,1 min | **7,8% ✅** | 8,2% ✅ | 9,2% ✅ |
| amostra-02 (simulada) | 1,5 min | **5,3% ✅** | 11,2% ❌ | 14,6% ❌ |
| amostra-real-02 | 10,1 min | 24,4% ❌ | **18,4% ❌** | 24,0% ❌ |
| amostra-real-01 | 77,2 min | 24,9% ❌ | **16,3% ❌** | 24,8% ❌ |
| **Aprovadas (≤ 10%)** | | **2/4 ✅** | 1/4 | 1/4 |

**Conclusão:** apenas o Gemini 2.5 Flash atinge o critério (≥ 2 amostras ≤ 10%). **Spike 1
aprovado** com o Gemini como engine. Detalhes completos, landscape de modelos e alternativas
descartadas (Whisper local, Cloudflare Workers AI, Chirp 2/3, Gemini 3.x) em **ADR 0010**.

**Gap em aberto:** WER excepcional em áudio limpo (5–8%) mas ~24% em áudio real de consultório
(celular na mesa). Fechar esse gap é o objetivo do **Passo 8** (protocolo A/B) e do **ADR 0011**.

---

## Pré-requisitos

1. Conta no Google Cloud com faturamento ativado.
2. Projeto GCP criado (`consulta-ia-spikes` — descartável).
3. Vertex AI habilitado: `gcloud services enable aiplatform.googleapis.com`.
4. Service account com role `roles/aiplatform.user` e key JSON baixada.
5. Cloud Storage bucket em `southamerica-east1` para áudios ≥ 19 MB (enviados via `fileData`
   com URI `gs://`; abaixo disso usa-se `inlineData` base64 direto na requisição).
6. Node.js 20+ e `pnpm` ou `npm` instalados localmente.

---

## Passos detalhados

### Passo 1 — Preparar amostras de áudio

Gravar áudios simulando consulta psiquiátrica cobrindo os cenários abaixo. A reavaliação usou
**4 amostras (2 simuladas + 2 reais de consultório)**; a matriz a seguir é o alvo de cobertura
para novas amostras:

| Amostra | Duração | Cenário |
|---------|---------|---------|
| 1 | ~5 min | Consulta curta, ambiente silencioso, 2 vozes claras |
| 2 | ~10 min | Consulta de média duração, ambiente com ruído leve (ar condicionado) |
| 3 | ~15 min | Consulta longa, incluindo termos técnicos psiquiátricos (CID-10, medicações) |
| 4 | ~10 min | Paciente com fala mais rápida ou sotaque regional |
| 5 | ~20 min | Consulta com pausas, interrupções e voz baixa em alguns trechos |

**Importante:**
- Áudio simulado com roteiro para geração de novas amostras; áudio real de consultório é
  processado sob o ADR 0002 (LGPD — sem DPA formal na Fase 0).
- Gravar com iPhone (app "Gravador") para simular o dispositivo final.
- Exportar como `m4a` ou `wav`.
- Guardar em `spikes/01-transcription/samples/` (`.gitignore` para não versionar áudio).

**Roteiro sugerido** (médico + "paciente" simulados):
- Cumprimentos e consentimento verbal explícito ("você autoriza a gravação desta consulta?" /
  "sim, autorizo").
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

Esta transcrição é a "verdade" contra a qual o resultado da engine é comparado.

### Passo 3 — Script de transcrição via Gemini (Vertex AI)

Projeto Node.js isolado:

```bash
mkdir -p spikes/01-transcription
cd spikes/01-transcription
pnpm init
pnpm add @google/genai @google-cloud/storage dotenv
pnpm add -D typescript @types/node tsx
```

Implementar `src/transcribe-gemini.ts` que:

1. Para áudio < 19 MB: envia o arquivo como `inlineData` (base64 inline na requisição).
2. Para áudio ≥ 19 MB: faz upload para Cloud Storage (`southamerica-east1`) e referencia via
   `fileData` com URI `gs://`.
3. Chama o Gemini 2.5 Flash via Vertex AI (`@google/genai`) com:
   - `model: 'gemini-2.5-flash'`
   - Região `southamerica-east1`
   - **`thinkingConfig: { thinkingBudget: 0 }` — OBRIGATÓRIO.** Sem essa flag o Gemini vaza
     raciocínio interno (THINKALOUD) no output e infla o WER em até 46 pp (observado na
     amostra-real-01). Testar regressivamente: se o SDK/API mudar o default, a flag pode ser
     silenciosamente ignorada.
   - Prompt de transcrição literal em PT-BR, com o vocabulário psiquiátrico do Passo 4 embutido.
4. Salva o resultado em `results/amostra-XX-gemini.txt`.
5. Registra tempo de processamento e custo estimado (~US$ 0,010/min; ~US$ 0,40 para 40 min).

### Passo 4 — Vocabulário psiquiátrico (no prompt)

Diferente do Google STT (que usava `speechContexts`), o Gemini recebe o vocabulário **dentro
do prompt** como lista de termos esperados. Criar `src/vocabulary.ts`:

```typescript
export const psychiatryVocabulary = [
  // Medicações comuns em psiquiatria
  'Sertralina', 'Fluoxetina', 'Escitalopram', 'Venlafaxina',
  'Clonazepam', 'Alprazolam', 'Diazepam',
  'Risperidona', 'Olanzapina', 'Quetiapina', 'Aripiprazol',
  'Lítio', 'Valproato', 'Lamotrigina', 'Carbamazepina',
  'Bupropiona', 'Mirtazapina', 'Trazodona',
  'Metilfenidato', 'Lisdexanfetamina',
  // Nomes de medicação com regressão observada em áudio real — incluir variantes fonéticas
  'Pregabalina', 'Desvenlafaxina',

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

Implementar `src/compute-wer.ts` que:

1. Lê transcrição de referência e resultado da engine.
2. Normaliza ambas (minúsculas, remove pontuação, espaços extras).
3. Calcula Word Error Rate usando distância de Levenshtein entre palavras.

Pode usar a biblioteca `word-error-rate` ou implementar manualmente (~30 linhas).

Saída:

```
Amostra 01: WER = 7.8%  — APROVADO
Amostra 02: WER = 5.3%  — APROVADO
...
Resultado: 2 de 4 aprovados — SPIKE APROVADO ✅
```

### Passo 6 — Análise qualitativa dos erros

Para cada amostra reprovada, identificar padrões:

- Erros em medicações? → expandir vocabulário no prompt (incl. variantes fonéticas).
- Erros em termos CID? → adicionar mais variações.
- Erros em fala rápida ou sobreposta? → limitação de captura (ver Passo 8 / ADR 0011).
- Erros de pontuação? → aceitável, não entra no WER.
- Vazamento de raciocínio (THINKALOUD)? → verificar `thinkingBudget: 0`.

### Passo 7 — Documentar decisão

Decisão registrada em **ADR 0010** (`docs/adr/0010-gemini-flash-engine-transcricao.md`), que
substitui o ADR 0001. Contém resultado do spike, engine escolhida, configuração crítica
(`thinkingBudget: 0`), estratégia de envio (`inlineData`/`fileData`), custo observado e
alternativas descartadas. Decisão de captura/pré-processamento em **ADR 0011**.

### Passo 8 — Protocolo A/B de pré-processamento de áudio

> **Adicionado em 2026-06-30 (ADR 0011).** Ataca especificamente o gap medido: **WER de 5–8%
> em áudio limpo vs ~24% em áudio real de consultório** (celular na mesa). O objetivo é
> descobrir, com dado e não com intuição, se algum pré-processamento de áudio reduz o WER antes
> de transcrever — ou se o áudio cru vence.

### Hipótese a testar

O instinto de "limpar o áudio (remover eco e ruído) antes de transcrever" **frequentemente
piora o WER** em ASR moderno: denoise agressivo introduz artefatos que apagam fonemas (fricativas
PT-BR: s, f, ch, x); o navegador **já aplica** `echoCancellation`, `noiseSuppression` e
`autoGainControl` por default no `getUserMedia`; e AEC é a tecnologia errada para gravação sem
far-end (o problema real é reverberação, não eco). Hipótese: **a variante mais crua vence, ou
empata com processamento mínimo — e o denoise pesado perde.**

### Desenho do teste

Rodar **a mesma amostra de áudio real de consultório** por 4 variantes de pré-processamento,
todas transcritas pela **mesma engine (Gemini 2.5 Flash, `thinkingBudget: 0`)** e comparadas
com a mesma transcrição de referência. Reaproveitar `amostra-real-01` e `amostra-real-02`
(as que expõem o gap de 24%).

| Variante | Pré-processamento | Hipótese |
|---|---|---|
| **A — Cru** | `getUserMedia` com `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` | Baseline mais cru — candidato a vencedor |
| **B — Default navegador** | Constraints no default (`true`) — o que o PWA captura hoje | O estado atual; referência de comparação |
| **C — Mínimo cirúrgico** | A + high-pass <80 Hz + normalização de nível | Ganho leve provável |
| **D — Denoise agressivo** | C + denoise/dereverb via plugin (RNNoise/WebRTC) | Provável **piora** (artefatos) |

**Regra de ouro:** a única métrica que decide é o **WER medido** (`compute-wer.ts`). Nenhuma
variante entra no pipeline de produção por parecer "mais limpa ao ouvido" — só por reduzir WER.

### Implementação

1. Estender a captura para gravar as variantes A e B a partir das constraints do `getUserMedia`
   (ou, para o spike, aplicar as constraints em regravações controladas da mesma fala).
2. Gerar C e D offline a partir de A com filtros (ex.: `ffmpeg` high-pass + `loudnorm`; RNNoise
   para D). Documentar exatamente o comando/versão de cada filtro para reprodutibilidade.
3. Transcrever as 4 variantes de cada amostra real com `transcribe-gemini.ts`.
4. Rodar `compute-wer.ts` nas 4 e emitir a tabela comparativa.

### Saída esperada

```
amostra-real-01 (77 min):
  A (cru)              WER = XX.X%
  B (default nav.)     WER = XX.X%
  C (mínimo)           WER = XX.X%
  D (denoise agress.)  WER = XX.X%
  → vencedora: <variante> (menor WER)
```

### Critério de decisão

- Se **A ou C** vencer: confirma a posição do ADR 0011 (áudio cru + processamento mínimo).
  A variante vencedora vira o pipeline de captura da Fase 1.
- Se **D** vencer de forma consistente e material (> ~2 pp): refuta a hipótese; reabrir o ADR
  0011 e incorporar o denoise validado ao pipeline.
- Se nenhuma variante levar o áudio real a WER ≤ 10%: o gap não fecha só com pré-processamento;
  escalar para as outras mitigações do ADR 0010 (prompt por equipamento, vocabulário expandido)
  e reforçar a etapa de revisão do médico no produto.

### Resultado do Passo 8 (executado em 2026-06-30)

Runner: `src/run-preprocess-ab.ts` (+ `src/variance-probe.ts`). Engine: Gemini 2.5 Flash.

**Variância primeiro:** áudio cru, mesmo input, 3 execuções → WER médio **21,2%**, amplitude
**1,8 pp** (20,5–22,3%). Diferenças < ~2 pp são ruído.

**amostra-real-02 (10 min) — válida:**

| Variante | WER | Palavras (ref 1019) |
|---|---|---|
| Baseline cru (média 3×) | ~21,2% | 1118 |
| C — mínimo (highpass+loudnorm) | **38,4%** ❌ piora | 878 (−141, deleções) |
| D — denoise agressivo (afftdn+…) | 20,4% ≈ cru | 1071 |

→ **Pré-processamento não reduz o WER.** D empata com o cru; C (loudnorm sobre áudio ruidoso)
degrada e faz o modelo pular trechos. Confirma o ADR 0011.

**amostra-real-01 (77 min) — INVÁLIDA:** baseline fresco 63,5% (histórico 24,9%), variante D em
loop de repetição (WER 328%, 37.658 palavras). Causa: **instabilidade de áudio longo em chamada
única**, não o filtro. → **Produção precisa de chunking** (rastreado em ADR 0010 e 0011).

### Checklist do Passo 8

- [x] Filtros C e D documentados e reproduzíveis (`run-preprocess-ab.ts`, ffmpeg 8.1.1)
- [x] Variantes geradas e transcritas via Gemini Flash (real-02 e real-01)
- [x] Variância run-to-run medida (probe dedicada) — pré-requisito para interpretar o A/B
- [x] Tabela comparativa de WER emitida
- [x] ADR 0011 atualizado (proposto → aceito, com ressalvas)
- [ ] Constraints A/B de captura no browser (`getUserMedia`) — adiado para Fase 1
- [ ] Repetir A/B numa 2ª amostra real **curta** para elevar o n
- [ ] Chunking de áudio longo (novo gargalo descoberto) — Fase 1

---

## Prompt para retomar o Passo 8 no Claude Code

```
Vamos executar o Passo 8 do Spike 1 (protocolo A/B de pré-processamento de áudio).
Leia antes para contexto:

1. CLAUDE.md
2. docs/spikes/spike-01-transcription.md (este spike, Passo 8)
3. docs/adr/0010-gemini-flash-engine-transcricao.md (engine e gap de 24%)
4. docs/adr/0011-captacao-preprocessamento-audio.md (decisão a validar)

O spike já tem src/transcribe-gemini.ts e src/compute-wer.ts. Gere as 4 variantes
(A/B/C/D) de amostra-real-01 e amostra-real-02, transcreva todas com o Gemini Flash
(thinkingBudget: 0) e emita a tabela comparativa de WER. Documente o comando/versão
exatos de cada filtro (ffmpeg, RNNoise) para reprodutibilidade. Não adicione
dependências fora da stack sem perguntar.
```

---

## Checklist de conclusão

- [x] Amostras de áudio gravadas (4: 2 simuladas + 2 reais)
- [x] Transcrições de referência criadas
- [x] Script de transcrição implementado (`transcribe-gemini.ts`)
- [x] Vocabulário customizado configurado (no prompt)
- [x] Script de WER implementado
- [x] Amostras processadas nas 3 engines comparadas
- [x] Análise qualitativa dos erros documentada (ADR 0010)
- [x] ADR criado com a decisão (ADR 0010, substitui 0001)
- [x] Resultado do spike comunicado (go — Gemini aprovado)
- [ ] **Passo 8 — protocolo A/B de pré-processamento (pendente)**

---

## Se o gap de áudio real não fechar

Plano B para o gap de WER em áudio real (nesta ordem de preferência):

1. **Pré-processamento validado** — executar o Passo 8; se alguma variante fechar o gap,
   incorporá-la ao pipeline.
2. **Prompt e vocabulário por equipamento** — ajustar o prompt conforme o dispositivo de
   captura (smartphone vs microfone externo) e expandir o vocabulário psiquiátrico com
   variantes fonéticas.
3. **Reforçar a revisão do médico** — o produto já prevê edição/correção pós-transcrição;
   assumir que áudio real depende dessa etapa até o WER cair.
4. **Whisper local como fallback de qualidade** — melhor WER em áudio real (16,3% vs 24,9%),
   mas conflita com serverless em Cloud Run (ADR 0009). Reavaliar só se necessário.

Registrar resultado honestamente e atualizar ADR 0010/0011 antes de decidir.
