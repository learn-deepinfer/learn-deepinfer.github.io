"""An independent oracle built from a tiny random checkpoint, with no downloads."""

import pytest
import torch

from build_deepinfer.model import KVCache, Qwen2


@torch.inference_mode()
@pytest.mark.parametrize("tie_weights", [False, True])
def test_tiny_local_checkpoint_matches_transformers(tmp_path, tie_weights):
    transformers = pytest.importorskip("transformers")
    config = transformers.Qwen2Config(
        vocab_size=97,
        hidden_size=32,
        intermediate_size=64,
        num_hidden_layers=2,
        num_attention_heads=4,
        num_key_value_heads=2,
        max_position_embeddings=32,
        rope_theta=1000000.0,
        rms_norm_eps=1e-6,
        attention_bias=True,
        tie_word_embeddings=tie_weights,
    )
    config._attn_implementation = "eager"
    torch.manual_seed(71)
    reference = transformers.Qwen2ForCausalLM(config).float().eval()
    reference.save_pretrained(tmp_path)
    model = Qwen2.from_pretrained(str(tmp_path), local_files_only=True).float().eval()
    tokens = torch.tensor([[2, 9, 31, 8, 17, 42, 6], [11, 4, 13, 9, 7, 1, 5]])
    cache = KVCache(config.num_hidden_layers)
    offset = 0
    for chunk_size in (3, 2, 2):
        actual_cached = model(tokens[:, offset : offset + chunk_size], cache=cache)
        offset += chunk_size
        expected = reference(tokens[:, :offset], use_cache=False).logits[:, -1:]
        torch.testing.assert_close(actual_cached, expected, atol=2e-5, rtol=2e-5)
        torch.testing.assert_close(model(tokens[:, :offset]), expected, atol=2e-5, rtol=2e-5)
        assert cache.length == offset
