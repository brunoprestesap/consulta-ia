# Consulta IA — Transcrição de Consultas Psiquiátricas

PWA para psiquiatras gravarem consultas e receberem transcrição literal em PT-BR + resumo estruturado SOAP gerado por IA.

**Status:** Fase 0 — Spikes técnicos (pré-desenvolvimento).

---

## Documentação

- `docs/product/` — PRD, UX Specs, Conceito de MVP e Plano de Desenvolvimento
- `docs/spikes/` — instruções dos spikes da Fase 0
- `docs/adr/` — decisões arquiteturais (ADRs)
- `CLAUDE.md` — contexto operacional para assistentes de código (ler primeiro)

---

## Stack (resumo)

Next.js 16 · TypeScript · Tailwind · shadcn/ui · NextAuth · PostgreSQL · Prisma · BullMQ · Redis · Docker · Google Cloud (região São Paulo) · Google Cloud Speech-to-Text · Maritaca Sabiá 4.

Detalhes completos em `CLAUDE.md` e `docs/product/04-development-plan.md`.

---

## Como começar

A primeira coisa a fazer é executar os spikes da Fase 0 (ver `docs/spikes/`). Nenhum código de aplicação é escrito antes disso.

```bash
# Spike 1 — Transcrição
cd spikes/01-transcription
# seguir instruções em docs/spikes/spike-01-transcription.md
```

---

## Licença

Privado. Todos os direitos reservados.
