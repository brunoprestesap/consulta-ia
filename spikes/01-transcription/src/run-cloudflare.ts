/**
 * Benchmark dos modelos de transcrição hospedados no Cloudflare Workers AI:
 *   1. @cf/openai/whisper              ($0.0005/min)
 *   2. @cf/openai/whisper-large-v3-turbo ($0.0005/min)
 *   3. @cf/deepgram/nova-3             ($0.0052/min)
 *
 * Compara WER com Gemini 2.5 Flash (baseline aprovado).
 * Critério: WER ≤ 10%.
 *
 * Uso:
 *   pnpm tsx src/run-cloudflare.ts                    # todos os modelos
 *   pnpm tsx src/run-cloudflare.ts whisper-turbo      # só um modelo
 *
 * Requer no .env:
 *   CF_ACCOUNT_ID=<account-id>
 *   CF_API_TOKEN=<api-token-com-workers-ai-write>
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { transcribeCloudflare } from './transcribe-cloudflare.js';
import { computeWER }           from './compute-wer.js';

const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR   = path.resolve('results');
const SAMPLES_DIR   = path.resolve('samples');
const WER_THRESHOLD = 0.10;

const STEMS = ['amostra-01', 'amostra-02', 'amostra-03', 'amostra-real-01', 'amostra-real-02'];
const AUDIO_EXTS = ['.flac', '.wav', '.m4a', '.ogg', '.mp4', '.mp3'];

type ModelSpec = {
  id: string;
  label: string;
  model: string;
  suffix: string;
  usdPerMin: number;
};

const ALL_MODELS: ModelSpec[] = [
  {
    id: 'whisper',
    label: 'Whisper (base)',
    model: '@cf/openai/whisper',
    suffix: 'cf-whisper',
    usdPerMin: 0.0005,
  },
  {
    id: 'whisper-turbo',
    label: 'Whisper Large v3 Turbo',
    model: '@cf/openai/whisper-large-v3-turbo',
    suffix: 'cf-whisper-turbo',
    usdPerMin: 0.0005,
  },
  {
    id: 'nova-3',
    label: 'Deepgram Nova-3',
    model: '@cf/deepgram/nova-3',
    suffix: 'cf-nova-3',
    usdPerMin: 0.0052,
  },
];

function findAudio(stem: string): string | null {
  for (const ext of AUDIO_EXTS) {
    const p = path.join(SAMPLES_DIR, `${stem}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadWER(stem: string, suffix: string, reference: string): number | null {
  const p = path.join(RESULTS_DIR, `${stem}-${suffix}.txt`);
  if (!fs.existsSync(p)) return null;
  return computeWER(reference, fs.readFileSync(p, 'utf-8')).wer;
}

interface SampleResult {
  stem: string;
  wer: number;
  words: number;
  errors: number;
  procSec: number;
  costUSD: number;
  passed: boolean;
}

interface ModelResult {
  spec: ModelSpec;
  samples: SampleResult[];
  approved: number;
  totalCostUSD: number;
}

async function runModel(spec: ModelSpec): Promise<ModelResult> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${spec.label} (${spec.model})`);
  console.log('─'.repeat(60));

  const samples: SampleResult[] = [];

  for (const stem of STEMS) {
    const refPath   = path.join(REFERENCE_DIR, `${stem}.txt`);
    const audioPath = findAudio(stem);

    if (!fs.existsSync(refPath) || !audioPath) {
      console.warn(`  [${stem}] referência ou áudio ausente — pulando`);
      continue;
    }

    const outPath = path.join(RESULTS_DIR, `${stem}-${spec.suffix}.txt`);
    let text: string;
    let procSec: number;
    let costUSD: number;

    if (fs.existsSync(outPath)) {
      console.log(`  [${stem}] resultado já existe, reutilizando`);
      text    = fs.readFileSync(outPath, 'utf-8');
      procSec = 0;
      costUSD = 0;
    } else {
      try {
        const result = await transcribeCloudflare(audioPath, spec.model);
        text    = result.text;
        procSec = result.processingDurationSec;
        costUSD = result.estimatedCostUSD;
      } catch (err: unknown) {
        console.error(`  [${stem}] ERRO: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    const reference = fs.readFileSync(refPath, 'utf-8');
    const { wer, words, errors } = computeWER(reference, text);
    samples.push({ stem, wer, words, errors, procSec, costUSD, passed: wer <= WER_THRESHOLD });
  }

  const approved     = samples.filter(s => s.passed).length;
  const totalCostUSD = samples.reduce((a, s) => a + s.costUSD, 0);
  return { spec, samples, approved, totalCostUSD };
}

function printModelTable(r: ModelResult): void {
  const header = `  Amostra`.padEnd(22) + `WER`.padEnd(10) + `Gemini`.padEnd(10) + `Proc(s)`.padEnd(10) + `Status`;
  console.log('\n' + header);
  console.log('  ' + '─'.repeat(58));

  for (const s of r.samples) {
    const refPath  = path.join(REFERENCE_DIR, `${s.stem}.txt`);
    const ref      = fs.readFileSync(refPath, 'utf-8');
    const gemWer   = loadWER(s.stem, 'gemini', ref);
    const pct      = (s.wer * 100).toFixed(1) + '%';
    const gemPct   = gemWer !== null ? (gemWer * 100).toFixed(1) + '%' : '—';
    const procStr  = s.procSec > 0 ? s.procSec.toFixed(1) + 's' : '(cache)';
    const status   = s.passed ? '✅' : '❌';
    console.log(`  ${s.stem.padEnd(20)}${pct.padEnd(10)}${gemPct.padEnd(10)}${procStr.padEnd(10)}${status}`);
  }

  console.log('  ' + '─'.repeat(58));
  console.log(`  Aprovados: ${r.approved}/${r.samples.length}  |  Custo total amostras: US$${r.totalCostUSD.toFixed(4)}`);
}

function printFinalComparison(results: ModelResult[]): void {
  console.log('\n\n' + '═'.repeat(80));
  console.log('COMPARATIVO FINAL — CLOUDFLARE WORKERS AI vs GEMINI 2.5 FLASH (baseline)');
  console.log('═'.repeat(80));

  const labels = results.map(r => r.spec.label.substring(0, 14));
  let header   = 'Amostra'.padEnd(22);
  for (const l of labels) header += l.padEnd(16);
  header += 'Gemini Flash';
  console.log(header);
  console.log('─'.repeat(80));

  for (const stem of STEMS) {
    const refPath = path.join(REFERENCE_DIR, `${stem}.txt`);
    if (!fs.existsSync(refPath)) continue;
    const ref = fs.readFileSync(refPath, 'utf-8');

    let row = stem.padEnd(22);
    for (const r of results) {
      const s   = r.samples.find(x => x.stem === stem);
      const pct = s ? (s.wer * 100).toFixed(1) + '%' + (s.passed ? ' ✅' : ' ❌') : '—';
      row += pct.padEnd(16);
    }
    const gemWer = loadWER(stem, 'gemini', ref);
    const gemPct = gemWer !== null
      ? (gemWer * 100).toFixed(1) + '%' + (gemWer <= WER_THRESHOLD ? ' ✅' : ' ❌')
      : '—';
    row += gemPct;
    console.log(row);
  }

  console.log('─'.repeat(80));

  let approvedRow = 'Aprovados'.padEnd(22);
  for (const r of results) approvedRow += `${r.approved}/${r.samples.length}`.padEnd(16);
  console.log(approvedRow);

  let costRow = 'Custo/hora (ref)'.padEnd(22);
  for (const r of results) costRow += `$${(r.spec.usdPerMin * 60).toFixed(3)}/hr`.padEnd(16);
  costRow += '~$0.10-0.15/hr';
  console.log(costRow);

  console.log('═'.repeat(80));
}

async function main() {
  const filter = process.argv[2]?.toLowerCase();

  const models = filter
    ? ALL_MODELS.filter(m => m.id === filter)
    : ALL_MODELS;

  if (models.length === 0) {
    console.error(`Modelo não encontrado: ${filter}. Opções: ${ALL_MODELS.map(m => m.id).join(', ')}`);
    process.exit(1);
  }

  if (!process.env['CF_ACCOUNT_ID'] || !process.env['CF_API_TOKEN']) {
    console.error('❌ CF_ACCOUNT_ID e CF_API_TOKEN são necessários no .env');
    console.error('   CF_ACCOUNT_ID: Cloudflare dashboard → lado direito da página inicial');
    console.error('   CF_API_TOKEN: My Profile → API Tokens → Create Token → Workers AI (Write)');
    process.exit(1);
  }

  const results: ModelResult[] = [];
  for (const spec of models) {
    results.push(await runModel(spec));
    printModelTable(results[results.length - 1]!);
  }

  if (results.length > 1) printFinalComparison(results);
}

main().catch(err => { console.error(err); process.exit(1); });
