"""Small, offline tests for the inference primitives in chapter one."""

import pytest
import torch
from torch import nn

from build_deepinfer.model import KVCache, Qwen2


@pytest.fixture
def config():
    # Four query heads and two KV heads exercise grouped-query attention.
    return {
        "model_type": "qwen2",
        "hidden_size": 32,
        "intermediate_size": 64,
        "num_hidden_layers": 2,
        "num_attention_heads": 4,
        "num_key_value_heads": 2,
        "vocab_size": 97,
        "rms_norm_eps": 1e-6,
        "rope_theta": 1000000.0,
        "tie_word_embeddings": False,
        "attention_bias": True,
        "max_position_embeddings": 32,
        "hidden_act": "silu",
    }


@pytest.fixture
def model(config):
    torch.manual_seed(17)
    return Qwen2(config).float().eval()


@torch.inference_mode()
def test_returns_only_last_position(model, config):
    tokens = torch.tensor([[3, 8, 12, 9], [15, 4, 7, 1]])
    logits = model(tokens)
    assert logits.shape == (2, 1, config["vocab_size"])
    assert torch.isfinite(logits).all()


@torch.inference_mode()
@pytest.mark.parametrize("chunk_sizes", [(1, 1, 1, 1, 1, 1, 1), (3, 2, 2), (1, 4, 2)])
def test_cache_matches_full_recomputation(model, config, chunk_sizes):
    """Multi-token cached chunks catch the offset causal-mask failure case."""
    tokens = torch.tensor([[3, 8, 12, 9, 42, 11, 5], [15, 4, 7, 1, 33, 2, 14]])
    cache = KVCache(config["num_hidden_layers"])
    assert cache.length == 0
    offset = 0
    for size in chunk_sizes:
        cached_logits = model(tokens[:, offset : offset + size], cache=cache)
        offset += size
        expected = model(tokens[:, :offset])
        torch.testing.assert_close(cached_logits, expected, atol=2e-5, rtol=2e-5)
        assert cache.length == offset


@torch.inference_mode()
def test_batch_rows_are_independent(model):
    first = torch.tensor([[3, 8, 12, 9]])
    second = torch.tensor([[15, 4, 7, 1]])
    together = model(torch.cat([first, second]))
    torch.testing.assert_close(together[:1], model(first), atol=2e-5, rtol=2e-5)
    torch.testing.assert_close(together[1:], model(second), atol=2e-5, rtol=2e-5)


@torch.inference_mode()
def test_exact_context_limit_is_allowed(model, config):
    limit = config["max_position_embeddings"]
    tokens = torch.arange(limit).remainder(config["vocab_size"]).unsqueeze(0)
    cache = KVCache(config["num_hidden_layers"])
    model(tokens[:, :-1], cache=cache)
    cached = model(tokens[:, -1:], cache=cache)
    torch.testing.assert_close(cached, model(tokens), atol=2e-5, rtol=2e-5)
    assert cache.length == limit


@torch.inference_mode()
def test_context_limit_rejects_full_and_cached_overflow(model, config):
    limit = config["max_position_embeddings"]
    with pytest.raises(ValueError):
        model(torch.ones((1, limit + 1), dtype=torch.long))
    cache = KVCache(config["num_hidden_layers"])
    model(torch.ones((1, limit), dtype=torch.long), cache=cache)
    with pytest.raises(ValueError):
        model(torch.ones((1, 1), dtype=torch.long), cache=cache)
    assert cache.length == limit


@torch.inference_mode()
def test_empty_input_is_rejected(model):
    with pytest.raises(ValueError):
        model(torch.empty((1, 0), dtype=torch.long))


@torch.inference_mode()
def test_cache_rejects_a_different_batch_size(model, config):
    cache = KVCache(config["num_hidden_layers"])
    model(torch.tensor([[3, 8, 12]]), cache=cache)
    with pytest.raises(ValueError):
        model(torch.tensor([[9], [4]]), cache=cache)


@torch.inference_mode()
def test_cleared_cache_can_start_an_independent_request(model, config):
    cache = KVCache(config["num_hidden_layers"])
    model(torch.tensor([[3, 8, 12]]), cache=cache)
    cache.clear()
    assert cache.length == 0
    new_request = torch.tensor([[15, 4, 7, 1]])
    torch.testing.assert_close(model(new_request, cache=cache), model(new_request), atol=2e-5, rtol=2e-5)
    assert cache.length == new_request.shape[1]


@pytest.mark.parametrize("tie_weights", [True, False])
def test_embedding_tying_is_real_shared_storage(config, tie_weights):
    model = Qwen2({**config, "tie_word_embeddings": tie_weights})
    embedding = next(layer for layer in model.modules() if isinstance(layer, nn.Embedding))
    head = next(
        layer
        for layer in model.modules()
        if isinstance(layer, nn.Linear) and layer.out_features == config["vocab_size"]
    )
    assert (embedding.weight.data_ptr() == head.weight.data_ptr()) is tie_weights
