import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { transcribeGemini } from './transcribe-gemini.js';
import { computeWER } from './compute-wer.js';

// Passo 8 do Spike 1 (ADR 0011) — A/B de pré-processamento de áudio.
// Testa a hipótese: "limpar o áudio ajuda ou piora o WER?".
// Variantes A (getUserMedia cru) e B (default do navegador) exigem captura no
// browser e não são reproduzíveis a partir de arquivos já gravados; ficam para
// um experimento de captura na Fase 1. Aqui rodamos o A/B *offline* de 3 vias:
//   baseline (como capturado) vs C (mínimo) vs D (denoise agressivo).

const execP = promisify(exec);

const SAMPLES = path.resolve('samples');
const REFERENCE = path.resolve('reference');
const RESULTS = path.resolve('results');
const WER_THRESHOLD = 0.10;

// Filtros ffmpeg — documentados aqui para reprodutibilidade (checklist do Passo 8).
// C: high-pass <80 Hz (tira ronco/HVAC) + normalização de loudness EBU R128.
// D: C + denoise FFT agressivo (afftdn) antes do high-pass.
const FILTERS: Record<'c' | 'd', string> = {
  c: 'highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11',
  d: 'afftdn=nr=24:nf=-30,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11',
};

type Variant = 'baseline' | 'c' | 'd';

async function ensureVariant(srcFlac: string, stem: string, key: 'c' | 'd'): Promise<string> {
  const out = path.join(SAMPLES, `${stem}-${key}.flac`);
  if (fs.existsSync(out)) {
    console.log(`[${stem}-${key}] variante já existe, reusando`);
    return out;
  }
  console.log(`[${stem}-${key}] gerando via ffmpeg: -af "${FILTERS[key]}"`);
  await execP(`ffmpeg -y -hide_banner -loglevel error -i "${srcFlac}" -af "${FILTERS[key]}" -c:a flac "${out}"`);
  return out;
}

async function werForVariant(stem: string, reference: string, variant: Variant): Promise<{
  wer: number; words: number; errors: number; costUSD: number; procSec: number; reused: boolean;
}> {
  // Baseline sempre roda fresco: reusar um resultado antigo introduz variância
  // entre execuções/versões de prompt e falseia a comparação (lição da probe de variância).
  const srcFlac = path.join(SAMPLES, `${stem}.flac`);
  const audioPath = variant === 'baseline' ? srcFlac : await ensureVariant(srcFlac, stem, variant);
  const res = await transcribeGemini(audioPath);
  const w = computeWER(reference, res.text);
  return { ...w, costUSD: res.estimatedCostUSD, procSec: res.processingDurationSec, reused: false };
}

async function main() {
  const stems = process.argv.slice(2);
  if (stems.length === 0) {
    console.error('Uso: tsx src/run-preprocess-ab.ts <stem> [<stem> ...]');
    console.error('Ex.: tsx src/run-preprocess-ab.ts amostra-real-02 amostra-real-01');
    process.exit(1);
  }

  const lines: string[] = [];
  lines.push('# Passo 8 — A/B de pré-processamento de áudio (ADR 0011)\n');
  lines.push('Filtros ffmpeg:');
  lines.push('- **C (mínimo):** `' + FILTERS.c + '`');
  lines.push('- **D (denoise agressivo):** `' + FILTERS.d + '`\n');

  let grandCost = 0;

  for (const stem of stems) {
    const refPath = path.join(REFERENCE, `${stem}.txt`);
    if (!fs.existsSync(refPath)) { console.warn(`Pulando ${stem}: referência ausente`); continue; }
    const reference = fs.readFileSync(refPath, 'utf-8');

    console.log(`\n=== ${stem} ===`);
    const variants: Variant[] = ['baseline', 'c', 'd'];
    const rows: { variant: Variant; wer: number; words: number; errors: number; costUSD: number; reused: boolean }[] = [];
    for (const v of variants) {
      const r = await werForVariant(stem, reference, v);
      grandCost += r.costUSD;
      rows.push({ variant: v, wer: r.wer, words: r.words, errors: r.errors, costUSD: r.costUSD, reused: r.reused });
    }

    const winner = rows.reduce((best, r) => (r.wer < best.wer ? r : best), rows[0]!);

    console.log(`${'Variante'.padEnd(28)} | ${'WER'.padStart(7)} | ${'Erros'.padStart(6)} | Status`);
    console.log('-'.repeat(60));
    lines.push(`\n## ${stem}\n`);
    lines.push('| Variante | WER | Erros/Palavras | Status |');
    lines.push('|---|---|---|---|');
    for (const r of rows) {
      const label = { baseline: 'Baseline (como capturado)', c: 'C — mínimo (hp+loudnorm)', d: 'D — denoise agressivo' }[r.variant];
      const pct = `${(r.wer * 100).toFixed(1)}%`;
      const pass = r.wer <= WER_THRESHOLD ? '✅' : '❌';
      const win = r === winner ? ' ⬅ menor' : '';
      console.log(`${label.padEnd(28)} | ${pct.padStart(7)} | ${String(r.errors).padStart(6)} | ${pass}${win}${r.reused ? ' (reuso)' : ''}`);
      lines.push(`| ${label} | ${pct} ${pass} | ${r.errors}/${r.words} |${win ? ' **menor WER**' : ''}${r.reused ? ' _(baseline reusado)_' : ''} |`);
    }
    const winLabel = { baseline: 'Baseline', c: 'C (mínimo)', d: 'D (denoise agressivo)' }[winner.variant];
    console.log(`→ vencedora: ${winLabel} (${(winner.wer * 100).toFixed(1)}%)`);
    lines.push(`\n→ **Vencedora: ${winLabel}** (${(winner.wer * 100).toFixed(1)}%)`);
  }

  lines.push(`\n---\n\n_Custo Gemini desta execução: ~US$${grandCost.toFixed(3)} (baseline reusado quando disponível)._`);
  const summaryPath = path.join(RESULTS, 'passo8-ab-summary.md');
  fs.writeFileSync(summaryPath, lines.join('\n'));
  console.log(`\nResumo salvo em ${summaryPath}`);
  console.log(`Custo total desta execução: ~US$${grandCost.toFixed(3)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
