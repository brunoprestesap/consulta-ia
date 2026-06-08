# ADR 0002 — Processamento de áudio clínico real no Spike 1 sem DPA formal

**Data:** 2026-04-21
**Status:** aceito

---

## Contexto

Recebemos uma amostra de áudio de consulta psiquiátrica real de 1h+ com transcrição manual literal (palavra por palavra) completa. O paciente deu consentimento verbal específico para processamento externo incluindo Google Cloud Speech-to-Text. O áudio não contém nomes próprios do paciente ou familiares (foram omitidos naturalmente ao longo da consulta). O áudio original não passou por processo adicional de anonimização.

O projeto ainda não possui DPA formal aceito com o Google Cloud. Não há DPO designado nem parecer jurídico formal.

## Decisão

Processar o áudio real no Spike 1 sem DPA formal e sem etapa adicional de anonimização. Decisão tomada pelo controlador (dev solo) ciente dos riscos, documentada explicitamente neste ADR.

## Alternativas consideradas

- **Aceitar DPA padrão do Google Cloud antes de processar** — ~15 min de trabalho; recomendada pela análise de risco, declinada por custo de tempo.
- **DPA + varredura manual de identificadores residuais no áudio** — ~1h de trabalho; declinada por custo de tempo.
- **Pausar spike para consentimento por escrito específico** — elimina risco de consentimento informal ser contestado; declinada por custo de tempo.
- **Pausar spike para consulta jurídica formal** — caminho mais seguro para dados sensíveis (LGPD Art. 11); declinada por custo de tempo.

## Consequências

### Positivas

- Destrava execução imediata do teste com a amostra de maior valor disponível (duração real de consulta psiquiátrica).
- Economiza 15–60 min de trabalho formal de compliance.

### Negativas

- Controlador fica pessoalmente exposto a responsabilidade civil e administrativa caso haja incidente com os dados.
- Consentimento não formalizado por escrito pode ser considerado insuficiente pela LGPD em eventual disputa (Art. 8–9 exigem consentimento "livre, informado e inequívoco").
- Precedente operacional de priorizar velocidade sobre compliance em fase inicial.

### Neutras / a monitorar

- Aceitar DPA do Google Cloud antes do início da Fase 1 é mandatório.
- Termo de consentimento específico para processamento por terceiros deve ser redigido antes do beta com psiquiatras reais.
- Áudio deste spike será deletado após conclusão conforme política de retenção de 30 dias já definida no projeto.
- Mitigação parcial: transcrição manual confirmou ausência de nomes próprios no áudio.

## Referências

- Conversa de elicitação registrada na sessão do dia (2026-04-21)
- PRD v0.2, RNF-01 (segurança e privacidade)
- PRD v0.2, RNF-07 (compliance LGPD)
- LGPD Lei 13.709/2018, Art. 11 (dados sensíveis de saúde)
- LGPD Lei 13.709/2018, Art. 8–9 (consentimento)
