import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { psychiatryVocabulary } from './vocabulary.js';

const execP = promisify(exec);

export type WhisperResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
  model: string;
};

// Whisper large-v3 em MLX (Apple Silicon). Baixado do HF na primeira execução (~3 GB).
const DEFAULT_MODEL = 'mlx-community/whisper-large-v3-mlx';

// Caminho do Python do venv local (.venv), criado dentro do spike.
const VENV_PY = path.resolve('.venv', 'bin', 'mlx_whisper');

// Whisper usa o initial-prompt para enviesar o vocabulário (análogo ao speechContexts
// do Google). Texto natural curto funciona melhor que uma lista crua — o prompt é
// truncado em ~224 tokens. Reaproveitamos os termos psiquiátricos do spike.
const INITIAL_PROMPT =
  'Transcrição de consulta psiquiátrica em português do Brasil. ' +
  `Termos frequentes: ${psychiatryVocabulary.slice(0, 28).join(', ')}.`;

async function probeDuration(audioPath: string): Promise<number> {
  const { stdout } = await execP(
    `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${audioPath}"`,
  );
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duração inválida em ${audioPath}: ${stdout}`);
  return d;
}

export async function transcribeWhisper(
  audioPath: string,
  model: string = DEFAULT_MODEL,
): Promise<WhisperResult> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Arquivo não encontrado: ${audioPath}`);
  }
  if (!fs.existsSync(VENV_PY)) {
    throw new Error(
      `mlx_whisper não encontrado em ${VENV_PY}. Rode: python3 -m venv .venv && .venv/bin/pip install mlx-whisper`,
    );
  }

  const ext = path.extname(audioPath).toLowerCase();
  const stem = path.basename(audioPath, ext);
  const duration = await probeDuration(audioPath);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `spike-01-whisper-${stem}-`));
  console.log(`[${stem}] duração=${duration.toFixed(1)}s · modelo=${model}`);

  const t0 = Date.now();
  try {
    const args = [
      `"${audioPath}"`,
      `--model "${model}"`,
      '--language pt',
      '--task transcribe',
      `--output-dir "${outDir}"`,
      '--output-format txt',
      '--output-name out',
      `--initial-prompt "${INITIAL_PROMPT.replace(/"/g, '')}"`,
      // CRÍTICO p/ áudio longo: sem isto o Whisper realimenta o próprio texto e,
      // ao entrar num loop ("Não. Não. Não..."), nunca sai — derrubando o WER de
      // ~16% para ~90% na amostra-real-01. Ver README do spike.
      '--condition-on-previous-text False',
      '--verbose False',
    ].join(' ');

    // Buffer generoso: arquivos longos geram bastante stdout.
    await execP(`"${VENV_PY}" ${args}`, { maxBuffer: 64 * 1024 * 1024 });

    const producedTxt = path.join(outDir, 'out.txt');
    if (!fs.existsSync(producedTxt)) {
      throw new Error(`mlx_whisper não gerou ${producedTxt}`);
    }
    const text = fs.readFileSync(producedTxt, 'utf-8').replace(/\s+/g, ' ').trim();
    const processingDurationSec = (Date.now() - t0) / 1000;

    const resultsDir = path.resolve('results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const outputPath = path.join(resultsDir, `${stem}-whisper.txt`);
    fs.writeFileSync(outputPath, text);

    console.log(
      `[${stem}] OK · áudio=${duration.toFixed(0)}s · proc=${processingDurationSec.toFixed(1)}s · ` +
      `custo=US$0.000 (local) · ${outputPath}`,
    );

    return {
      text,
      audioPath,
      audioDurationSec: duration,
      processingDurationSec,
      estimatedCostUSD: 0,
      outputPath,
      model,
    };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: tsx src/transcribe-whisper.ts <caminho-do-audio> [modelo]');
    process.exit(1);
  }
  const model = process.argv[3] ?? DEFAULT_MODEL;
  transcribeWhisper(input, model).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
