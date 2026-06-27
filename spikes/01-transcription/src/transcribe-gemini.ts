import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, type Part } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { psychiatryVocabulary } from './vocabulary.js';

const execP = promisify(exec);

export type GeminiTranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
  model: string;
};

// Preço Gemini 2.5 Flash via Vertex AI: US$1,875 por 1M tokens de áudio (~32 tokens/s)
// Para 1 min de áudio: 60s × 32 tok/s = 1920 tokens = ~US$0.0036/min
// Usando estimativa conservadora de US$0.01/min para cobrir output tokens também.
const FLASH_USD_PER_MIN = 0.01;
const PRO_USD_PER_MIN   = 0.04;

export const DEFAULT_MODEL = 'gemini-2.5-flash';

// Gemini aceita: audio/wav, audio/mpeg, audio/aiff, audio/aac, audio/ogg, audio/flac, audio/mp4
const MIME_MAP: Record<string, string> = {
  '.flac': 'audio/flac',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.m4a':  'audio/mp4',
  '.mp4':  'audio/mp4',
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

async function probeDuration(audioPath: string): Promise<number> {
  const { stdout } = await execP(
    `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${audioPath}"`,
  );
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duração inválida em ${audioPath}: ${stdout}`);
  return d;
}

function buildPrompt(): string {
  const vocab = psychiatryVocabulary.slice(0, 40).join(', ');
  return (
    'Você é um transcritor especializado em consultas psiquiátricas em português brasileiro. ' +
    'Transcreva LITERALMENTE todo o áudio — palavra por palavra, incluindo palavras de ' +
    'preenchimento ("né", "é", "assim", "então", "ã"), falsos começos, repetições e pausas ' +
    'preenchidas. NÃO resuma, NÃO interprete, NÃO corrija erros gramaticais do falante. ' +
    'Quando houver dois falantes, transcreva ambos na ordem em que falam, sem identificar ' +
    'quem é cada um. Escreva a transcrição como texto corrido, sem timestamps ou marcadores. ' +
    'Vocabulário técnico esperado: ' + vocab + '.'
  );
}

export async function transcribeGemini(
  audioPath: string,
  model: string = DEFAULT_MODEL,
): Promise<GeminiTranscribeResult> {
  if (!fs.existsSync(audioPath)) throw new Error(`Arquivo não encontrado: ${audioPath}`);

  const ext = path.extname(audioPath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) throw new Error(`Formato não suportado: ${ext}. Aceitos: ${Object.keys(MIME_MAP).join(' ')}`);

  const projectId  = requireEnv('GCP_PROJECT_ID');
  const bucketName = requireEnv('GCS_BUCKET');
  const stem       = path.basename(audioPath, ext);
  const duration   = await probeDuration(audioPath);

  // Inline para arquivos < 20 MB; GCS para arquivos maiores.
  const INLINE_LIMIT_BYTES = 19 * 1024 * 1024;
  const fileSizeBytes = fs.statSync(audioPath).size;
  const useInline = fileSizeBytes < INLINE_LIMIT_BYTES;

  const storage = new Storage();
  let gcsObjToDelete: string | null = null;

  const client = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: 'southamerica-east1',
  });

  let audioPart: Part;
  if (useInline) {
    console.log(`[${stem}] duração=${duration.toFixed(1)}s · modelo=${model} · inline (${(fileSizeBytes / 1024).toFixed(0)} KB)…`);
    const data = fs.readFileSync(audioPath).toString('base64');
    audioPart = { inlineData: { mimeType, data } };
  } else {
    const gcsObj = `spike-01-gemini/${Date.now()}-${path.basename(audioPath)}`;
    const gcsUri = `gs://${bucketName}/${gcsObj}`;
    gcsObjToDelete = gcsObj;
    console.log(`[${stem}] duração=${duration.toFixed(1)}s · modelo=${model} · uploading GCS (${(fileSizeBytes / 1024 / 1024).toFixed(0)} MB)…`);
    await storage.bucket(bucketName).upload(audioPath, { destination: gcsObj });
    audioPart = { fileData: { mimeType, fileUri: gcsUri } };
  }

  const t0 = Date.now();
  console.log(`[${stem}] chamando Gemini (${model})…`);

  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildPrompt() },
          audioPart,
        ],
      },
    ],
    // Desabilita thinking — evita vazamento de raciocínio interno no output de transcrição.
    config: { thinkingConfig: { thinkingBudget: 0 } },
  });

  const procSec = (Date.now() - t0) / 1000;

  if (gcsObjToDelete) {
    await storage.bucket(bucketName).file(gcsObjToDelete).delete().catch(() => {});
  }

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) throw new Error('Gemini retornou resposta vazia');

  const usdPerMin = model.includes('pro') ? PRO_USD_PER_MIN : FLASH_USD_PER_MIN;
  const estimatedCostUSD = (duration / 60) * usdPerMin;

  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, `${stem}-gemini.txt`);
  fs.writeFileSync(outputPath, text.replace(/\s+/g, ' ').trim());

  console.log(
    `[${stem}] OK · áudio=${duration.toFixed(0)}s · proc=${procSec.toFixed(1)}s · ` +
    `custo≈US$${estimatedCostUSD.toFixed(3)} · ${outputPath}`,
  );

  return { text, audioPath, audioDurationSec: duration, processingDurationSec: procSec, estimatedCostUSD, outputPath, model };
}

function main() {
  const input = process.argv[2];
  const model = process.argv[3] ?? DEFAULT_MODEL;
  if (!input) {
    console.error('Uso: tsx src/transcribe-gemini.ts <caminho-do-audio> [modelo]');
    process.exit(1);
  }
  transcribeGemini(input, model).catch(err => { console.error(err); process.exit(1); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
