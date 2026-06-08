import fs from 'node:fs';
import path from 'node:path';
import { transcribeWhisper } from './transcribe-whisper.js';
import { computeWER } from './compute-wer.js';

const SAMPLES_DIR = path.resolve('samples');
const REFERENCE_DIR = path.resolve('reference');
const RESULTS_DIR = path.resolve('results');
const WER_THRESHOLD = 0.10;
const MIN_APPROVED = 2;
const MIN_SAMPLES = 2;
const MODEL = process.env.WHISPER_MODEL ?? 'mlx-community/whisper-large-v3-mlx';

// Whisper aceita qualquer container via ffmpeg. Preferimos .flac; caímos para .m4a
// quando é o único formato disponível (ex.: amostra-real-02).
const PREFERRED_EXT = ['.flac', '.wav', '.ogg', '.opus', '.m4a'];

// Fala humana raramente passa de ~200 wpm. Acima disto a referência não pode
// corresponder ao áudio (fixture trocado) — sinalizamos em vez de reprovar.
const MAX_PLAUSIBLE_WPM = 250;

type Row = {
  name: string;
  werWhisper: number;
  werGoogle: number | null;
  words: number;
  errors: number;
  audioSec: number;
  processingSec: number;
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
    if (!current) {
      byStem.set(stem, f);
      continue;
    }
    // Mantém o de extensão mais "preferida".
    const rankNew = PREFERRED_EXT.indexOf(ext);
    const rankCur = PREFERRED_EXT.indexOf(path.extname(current).toLowerCase());
    if (rankNew < rankCur) byStem.set(stem, f);
  }
  return [...byStem.entries()].map(([stem, file]) => ({ stem, file })).sort((a, b) => a.stem.localeCompare(b.stem));
}

async function main() {
  if (!fs.existsSync(SAMPLES_DIR)) {
    throw new Error(`Pasta não encontrada: ${SAMPLES_DIR}.`);
  }

  const samples = pickSamples();
  if (samples.length === 0) {
    console.log(`Nenhuma amostra suportada em ${SAMPLES_DIR}/.`);
    return;
  }

  const rows: Row[] = [];

  for (const { stem, file } of samples) {
    const referencePath = path.join(REFERENCE_DIR, `${stem}.txt`);
    if (!fs.existsSync(referencePath)) {
      console.warn(`Pulando ${file}: referência ausente em ${referencePath}`);
      continue;
    }

    const audioPath = path.join(SAMPLES_DIR, file);
    try {
      const result = await transcribeWhisper(audioPath, MODEL);
      const reference = fs.readFileSync(referencePath, 'utf-8');
      const wer = computeWER(reference, result.text);

      const refWpm = (wer.words / result.audioDurationSec) * 60;
      const invalidFixture = refWpm > MAX_PLAUSIBLE_WPM;
      if (invalidFixture) {
        console.warn(
          `⚠️  ${stem}: referência tem ${wer.words} palavras para ${result.audioDurationSec.toFixed(0)}s ` +
          `(${refWpm.toFixed(0)} wpm) — fixture provavelmente trocado. WER não é confiável.`,
        );
      }

      // Reaproveita transcrição do Google já salva em results/, se existir.
      const googlePath = path.join(RESULTS_DIR, `${stem}-google.txt`);
      let werGoogle: number | null = null;
      if (fs.existsSync(googlePath)) {
        werGoogle = computeWER(reference, fs.readFileSync(googlePath, 'utf-8')).wer;
      }

      rows.push({
        name: stem,
        werWhisper: wer.wer,
        werGoogle,
        words: wer.words,
        errors: wer.errors,
        audioSec: result.audioDurationSec,
        processingSec: result.processingDurationSec,
        passed: !invalidFixture && wer.wer <= WER_THRESHOLD,
        invalidFixture,
      });
    } catch (err) {
      console.error(`Falhou ${file}:`, err);
    }
  }

  if (rows.length === 0) {
    console.log('Nenhum par amostra+referência processado.');
    return;
  }

  console.log('\n--- Resultados (Whisper local vs. Google) ---');
  const header =
    `${pad('Amostra', 20)}| ${pad('WER Whisper', 11, true)} | ${pad('WER Google', 10, true)} | ${pad('Palavras', 8, true)} | ${pad('Erros', 5, true)} | ${pad('Áudio', 7, true)} | ${pad('Proc', 7, true)} | Status`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    const pctW = r.invalidFixture ? 'n/a' : `${(r.werWhisper * 100).toFixed(1)}%`;
    const pctG = r.werGoogle === null ? '—' : `${(r.werGoogle * 100).toFixed(1)}%`;
    const status = r.invalidFixture ? 'FIXTURE?' : r.passed ? 'APROVADO' : 'REPROVADO';
    console.log(
      `${pad(r.name, 20)}| ${pad(pctW, 11, true)} | ${pad(pctG, 10, true)} | ${pad(String(r.words), 8, true)} | ${pad(String(r.errors), 5, true)} | ${pad(`${r.audioSec.toFixed(0)}s`, 7, true)} | ${pad(`${r.processingSec.toFixed(0)}s`, 7, true)} | ${status}`,
    );
  }
  console.log('-'.repeat(header.length));

  const valid = rows.filter((r) => !r.invalidFixture);
  const skipped = rows.length - valid.length;
  const approved = valid.filter((r) => r.passed).length;
  const meanWER = valid.length ? valid.reduce((s, r) => s + r.werWhisper, 0) / valid.length : 0;
  const totalAudio = rows.reduce((s, r) => s + r.audioSec, 0);
  const totalProc = rows.reduce((s, r) => s + r.processingSec, 0);

  console.log(
    `Aprovadas: ${approved}/${valid.length} válidas · WER médio Whisper: ${(meanWER * 100).toFixed(1)}% · ` +
    `Áudio total: ${(totalAudio / 60).toFixed(1)}min · Proc total: ${(totalProc / 60).toFixed(1)}min · Custo: US$0 (local)` +
    (skipped ? ` · ${skipped} ignorada(s) por fixture inválido` : ''),
  );

  const spikePass = approved >= MIN_APPROVED && valid.length >= MIN_SAMPLES;
  console.log(
    `\nResultado (Whisper local): ${spikePass ? 'APROVADO ✅' : 'REPROVADO ❌'} ` +
    `(critério: ≥ ${MIN_APPROVED} de ${MIN_SAMPLES} com WER ≤ ${(WER_THRESHOLD * 100).toFixed(0)}%)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
