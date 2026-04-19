import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { psychiatryVocabulary } from './vocabulary.js';

const AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

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
  const objectName = `spike-01/diag-${Date.now()}-amostra-01.flac`;
  const gcsUri = `gs://${bucketName}/${objectName}`;

  console.log(`[diag] Upload → ${gcsUri}`);
  await storage.bucket(bucketName).upload(audioPath, { destination: objectName });

  console.log(`[diag] longRunningRecognize (mesma config de transcribe.ts)`);
  const [operation] = await speech.longRunningRecognize({
    audio: { uri: gcsUri },
    config: {
      languageCode: 'pt-BR',
      model: 'latest_long',
      enableAutomaticPunctuation: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
      speechContexts: [{ phrases: psychiatryVocabulary, boost: 15 }],
      encoding: AudioEncoding.FLAC,
    },
  });
  const [response] = await operation.promise();

  const results = response.results ?? [];
  const billedSec = durationToSec(response.totalBilledTime as any);

  console.log('\n=== Diagnóstico amostra-01 ===');
  console.log(`Áudio (totalBilledTime): ${billedSec.toFixed(2)}s`);
  console.log(`response.results.length: ${results.length}`);
  console.log('');

  let lastEndSec = 0;
  let totalChars = 0;
  results.forEach((r, i) => {
    const alts = r.alternatives ?? [];
    const t0 = alts[0]?.transcript ?? '';
    const endSec = durationToSec(r.resultEndTime as any);
    const wordsCount = alts[0]?.words?.length ?? 0;
    lastEndSec = Math.max(lastEndSec, endSec);
    totalChars += t0.length;
    const preview = t0.length > 80 ? t0.slice(0, 80) + '…' : t0;
    console.log(
      `  [${i}] resultEndTime=${endSec.toFixed(2)}s · alternatives=${alts.length} · words=${wordsCount} · chars=${t0.length} · channelTag=${r.channelTag ?? '-'}`
    );
    console.log(`       transcript[0]: "${preview}"`);
  });

  console.log('');
  console.log(`Última resultEndTime: ${lastEndSec.toFixed(2)}s`);
  console.log(`Cobre o áudio inteiro? ${lastEndSec >= billedSec - 1 ? 'SIM' : 'NÃO ⚠️'}  (gap ≈ ${(billedSec - lastEndSec).toFixed(2)}s)`);
  console.log(`Soma de chars de transcript[0] de todos results: ${totalChars}`);

  const joined = results.map(r => r.alternatives?.[0]?.transcript ?? '').join(' ').replace(/\s+/g, ' ').trim();
  console.log(`\nTexto concatenado (como em transcribe.ts), len=${joined.length}:`);
  console.log(joined);

  const lastAlt = results.at(-1)?.alternatives?.[0];
  if (lastAlt?.words && lastAlt.words.length > 0) {
    const w = lastAlt.words;
    const firstWord = w[0]!;
    const lastWord = w.at(-1)!;
    console.log(`\nÚltimo result tem words[]: ${w.length} palavras`);
    console.log(`  primeira palavra "${firstWord.word}" startTime=${durationToSec(firstWord.startTime as any).toFixed(2)}s`);
    console.log(`  última palavra "${lastWord.word}" endTime=${durationToSec(lastWord.endTime as any).toFixed(2)}s`);
  }

  fs.writeFileSync(
    path.resolve('results/diagnose-amostra-01.json'),
    JSON.stringify(response, null, 2),
  );
  console.log(`\nResposta crua salva em results/diagnose-amostra-01.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
