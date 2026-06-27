import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

const SOAP_PROMPT = `Você é um assistente especializado em documentação clínica psiquiátrica.
Com base na transcrição literal de uma consulta psiquiátrica abaixo, gere um resumo estruturado
no formato SOAP psiquiátrico em português brasileiro. Seja fiel ao que foi dito — não invente
informações que não estão na transcrição. Se um campo não puder ser preenchido com base no
que foi dito, escreva "Não mencionado na consulta".

FORMATO DE SAÍDA (use exatamente estas seções):

## S — Subjetivo (Histórico)
[O que o paciente relata: queixa principal, evolução desde a última consulta, sintomas,
contexto de vida relevante mencionado na consulta]

## O — Objetivo (Exame do Estado Mental — EEM)
[Observações do médico sobre o estado do paciente durante a consulta: aparência,
psicomotricidade, humor, afeto, pensamento, percepção, cognição, insight, juízo crítico]

## A — Avaliação
[Hipótese diagnóstica ou diagnóstico em curso, com CID-10 se mencionado.
Avaliação do progresso do tratamento.]

## M — Medicações
[Medicações em uso mencionadas, doses se citadas, alterações propostas]

## P — Plano / Conduta
[Decisões terapêuticas: ajuste de medicação, encaminhamentos, orientações ao paciente,
próxima consulta se mencionada]

TRANSCRIÇÃO:
`;

async function generateSOAP(transcriptionPath: string, model = 'gemini-2.5-pro'): Promise<void> {
  if (!fs.existsSync(transcriptionPath)) {
    throw new Error(`Arquivo não encontrado: ${transcriptionPath}`);
  }

  const transcription = fs.readFileSync(transcriptionPath, 'utf-8');
  const stem = path.basename(transcriptionPath, path.extname(transcriptionPath));

  const client = new GoogleGenAI({
    vertexai: true,
    project: requireEnv('GCP_PROJECT_ID'),
    location: 'southamerica-east1',
  });

  console.log(`Gerando SOAP para ${stem} com ${model}…`);
  const t0 = Date.now();

  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: SOAP_PROMPT + transcription }] }],
    config: { thinkingConfig: { thinkingBudget: 0 } },
  });

  const soap = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!soap) throw new Error('Resposta vazia');

  const procSec = (Date.now() - t0) / 1000;
  const outputPath = path.resolve('results', `${stem}-soap.md`);
  fs.writeFileSync(outputPath, soap);

  console.log(`Concluído em ${procSec.toFixed(1)}s → ${outputPath}\n`);
  console.log(soap);
}

const input = process.argv[2] ?? 'results/amostra-real-02-whisper.txt';
const model = process.argv[3] ?? 'gemini-2.5-pro';

generateSOAP(input, model).catch(err => { console.error(err); process.exit(1); });
