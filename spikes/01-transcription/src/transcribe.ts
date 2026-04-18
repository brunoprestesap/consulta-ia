import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { psychiatryVocabulary } from './vocabulary.js';

type Encoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

export type TranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  gcsUri: string;
  outputPath: string;
};

// Referência: https://cloud.google.com/speech-to-text/pricing
// "Long" model (standard): US$ 0,016 por minuto no pagamento à vista.
const USD_PER_MIN_LONG_MODEL = 0.016;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function readWavSampleRate(filePath: string): number {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(44);
    fs.readSync(fd, header, 0, 44, 0);
    const riff = header.toString('ascii', 0, 4);
    const wave = header.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error(`Arquivo WAV inválido: ${filePath}`);
    }
    return header.readUInt32LE(24);
  } finally {
    fs.closeSync(fd);
  }
}

function detectEncoding(audioPath: string): { encoding: Encoding; sampleRateHertz?: number } {
  const ext = path.extname(audioPath).toLowerCase();
  switch (ext) {
    case '.wav':
      return { encoding: AudioEncoding.LINEAR16, sampleRateHertz: readWavSampleRate(audioPath) };
    case '.flac':
      return { encoding: AudioEncoding.FLAC };
    case '.ogg':
    case '.opus':
      return { encoding: AudioEncoding.OGG_OPUS, sampleRateHertz: 48000 };
    default:
      throw new Error(
        `Formato não suportado pelo Google STT V1: ${ext}. ` +
        `Converta com: ffmpeg -i "${audioPath}" -c:a flac "${audioPath.replace(ext, '.flac')}"`
      );
  }
}

export async function transcribe(audioPath: string): Promise<TranscribeResult> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Arquivo não encontrado: ${audioPath}`);
  }

  const bucketName = requireEnv('GCS_BUCKET');
  const storage = new Storage();
  const speech = new SpeechClient();

  const basename = path.basename(audioPath);
  const objectName = `spike-01/${Date.now()}-${basename}`;
  const gcsUri = `gs://${bucketName}/${objectName}`;

  console.log(`[${basename}] Upload → ${gcsUri}`);
  await storage.bucket(bucketName).upload(audioPath, { destination: objectName });

  const { encoding, sampleRateHertz } = detectEncoding(audioPath);

  console.log(`[${basename}] Long-running recognize (model=long, languageCode=pt-BR, diarization=2)`);
  const t0 = Date.now();
  const [operation] = await speech.longRunningRecognize({
    audio: { uri: gcsUri },
    config: {
      languageCode: 'pt-BR',
      model: 'long',
      enableAutomaticPunctuation: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
      speechContexts: [{ phrases: psychiatryVocabulary, boost: 15 }],
      encoding,
      ...(sampleRateHertz ? { sampleRateHertz } : {}),
    },
  });
  const [response] = await operation.promise();
  const processingDurationSec = (Date.now() - t0) / 1000;

  const text = (response.results ?? [])
    .map(r => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const billed = response.totalBilledTime;
  const audioDurationSec = billed
    ? Number(billed.seconds ?? 0) + Number(billed.nanos ?? 0) / 1e9
    : 0;
  const estimatedCostUSD = (audioDurationSec / 60) * USD_PER_MIN_LONG_MODEL;

  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const stem = path.basename(audioPath, path.extname(audioPath));
  const outputPath = path.join(resultsDir, `${stem}-google.txt`);
  fs.writeFileSync(outputPath, text);

  console.log(
    `[${basename}] OK · áudio=${audioDurationSec.toFixed(0)}s · proc=${processingDurationSec.toFixed(1)}s · custo≈US$${estimatedCostUSD.toFixed(3)} · ${outputPath}`
  );

  return {
    text,
    audioPath,
    audioDurationSec,
    processingDurationSec,
    estimatedCostUSD,
    gcsUri,
    outputPath,
  };
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: tsx src/transcribe.ts <caminho-do-audio>');
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
