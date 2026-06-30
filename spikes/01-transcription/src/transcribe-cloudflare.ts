import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execP = promisify(exec);

// Preço por minuto de áudio (Workers AI pricing, Jun/2026)
const USD_PER_MIN: Record<string, number> = {
  '@cf/openai/whisper': 0.0005,
  '@cf/openai/whisper-large-v3-turbo': 0.0005,
  '@cf/deepgram/nova-3': 0.0052,
};

// Sufixo legível para nome de arquivo de resultado
const FILE_SUFFIX: Record<string, string> = {
  '@cf/openai/whisper': 'cf-whisper',
  '@cf/openai/whisper-large-v3-turbo': 'cf-whisper-turbo',
  '@cf/deepgram/nova-3': 'cf-nova-3',
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

async function probeDuration(audioPath: string): Promise<number> {
  const { stdout } = await execP(
    `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${audioPath}"`,
  );
  const d = parseFloat(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Duração inválida: ${stdout}`);
  return d;
}

// Cloudflare Workers AI Whisper tem limite de ~5 minutos de áudio por request.
// Áudios mais longos são divididos em chunks de CF_CHUNK_SEC segundos.
const CF_CHUNK_SEC = 120; // 2 minutos por chunk

async function splitIntoChunks(audioPath: string, chunkSec: number): Promise<string[]> {
  const stem    = path.basename(audioPath, path.extname(audioPath));
  const tmpDir  = path.join(path.dirname(audioPath), `_cf_chunks_${stem}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const pattern = path.join(tmpDir, 'chunk_%03d.mp3');
  await execP(
    `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -b:a 64k -f segment -segment_time ${chunkSec} "${pattern}" 2>/dev/null`,
  );

  return fs.readdirSync(tmpDir)
    .filter(f => f.endsWith('.mp3'))
    .sort()
    .map(f => path.join(tmpDir, f));
}

function cleanupChunkDir(chunkPaths: string[]): void {
  if (chunkPaths.length === 0) return;
  const dir = path.dirname(chunkPaths[0]!);
  fs.rmSync(dir, { recursive: true, force: true });
}

export type CloudflareTranscribeResult = {
  text: string;
  audioPath: string;
  audioDurationSec: number;
  processingDurationSec: number;
  estimatedCostUSD: number;
  outputPath: string;
  model: string;
};

export async function transcribeCloudflare(
  audioPath: string,
  model: string = '@cf/openai/whisper-large-v3-turbo',
): Promise<CloudflareTranscribeResult> {
  if (!fs.existsSync(audioPath)) throw new Error(`Arquivo não encontrado: ${audioPath}`);

  const accountId = requireEnv('CF_ACCOUNT_ID');
  const apiToken  = requireEnv('CF_API_TOKEN');

  const stem     = path.basename(audioPath, path.extname(audioPath));
  const duration = await probeDuration(audioPath);
  const usdPerMin = USD_PER_MIN[model] ?? 0.0005;
  const suffix    = FILE_SUFFIX[model] ?? `cf-${model.replace('@cf/', '').replace(/\//g, '-')}`;

  const needsChunking = duration > CF_CHUNK_SEC;
  console.log(
    `[${stem}] Cloudflare ${model} · ${duration.toFixed(0)}s (${(duration / 60).toFixed(1)}min)` +
    (needsChunking ? ` → ${Math.ceil(duration / CF_CHUNK_SEC)} chunks de ${CF_CHUNK_SEC / 60}min` : '') + '…',
  );

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  type CFResponse = {
    result?: {
      text?: string;
      transcript?: string;
      // Deepgram nested format (nova-3)
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    success?: boolean;
    errors?: unknown[];
  };

  function extractText(json: CFResponse): string {
    return (
      json.result?.text ??
      json.result?.transcript ??
      json.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
      ''
    );
  }

  async function callCF(filePath: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);
    let res: Response;

    if (model === '@cf/openai/whisper-large-v3-turbo') {
      // Docs: https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
      // Requer JSON com audio em base64 (não uint8 array nem binário puro)
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: buffer.toString('base64'), task: 'transcribe', language: 'pt' }),
      });
    } else if (model === '@cf/deepgram/nova-3') {
      // Docs: https://developers.cloudflare.com/workers-ai/models/nova-3/
      // Binário com content-type correto; idioma como query param
      res = await fetch(`${url}?language=pt&punctuate=true`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'audio/mpeg' },
        body: buffer,
      });
    } else {
      // @cf/openai/whisper (base): binário puro
      // Retry com JSON + language se o modelo detectar "múltiplos idiomas"
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/octet-stream' },
        body: buffer,
      });
      if (!res.ok) {
        const errText = await res.text();
        if (errText.includes('different languages') || errText.includes('3010')) {
          res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: [...new Uint8Array(buffer)], task: 'transcribe', language: 'pt' }),
          });
        } else {
          throw new Error(`Cloudflare API error ${res.status}: ${errText}`);
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cloudflare API error ${res.status}: ${errText}`);
    }

    const json = await res.json() as CFResponse;
    if (json.success === false) throw new Error(`Cloudflare AI falhou: ${JSON.stringify(json.errors)}`);
    return extractText(json);
  }

  const t0 = Date.now();
  let text: string;

  if (!needsChunking) {
    const raw = await callCF(audioPath);
    text = raw.replace(/\s+/g, ' ').trim();
    if (!text) throw new Error(`Cloudflare (${model}) retornou transcrição vazia`);
  } else {
    const chunks = await splitIntoChunks(audioPath, CF_CHUNK_SEC);
    console.log(`  → ${chunks.length} chunks criados`);
    const parts: string[] = [];
    let skipped = 0;
    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`  → chunk ${i + 1}/${chunks.length}…`);
      try {
        const part = await callCF(chunks[i]!);
        process.stdout.write(' OK\n');
        parts.push(part.trim());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(` SKIP (${msg.slice(0, 80)})\n`);
        skipped++;
      }
    }
    if (skipped > 0) console.log(`  ⚠ ${skipped}/${chunks.length} chunks ignorados`);
    cleanupChunkDir(chunks);
    text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error(`Cloudflare (${model}) retornou transcrição vazia após chunking`);
  }

  const procSec = (Date.now() - t0) / 1000;

  const estimatedCostUSD = (duration / 60) * usdPerMin;
  const resultsDir = path.resolve('results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, `${stem}-${suffix}.txt`);
  fs.writeFileSync(outputPath, text);

  console.log(
    `[${stem}] OK · proc=${procSec.toFixed(1)}s · custo≈US$${estimatedCostUSD.toFixed(4)} · ${outputPath}`,
  );

  return { text, audioPath, audioDurationSec: duration, processingDurationSec: procSec, estimatedCostUSD, outputPath, model };
}

function main() {
  const input = process.argv[2];
  const model = process.argv[3] ?? '@cf/openai/whisper-large-v3-turbo';
  if (!input) {
    console.error('Uso: tsx src/transcribe-cloudflare.ts <caminho-do-audio> [modelo]');
    console.error('Modelos: @cf/openai/whisper | @cf/openai/whisper-large-v3-turbo | @cf/deepgram/nova-3');
    process.exit(1);
  }
  transcribeCloudflare(input, model).catch(err => { console.error(err); process.exit(1); });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
