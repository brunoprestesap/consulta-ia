import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execP = promisify(exec);

export type CohereTranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
};

const COHERE_MODEL   = 'cohere-transcribe-03-2026';
const COHERE_API_URL = 'https://api.cohere.com/v2/audio/transcriptions';
const MAX_MIB        = 25;
const TARGET_MIB     = 18;   // margem confortável abaixo do limite
const OVERLAP_SEC    = 5;

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

async function extractChunk(audioPath: string, startSec: number, durationSec: number, outPath: string): Promise<void> {
  // Re-encoda para WAV 16kHz mono — chunks FLAC cortados com -c copy ficam inválidos
  await execP(
    `ffmpeg -y -ss ${startSec} -t ${durationSec} -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outPath}" 2>/dev/null`,
  );
}

async function callCohereAPI(apiKey: string, audioPath: string): Promise<string> {
  const ext    = path.extname(audioPath).replace('.', '');
  const buffer = fs.readFileSync(audioPath);
  const form   = new FormData();
  form.append('model', COHERE_MODEL);
  form.append('language', 'pt');
  form.append('file', new Blob([buffer], { type: `audio/${ext}` }), path.basename(audioPath));

  const res = await fetch(COHERE_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cohere HTTP ${res.status}: ${body}`);
  }

  const json = await res.json() as { text?: string };
  return (json.text ?? '').replace(/\s+/g, ' ').trim();
}

export async function transcribeCohere(audioPath: string): Promise<CohereTranscribeResult> {
  if (!fs.existsSync(audioPath)) throw new Error(`Arquivo não encontrado: ${audioPath}`);

  const apiKey    = requireEnv('COHERE_API_KEY');
  const stem      = path.basename(audioPath, path.extname(audioPath));
  const ext       = path.extname(audioPath);
  const duration  = await probeDuration(audioPath);
  const sizeMiB   = fs.statSync(audioPath).size / (1024 * 1024);

  console.log(`[${stem}] Cohere ${COHERE_MODEL} · ${duration.toFixed(0)}s (${(duration / 60).toFixed(1)}min) · ${sizeMiB.toFixed(1)} MiB…`);

  const t0 = Date.now();
  let text: string;

  if (sizeMiB <= MAX_MIB - 2) {
    text = await callCohereAPI(apiKey, audioPath);
  } else {
    // Chunks são re-encodados para WAV 16kHz mono (~1.83 MiB/min)
    const WAV_MIB_PER_SEC = (16000 * 2 * 1) / (1024 * 1024); // ~0.0305 MiB/s
    const chunkSec        = Math.floor(TARGET_MIB / WAV_MIB_PER_SEC);
    const tmpDir       = fs.mkdtempSync(path.join(os.tmpdir(), 'cohere-'));
    try {
      const parts: string[] = [];
      let offset = 0;
      let idx    = 0;

      while (offset < duration) {
        const chunkDur = Math.min(chunkSec, duration - offset);
        if (chunkDur < 5) break;

        const chunkPath = path.join(tmpDir, `chunk-${idx}.wav`);
        await extractChunk(audioPath, offset, chunkDur, chunkPath);

        console.log(
          `[${stem}] chunk ${idx + 1} · ${(offset / 60).toFixed(1)}–${((offset + chunkDur) / 60).toFixed(1)}min`,
        );
        parts.push(await callCohereAPI(apiKey, chunkPath));
        fs.unlinkSync(chunkPath);

        offset += chunkSec - OVERLAP_SEC;
        idx++;
      }

      text = parts.join(' ').replace(/\s+/g, ' ').trim();
    } finally {
      fs.rmdirSync(tmpDir, { recursive: true } as Parameters<typeof fs.rmdirSync>[1]);
    }
  }

  const procSec = (Date.now() - t0) / 1000;
  if (!text) throw new Error('Cohere retornou resposta vazia');

  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, `${stem}-cohere.txt`);
  fs.writeFileSync(outputPath, text);

  console.log(`[${stem}] OK · proc=${procSec.toFixed(1)}s · ${outputPath}`);

  return { text, audioPath, audioDurationSec: duration, processingDurationSec: procSec, estimatedCostUSD: 0, outputPath };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: tsx src/transcribe-cohere.ts <caminho-do-audio>');
    process.exit(1);
  }
  transcribeCohere(input).catch(err => { console.error(err); process.exit(1); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
