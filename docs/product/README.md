# Documentação de Produto

Este diretório contém os quatro documentos fundacionais do projeto, gerados em sequência via elicitação guiada.

## Ordem de leitura recomendada

1. **[01-prd.md](./01-prd.md)** — Documento de Requisitos de Produto (visão, objetivos, requisitos funcionais e não funcionais)
2. **[02-ux-specs.md](./02-ux-specs.md)** — Especificações de UX/UI (arquitetura da informação, fluxos, telas, padrões de interação)
3. **[03-mvp-concept.md](./03-mvp-concept.md)** — Conceito de MVP (hipótese, recorte IN/OUT, métricas)
4. **[04-development-plan.md](./04-development-plan.md)** — Plano de Desenvolvimento (stack, fases, testes, deploy, riscos)

## Relação entre os documentos

```
PRD (visão ampla)
 │
 ├──▶ UX Specs (como a visão vira interface)
 │
 └──▶ MVP Concept (qual fatia da visão será validada primeiro)
       │
       └──▶ Development Plan (como o MVP será construído)
```

## Quando atualizar

- **PRD:** quando o escopo ou os requisitos do produto mudarem.
- **UX Specs:** quando decisões de interação, layout ou fluxo forem revisadas.
- **MVP Concept:** se a hipótese for refutada ou refinada com aprendizado do beta.
- **Development Plan:** quando o roadmap, stack ou estratégia de execução mudarem.

Sempre incrementar a versão e registrar no histórico de revisões do documento.
