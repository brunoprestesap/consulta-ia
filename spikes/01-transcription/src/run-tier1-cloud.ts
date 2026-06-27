/**
 * Benchmark dos 3 providers Tier 1 identificados na pesquisa de Jun/2026:
 *   1. ElevenLabs Scribe v2  (ELEVENLABS_API_KEY)
 *   2. Deepgram Nova-3 pt-BR (DEEPGRAM_API_KEY)
 *   3. Cohere Transcribe     (COHERE_API_KEY)
 *
 * Compara com Gemini 2.5 Flash (provider atual aprovado, ADR 0010).
 * Critério de aprovação: WER ≤ 10%.
 *
 * Uso:
 *   cp .env.example .env   # preenche as 3 chaves
 *   pnpm tsx src/run-tier1-cloud.ts
 *   pnpm tsx src/run-tier1-cloud.ts elevenlabs   # só um provider
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { transcribeElevenLabs } from './transcribe-elevenlabs.js';
import { transcribeDeepgram }   from './transcribe-deepgram.js';
import { transcribeCohere }     from './transcribe-cohere.js';
import { computeWER }           from './compute-wer.js';

const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR   = path.resolve('results');
const SAMPLES_DIR   = path.resolve('samples');
const WER_THRESHOLD = 0.10;

const STEMS = ['amostra-01', 'amostra-02', 'amostra-03', 'amostra-real-01', 'amostra-real-02'];

const AUDIO_EXTS = ['.flac', '.wav', '.m4a', '.ogg', '.mp4', '.mp3'];

function findAudio(stem: string): string | null {
  for (const ext of AUDIO_EXTS) {
    const p = path.join(SAMPLES_DIR, `${stem}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

type Provider = {
  id: string;
  label: string;
  suffix: string;
  fn: (audio: string) => Promise<{ text: string; processingDurationSec: number; estimatedCostUSD: number }>;
  envKey: string;
};

const ALL_PROVIDERS: Provider[] = [
  {
    id: 'elevenlabs',
    label: 'ElevenLabs Scribe v2',
    suffix: 'elevenlabs',
    fn: transcribeElevenLabs,
    envKey: 'ELEVENLABS_API_KEY',
  },
  {
    id: 'deepgram',
    label: 'Deepgram Nova-3 pt-BR',
    suffix: 'deepgram',
    fn: transcribeDeepgram,
    envKey: 'DEEPGRAM_API_KEY',
  },
  {
    id: 'cohere',
    label: 'Cohere Transcribe',
    suffix: 'cohere',
    fn: transcribeCohere,
    envKey: 'COHERE_API_KEY',
  },
];

interface SampleResult {
  stem: string;
  wer: number;
  words: number;
  errors: number;
  procSec: number;
  costUSD: number;
  passed: boolean;
}

interface ProviderResult {
  provider: Provider;
  samples: SampleResult[];
  approved: number;
  totalCostUSD: number;
}

function loadBaseline(stem: string, suffix: string, reference: string): number | null {
  const p = path.join(RESULTS_DIR, `${stem}-${suffix}.txt`);
  if (!fs.existsSync(p)) return null;
  return computeWER(reference, fs.readFileSync(p, 'utf-8')).wer;
}

async function runProvider(provider: Provider): Promise<ProviderResult> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${provider.label}`);
  console.log('─'.repeat(60));

  const samples: SampleResult[] = [];

  for (const stem of STEMS) {
    const refPath   = path.join(REFERENCE_DIR, `${stem}.txt`);
    const audioPath = findAudio(stem);

    if (!fs.existsSync(refPath) || !audioPath) {
      console.warn(`  [${stem}] referência ou áudio ausente — pulando`);
      continue;
    }

    const outPath = path.join(RESULTS_DIR, `${stem}-${provider.suffix}.txt`);
    let text: string;
    let procSec: number;
    let costUSD: number;

    if (fs.existsSync(outPath)) {
      console.log(`  [${stem}] resultado já existe, reutilizando`);
      text    = fs.readFileSync(outPath, 'utf-8');
      procSec = 0;
      costUSD = 0;
    } else {
      const result = await provider.fn(audioPath!);
      text    = result.text;
      procSec = result.processingDurationSec;
      costUSD = result.estimatedCostUSD;
    }

    const reference = fs.readFileSync(refPath, 'utf-8');
    const { wer, words, errors } = computeWER(reference, text);
    samples.push({ stem, wer, words, errors, procSec, costUSD, passed: wer <= WER_THRESHOLD });
  }

  const approved     = samples.filter(s => s.passed).length;
  const totalCostUSD = samples.reduce((a, s) => a + s.costUSD, 0);
  return { provider, samples, approved, totalCostUSD };
}

function printProviderTable(r: ProviderResult): void {
  const header = `  Amostra`.padEnd(22) + `WER`.padEnd(10) + `Gemini`.padEnd(10) + `Proc(s)`.padEnd(10) + `Status`;
  console.log('\n' + header);
  console.log('  ' + '─'.repeat(58));

  for (const s of r.samples) {
    const werGemini = loadBaseline(s.stem, 'gemini', fs.readFileSync(path.join(REFERENCE_DIR, `${s.stem}.txt`), 'utf-8'));
    const pct     = (s.wer * 100).toFixed(1) + '%';
    const gemPct  = werGemini !== null ? (werGemini * 100).toFixed(1) + '%' : '—';
    const procStr = s.procSec > 0 ? s.procSec.toFixed(1) + 's' : '(cache)';
    const status  = s.passed ? '✅' : '❌';
    console.log(
      `  ${s.stem.padEnd(20)}${pct.padEnd(10)}${gemPct.padEnd(10)}${procStr.padEnd(10)}${status}`,
    );
  }
  console.log('  ' + '─'.repeat(58));
  console.log(`  Aprovados: ${r.approved}/${r.samples.length}  |  Custo total amostras: US$${r.totalCostUSD.toFixed(4)}`);
}

function printFinalComparison(results: ProviderResult[]): void {
  console.log('\n\n' + '═'.repeat(70));
  console.log('COMPARATIVO FINAL — TIER 1 CLOUD vs GEMINI 2.5 FLASH');
  console.log('═'.repeat(70));

  // Cabeçalho
  const providers = results.map(r => r.provider.label.substring(0, 12));
  let header = 'Amostra'.padEnd(22);
  for (const p of providers) header += p.padEnd(14);
  header += 'Gemini Flash';
  console.log(header);
  console.log('─'.repeat(70));

  for (const stem of STEMS) {
    const refPath = path.join(REFERENCE_DIR, `${stem}.txt`);
    if (!fs.existsSync(refPath)) continue;
    const reference = fs.readFileSync(refPath, 'utf-8');

    let row = stem.padEnd(22);
    for (const r of results) {
      const s = r.samples.find(x => x.stem === stem);
      const pct = s ? (s.wer * 100).toFixed(1) + '%' + (s.passed ? ' ✅' : ' ❌') : '—';
      row += pct.padEnd(14);
    }
    const gemWer = loadBaseline(stem, 'gemini', reference);
    const gemPct = gemWer !== null
      ? (gemWer * 100).toFixed(1) + '%' + (gemWer <= WER_THRESHOLD ? ' ✅' : ' ❌')
      : '—';
    row += gemPct;
    console.log(row);
  }
  console.log('─'.repeat(70));

  let approvedRow = 'Aprovados'.padEnd(22);
  for (const r of results) {
    approvedRow += `${r.approved}/${r.samples.length}`.padEnd(14);
  }
  console.log(approvedRow);

  let costRow = 'Custo/hr (ref)'.padEnd(22);
  const costs: Record<string, string> = {
    elevenlabs: '$0.22',
    deepgram: '$0.26',
    cohere: '~$0.50?',
  };
  for (const r of results) {
    costRow += (costs[r.provider.id] ?? '—').padEnd(14);
  }
  console.log(costRow);
  console.log('═'.repeat(70));
}

async function main() {
  const filter = process.argv[2]?.toLowerCase();

  const providers = filter
    ? ALL_PROVIDERS.filter(p => p.id === filter)
    : ALL_PROVIDERS;

  if (providers.length === 0) {
    console.error(`Provider não encontrado: ${filter}. Opções: ${ALL_PROVIDERS.map(p => p.id).join(', ')}`);
    process.exit(1);
  }

  // Verifica chaves antes de começar
  const missing = providers.filter(p => !process.env[p.envKey]);
  if (missing.length > 0) {
    for (const p of missing) {
      console.error(`❌ Variável ausente: ${p.envKey}  (necessária para ${p.label})`);
    }
    console.error('\nAdicione as chaves ao .env e rode novamente.');
    process.exit(1);
  }

  const results: ProviderResult[] = [];
  for (const provider of providers) {
    results.push(await runProvider(provider));
    printProviderTable(results[results.length - 1]!);
  }

  if (results.length > 1) {
    printFinalComparison(results);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
