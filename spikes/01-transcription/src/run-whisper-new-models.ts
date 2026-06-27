/**
 * Compara novos modelos Whisper contra o baseline (large-v3) nas amostras reais.
 * Salva resultados com sufixo específico do modelo para não sobrescrever resultados anteriores.
 *
 * Modelos testados:
 *  - mlx-community/whisper-large-v3-turbo  (6x mais rápido, -1-2% WER)
 *  - fsicoli/whisper-large-v3-pt-3000h-4   (fine-tuned PT-BR, 3000h de dados)
 */
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { transcribeWhisper } from './transcribe-whisper.js';
import { computeWER } from './compute-wer.js';

const execP = promisify(exec);
const VENV_PYTHON = path.resolve('.venv', 'bin', 'python3');
const PTBR_SCRIPT = path.resolve('src', 'transcribe_ptbr.py');

async function transcribePTBR(audioPath: string, modelDir: string, label: string): Promise<{ text: string; procSec: number }> {
  const ext     = path.extname(audioPath).toLowerCase();
  const stem    = path.basename(audioPath, ext);
  const outPath = path.join(path.resolve('results'), `${stem}-${label}.txt`);
  const t0      = Date.now();

  await execP(
    `"${VENV_PYTHON}" "${PTBR_SCRIPT}" "${audioPath}" "${outPath}" "${path.resolve(modelDir)}"`,
    { maxBuffer: 64 * 1024 * 1024 },
  );

  if (!fs.existsSync(outPath)) throw new Error(`Script PT-BR não gerou ${outPath}`);
  const text    = fs.readFileSync(outPath, 'utf-8');
  const procSec = (Date.now() - t0) / 1000;
  console.log(`[${stem}] OK · proc=${procSec.toFixed(1)}s · ${outPath}`);
  return { text, procSec };
}

const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR   = path.resolve('results');
const SAMPLES_DIR   = path.resolve('samples');

// Focar nas amostras reais — são onde os novos modelos podem trazer mais ganho.
// Para incluir todas as amostras, remova o filtro abaixo.
const TARGET_STEMS = [
  'amostra-real-02',
  'amostra-real-01',
  'amostra-01',
  'amostra-02',
];

// runtime: 'mlx' usa mlx_whisper (Apple Silicon); 'ct2' usa whisper-ctranslate2 (CPU/CTranslate2).
// Para 'ct2', `id` é o caminho local do modelo já convertido.
// Nota: mlx-whisper força task token 50359 (=translate neste modelo fine-tuned, que tem tokens invertidos).
// O fix via generation_config.json funciona apenas no CT2 (faster-whisper lê o arquivo).
// Por isso, whisper-ptbr-mlx está EXCLUÍDO do benchmark — produz output truncado.
const MODELS: { id: string; label: string; runtime: 'mlx' | 'ct2' }[] = [
  { id: 'mlx-community/whisper-large-v3-turbo', label: 'whisper-turbo', runtime: 'mlx' },
  { id: 'models/whisper-ptbr-ct2-f16',          label: 'whisper-ptbr',  runtime: 'ct2' },
];

type Row = {
  stem: string;
  model: string;
  label: string;
  werNew: number;
  werBaseline: number | null;
  werGemini: number | null;
  audioSec: number;
  procSec: number;
  passed: boolean;
};

function pad(s: string, n: number, right = false) {
  return right ? s.padStart(n) : s.padEnd(n);
}

function pickAudio(stem: string): string | null {
  for (const ext of ['.flac', '.wav', '.ogg', '.m4a']) {
    const p = path.join(SAMPLES_DIR, `${stem}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function probeDuration(audioPath: string): Promise<number> {
  try {
    const { stdout } = await execP(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${audioPath}"`);
    return parseFloat(stdout.trim()) || 0;
  } catch { return 0; }
}

async function main() {
  const rows: Row[] = [];

  for (const { id, label, runtime } of MODELS) {
    console.log(`\n=== ${label} (${id}) [${runtime}] ===`);

    for (const stem of TARGET_STEMS) {
      const refPath   = path.join(REFERENCE_DIR, `${stem}.txt`);
      const audioPath = pickAudio(stem);

      if (!audioPath) { console.warn(`[${stem}] áudio não encontrado, pulando.`); continue; }
      if (!fs.existsSync(refPath)) { console.warn(`[${stem}] referência ausente, pulando.`); continue; }

      const outPath = path.join(RESULTS_DIR, `${stem}-${label}.txt`);

      let text: string;
      let audioSec = 0;
      let procSec  = 0;

      if (fs.existsSync(outPath)) {
        console.log(`[${stem}] resultado já existe, reutilizando.`);
        text = fs.readFileSync(outPath, 'utf-8');
        audioSec = await probeDuration(audioPath);
      } else if (runtime === 'ct2') {
        try {
          audioSec = await probeDuration(audioPath);
          console.log(`[${stem}] duração=${audioSec.toFixed(1)}s · modelo=${id}`);
          const r = await transcribePTBR(audioPath, id, label);
          text    = r.text;
          procSec = r.procSec;
        } catch (err) {
          console.error(`[${stem}] falhou:`, err instanceof Error ? err.message : err);
          continue;
        }
      } else {
        try {
          const result = await transcribeWhisper(audioPath, id, label);
          text     = result.text;
          audioSec = result.audioDurationSec;
          procSec  = result.processingDurationSec;
        } catch (err) {
          console.error(`[${stem}] falhou:`, err instanceof Error ? err.message : err);
          continue;
        }
      }

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

      rows.push({ stem, model: id, label, werNew: wer, werBaseline, werGemini, audioSec, procSec, passed: wer <= 0.10 });
    }
  }

  if (rows.length === 0) { console.log('\nNenhum resultado.'); return; }

  console.log('\n\n========== COMPARATIVO FINAL ==========');
  const header = `${pad('Amostra', 20)} | ${pad('Modelo', 18)} | ${pad('Novo WER', 9, true)} | ${pad('Baseline', 9, true)} | ${pad('Gemini', 7, true)} | ${pad('Δ vs base', 10, true)} | Status`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of rows) {
    const newPct  = `${(r.werNew * 100).toFixed(1)}%`;
    const basePct = r.werBaseline !== null ? `${(r.werBaseline * 100).toFixed(1)}%` : '—';
    const gemPct  = r.werGemini   !== null ? `${(r.werGemini   * 100).toFixed(1)}%` : '—';
    const delta   = r.werBaseline !== null
      ? `${((r.werNew - r.werBaseline) * 100).toFixed(1)}pp`
      : '—';
    const status  = r.passed ? '✅ APROVADO' : '❌ reprovado';
    console.log(
      `${pad(r.stem, 20)} | ${pad(r.label, 18)} | ${pad(newPct, 9, true)} | ${pad(basePct, 9, true)} | ${pad(gemPct, 7, true)} | ${pad(delta, 10, true)} | ${status}`,
    );
  }
  console.log('-'.repeat(header.length));
}

main().catch(err => { console.error(err); process.exit(1); });
