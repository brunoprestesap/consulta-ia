import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { psychiatryVocabulary } from './vocabulary.js';

const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
const USD_PER_MIN_LONG_MODEL = 0.016;

function durationToSec(d: { seconds?: number | string | Long | null; nanos?: number | null } | null | undefined): number {
  if (!d) return 0;
  return Number(d.seconds ?? 0) + Number(d.nanos ?? 0) / 1e9;
}

async function main() {
  const audioPath = path.resolve('samples/amostra-01.flac');
  if (!fs.existsSync(audioPath)) throw new Error(`Não encontrado: ${audioPath}`);

  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) throw new Error('GCS_BUCKET ausente');

  const storage = new Storage();
  const speech = new SpeechClient();
  const objectName = `spike-01/diag-nodiar-${Date.now()}-amostra-01.flac`;
  const gcsUri = `gs://${bucketName}/${objectName}`;

  console.log(`[diag-no-diar] Upload → ${gcsUri}`);
  await storage.bucket(bucketName).upload(audioPath, { destination: objectName });

  console.log(`[diag-no-diar] longRunningRecognize SEM diarização`);
  const t0 = Date.now();
  const [operation] = await speech.longRunningRecognize({
    audio: { uri: gcsUri },
    config: {
      languageCode: 'pt-BR',
      model: 'latest_long',
      enableAutomaticPunctuation: true,
      // diarizationConfig REMOVIDO — única diferença vs transcribe.ts
      speechContexts: [{ phrases: psychiatryVocabulary, boost: 15 }],
      encoding: AudioEncoding.FLAC,
    },
  });
  const [response] = await operation.promise();
  const procSec = (Date.now() - t0) / 1000;

  const results = response.results ?? [];
  const billedSec = durationToSec(response.totalBilledTime as any);
  const costUSD = (billedSec / 60) * USD_PER_MIN_LONG_MODEL;

  console.log('\n=== Diagnóstico amostra-01 SEM diarização ===');
  console.log(`Áudio: ${billedSec.toFixed(2)}s · proc=${procSec.toFixed(1)}s · custo≈US$${costUSD.toFixed(3)}`);
  console.log(`response.results.length: ${results.length}`);

  let lastEndSec = 0;
  let totalWords = 0;
  results.forEach((r, i) => {
    const alts = r.alternatives ?? [];
    const t = alts[0]?.transcript ?? '';
    const endSec = durationToSec(r.resultEndTime as any);
    const wc = t.trim().split(/\s+/).filter(Boolean).length;
    lastEndSec = Math.max(lastEndSec, endSec);
    totalWords += wc;
    const preview = t.length > 100 ? t.slice(0, 100) + '…' : t;
    console.log(`  [${i}] resultEndTime=${endSec.toFixed(2)}s · palavras≈${wc} · chars=${t.length}`);
    console.log(`       "${preview}"`);
  });

  console.log(`\nÚltima resultEndTime: ${lastEndSec.toFixed(2)}s (gap ${(billedSec - lastEndSec).toFixed(2)}s)`);
  console.log(`Total palavras: ${totalWords}`);

  const joined = results.map(r => r.alternatives?.[0]?.transcript ?? '').join(' ').replace(/\s+/g, ' ').trim();
  const outPath = path.resolve('results/amostra-01-google-no-diarization.txt');
  fs.writeFileSync(outPath, joined);
  console.log(`\nTexto salvo em ${outPath}`);
  console.log(`\n--- Texto completo ---\n${joined}`);
}

main().catch(e => { console.error(e); process.exit(1); });
