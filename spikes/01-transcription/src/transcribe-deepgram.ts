import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DeepgramClient } from '@deepgram/sdk';

const execP = promisify(exec);

export type DeepgramTranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
};

// Deepgram Nova-3: US$0.0043/min (batch) / US$0.0059/min (streaming)
const USD_PER_MIN_BATCH = 0.0043;

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
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duração inválida: ${stdout}`);
  return d;
}

export async function transcribeDeepgram(audioPath: string): Promise<DeepgramTranscribeResult> {
  if (!fs.existsSync(audioPath)) throw new Error(`Arquivo não encontrado: ${audioPath}`);

  const apiKey   = requireEnv('DEEPGRAM_API_KEY');
  const stem     = path.basename(audioPath, path.extname(audioPath));
  const duration = await probeDuration(audioPath);

  const deepgram = new DeepgramClient({ apiKey });

  console.log(`[${stem}] Deepgram Nova-3 · ${duration.toFixed(0)}s (${(duration / 60).toFixed(1)}min)…`);

  const t0 = Date.now();
  const response = await deepgram.listen.v1.media.transcribeFile(
    fs.createReadStream(audioPath),
    {
      model: 'nova-3',
      language: 'pt-BR',
      punctuate: true,
      diarize: false,
      smart_format: false,
      paragraphs: false,
    },
  );
  const procSec = (Date.now() - t0) / 1000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (response as any)?.body ?? (response as any);
  const transcript: string = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Deepgram retornou transcrição vazia');

  const estimatedCostUSD = (duration / 60) * USD_PER_MIN_BATCH;
  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, `${stem}-deepgram.txt`);
  fs.writeFileSync(outputPath, text);

  console.log(
    `[${stem}] OK · proc=${procSec.toFixed(1)}s · custo≈US$${estimatedCostUSD.toFixed(4)} · ${outputPath}`,
  );

  return { text, audioPath, audioDurationSec: duration, processingDurationSec: procSec, estimatedCostUSD, outputPath };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: tsx src/transcribe-deepgram.ts <caminho-do-audio>');
    process.exit(1);
  }
  transcribeDeepgram(input).catch(err => { console.error(err); process.exit(1); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
