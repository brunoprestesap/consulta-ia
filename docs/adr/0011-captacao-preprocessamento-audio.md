# ADR 0011 — Estratégia de captação e pré-processamento de áudio

**Data:** 2026-06-30
**Status:** aceito — validação inicial no Spike 1 (Passo 8) confirma a direção (1 amostra real
válida; ver ressalvas na seção de resultados)

> **Nota de numeração:** o `README.md` reservava informalmente 0004–0008 para outros
> temas (Wake Lock, fila, App Router, storage, consolidação). Este ADR usa o próximo
> número livre e não reservado, **0011**, para evitar colisão.

---

## Contexto

O produto é um SaaS onde o próprio médico grava a consulta com o paciente para transcrição
(Gemini 2.5 Flash — ADR 0010) e geração de resumo SOAP. Duas forças definem a estratégia de
captação:

1. **Restrição de negócio:** exigir que o médico compre um microfone externo (speakerphone,
   lapela) adiciona atrito de compra além da assinatura, custo, e carga de suporte ("meu
   microfone não conecta"). Para o MVP, o dispositivo de captura precisa ser o que o médico
   **já tem**: o microfone do próprio celular.

2. **Dado empírico do Spike 1 (ADR 0010):** o Gemini atinge WER de 5–8% em áudio limpo, mas
   **regride para ~24% em áudio real de consultório** capturado por microfone de smartphone
   sobre a mesa (ruído ambiente, ventilação, reverberação, falas sobrepostas). Fechar esse gap
   é o problema central de qualidade do produto.

O instinto natural para fechar o gap — e a mitigação otimista listada no próprio ADR 0010
("filtro de ruído RNNoise/WebRTC antes da transcrição") — é **aplicar remoção de eco e ruído
antes de transcrever**. Este ADR examina essa premissa e a substitui por uma posição validada
empiricamente, porque para ASR moderno o pré-processamento agressivo **frequentemente piora o
WER** em vez de melhorá-lo.

### Por que "limpar o áudio" pode piorar a transcrição

- Engines como Gemini e Whisper foram treinadas em áudio real e ruidoso e possuem front-end
  próprio de robustez a ruído — melhor que plugins genéricos. Áudio "limpo demais" fica fora
  da distribuição de treino.
- Denoise agressivo introduz artefatos (*musical noise*, buracos espectrais) que apagam
  fonemas, especialmente as fricativas de PT-BR (s, f, ch, x, ç) — justamente as mais frágeis
  para ASR.
- **AEC (cancelamento de eco acústico) é a tecnologia errada para este caso.** AEC cancela o
  som de um alto-falante reproduzindo o *far-end* de uma chamada. Numa consulta gravada não há
  far-end tocando; não há eco acústico a cancelar. O que existe é **reverberação de sala**, cujo
  tratamento correto é *dereverberação* — tecnologia distinta e mais delicada.
- **O navegador já processa o áudio por padrão.** `getUserMedia` aplica `echoCancellation`,
  `noiseSuppression` e `autoGainControl` com default `true`. O áudio do PWA hoje **já vem
  processado**. A pergunta real não é "adiciono mais processamento?", e sim "**desligo o
  processamento do navegador para entregar áudio mais cru à IA?**".

## Decisão

1. **Sem dependência de hardware no MVP.** O microfone do dispositivo do médico é o baseline
   oficial de captura. Nenhum microfone externo é requisito para usar o produto.

2. **O pré-processamento de áudio não é assumido como benéfico.** Nenhuma etapa de denoise,
   AEC ou dereverberação entra no pipeline de produção sem ter reduzido o WER de forma medida
   em teste A/B na mesma engine (protocolo no Spike 1). A posição default é entregar à IA o
   áudio **o mais cru possível**, controlando explicitamente as constraints do `getUserMedia`
   em vez de aceitar os defaults.

3. **Processamento permitido é mínimo e cirúrgico** — no máximo um *high-pass filter* para
   ronco de baixa frequência (<80 Hz) e normalização de nível — e mesmo esse só entra se o
   A/B comprovar ganho.

4. **Prioridade de esforço na qualidade de captura, não na limpeza posterior**, nesta ordem
   de impacto real no WER:
   1. Proximidade e nível (celular perto do médico e paciente, voz forte).
   2. Captura sem perda dupla (bitrate alto/lossless; evitar recompressão de codec).
   3. Processamento leve validado por A/B.
   4. Denoise/dereverb pesado — apenas se o A/B provar ganho (hipótese: **não vai provar**).

5. **App nativo fica como direção de roadmap pós-MVP**, não como solução agora. O nativo
   agrega controle de sample rate, acesso a áudio cru sem processamento do Safari, e gravação
   em background confiável (relacionado à limitação que motiva o Spike 3 de Wake Lock). Fora
   do escopo do MVP (que é PWA), mas registrado como o caminho para elevar o teto de qualidade
   de captura quando o gap de áudio real justificar o investimento.

## Alternativas consideradas

- **Exigir microfone externo (speakerphone USB / lapela)** — melhor SNR na fonte, mas cria
  barreira de compra sobre a assinatura, custo, e suporte de hardware. Agrava-se no Brasil:
  marcas de referência em speakerphone compacto (Anker) não têm distribuição oficial no país
  (só importação cinza, sem garantia nacional). **Rejeitada** para o MVP; pode virar
  recomendação opcional ("para melhor qualidade, use…"), nunca requisito.

- **Denoise/AEC agressivo antes da transcrição (default "limpar sempre")** — intuitivo, mas
  alto risco de piorar o WER por artefatos e por tirar o áudio da distribuição de treino da
  engine. **Rejeitada como default**; só entra por evidência A/B.

- **Áudio cru + processamento mínimo validado por A/B** (escolhida) — entrega à engine o
  áudio mais próximo do cru; qualquer processamento precisa provar redução de WER.

- **Migrar já para app nativo** — resolveria controle de captura, mas é reescrita fora do MVP
  e não testada. **Adiada** para roadmap.

## Resultado da validação (Passo 8 — 2026-06-30)

Protocolo A/B offline executado (`spikes/01-transcription/src/run-preprocess-ab.ts`), engine
Gemini 2.5 Flash. Comparou-se, na mesma engine e referência, o áudio **como capturado** contra
**C (high-pass 80 Hz + loudnorm)** e **D (afftdn + high-pass + loudnorm)**.

**Descoberta metodológica primeiro:** o Gemini é não-determinístico. Uma probe de variância
(mesmo áudio cru, 3 execuções) mediu **21,2% de WER médio, amplitude 1,8 pp** (20,5–22,3%).
Diferenças menores que ~2 pp são ruído, não sinal. Isso invalidou a comparação inicial contra
um baseline reusado de execução antiga (que marcava 24,4%, no topo/fora da faixa real).

**Amostra real-02 (10 min) — válida:**

| Variante | WER | Palavras (ref 1019) | Leitura |
|---|---|---|---|
| Baseline cru (média de 3) | **~21,2%** (20,5–22,3) | 1118 | referência real |
| C — mínimo (hp+loudnorm) | **38,4%** | 878 (−141) | **piora clara** — sub-transcrição/deleções |
| D — denoise agressivo | **20,4%** | 1071 | dentro da variância do cru → **sem ganho real** |

Interpretação: **pré-processamento não melhorou o WER.** O denoise pesado (D) empatou com o
áudio cru; o processamento "leve" (C) — `loudnorm` sobre áudio não-denoised, que amplifica ruído
nas pausas — **degradou** e fez o modelo pular trechos. Confirma a decisão: entregar áudio cru,
não adicionar limpeza sem prova de WER.

**Amostra real-01 (77 min) — INVÁLIDA para o A/B:** baseline fresco deu 63,5% (histórico:
24,9%) e a variante D degenerou em **loop de repetição** (37.658 palavras vs 9.974 da
referência; WER 328%). A causa não é o filtro: é **instabilidade da transcrição de áudio longo
em chamada única do Gemini**. Este é um achado separado e relevante (ver "A monitorar").

**Ressalvas:** a validação positiva vem de **uma única amostra real curta**. A direção é
consistente e refuta a alternativa "limpar sempre", mas não é n suficiente para tratar denoise
como universalmente inútil — apenas como **sem benefício demonstrado** e com risco real (C).
As variantes A/B de captura (constraints do `getUserMedia`) seguem não validadas (exigem
experimento no browser, Fase 1).

Custo total da execução: ~US$ 2,8 (Gemini via Vertex AI).

## Consequências

### Positivas
- Zero atrito de hardware: o produto funciona com o celular que o médico já tem.
- Evita a armadilha comum de "limpar o áudio" e degradar silenciosamente o WER.
- Direciona o esforço de engenharia para onde o retorno é maior (captura), não para plugins
  de limpeza de retorno duvidoso.
- Decisões de pipeline passam a ser guiadas por WER medido, não por intuição.

### Negativas
- O gap de WER em áudio real (24%) **não é resolvido por este ADR** — ele define *como*
  atacá-lo (A/B), não garante que feche. Se nenhuma variante fechar o gap, o produto depende
  mais fortemente da etapa de revisão/correção do médico (já prevista) e/ou reabre a discussão
  de captura (nativo, microfone opcional).
- Controlar constraints do `getUserMedia` e testar variantes adiciona trabalho ao Spike 1.
- Depender do microfone do dispositivo significa qualidade heterogênea entre modelos de
  celular — variância que precisa ser monitorada em produção.

### Neutras / a monitorar
- **Instabilidade de áudio longo (achado do Passo 8):** transcrição single-call de 77 min no
  Gemini degenerou (baseline 24,9%→63,5% entre execuções; variante D em loop de repetição,
  WER 328%). Produção precisará de **chunking** para consultas longas. Rastreado também no
  ADR 0010. Isto, e não o pré-processamento, é o próximo gargalo de qualidade a atacar.
- Repetir o A/B numa segunda amostra real **curta** para elevar o n (a de 77 min não serve
  enquanto o chunking não existir).
- Impacto de desligar `noiseSuppression`/`autoGainControl` do navegador no WER real.
- Se/quando o app nativo entrar no roadmap, revisar esta decisão com dados de captura nativa.
- Variância de WER entre modelos de smartphone (iOS vs Android, topo vs entrada).

## Referências

- ADR 0010 — Gemini 2.5 Flash como engine de transcrição (origem do gap de 24% em áudio real)
- ADR 0002 — Processamento de áudio clínico real no Spike 1
- Spike 1 — protocolo A/B de pré-processamento (`docs/spikes/spike-01-transcription.md`)
- Spike 3 — Wake Lock no Safari iOS (limitação de captura em background que motiva o nativo)
- [MDN — MediaTrackConstraints: echoCancellation / noiseSuppression / autoGainControl](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)
