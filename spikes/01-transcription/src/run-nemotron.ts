/**
 * Benchmarks Nemotron 3.5 ASR (nvidia/nemotron-3.5-asr-streaming-0.6b) nas 4 amostras do Spike 1.
 *
 * Pré-requisito: venv312 (Python 3.12) com NeMo 3.x instalado.
 *   cd spikes/01-transcription
 *   python3.12 -m venv .venv312
 *   .venv312/bin/pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git@main"
 *
 * Modelo: Cache-Aware FastConformer-RNNT com prompt conditioning
 * WER (paper, FLEURS PT-BR): 5.48% | Medido em CPU neste spike: ~12-21%
 * RTF em CPU (Apple M-series): ~0.35× (sem MPS — NeMo não suporta Metal)
 */
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { computeWER } from './compute-wer.js';

const execP = promisify(exec);
const VENV312_PYTHON = path.resolve('.venv312', 'bin', 'python');
const NEMOTRON_SCRIPT = path.resolve('src', 'transcribe_nemotron.py');

const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR   = path.resolve('results');
const SAMPLES_DIR   = path.resolve('samples');

const TARGET_STEMS = ['amostra-01', 'amostra-02', 'amostra-real-01', 'amostra-real-02'];

async function transcribeNemotron(
  audioPath: string,
  label: string,
  lang = 'pt-BR',
): Promise<{ text: string; procSec: number }> {
  const ext     = path.extname(audioPath).toLowerCase();
  const stem    = path.basename(audioPath, ext);
  const outPath = path.join(RESULTS_DIR, `${stem}-${label}.txt`);

  if (fs.existsSync(outPath)) {
    console.log(`[${stem}] resultado já existe, reutilizando`);
    return { text: fs.readFileSync(outPath, 'utf-8'), procSec: 0 };
  }

  console.log(`[${stem}] transcrevendo com Nemotron (lang=${lang})...`);
  const t0 = Date.now();
  await execP(
    `"${VENV312_PYTHON}" "${NEMOTRON_SCRIPT}" "${audioPath}" "${outPath}" --lang ${lang}`,
    { maxBuffer: 64 * 1024 * 1024 },
  );
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
  if (!fs.existsSync(VENV312_PYTHON)) {
    console.error(`Erro: venv312 não encontrado em ${VENV312_PYTHON}`);
    console.error('Crie com: python3.12 -m venv .venv312');
    console.error('Instale: .venv312/bin/pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git@main"');
    process.exit(1);
  }

  console.log('\n=== Nemotron 3.5 ASR (nvidia/nemotron-3.5-asr-streaming-0.6b) ===\n');
  const rows: Row[] = [];

  for (const stem of TARGET_STEMS) {
    const refPath   = path.join(REFERENCE_DIR, `${stem}.txt`);
    const audioPath = path.join(SAMPLES_DIR, `${stem}.flac`);

    if (!fs.existsSync(refPath) || !fs.existsSync(audioPath)) {
      console.warn(`[${stem}] referência ou áudio ausente — pulando`);
      continue;
    }

    const { text } = await transcribeNemotron(audioPath, 'nemotron');
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

  console.log('\n========== RESULTADOS NEMOTRON ==========');
  console.log(
    'Amostra'.padEnd(20) + '| WER Nemotron'.padEnd(16) + '| WER large-v3'.padEnd(16) + '| WER Gemini'.padEnd(14) + '| Status',
  );
  console.log('-'.repeat(80));
  let approved = 0;
  for (const r of rows) {
    const pct  = (r.wer * 100).toFixed(1) + '%';
    const base = r.werBaseline !== null ? (r.werBaseline * 100).toFixed(1) + '%' : 'n/a';
    const gem  = r.werGemini !== null ? (r.werGemini * 100).toFixed(1) + '%' : 'n/a';
    if (r.wer <= 0.10) approved++;
    console.log(
      r.stem.padEnd(20) + ('| ' + pct).padEnd(16) + ('| ' + base).padEnd(16) + ('| ' + gem).padEnd(14) + '| ' + r.status,
    );
  }
  console.log('-'.repeat(80));
  console.log(`Aprovados: ${approved}/${rows.length} (critério ≤ 10%)`);
  console.log('\nNota: WER paper (FLEURS PT-BR) = 5.48% com CUDA. CPU sem MPS → WER mais alto.');
}

main().catch((e) => { console.error(e); process.exit(1); });
