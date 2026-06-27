# ADR 0003 — LLM primário para geração de resumo SOAP psiquiátrico

**Data:** 2026-06-27
**Status:** proposto — Spike 2 formal pendente; preview validado neste ADR

---

## Contexto

O produto exige, além da transcrição literal (ADR 0010), a geração automática de um resumo
estruturado no formato SOAP psiquiátrico com as seções: **S** (Subjetivo/Histórico),
**O** (Objetivo/EEM — Exame do Estado Mental), **A** (Avaliação/CID-10), **M** (Medicações)
e **P** (Plano/Conduta).

O Spike 2 está formalmente pendente. Porém, durante a conclusão do Spike 1, executou-se um
teste de SOAP com a transcrição da `amostra-real-02` (consulta real de ~10 min sobre gestão
de medicação psiquiátrica) para validar a viabilidade do fluxo antes de iniciar o spike
formal. O teste usou `spikes/01-transcription/src/soap.ts` e o resultado foi salvo em
`spikes/01-transcription/results/amostra-real-02-whisper-soap.md`.

## Decisão proposta

Usar **Gemini 2.5 Flash via Vertex AI**, região `southamerica-east1`, como LLM primário para
geração do resumo SOAP. Se Gemini 2.5 Pro passar a estar disponível em `southamerica-east1`,
promovê-lo a primário e manter o Flash como fallback mais barato.

**Justificativa para adiantar a decisão do Spike 2:**
1. O Gemini já é o engine de transcrição (ADR 0010): stack unificada, sem nova dependência.
2. O preview de SOAP executado em 2026-06-27 produziu resultado clinicamente coerente em
   **5,2 segundos** para uma consulta de 10 min, com fidelidade ao conteúdo da transcrição.
3. Gemini 2.5 Flash suporta o contexto de transcrição completa de consultas longas (1M tokens).
4. `southamerica-east1` mantém residência de dados (RNF-02).

**Configuração:** `thinkingConfig: { thinkingBudget: 0 }` obrigatório (mesma razão do ADR 0010
— evita vazamento de THINKALOUD no output clínico).

## Preview do resultado (2026-06-27)

Entrada: transcrição Whisper da `amostra-real-02` (consulta sobre pregabalina e desvenlafaxina).
Modelo: `gemini-2.5-flash`. Latência: 5,2s.

**O que o modelo acertou:**
- Identificou corretamente medicações (Pregabalina, Desvenlafaxina/`desvi`), avaliação de
  melhora em 7/10, tentativa de suspensão por 3 dias, contexto de trabalho no São Camilo.
- Usou "Não mencionado na consulta" corretamente para o EEM (ausente na transcrição).
- Separou S/O/A/M/P com fidelidade — não inventou informações.

**Limitações observadas (herança do WER 18,4% do Whisper):**
- `"insatina"` carregado literalmente da transcrição errada (deveria ser Pregabalina).
- `"desvi"` reconhecido mas não normalizado para Desvenlafaxina.
- Nomes de pacientes (ex: "Joane") aparecem no SOAP — em produção, scrubbing de PII deve
  ocorrer antes de persistir ou exibir o resumo.

**Conclusão do preview:** resultado é **clinicamente útil com pequenos ajustes manuais** —
critério de sucesso esperado pelo Spike 2.

## Alternativas a avaliar no Spike 2 formal

- **Maritaca Sabiá 4** — conforme CLAUDE.md, deve ser avaliado comparativamente. Modelo
  brasileiro, PT-BR nativo, possivelmente com vocabulário médico mais robusto. Sem API em
  `southamerica-east1`; verificar residência de dados e compliance antes de usar.
- **Gemini 2.5 Pro** — qualidade superior, mas indisponível em `southamerica-east1` atualmente.
  Monitorar disponibilidade; se chegar à região, incluir no Spike 2.
- **Claude Bedrock (anthropic.claude-3-5-sonnet)** — mencionado no PRD como fallback.
  Exigiria conta AWS + avaliação de residência de dados (verificar região São Paulo no AWS).

## Prompt estrutural (versão do preview)

```
S — Subjetivo (Histórico)
O — Objetivo (Exame do Estado Mental — EEM)
A — Avaliação
M — Medicações
P — Plano / Conduta
```

Seção M (Medicações) foi adicionada como extensão do SOAP clássico por relevância clínica
em psiquiatria (medicações são o principal objeto de decisão na consulta de seguimento).

Instrução central do prompt: `"Seja fiel ao que foi dito — não invente informações que não
estão na transcrição. Se um campo não puder ser preenchido, escreva 'Não mencionado na
consulta'."` — crítica para evitar alucinações clínicas.

## Consequências

### Positivas
- **Latência aceitável:** 5s para 10 min de consulta (Flash); esperado ~15–20s para 60 min.
- **Sem nova dependência:** Gemini já está na stack para transcrição.
- **Resultado clinicamente coerente** no preview, mesmo com WER de 18% na entrada.
- **Custo marginal:** ~US$ 0,004–0,010/consulta para o SOAP (tokens de texto são mais baratos
  que tokens de áudio).

### Negativas / riscos
- **Alucinações clínicas** são o risco principal: o LLM pode inferir informações não ditas.
  O prompt deve ser revisado iterativamente com psiquiatras reais no Spike 2.
- **PII e LGPD:** nomes de pacientes, medicações e diagnósticos transitam pelo LLM. O Gemini
  via Vertex AI em `southamerica-east1` atende residência, mas verificar os termos de DPA do
  Google Cloud para dados de saúde (HIPAA BAA disponível no Google Cloud; verificar LGPD).
- **Qualidade dependente da transcrição:** erros de WER (ex: `insatina`) aparecem verbatim no
  SOAP se o modelo não normalizar. Explorar pós-processamento de vocabulário antes do SOAP.

### A validar no Spike 2 formal
- Comparação Gemini Flash vs Maritaca Sabiá 4 com as mesmas transcrições.
- Avaliação por pelo menos 1 psiquiatra da utilidade clínica do resumo gerado.
- Definição do critério de aceite: ex. "≥ 4/5 seções úteis sem inventar informações" julgado
  pelo médico.
- Latência para áudio de 60–90 min (caso de consulta de primeira vez).
- Estratégia de scrubbing de PII no output antes de persistir no banco.

## Referências

- ADR 0010 — Gemini 2.5 Flash como engine de transcrição (stack compartilhada)
- ADR 0007 — Consolidação do stack em Google Cloud
- `spikes/01-transcription/src/soap.ts` — script de preview do SOAP
- `spikes/01-transcription/results/amostra-real-02-whisper-soap.md` — output do preview
- PRD v0.2 — seção "Resumo SOAP psiquiátrico" (seções obrigatórias e critérios de qualidade)
