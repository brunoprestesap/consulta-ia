import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ElevenLabsClient } from 'elevenlabs';

const execP = promisify(exec);

export type ElevenLabsTranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
};

// ElevenLabs Scribe v2: US$0.22/hr = US$0.003667/min
const USD_PER_MIN = 0.22 / 60;

// Chunka em segmentos de 10 min para evitar timeout da API (max ~15 min por chamada)
const CHUNK_SEC = 600;
const CHUNK_OVERLAP_SEC = 5;

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
  await execP(
    `ffmpeg -y -ss ${startSec} -t ${durationSec} -i "${audioPath}" -c copy "${outPath}" 2>/dev/null`,
  );
}

async function transcribeChunk(client: ElevenLabsClient, chunkPath: string): Promise<string> {
  const response = await client.speechToText.convert({
    file: fs.createReadStream(chunkPath) as unknown as Blob,
    model_id: 'scribe_v2',
    language_code: 'pt',
    tag_audio_events: false,
    timestamps_granularity: 'none',
  });
  return (response.text ?? '').replace(/\s+/g, ' ').trim();
}

export async function transcribeElevenLabs(audioPath: string): Promise<ElevenLabsTranscribeResult> {
  if (!fs.existsSync(audioPath)) throw new Error(`Arquivo não encontrado: ${audioPath}`);

  const apiKey   = requireEnv('ELEVENLABS_API_KEY');
  const stem     = path.basename(audioPath, path.extname(audioPath));
  const duration = await probeDuration(audioPath);
  const ext      = path.extname(audioPath);

  const client = new ElevenLabsClient({ apiKey });

  console.log(`[${stem}] ElevenLabs Scribe v2 · ${duration.toFixed(0)}s (${(duration / 60).toFixed(1)}min)…`);

  const t0 = Date.now();
  let text: string;

  if (duration <= CHUNK_SEC + 30) {
    // Arquivo curto — envia direto
    const response = await client.speechToText.convert({
      file: fs.createReadStream(audioPath) as unknown as Blob,
      model_id: 'scribe_v2',
      language_code: 'pt',
      tag_audio_events: false,
      timestamps_granularity: 'none',
    });
    text = (response.text ?? '').replace(/\s+/g, ' ').trim();
  } else {
    // Arquivo longo — particiona em chunks, transcrevem sequencialmente, concatena
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elevenlabs-'));
    try {
      const parts: string[] = [];
      let offset = 0;
      let chunkIdx = 0;

      while (offset < duration) {
        const chunkDur = Math.min(CHUNK_SEC, duration - offset);
        if (chunkDur < 5) break; // descarta fragmento residual < 5s

        const chunkPath = path.join(tmpDir, `chunk-${chunkIdx}${ext}`);
        await extractChunk(audioPath, offset, chunkDur, chunkPath);

        console.log(
          `[${stem}] chunk ${chunkIdx + 1} · ${(offset / 60).toFixed(1)}–${((offset + chunkDur) / 60).toFixed(1)}min`,
        );
        const chunkText = await transcribeChunk(client, chunkPath);
        parts.push(chunkText);
        fs.unlinkSync(chunkPath);

        // avança com overlap para evitar corte de palavra
        offset += CHUNK_SEC - CHUNK_OVERLAP_SEC;
        chunkIdx++;
      }

      text = parts.join(' ').replace(/\s+/g, ' ').trim();
    } finally {
      fs.rmdirSync(tmpDir, { recursive: true } as Parameters<typeof fs.rmdirSync>[1]);
    }
  }

  const procSec = (Date.now() - t0) / 1000;

  if (!text) throw new Error('ElevenLabs retornou resposta vazia');

  const estimatedCostUSD = (duration / 60) * USD_PER_MIN;
  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, `${stem}-elevenlabs.txt`);
  fs.writeFileSync(outputPath, text);

  console.log(
    `[${stem}] OK · proc=${procSec.toFixed(1)}s · custo≈US$${estimatedCostUSD.toFixed(4)} · ${outputPath}`,
  );

  return { text, audioPath, audioDurationSec: duration, processingDurationSec: procSec, estimatedCostUSD, outputPath };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: tsx src/transcribe-elevenlabs.ts <caminho-do-audio>');
    process.exit(1);
  }
  transcribeElevenLabs(input).catch(err => { console.error(err); process.exit(1); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
