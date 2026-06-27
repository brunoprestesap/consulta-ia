"""
Transcrição com Parakeet TDT v3 via parakeet-mlx (Apple Silicon).

Modelo: mlx-community/parakeet-tdt-0.6b-v3
Arquitetura: FastConformer-TDT (Token-and-Duration Transducer)
Família: NVIDIA Parakeet — mesma linhagem do Nemotron 3.5 ASR
Línguas: 25 europeus, incluindo PT (Português europeu — PT-PT, não PT-BR)

Limitações observadas neste spike:
- WER ~19% em PT-BR (modelo treinado em PT-PT)
- Nemotron 3.5 ASR (PT-BR, WER 5.48% no paper) requer NeMo ou Python <3.14 (numba)

Uso:
    python src/transcribe_parakeet.py samples/audio.flac results/out.txt
    python src/transcribe_parakeet.py samples/audio.flac results/out.txt --chunk-duration 300
"""
import sys
import os
import time
import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", help="Caminho do arquivo de áudio")
    parser.add_argument("output", help="Arquivo de saída (.txt)")
    parser.add_argument("--chunk-duration", type=float, default=300.0,
                        help="Duração de cada chunk em segundos (padrão: 300 = 5 min)")
    parser.add_argument("--overlap-duration", type=float, default=10.0,
                        help="Overlap entre chunks em segundos (padrão: 10)")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"Erro: arquivo não encontrado: {args.audio}", file=sys.stderr)
        sys.exit(1)

    from parakeet_mlx import from_pretrained  # type: ignore

    print(f"[parakeet] carregando mlx-community/parakeet-tdt-0.6b-v3...", file=sys.stderr)
    model = from_pretrained("mlx-community/parakeet-tdt-0.6b-v3")

    # Usa chunking apenas se o arquivo for longo (>60s) para evitar OOM
    import subprocess
    dur_raw = subprocess.check_output(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", args.audio], text=True
    ).strip()
    dur = float(dur_raw)

    use_chunks = dur > args.chunk_duration
    print(f"[parakeet] {dur:.0f}s ({dur/60:.1f}min) · chunks={'sim' if use_chunks else 'não'}", file=sys.stderr)

    t0 = time.time()
    if use_chunks:
        result = model.transcribe(
            args.audio,
            chunk_duration=args.chunk_duration,
            overlap_duration=args.overlap_duration,
        )
    else:
        result = model.transcribe(args.audio)
    elapsed = time.time() - t0

    text = result.text.strip()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(text)

    rtf = elapsed / dur if dur > 0 else 0
    print(f"[parakeet] OK · {elapsed:.1f}s proc · RTF={rtf:.3f}x · {len(text.split())} palavras", file=sys.stderr)


if __name__ == "__main__":
    main()
