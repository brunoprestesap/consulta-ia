"""
Transcrição PT-BR via faster-whisper com modelo fine-tuned (fsicoli/whisper-large-v3-pt-3000h-4).

Modelo convertido com:
  ct2-transformers-converter --model fsicoli/whisper-large-v3-pt-3000h-4
    --output_dir models/whisper-ptbr-ct2-f16
    --copy_files tokenizer.json preprocessor_config.json generation_config.json
    --quantization float16

Correções aplicadas:
  - generation_config.json incluído: preserva task_to_id {"transcribe": 50360}
    (modelo fine-tuned tem tokens invertidos vs Whisper padrão — sem este arquivo
    o faster-whisper envia token 50359 que neste modelo = translate → saída em inglês)
  - preprocessor_config.json incluído: feature_size=128 lido automaticamente
    (sem ele, feature_extractor usa 80 mel bins e o encoder rejeita a entrada)
  - compute_type="int8": float16 não é suportado em CPU; int8 sobre pesos float16
    é equivalente a int8_float16 em GPU — rápido e qualidade preservada

Uso: python3 src/transcribe_ptbr.py <audio> <output_txt> [model_dir]
"""
import sys
import os
from faster_whisper import WhisperModel

INITIAL_PROMPT = (
    "Transcrição de consulta psiquiátrica em português do Brasil. "
    "Termos frequentes: antidepressivo, ansiolítico, pregabalina, desvenlafaxina, "
    "sertralina, clonazepam, escitalopram, quetiapina, risperidona, olanzapina, "
    "aripiprazol, venlafaxina, bupropiona, fluoxetina, paroxetina, mirtazapina, "
    "lamotrigina, valproato, CID-10, transtorno de ansiedade, depressão, bipolar."
)

def main():
    if len(sys.argv) < 3:
        print("Uso: python3 transcribe_ptbr.py <audio> <output_txt> [model_dir]", file=sys.stderr)
        sys.exit(1)

    audio_path  = sys.argv[1]
    output_path = sys.argv[2]
    model_dir   = sys.argv[3] if len(sys.argv) > 3 else "models/whisper-ptbr-ct2-f16"

    if not os.path.exists(audio_path):
        print(f"Áudio não encontrado: {audio_path}", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(model_dir):
        print(f"Modelo não encontrado: {model_dir}", file=sys.stderr)
        sys.exit(1)

    # Carrega modelo float16 com compute int8 (suportado em CPU).
    # preprocessor_config.json no model_dir garante feature_size=128 automaticamente.
    # generation_config.json garante task_to_id correto (transcribe=50360 neste modelo).
    model = WhisperModel(model_dir, device="cpu", compute_type="int8")

    segments, _ = model.transcribe(
        audio_path,
        language="pt",
        task="transcribe",
        condition_on_previous_text=False,
        initial_prompt=INITIAL_PROMPT,
        beam_size=5,
    )

    text = " ".join(s.text for s in segments).replace("  ", " ").strip()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(text)

    print(text[:200], file=sys.stderr)

if __name__ == "__main__":
    main()
