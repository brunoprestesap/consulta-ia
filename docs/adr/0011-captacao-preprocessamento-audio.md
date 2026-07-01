# ADR 0011 — Estratégia de captação e pré-processamento de áudio

**Data:** 2026-06-30
**Status:** proposto (validação pendente no Spike 1 — protocolo A/B)

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
- Resultado do protocolo A/B (qual variante minimiza WER em áudio real) — alimenta a decisão
  final de pipeline na Fase 1.
- Impacto de desligar `noiseSuppression`/`autoGainControl` do navegador no WER real.
- Se/quando o app nativo entrar no roadmap, revisar esta decisão com dados de captura nativa.
- Variância de WER entre modelos de smartphone (iOS vs Android, topo vs entrada).

## Referências

- ADR 0010 — Gemini 2.5 Flash como engine de transcrição (origem do gap de 24% em áudio real)
- ADR 0002 — Processamento de áudio clínico real no Spike 1
- Spike 1 — protocolo A/B de pré-processamento (`docs/spikes/spike-01-transcription.md`)
- Spike 3 — Wake Lock no Safari iOS (limitação de captura em background que motiva o nativo)
- [MDN — MediaTrackConstraints: echoCancellation / noiseSuppression / autoGainControl](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)
