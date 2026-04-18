# ADR 0007 — Consolidação do stack em Google Cloud

**Data:** 2026-04-18
**Status:** aceito

---

## Contexto

O plano original previa:
- Transcrição via Google Cloud Speech-to-Text (região São Paulo)
- LLM primário via Maritaca Sabiá 4 (API brasileira)
- LLM fallback via Claude na AWS Bedrock (região São Paulo)

Isso significava operar com **três provedores externos** (Google Cloud, Maritaca, AWS), cada um com suas próprias credenciais, faturamento, SLAs, dashboards e políticas de retenção.

Para um dev solo executando o MVP sem pressa de prazo mas com orçamento sem limite, a fricção operacional de múltiplos provedores é custo real em tempo e atenção. Além disso, o surgimento do Gemini 2.5 Pro/Flash via Vertex AI em `southamerica-east1` oferece uma alternativa nativa do Google Cloud com qualidade competitiva em PT-BR.

## Decisão

Consolidar **todo o stack de IA no Google Cloud**, região São Paulo:

- **Transcrição:** Google Cloud Speech-to-Text (mantido)
- **LLM primário:** Gemini 2.5 Pro via Vertex AI
- **LLM fallback barato/rápido:** Gemini 2.5 Flash via Vertex AI
- **LLM avaliado como referência no Spike 2:** Maritaca Sabiá 4 (para validar empiricamente se não estamos perdendo qualidade relevante ao consolidar)

AWS Bedrock fica **fora** do stack até segunda ordem.

## Alternativas consideradas

- **Manter Maritaca como primária:** maior narrativa de produto brasileiro e treinamento especializado em PT-BR. Contras: mais um provedor para gerenciar, empresa menor com risco operacional maior, sem fine-tuning disponível.

- **Manter Claude via Bedrock como fallback:** qualidade comprovada, região São Paulo disponível. Contras: adiciona AWS como terceiro provedor, complexidade IAM duplicada, billing separado.

- **Consolidar em Google Cloud com Gemini:** qualidade competitiva, single billing, single IAM, região nativa, SDK maduro. Escolhida.

## Consequências

### Positivas
- **Fricção operacional mínima.** Um único provedor para tudo (Speech, LLM, Storage, DB, Cache, Run, IAM, Logging, Monitoring).
- **Billing unificado** com alertas e quotas no mesmo dashboard.
- **Região São Paulo nativa** em todo o stack — atende RNF-02 do PRD sem configurações especiais.
- **SDKs Google Cloud** já sendo usados para Speech-to-Text e Storage — menos curva de aprendizado.
- **Menos segredos para gerenciar** (uma service account para tudo, não três sets de credenciais).

### Negativas
- **Lock-in maior em Google Cloud.** Se o Google aumentar preços ou descontinuar serviço, custo de saída é maior.
- **Perde diferenciação de "produto brasileiro"** se for usado como argumento comercial futuro.
- **Gemini não foi especificamente treinado em corpus brasileiro** como a Maritaca. Risco mitigado pelo Spike 2 que avalia empiricamente.

### Neutras / a monitorar
- Evolução de preços dos modelos Gemini ao longo do beta.
- Qualidade relativa entre Gemini Pro, Flash e Maritaca no Spike 2 — se diferença for muito grande a favor de Maritaca em psiquiatria, reconsiderar.
- Disponibilidade contínua dos modelos em `southamerica-east1` (modelos mais novos às vezes demoram a chegar em regiões fora de us-central).

## Referências

- Conversa de elicitação (18/04/2026) — decisão tomada após reflexão sobre trade-offs de múltiplos provedores para dev solo.
- [Vertex AI — Gemini disponibilidade por região](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)
- PRD v0.2, RNF-02 (hospedagem obrigatoriamente no Brasil)
- Development Plan v0.2 (atualizado em 18/04/2026)
