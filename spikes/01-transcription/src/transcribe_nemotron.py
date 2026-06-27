"""
Transcrição com Nemotron 3.5 ASR via NeMo 3.x (Python 3.12).

Modelo: nvidia/nemotron-3.5-asr-streaming-0.6b
Arquitetura: Cache-Aware FastConformer-RNNT com prompt conditioning (language token)
Línguas: 40 locais, PT-BR com WER 5.48% (FLEURS PT-BR, paper NVIDIA Jun/2026)
Runtime: nemo_toolkit (git main / >=3.1) + Python <=3.13

Pré-requisitos (venv312):
    pip install "nemo_toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git@main"

Uso:
    python src/transcribe_nemotron.py samples/audio.flac results/out.txt
"""
import sys
import os
import time
import argparse
import warnings
import logging

warnings.filterwarnings("ignore")
logging.disable(logging.WARNING)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", help="Caminho do arquivo de áudio (FLAC, WAV, MP3...)")
    parser.add_argument("output", help="Arquivo de saída .txt")
    parser.add_argument("--lang", default="pt-BR", help="Código de idioma (padrão: pt-BR)")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"Erro: arquivo não encontrado: {args.audio}", file=sys.stderr)
        sys.exit(1)

    import nemo.collections.asr as nemo_asr
    from nemo.collections.asr.models.rnnt_bpe_models_prompt import RNNTPromptTranscribeConfig

    print(f"[nemotron] carregando nvidia/nemotron-3.5-asr-streaming-0.6b...", file=sys.stderr)
    model = nemo_asr.models.ASRModel.from_pretrained("nvidia/nemotron-3.5-asr-streaming-0.6b")
    model.eval()
    print(f"[nemotron] modelo carregado: {type(model).__name__}", file=sys.stderr)

    cfg = RNNTPromptTranscribeConfig(target_lang=args.lang)

    print(f"[nemotron] transcrevendo {args.audio} (lang={args.lang})...", file=sys.stderr)
    t0 = time.time()
    output = model.transcribe([args.audio], override_config=cfg, verbose=True)
    elapsed = time.time() - t0

    # output pode ser lista de str ou lista de HypothesisResult
    result = output[0]
    text = result if isinstance(result, str) else result.text

    # Remove tokens de idioma que o modelo injeta no output (ex: <pt-PT>, <en-US>)
    import re
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(text)

    dur_raw = os.popen(
        f"ffprobe -v quiet -show_entries format=duration -of csv=p=0 '{args.audio}' 2>/dev/null"
    ).read().strip()
    dur = float(dur_raw) if dur_raw else 1.0
    rtf = elapsed / dur
    print(
        f"[nemotron] OK · {elapsed:.1f}s proc · RTF={rtf:.3f}x · {len(text.split())} palavras",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
