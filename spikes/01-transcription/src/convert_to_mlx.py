"""
Converte modelo Whisper fine-tuned HuggingFace Transformers → formato MLX (mlx_whisper).

Problema: mlx_whisper.load_models espera pesos com chaves no formato OpenAI Whisper
(ex: encoder.blocks.0.attn.query.weight), mas modelos HuggingFace usam nomes
diferentes (ex: model.encoder.layers.0.self_attn.q_proj.weight).

Solução: carrega via transformers, faz o remapeamento de chaves HF → OpenAI e salva
como weights.npz + config.json no formato esperado pelo mlx-whisper.

Baseado em: https://github.com/ml-explore/mlx-examples/tree/main/whisper (convert.py)

Uso: python3 src/convert_to_mlx.py <hf_model_id_ou_path> <mlx_output_dir>
"""
import sys
import json
import re
import numpy as np
from pathlib import Path

MLX_CONFIG_KEYS = {
    "n_mels", "n_audio_ctx", "n_audio_state", "n_audio_head", "n_audio_layer",
    "n_vocab", "n_text_ctx", "n_text_state", "n_text_head", "n_text_layer",
}

HF_TO_OPENAI_CONFIG = {
    "num_mel_bins":            "n_mels",
    "max_source_positions":    "n_audio_ctx",
    "d_model":                 "n_audio_state",
    "encoder_attention_heads": "n_audio_head",
    "encoder_layers":          "n_audio_layer",
    "vocab_size":              "n_vocab",
    "max_target_positions":    "n_text_ctx",
    "decoder_attention_heads": "n_text_head",
    "decoder_layers":          "n_text_layer",
}

def remap_key(k: str) -> str | None:
    """Remapeia chave HuggingFace → chave OpenAI Whisper."""
    # Remove prefixo "model."
    k = re.sub(r'^model\.', '', k)

    # encoder.embed_positions: em mlx-whisper é calculado via sinusoids(), não carregado de pesos — pular
    if re.match(r'^encoder\.embed_positions\.weight$', k):
        return None
    # encoder.layer_norm → encoder.ln_post
    k = re.sub(r'^encoder\.layer_norm\.(weight|bias)$', r'encoder.ln_post.\1', k)
    # encoder.layers.N.self_attn.[qkv]_proj → encoder.blocks.N.attn.[query/key/value]
    k = re.sub(r'^encoder\.layers\.(\d+)\.self_attn\.q_proj\.(weight|bias)$',
               r'encoder.blocks.\1.attn.query.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.self_attn\.k_proj\.(weight|bias)$',
               r'encoder.blocks.\1.attn.key.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.self_attn\.v_proj\.(weight|bias)$',
               r'encoder.blocks.\1.attn.value.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.self_attn\.out_proj\.(weight|bias)$',
               r'encoder.blocks.\1.attn.out.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.self_attn_layer_norm\.(weight|bias)$',
               r'encoder.blocks.\1.attn_ln.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.fc1\.(weight|bias)$',
               r'encoder.blocks.\1.mlp1.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.fc2\.(weight|bias)$',
               r'encoder.blocks.\1.mlp2.\2', k)
    k = re.sub(r'^encoder\.layers\.(\d+)\.final_layer_norm\.(weight|bias)$',
               r'encoder.blocks.\1.mlp_ln.\2', k)

    # decoder.embed_tokens → decoder.token_embedding
    k = re.sub(r'^decoder\.embed_tokens\.weight$', 'decoder.token_embedding.weight', k)
    # decoder.embed_positions → decoder.positional_embedding
    k = re.sub(r'^decoder\.embed_positions\.weight$', 'decoder.positional_embedding', k)
    # decoder.layer_norm → decoder.ln
    k = re.sub(r'^decoder\.layer_norm\.(weight|bias)$', r'decoder.ln.\1', k)
    # decoder.layers.N.self_attn → decoder.blocks.N.attn
    k = re.sub(r'^decoder\.layers\.(\d+)\.self_attn\.q_proj\.(weight|bias)$',
               r'decoder.blocks.\1.attn.query.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.self_attn\.k_proj\.(weight|bias)$',
               r'decoder.blocks.\1.attn.key.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.self_attn\.v_proj\.(weight|bias)$',
               r'decoder.blocks.\1.attn.value.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.self_attn\.out_proj\.(weight|bias)$',
               r'decoder.blocks.\1.attn.out.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.self_attn_layer_norm\.(weight|bias)$',
               r'decoder.blocks.\1.attn_ln.\2', k)
    # decoder cross-attention
    k = re.sub(r'^decoder\.layers\.(\d+)\.encoder_attn\.q_proj\.(weight|bias)$',
               r'decoder.blocks.\1.cross_attn.query.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.encoder_attn\.k_proj\.(weight|bias)$',
               r'decoder.blocks.\1.cross_attn.key.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.encoder_attn\.v_proj\.(weight|bias)$',
               r'decoder.blocks.\1.cross_attn.value.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.encoder_attn\.out_proj\.(weight|bias)$',
               r'decoder.blocks.\1.cross_attn.out.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.encoder_attn_layer_norm\.(weight|bias)$',
               r'decoder.blocks.\1.cross_attn_ln.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.fc1\.(weight|bias)$',
               r'decoder.blocks.\1.mlp1.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.fc2\.(weight|bias)$',
               r'decoder.blocks.\1.mlp2.\2', k)
    k = re.sub(r'^decoder\.layers\.(\d+)\.final_layer_norm\.(weight|bias)$',
               r'decoder.blocks.\1.mlp_ln.\2', k)

    return k

