import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { psychiatryVocabulary } from './vocabulary.js';

const execP = promisify(exec);
const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

export type TranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
  chunks: number;
};

// Referência: https://cloud.google.com/speech-to-text/pricing — modelo "Long" a US$ 0,016/min.
const USD_PER_MIN_LONG_MODEL = 0.016;

// Chunking contorna o bug de degradação do `latest_long` em arquivos > ~80s.
// Ver docs/adr/0001-transcription-provider.md.
const CHUNK_LEN_SEC = 50;
const OVERLAP_SEC = 5;

type Chunk = {
  id: number;
  audioStart: number;
  audioEnd: number;
  keepStart: number;
  keepEnd: number;
  audioPath: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function durSec(d: { seconds?: number | string | null; nanos?: number | null } | null | undefined): number {
  if (!d) return 0;
  return Number(d.seconds ?? 0) + Number(d.nanos ?? 0) / 1e9;
}

async function probeDuration(audioPath: string): Promise<number> {
  const { stdout } = await execP(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${audioPath}"`);
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duração inválida em ${audioPath}: ${stdout}`);
  return d;
}

function planChunks(duration: number, stem: string, dir: string): Chunk[] {
  const chunks: Chunk[] = [];
  const stride = CHUNK_LEN_SEC - OVERLAP_SEC;
  let start = 0;
  let id = 0;
  while (start < duration - 1) {
    const audioEnd = Math.min(start + CHUNK_LEN_SEC, duration);
    const isLast = audioEnd >= duration;
    const keepStart = id === 0 ? 0 : OVERLAP_SEC / 2;
    const keepEnd = isLast ? Number.POSITIVE_INFINITY : (audioEnd - start) - OVERLAP_SEC / 2;
    chunks.push({
      id, audioStart: start, audioEnd, keepStart, keepEnd,
      audioPath: path.join(dir, `${stem}-${id}.flac`),
    });
    if (isLast) break;
    start += stride;
    id++;
  }
  return chunks;
}

async function extractChunk(srcPath: string, c: Chunk): Promise<void> {
  fs.mkdirSync(path.dirname(c.audioPath), { recursive: true });
  await execP(
    `ffmpeg -hide_banner -loglevel error -y -ss ${c.audioStart} -to ${c.audioEnd} -i "${srcPath}" -c:a flac "${c.audioPath}"`
  );
}

type ChunkOutcome = {
  words: { word: string; startSec: number }[];
  procSec: number;
  billedSec: number;
};

async function transcribeChunk(
  c: Chunk,
  bucketName: string,
  speech: SpeechClient,
  storage: Storage,
): Promise<ChunkOutcome> {
  const obj = `spike-01/${Date.now()}-${path.basename(c.audioPath)}`;
  await storage.bucket(bucketName).upload(c.audioPath, { destination: obj });
  const gcsUri = `gs://${bucketName}/${obj}`;

  const t0 = Date.now();
  const [op] = await speech.longRunningRecognize({
    audio: { uri: gcsUri },
    config: {
      languageCode: 'pt-BR',
      model: 'latest_long',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
      speechContexts: [{ phrases: psychiatryVocabulary, boost: 15 }],
      encoding: AudioEncoding.FLAC,
    },
  });
  const [response] = await op.promise();
  const procSec = (Date.now() - t0) / 1000;
  const billedSec = durSec(response.totalBilledTime as any);

  const results = response.results ?? [];
  // Diarização em V1 coloca todas as palavras com timing no ÚLTIMO result.
  const lastWords = results.at(-1)?.alternatives?.[0]?.words ?? [];
  const words = lastWords.map(w => ({
    word: w.word ?? '',
    startSec: durSec(w.startTime as any),
  }));

  return { words, procSec, billedSec };
}

export async function transcribe(audioPath: string): Promise<TranscribeResult> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Arquivo não encontrado: ${audioPath}`);
  }

  const ext = path.extname(audioPath).toLowerCase();
  if (!/^\.(flac|wav|ogg|opus)$/.test(ext)) {
    throw new Error(`Formato não suportado: ${ext}. Aceitos: .flac .wav .ogg .opus`);
  }

  const bucketName = requireEnv('GCS_BUCKET');
  const storage = new Storage();
  const speech = new SpeechClient();

  const stem = path.basename(audioPath, ext);
  const duration = await probeDuration(audioPath);
  const chunkDir = fs.mkdtempSync(path.join(os.tmpdir(), `spike-01-${stem}-`));
  const chunks = planChunks(duration, stem, chunkDir);

  console.log(`[${stem}] duração=${duration.toFixed(1)}s · chunks=${chunks.length} (size=${CHUNK_LEN_SEC}s, overlap=${OVERLAP_SEC}s)`);

  const t0 = Date.now();
  const keptWords: string[] = [];
  let totalBilledSec = 0;

  try {
    for (const c of chunks) {
      await extractChunk(audioPath, c);
      const outcome = await transcribeChunk(c, bucketName, speech, storage);
      totalBilledSec += outcome.billedSec;

      const filtered = outcome.words.filter(w => w.startSec >= c.keepStart && w.startSec < c.keepEnd);
      for (const w of filtered) keptWords.push(w.word);

      console.log(
        `[${stem}] chunk ${c.id} (${c.audioStart}-${c.audioEnd.toFixed(0)}s): ` +
        `${outcome.words.length} palavras, ${filtered.length} mantidas · ` +
        `proc=${outcome.procSec.toFixed(1)}s`
      );
    }
  } finally {
    fs.rmSync(chunkDir, { recursive: true, force: true });
  }

  const text = keptWords.join(' ').replace(/\s+/g, ' ').trim();
  const processingDurationSec = (Date.now() - t0) / 1000;
  const estimatedCostUSD = (totalBilledSec / 60) * USD_PER_MIN_LONG_MODEL;

  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, `${stem}-google.txt`);
  fs.writeFileSync(outputPath, text);

  console.log(
    `[${stem}] OK · áudio=${totalBilledSec.toFixed(0)}s · proc=${processingDurationSec.toFixed(1)}s · ` +
    `custo≈US$${estimatedCostUSD.toFixed(3)} · ${outputPath}`
  );

  return {
    text,
    audioPath,
    audioDurationSec: totalBilledSec,
    processingDurationSec,
    estimatedCostUSD,
    outputPath,
    chunks: chunks.length,
  };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: tsx src/transcribe.ts <caminho-do-audio.flac>');
    process.exit(1);
  }
  transcribe(input).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
