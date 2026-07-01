import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { transcribeGemini } from './transcribe-gemini.js';
import { computeWER } from './compute-wer.js';

// Throwaway: mede a variância run-to-run do Gemini com input idêntico,
// para saber se diferenças de WER entre variantes do Passo 8 são sinal ou ruído.
async function main() {
  const stem = process.argv[2] ?? 'amostra-real-02';
  const runs = parseInt(process.argv[3] ?? '3', 10);
  const reference = fs.readFileSync(path.resolve('reference', `${stem}.txt`), 'utf-8');
  const audio = path.resolve('samples', `${stem}.flac`);

  const wers: number[] = [];
  for (let i = 0; i < runs; i++) {
    const res = await transcribeGemini(audio);
    const w = computeWER(reference, res.text);
    wers.push(w.wer);
    console.log(`run ${i + 1}: WER=${(w.wer * 100).toFixed(1)}% (${w.errors}/${w.words})`);
  }
  const mean = wers.reduce((a, b) => a + b, 0) / wers.length;
  const min = Math.min(...wers), max = Math.max(...wers);
  console.log(`\nmédia=${(mean * 100).toFixed(1)}% · min=${(min * 100).toFixed(1)}% · max=${(max * 100).toFixed(1)}% · amplitude=${((max - min) * 100).toFixed(1)}pp`);
}

main().catch(err => { console.error(err); process.exit(1); });
