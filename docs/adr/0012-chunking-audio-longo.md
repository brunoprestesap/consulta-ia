# ADR 0012 — Chunking de áudio longo para transcrição

**Data:** 2026-06-30
**Status:** proposto (validação pendente no Spike 4)

---

## Contexto

O ADR 0010 escolheu o Gemini 2.5 Flash como engine de transcrição, enviando o **arquivo inteiro
em chamada única** ("sem chunking manual" foi listado como vantagem). O Passo 8 do Spike 1
(ADR 0011) mostrou que essa premissa **não se sustenta em áudio longo**:

- `amostra-real-01` (77 min), transcrição single-call: baseline oscilou **24,9% ↔ 63,5%** entre
  execuções e uma variante degenerou em **loop de repetição** (WER 328%, 37.658 palavras vs
  9.974 da referência).
- `amostra-real-02` (10 min): transcrição **estável**, variância de apenas **1,8 pp** em 3
  execuções.

A instabilidade é função da duração: chamada única só é confiável em áudio curto. Consultas reais
duram 30–60 min, então o produto **não pode** depender de transcrição single-call.

## Decisão

**Transcrever áudio longo por chunking**: fatiar o áudio em janelas, transcrever cada janela em
chamada separada (Gemini 2.5 Flash, `thinkingBudget: 0`, áudio cru conforme ADR 0011) e costurar
os resultados. A estratégia concreta (tamanho de janela, overlap, corte por tempo vs silêncio,
dedup na costura) será definida pelo **Spike 4** e este ADR promovido a *aceito* com os parâmetros
vencedores.

Janelas transcritas **em paralelo** — o que também favorece o SLA de latência e se encaixa no job
BullMQ da Fase 1 (split → transcrição paralela dos chunks → stitch → SOAP).

## Alternativas consideradas

- **Manter chamada única** — mais simples, mas **degenera** em áudio longo (loops, WER
  imprevisível). Rejeitada: inviável para consultas de 30–60 min.
- **Chunking com overlap + dedup** (preferida) — janelas sobrepostas evitam cortar palavras na
  fronteira; o overlap é deduplicado na costura. Custo ~igual (preço por duração de áudio),
  latência menor com paralelismo.
- **Chunking sem overlap** — mais simples, mas arrisca perder/duplicar palavras exatamente nas
  fronteiras. Candidata a baseline no Spike 4.
- **Whisper local / Cloudflare Workers AI** — o Whisper faz chunking interno de 30 s e teve
  **melhor WER em áudio real** no Spike 1 (16,3% vs 24,9% do Gemini na `amostra-real-01`).
  Conflita com serverless sem GPU (ADR 0009), mas permanece como **fallback para áudio longo**
  se o chunking do Gemini não estabilizar.

## Consequências

### Positivas
- Remove a degeneração de áudio longo; transcrição volta ao regime estável do áudio curto.
- Paralelismo dos chunks reduz latência total — bom para o SLA (≤ 10 min para 60 min de áudio).
- Encaixa naturalmente no job BullMQ já previsto para a Fase 1.

### Negativas
- **Erros de fronteira:** cortes podem partir palavras/frases; exige overlap + dedup, que
  adicionam complexidade ao stitching.
- Mais chamadas à API e orquestração (fila, retries por chunk) — mais superfície de falha.
- A qualidade de diarização/continuidade entre chunks precisa de atenção (mitigado por o prompt
  atual não identificar falantes).

### Neutras / a monitorar
- Parâmetros finais (janela, overlap, método de corte) — saída do Spike 4.
- Custo real com chunking vs single-call (esperado ~igual; validar overhead).
- Se o chunking do Gemini não estabilizar, reabrir a comparação com Whisper para áudio longo.

## Referências

- ADR 0010 — Gemini 2.5 Flash como engine (premissa de single-call revista)
- ADR 0011 — Captação e pré-processamento (áudio cru; achado da instabilidade)
- ADR 0009 — Whisper local como alternativa (fallback para áudio longo)
- Spike 4 — `docs/spikes/spike-04-chunking-audio-longo.md`
