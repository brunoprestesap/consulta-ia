import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { transcribeGemini } from './transcribe-gemini.js';
import { computeWER } from './compute-wer.js';

const SAMPLES_DIR   = path.resolve('samples');
const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR   = path.resolve('results');
const WER_THRESHOLD = 0.10;
const MIN_APPROVED  = 2;
const MIN_SAMPLES   = 2;
const MODEL         = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const MAX_PLAUSIBLE_WPM = 250;
const PREFERRED_EXT = ['.flac', '.wav', '.ogg', '.m4a', '.mp4'];

type Row = {
  name: string;
  werGemini: number;
  werGoogle: number | null;
  werWhisper: number | null;
  words: number;
  errors: number;
  audioSec: number;
  processingSec: number;
  costUSD: number;
  passed: boolean;
  invalidFixture: boolean;
};

function pad(s: string, n: number, right = false): string {
  return right ? s.padStart(n) : s.padEnd(n);
}

function pickSamples(): { stem: string; file: string }[] {
  const byStem = new Map<string, string>();
  for (const f of fs.readdirSync(SAMPLES_DIR).sort()) {
    const ext = path.extname(f).toLowerCase();
    if (!PREFERRED_EXT.includes(ext)) continue;
    const stem = path.basename(f, ext);
    const current = byStem.get(stem);
    if (!current) { byStem.set(stem, f); continue; }
    const rankNew = PREFERRED_EXT.indexOf(ext);
    const rankCur = PREFERRED_EXT.indexOf(path.extname(current).toLowerCase());
    if (rankNew < rankCur) byStem.set(stem, f);
  }
  return [...byStem.entries()].map(([stem, file]) => ({ stem, file })).sort((a, b) => a.stem.localeCompare(b.stem));
}

async function main() {
  if (!fs.existsSync(SAMPLES_DIR)) throw new Error(`Pasta não encontrada: ${SAMPLES_DIR}`);
  const samples = pickSamples();
  if (samples.length === 0) { console.log('Nenhuma amostra encontrada.'); return; }

  const rows: Row[] = [];

  for (const { stem, file } of samples) {
    const referencePath = path.join(REFERENCE_DIR, `${stem}.txt`);
    if (!fs.existsSync(referencePath)) {
      console.warn(`Pulando ${file}: referência ausente em ${referencePath}`);
      continue;
    }

    const audioPath = path.join(SAMPLES_DIR, file);
    try {
      const result  = await transcribeGemini(audioPath, MODEL);
      const reference = fs.readFileSync(referencePath, 'utf-8');
      const wer     = computeWER(reference, result.text);

      const refWpm  = (wer.words / result.audioDurationSec) * 60;
      const invalidFixture = refWpm > MAX_PLAUSIBLE_WPM;
      if (invalidFixture) {
        console.warn(`⚠️  ${stem}: referência tem ${wer.words} palavras para ${result.audioDurationSec.toFixed(0)}s (${refWpm.toFixed(0)} wpm) — fixture inválido.`);
      }

      const googlePath  = path.join(RESULTS_DIR, `${stem}-google.txt`);
      const whisperPath = path.join(RESULTS_DIR, `${stem}-whisper.txt`);
      const werGoogle   = fs.existsSync(googlePath)  ? computeWER(reference, fs.readFileSync(googlePath, 'utf-8')).wer  : null;
      const werWhisper  = fs.existsSync(whisperPath) ? computeWER(reference, fs.readFileSync(whisperPath, 'utf-8')).wer : null;

      rows.push({
        name: stem, werGemini: wer.wer, werGoogle, werWhisper,
        words: wer.words, errors: wer.errors,
        audioSec: result.audioDurationSec, processingSec: result.processingDurationSec,
        costUSD: result.estimatedCostUSD,
        passed: !invalidFixture && wer.wer <= WER_THRESHOLD,
        invalidFixture,
      });
    } catch (err) {
      console.error(`Falhou ${file}:`, err);
    }
  }

  if (rows.length === 0) { console.log('Nenhum par processado.'); return; }

  console.log('\n--- Resultados (Gemini vs. Whisper vs. Google) ---');
  const header =
    `${pad('Amostra', 20)}| ${pad('Gemini', 8, true)} | ${pad('Whisper', 8, true)} | ${pad('Google', 8, true)} | ${pad('Min', 5, true)} | ${pad('Proc', 6, true)} | ${pad('Custo', 7, true)} | Status`;
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const r of rows) {
    const pctG  = r.invalidFixture ? 'n/a' : `${(r.werGemini  * 100).toFixed(1)}%`;
    const pctW  = r.werWhisper  !== null ? `${(r.werWhisper  * 100).toFixed(1)}%` : '—';
    const pctGo = r.werGoogle   !== null ? `${(r.werGoogle   * 100).toFixed(1)}%` : '—';
    const status = r.invalidFixture ? 'FIXTURE?' : r.passed ? 'APROVADO ✅' : 'REPROVADO ❌';
    console.log(
      `${pad(r.name, 20)}| ${pad(pctG, 8, true)} | ${pad(pctW, 8, true)} | ${pad(pctGo, 8, true)} | ` +
      `${pad(`${(r.audioSec / 60).toFixed(1)}`, 5, true)} | ${pad(`${r.processingSec.toFixed(0)}s`, 6, true)} | ` +
      `${pad(`$${r.costUSD.toFixed(3)}`, 7, true)} | ${status}`,
    );
  }
  console.log('-'.repeat(header.length));

  const valid      = rows.filter(r => !r.invalidFixture);
  const skipped    = rows.length - valid.length;
  const approved   = valid.filter(r => r.passed).length;
  const meanWER    = valid.length ? valid.reduce((s, r) => s + r.werGemini, 0) / valid.length : 0;
  const totalAudio = rows.reduce((s, r) => s + r.audioSec, 0);
  const totalCost  = rows.reduce((s, r) => s + r.costUSD, 0);
  const totalProc  = rows.reduce((s, r) => s + r.processingSec, 0);

  console.log(
    `Aprovadas: ${approved}/${valid.length} válidas · WER médio Gemini: ${(meanWER * 100).toFixed(1)}% · ` +
    `Áudio total: ${(totalAudio / 60).toFixed(1)}min · Proc total: ${(totalProc / 60).toFixed(1)}min · ` +
    `Custo total: US$${totalCost.toFixed(3)}` +
    (skipped ? ` · ${skipped} ignorada(s) por fixture inválido` : ''),
  );

  const spikePass = approved >= MIN_APPROVED && valid.length >= MIN_SAMPLES;
  console.log(
    `\nResultado (Gemini ${MODEL}): ${spikePass ? 'APROVADO ✅' : 'REPROVADO ❌'} ` +
    `(critério: ≥ ${MIN_APPROVED} de ${MIN_SAMPLES} com WER ≤ ${(WER_THRESHOLD * 100).toFixed(0)}%)`,
  );
}

main().catch(err => { console.error(err); process.exit(1); });
