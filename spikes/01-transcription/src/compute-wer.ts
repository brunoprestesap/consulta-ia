import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export type WERResult = {
  wer: number;
  words: number;
  errors: number;
};

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?;:"“”‘’()\[\]{}—–\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

export function computeWER(reference: string, hypothesis: string): WERResult {
  const ref = normalize(reference);
  const hyp = normalize(hypothesis);
  const errors = levenshtein(ref, hyp);
  const wer = ref.length > 0 ? errors / ref.length : 0;
  return { wer, words: ref.length, errors };
}

function main() {
  const [refPath, hypPath] = process.argv.slice(2);
  if (!refPath || !hypPath) {
    console.error('Uso: tsx src/compute-wer.ts <referencia.txt> <hipotese.txt>');
    process.exit(1);
  }
  const reference = fs.readFileSync(refPath, 'utf-8');
  const hypothesis = fs.readFileSync(hypPath, 'utf-8');
  const r = computeWER(reference, hypothesis);
  console.log(`WER: ${(r.wer * 100).toFixed(1)}% (${r.words} palavras, ${r.errors} erros)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
