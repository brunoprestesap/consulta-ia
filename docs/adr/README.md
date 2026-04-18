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

## ADRs esperados no início do projeto

- [ ] 0001 — Provider de transcrição (resultado do Spike 1)
- [ ] 0002 — LLM primário para resumo SOAP (resultado do Spike 2)
- [ ] 0003 — Estratégia de Wake Lock no Safari iOS (resultado do Spike 3)
- [ ] 0004 — Arquitetura da fila de processamento (BullMQ + Redis no mesmo container)
- [ ] 0005 — Next.js App Router com Server Components por padrão
- [ ] 0006 — Estratégia de armazenamento de áudio (chunking em IndexedDB + Cloud Storage)
