/**
 * Benchmarks Parakeet TDT v3 (mlx-community/parakeet-tdt-0.6b-v3) nas 4 amostras do Spike 1.
 *
 * Modelo: NVIDIA Parakeet TDT 0.6B v3 (mesma família do Nemotron 3.5 ASR)
 * Línguas: 25 europeus incl. PT-PT. PT-BR não treinado → WER esperado > 10%.
 *
 * Contexto: Nemotron 3.5 ASR (PT-BR, WER 5.48%) foi inspecionado mas não executável:
 *   - transformers 5.12.1: arquitetura nemotron3_5_asr não reconhecida
 *   - nemo_toolkit: bloqueado por numba (requer Python <3.14, temos 3.14)
 *   - Mac Parakeet: usa CoreML (Swift-only, não acessível via Python)
 */
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { computeWER } from './compute-wer.js';

const execP = promisify(exec);
const VENV_PYTHON = path.resolve('.venv', 'bin', 'python3');
const PARAKEET_SCRIPT = path.resolve('src', 'transcribe_parakeet.py');

const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR   = path.resolve('results');
const SAMPLES_DIR   = path.resolve('samples');

const TARGET_STEMS = ['amostra-01', 'amostra-02', 'amostra-real-01', 'amostra-real-02'];

async function transcribeParakeet(audioPath: string, label: string): Promise<{ text: string; procSec: number }> {
  const ext     = path.extname(audioPath).toLowerCase();
  const stem    = path.basename(audioPath, ext);
  const outPath = path.join(RESULTS_DIR, `${stem}-${label}.txt`);

  if (fs.existsSync(outPath)) {
    console.log(`[${stem}] resultado já existe, reutilizando`);
    return { text: fs.readFileSync(outPath, 'utf-8'), procSec: 0 };
  }

  const t0 = Date.now();
  console.log(`[${stem}] transcrevendo com Parakeet TDT...`);
  await execP(`"${VENV_PYTHON}" "${PARAKEET_SCRIPT}" "${audioPath}" "${outPath}"`, {
    maxBuffer: 64 * 1024 * 1024,
  });
  const procSec = (Date.now() - t0) / 1000;
  const text = fs.readFileSync(outPath, 'utf-8');
  console.log(`[${stem}] OK · proc=${procSec.toFixed(1)}s`);
  return { text, procSec };
}

interface Row {
  stem: string;
  wer: number;
  werBaseline: number | null;
  werGemini: number | null;
  status: string;
}

async function main() {
  console.log('\n=== Parakeet TDT v3 (mlx-community/parakeet-tdt-0.6b-v3) ===\n');
  const rows: Row[] = [];

  for (const stem of TARGET_STEMS) {
    const refPath   = path.join(REFERENCE_DIR, `${stem}.txt`);
    const audioPath = path.join(SAMPLES_DIR, `${stem}.flac`);

    if (!fs.existsSync(refPath) || !fs.existsSync(audioPath)) {
      console.warn(`[${stem}] referência ou áudio ausente — pulando`);
      continue;
    }

    const { text } = await transcribeParakeet(audioPath, 'parakeet-tdt');
    const reference = fs.readFileSync(refPath, 'utf-8');
    const { wer }   = computeWER(reference, text);

    const baselinePath = path.join(RESULTS_DIR, `${stem}-whisper.txt`);
    const geminiPath   = path.join(RESULTS_DIR, `${stem}-gemini.txt`);

    const werBaseline = fs.existsSync(baselinePath)
      ? computeWER(reference, fs.readFileSync(baselinePath, 'utf-8')).wer
      : null;
    const werGemini = fs.existsSync(geminiPath)
      ? computeWER(reference, fs.readFileSync(geminiPath, 'utf-8')).wer
      : null;

    const status = wer <= 0.10 ? '✅ APROVADO' : '❌ reprovado';
    rows.push({ stem, wer, werBaseline, werGemini, status });
  }

  console.log('\n========== RESULTADOS PARAKEET TDT ==========');
  console.log(
    'Amostra'.padEnd(20) + '| WER Parakeet'.padEnd(16) + '| WER large-v3'.padEnd(16) + '| WER Gemini'.padEnd(14) + '| Status',
  );
  console.log('-'.repeat(80));
  let approved = 0;
  for (const r of rows) {
    const pct   = (r.wer * 100).toFixed(1) + '%';
    const base  = r.werBaseline !== null ? (r.werBaseline * 100).toFixed(1) + '%' : 'n/a';
    const gem   = r.werGemini !== null ? (r.werGemini * 100).toFixed(1) + '%' : 'n/a';
    if (r.wer <= 0.10) approved++;
    console.log(r.stem.padEnd(20) + ('| ' + pct).padEnd(16) + ('| ' + base).padEnd(16) + ('| ' + gem).padEnd(14) + '| ' + r.status);
  }
  console.log('-'.repeat(80));
  console.log(`Aprovados: ${approved}/${rows.length} (critério ≤ 10%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
