import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { transcribe } from './transcribe.js';
import { computeWER } from './compute-wer.js';

const SAMPLES_DIR = path.resolve('samples');
const REFERENCE_DIR = path.resolve('reference');
const WER_THRESHOLD = 0.10;
const MIN_APPROVED = 3;
const SUPPORTED_EXT = /\.(wav|flac|ogg|opus)$/i;

type Row = {
  name: string;
  wer: number;
  words: number;
  errors: number;
  audioSec: number;
  processingSec: number;
  costUSD: number;
  passed: boolean;
};

function pad(s: string, n: number, right = false): string {
  return right ? s.padStart(n) : s.padEnd(n);
}

async function main() {
  if (!fs.existsSync(SAMPLES_DIR)) {
    throw new Error(`Pasta não encontrada: ${SAMPLES_DIR}. Crie e adicione as amostras antes de rodar.`);
  }

  const files = fs.readdirSync(SAMPLES_DIR)
    .filter(f => SUPPORTED_EXT.test(f))
    .sort();

  if (files.length === 0) {
    console.log(`Nenhuma amostra suportada em ${SAMPLES_DIR}/. Formatos aceitos: .wav, .flac, .ogg, .opus`);
    return;
  }

  const rows: Row[] = [];

  for (const file of files) {
    const stem = path.basename(file, path.extname(file));
    const referencePath = path.join(REFERENCE_DIR, `${stem}.txt`);
    if (!fs.existsSync(referencePath)) {
      console.warn(`Pulando ${file}: referência ausente em ${referencePath}`);
      continue;
    }

    const audioPath = path.join(SAMPLES_DIR, file);
    try {
      const result = await transcribe(audioPath);
      const reference = fs.readFileSync(referencePath, 'utf-8');
      const wer = computeWER(reference, result.text);
      rows.push({
        name: stem,
        wer: wer.wer,
        words: wer.words,
        errors: wer.errors,
        audioSec: result.audioDurationSec,
        processingSec: result.processingDurationSec,
        costUSD: result.estimatedCostUSD,
        passed: wer.wer <= WER_THRESHOLD,
      });
    } catch (err) {
      console.error(`Falhou ${file}:`, err);
    }
  }

  if (rows.length === 0) {
    console.log('Nenhum par amostra+referência processado.');
    return;
  }

  console.log('\n--- Resultados ---');
  const header =
    `${pad('Amostra', 20)}| ${pad('WER', 7, true)} | ${pad('Palavras', 8, true)} | ${pad('Erros', 5, true)} | ${pad('Áudio', 7, true)} | ${pad('Proc', 7, true)} | ${pad('Custo', 8, true)} | Status`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    const pct = `${(r.wer * 100).toFixed(1)}%`;
    const status = r.passed ? 'APROVADO' : 'REPROVADO';
    console.log(
      `${pad(r.name, 20)}| ${pad(pct, 7, true)} | ${pad(String(r.words), 8, true)} | ${pad(String(r.errors), 5, true)} | ${pad(`${r.audioSec.toFixed(0)}s`, 7, true)} | ${pad(`${r.processingSec.toFixed(0)}s`, 7, true)} | ${pad(`$${r.costUSD.toFixed(3)}`, 8, true)} | ${status}`
    );
  }
  console.log('-'.repeat(header.length));

  const approved = rows.filter(r => r.passed).length;
  const meanWER = rows.reduce((s, r) => s + r.wer, 0) / rows.length;
  const totalCost = rows.reduce((s, r) => s + r.costUSD, 0);
  const totalAudio = rows.reduce((s, r) => s + r.audioSec, 0);

  console.log(
    `Aprovadas: ${approved}/${rows.length} · WER médio: ${(meanWER * 100).toFixed(1)}% · Áudio total: ${(totalAudio / 60).toFixed(1)}min · Custo total: US$${totalCost.toFixed(3)}`
  );

  const spikePass = approved >= MIN_APPROVED && rows.length >= 5;
  console.log(
    `\nResultado do spike: ${spikePass ? 'APROVADO ✅' : 'REPROVADO ❌'} (critério: ≥ ${MIN_APPROVED} de 5 com WER ≤ ${(WER_THRESHOLD * 100).toFixed(0)}%)`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
