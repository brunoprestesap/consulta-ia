# Spike 4 — Chunking de áudio longo para transcrição estável

**Status:** proposto (não executado)
**Fase:** 0 → 1 (follow-up do Spike 1; desbloqueia qualidade em consultas de duração normal)
**Responsável:** dev solo
**Origem:** Passo 8 do Spike 1 (ADR 0011) — descoberta de instabilidade em áudio longo.

> **Este spike é um follow-up do Spike 1, não um quarto desbloqueador original.** O Passo 8 do
> Spike 1 revelou que a transcrição single-call do Gemini **degenera em áudio longo**: na amostra
> de 77 min, o baseline oscilou 24,9%↔63,5% entre execuções e uma variante entrou em **loop de
> repetição** (WER 328%, 37.658 palavras vs 9.974 da referência). Em áudio curto (~10 min) a
> transcrição é estável (variância de apenas 1,8 pp). O gargalo real de qualidade em consultas
> de duração normal (30–60 min) não é o pré-processamento (ADR 0011) — é a **falta de chunking**.

---

## Objetivo

Validar se **fragmentar o áudio longo em janelas transcritas separadamente e depois costuradas**
elimina a degeneração e traz o WER da amostra de 77 min de volta à faixa estável observada em
áudio curto (~21–24%), sem loops de repetição e com custo/latência aceitáveis.

Não é objetivo deste spike atingir WER ≤ 10% em áudio real (o gap de áudio real é discutido no
ADR 0010 e depende de outras frentes). O objetivo é **estabilidade**: fazer o áudio longo se
comportar como o curto.

---

## Critério de sucesso

- Pelo menos uma estratégia de chunking traz o WER de `amostra-real-01` (77 min) para **dentro
  de ~2–3 pp do baseline estável de áudio curto** (~21–24%), de forma **reproduzível** (sem
  variação catastrófica entre execuções).
- **Zero degeneração:** nenhuma execução com loop de repetição (contagem de palavras da
  hipótese dentro de ±15% da referência).
- Custo por consulta dentro da faixa do plano (< R$ 3 / 60 min) e latência compatível com o SLA
  (processamento total ≤ 10 min para 60 min de áudio — favorecida por transcrição paralela dos
  chunks).

## Critério de falha

- Nenhuma estratégia estabiliza o WER, ou todas introduzem tantos erros de fronteira que o WER
  fica pior que o single-call.
- Custo/latência inviáveis (ex.: overlap grande demais multiplicando o custo).

---

## Dimensões de projeto a testar

1. **Tamanho da janela** — janelas menores são mais estáveis, mas geram mais chamadas e mais
   fronteiras. Testar **5 min** e **10 min**.
2. **Overlap entre janelas** — sobreposição (ex.: 10–20 s) evita cortar palavras na fronteira,
   ao custo de precisar **deduplicar** o texto repetido na costura. Testar **sem overlap** vs
   **overlap de ~15 s**.
3. **Método de corte:**
   - **Tempo fixo** (mais simples) — risco de cortar no meio de uma palavra/frase.
   - **Baseado em silêncio** (`ffmpeg silencedetect` / VAD) — corta em pausas naturais, fronteiras
     mais limpas, porém mais complexo. Alvo: janelas de ~5–10 min cortadas na pausa mais próxima.
4. **Costura (stitching):** como concatenar. Sem overlap → concatenação direta (risco de perder/
   duplicar palavras na junta). Com overlap → **dedup** do trecho repetido na costura.

### Variantes propostas

| Variante | Janela | Overlap | Corte | Costura |
|---|---|---|---|---|
| **V1** | 10 min | não | tempo fixo | concat direto |
| **V2** | 5 min | ~15 s | tempo fixo | dedup no overlap |
| **V3** | ~5–10 min | ~15 s | silêncio (silencedetect) | dedup no overlap |

Baseline de comparação: single-call (o que degenerou) e o baseline estável de áudio curto.

---

## Passos

1. **Segmentação** — script que fatia `samples/amostra-real-01.flac` conforme cada variante.
   Para V3, rodar `ffmpeg silencedetect` primeiro e escolher pontos de corte nas pausas mais
   próximas do alvo de janela. Documentar comandos/versão (reprodutibilidade).
2. **Transcrição por chunk** — reusar `transcribeGemini` (Gemini 2.5 Flash, `thinkingBudget: 0`)
   em cada chunk, **áudio cru** (ADR 0011). Rodar chunks em paralelo para medir latência real.
3. **Stitching** — módulo que concatena os chunks; nas variantes com overlap, deduplicar o texto
   sobreposto (ex.: alinhamento das últimas N palavras de um chunk com as primeiras do próximo).
4. **Medição** — `compute-wer.ts` contra `reference/amostra-real-01.txt`. Registrar WER,
   contagem de palavras (detecção de degeneração), custo e latência por variante.
5. **Repetir 2–3×** cada variante vencedora para confirmar **estabilidade** (a lição do Passo 8:
   single-run engana).

### Saída esperada

```
amostra-real-01 (77 min):
  single-call (referência de falha)   WER = 63.5%   palavras = 11688   [instável]
  V1 (10min, sem overlap)             WER = XX.X%   palavras = XXXXX
  V2 (5min, overlap 15s, dedup)       WER = XX.X%   palavras = XXXXX
  V3 (silêncio, overlap 15s, dedup)   WER = XX.X%   palavras = XXXXX
  → estável e mais próximo de ~21-24%: <variante>
```

---

## Implicações para produção (Fase 1)

A estratégia vencedora vira o desenho do job de transcrição no BullMQ:
**split → transcrever chunks em paralelo → stitch → resumo SOAP**. O paralelismo dos chunks
também ajuda o SLA de latência. Reforça a arquitetura de fila já prevista.

---

## Alternativa a considerar (registrar no ADR 0012)

- **Whisper local** já lida com áudio longo via chunking interno de 30 s e teve **melhor WER em
  áudio real** no Spike 1 (16,3% vs 24,9% do Gemini na `amostra-real-01`). Conflita com serverless
  em Cloud Run sem GPU (ADR 0009), mas se o chunking do Gemini não estabilizar, o Whisper (self-
  hosted ou Cloudflare Workers AI, ADR 0009) volta como candidato para áudio longo.

---

## Checklist de conclusão

- [ ] Script de segmentação (tempo fixo + silencedetect) documentado
- [ ] Módulo de stitching com dedup de overlap
- [ ] V1/V2/V3 transcritas e medidas (WER + palavras + custo + latência)
- [ ] Estabilidade confirmada (2–3 execuções da vencedora, sem degeneração)
- [ ] Estratégia vencedora registrada em ADR 0012 (proposto → aceito)
- [ ] Implicação para o job BullMQ da Fase 1 documentada
