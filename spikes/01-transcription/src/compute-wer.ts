import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export type WERResult = {
  wer: number;
  words: number;
  errors: number;
};

const ONES = ['', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function under1000(x: number): string {
  if (x === 0) return '';
  if (x === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(x / 100);
  const rest = x % 100;
  if (h > 0) parts.push(HUNDREDS[h]!);
  if (rest > 0) {
    if (rest < 10) parts.push(ONES[rest]!);
    else if (rest < 20) parts.push(TEENS[rest - 10]!);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u === 0 ? TENS[t]! : `${TENS[t]} e ${ONES[u]}`);
    }
  }
  return parts.join(' e ');
}

export function intToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n === 0) return 'zero';
  if (n < 1000) return under1000(n);
  const k = Math.floor(n / 1000);
  const rest = n % 1000;
  const prefix = k === 1 ? 'mil' : `${ONES[k]} mil`;
  if (rest === 0) return prefix;
  const useE = rest < 100 || rest % 100 === 0;
  return useE ? `${prefix} e ${under1000(rest)}` : `${prefix} ${under1000(rest)}`;
}

export function digitsToWords(text: string): string {
  return text.replace(/\b\d+\b/g, (m) => {
    const n = parseInt(m, 10);
    return n <= 9999 ? intToWords(n) : m;
  });
}

export function normalizeUnits(text: string): string {
  return text
    .replace(/(\d)\s*%/g, '$1 por cento')
    .replace(/%/g, ' por cento ')
    .replace(/(\d)\s*mg\b/gi, '$1 miligramas')
    .replace(/\bmg\b/gi, 'miligramas')
    .replace(/(\d)\s*ml\b/gi, '$1 mililitros')
    .replace(/\bml\b/gi, 'mililitros');
}

export function normalizeCID(text: string): string {
  let s = text;
  s = s.replace(/\bf\s*(\d{1,3})\s*\.\s*(\d{1,2})\b/g, 'f $1 ponto $2');
  s = s.replace(/\bf\s*(\d{1,3})\s+ponto\s+(\d{1,2})\b/g, 'f $1 ponto $2');
  s = s.replace(/\bf\s+(\d{1,3})\s+(\d{1,2})\b/g, 'f $1 ponto $2');
  s = s.replace(/\bf\s*(\d{1,3})\b/g, 'f $1');
  return s;
}

export function normalize(text: string): string[] {
  let s = text.toLowerCase();
  s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  s = s.replace(/[,!?;:"“”‘’()\[\]{}—–\-]/g, ' ');
  s = normalizeUnits(s);
  s = s.replace(/\befe\b/g, 'f');
  s = s.replace(/\s+/g, ' ').trim();
  s = normalizeCID(s);
  s = digitsToWords(s);
  s = s.replace(/\./g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.split(' ').filter(Boolean);
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