def convert(hf_repo: str, mlx_path: str):
    from transformers import WhisperForConditionalGeneration, WhisperConfig

    output = Path(mlx_path)
    output.mkdir(parents=True, exist_ok=True)

    print(f"Carregando {hf_repo} via transformers…")
    hf_model = WhisperForConditionalGeneration.from_pretrained(hf_repo)
    hf_cfg   = WhisperConfig.from_pretrained(hf_repo)

    # Config MLX
    mlx_cfg = {}
    for hf_key, mlx_key in HF_TO_OPENAI_CONFIG.items():
        val = getattr(hf_cfg, hf_key, None)
        if val is not None:
            mlx_cfg[mlx_key] = val
    if "n_audio_state" in mlx_cfg:
        mlx_cfg.setdefault("n_text_state", mlx_cfg["n_audio_state"])

    missing = MLX_CONFIG_KEYS - set(mlx_cfg.keys())
    if missing:
        raise ValueError(f"Campos ausentes no config: {missing}")

    with open(output / "config.json", "w") as f:
        json.dump(mlx_cfg, f, indent=2)
    print(f"  config: {mlx_cfg}")

    # Pesos
    print("Remapeando pesos HF → OpenAI…")
    state = hf_model.model.state_dict()
    mlx_weights = {}
    skipped = []
    # Conv1d: PyTorch shape (out, in, kernel) → MLX shape (out, kernel, in)
    CONV_KEYS = {'encoder.conv1.weight', 'encoder.conv2.weight'}

    for hf_key, tensor in state.items():
        new_key = remap_key(hf_key)
        if new_key is None:
            skipped.append(hf_key)
            continue
        if new_key == hf_key and not any(hf_key.startswith(p) for p in
                                         ['encoder.', 'decoder.']):
            skipped.append(hf_key)
            continue
        arr = tensor.half().numpy()  # float16: mlx-whisper requer este dtype
        if new_key in CONV_KEYS:
            arr = arr.transpose(0, 2, 1)  # (out, in, k) → (out, k, in)
        mlx_weights[new_key] = arr

    print(f"  {len(mlx_weights)} tensores mapeados, {len(skipped)} ignorados")
    if skipped:
        print(f"  ignorados: {skipped[:5]}{'…' if len(skipped)>5 else ''}")

    np.savez(output / "weights.npz", **mlx_weights)
    print(f"Conversão concluída → {output}/")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 src/convert_to_mlx.py <hf_model_id> <mlx_output_dir>")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
