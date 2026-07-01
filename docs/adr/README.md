# Architecture Decision Records (ADRs)

Este diretório contém o registro de decisões arquiteturais importantes do projeto.

## Por que ADRs?

- Dev solo tem alto risco de esquecer o "porquê" de decisões depois de alguns meses.
- Se o projeto crescer e novos devs entrarem, ADRs são a forma mais eficiente de transmitir contexto.
- Obriga a pensar nos trade-offs antes de decidir.

## Formato

Cada decisão vira um arquivo `NNNN-titulo-em-kebab-case.md`, numerado sequencialmente.

Template mínimo em [`_template.md`](./_template.md).

## Quando criar um ADR

- Toda vez que escolher entre duas ou mais alternativas técnicas com trade-offs reais.
- Toda vez que um spike da Fase 0 for concluído.
- Toda vez que uma decisão de arquitetura (banco, fila, modelo de dados) for tomada.
- NÃO criar ADR para decisões triviais (ex: escolha de lib de utilitário menor).

## ADRs existentes

| # | Título | Status |
|---|--------|--------|
| [0001](0001-transcription-provider.md) | Provider de transcrição PT-BR | substituído por 0010 |
| [0002](0002-audio-clinico-real-spike1.md) | Processamento de áudio clínico real no Spike 1 sem DPA formal | aceito |
| [0003](0003-llm-resumo-soap.md) | LLM primário para geração de resumo SOAP psiquiátrico | proposto (preview validado; Spike 2 formal pendente) |
| [0009](0009-whisper-local-alternativa-transcricao.md) | Whisper local (mlx-whisper) avaliado como alternativa de transcrição | aceito |
| [0010](0010-gemini-flash-engine-transcricao.md) | Gemini 2.5 Flash como engine de transcrição PT-BR | aceito |
| [0011](0011-captacao-preprocessamento-audio.md) | Captação (mic do device) e pré-processamento de áudio validado por WER | proposto (A/B pendente no Spike 1) |

## ADRs pendentes (para criar quando implementados)

- [ ] 0004 — Estratégia de Wake Lock no Safari iOS (resultado do Spike 3)
- [ ] 0005 — Arquitetura da fila de processamento (BullMQ + Redis no mesmo container)
- [ ] 0006 — Next.js App Router com Server Components por padrão
- [ ] 0007 — Estratégia de armazenamento de áudio (chunking em IndexedDB + Cloud Storage)
- [ ] 0008 — Consolidação do stack em Google Cloud (decisão tomada em 18/04/2026)
