"""Qwen2 inference, written explicitly: RMSNorm → GQA/RoPE → SwiGLU.

Only PyTorch tensor operations execute the model. See docs/chapter-01.md.
"""

import json
from pathlib import Path

import torch
from safetensors.torch import load_file
from torch import nn
from torch.nn import functional as F

DEFAULT_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
DEFAULT_REVISION = "7ae557604adf67be50417f59c2c2f167def9a775"


def resolve_model_path(model: str, local_files_only: bool = False) -> Path:
    path = Path(model).expanduser()
    if path.is_dir():
        return path.resolve()
    from huggingface_hub import snapshot_download
    from huggingface_hub.errors import LocalEntryNotFoundError

    kwargs = dict(repo_id=model, revision=DEFAULT_REVISION if model == DEFAULT_MODEL else None,
                  allow_patterns=["*.json", "*.safetensors"])
    # A complete cached snapshot works without a network call.
    try:
        return Path(snapshot_download(**kwargs, local_files_only=True))
    except LocalEntryNotFoundError:
        if local_files_only:
            raise
        return Path(snapshot_download(**kwargs))


class KVCache:
    """One [batch, kv_heads, sequence, head_dim] K/V pair per layer."""

    def __init__(self, num_layers: int):
        self.keys: list[torch.Tensor | None] = [None] * num_layers
        self.values: list[torch.Tensor | None] = [None] * num_layers

    @property
    def length(self) -> int:
        return 0 if self.keys[0] is None else self.keys[0].shape[-2]

    def clear(self) -> None:
        self.keys[:] = [None] * len(self.keys)
        self.values[:] = [None] * len(self.values)

    def append(self, layer: int, k: torch.Tensor, v: torch.Tensor):
        old_k, old_v = self.keys[layer], self.values[layer]
        if old_k is not None:
            if old_k.shape[:2] != k.shape[:2] or old_k.shape[-1] != k.shape[-1]:
                raise ValueError("KV cache shape changed; clear it before using a new batch")
            k, v = torch.cat((old_k, k), dim=-2), torch.cat((old_v, v), dim=-2)
        self.keys[layer], self.values[layer] = k, v
        return k, v


class RMSNorm(nn.Module):
    def __init__(self, size: int, eps: float):
        super().__init__()
        self.weight = nn.Parameter(torch.ones(size))
        self.eps = eps

    def forward(self, x):
        normalized = x.float() * torch.rsqrt(x.float().square().mean(-1, keepdim=True) + self.eps)
        return self.weight * normalized.to(x.dtype)


def apply_rope(q, k, positions, theta):
    """Qwen rotates the first/second halves of each head together."""
    inv_freq = theta ** (-torch.arange(0, q.shape[-1], 2, device=q.device).float() / q.shape[-1])
    angles = positions.float()[:, None] * inv_freq[None, :]
    angles = torch.cat((angles, angles), dim=-1)[None, None, :, :]
    cos, sin = angles.cos().to(q.dtype), angles.sin().to(q.dtype)

    def rotate(x):
        first, second = x.chunk(2, dim=-1)
        return torch.cat((-second, first), dim=-1)

    return q * cos + rotate(q) * sin, k * cos + rotate(k) * sin


class Attention(nn.Module):
    def __init__(self, config):
        super().__init__()
        hidden = config["hidden_size"]
        self.heads = config["num_attention_heads"]
        self.kv_heads = config["num_key_value_heads"]
        self.head_dim = hidden // self.heads
        self.theta = config.get("rope_theta", 10000.0)
        bias = config.get("attention_bias", True)
        self.q_proj = nn.Linear(hidden, self.heads * self.head_dim, bias=bias)
        self.k_proj = nn.Linear(hidden, self.kv_heads * self.head_dim, bias=bias)
        self.v_proj = nn.Linear(hidden, self.kv_heads * self.head_dim, bias=bias)
        self.o_proj = nn.Linear(hidden, hidden, bias=False)

    def forward(self, x, positions, cache, layer):
        batch, length, _ = x.shape
        q = self.q_proj(x).view(batch, length, self.heads, self.head_dim).transpose(1, 2)
        k = self.k_proj(x).view(batch, length, self.kv_heads, self.head_dim).transpose(1, 2)
        v = self.v_proj(x).view(batch, length, self.kv_heads, self.head_dim).transpose(1, 2)
        q, k = apply_rope(q, k, positions, self.theta)
        if cache is not None:
            k, v = cache.append(layer, k, v)
        # Several query heads share one KV head (grouped-query attention).
        repeats = self.heads // self.kv_heads
        k, v = k.repeat_interleave(repeats, dim=1), v.repeat_interleave(repeats, dim=1)
        # An explicit absolute-position mask also handles cached chunks of >1 token.
        visible = torch.arange(k.shape[-2], device=x.device)[None, :] <= positions[:, None]
        out = F.scaled_dot_product_attention(q, k, v, attn_mask=visible, dropout_p=0.0)
        return self.o_proj(out.transpose(1, 2).contiguous().view(batch, length, -1))


class MLP(nn.Module):
    def __init__(self, config):
        super().__init__()
        hidden, intermediate = config["hidden_size"], config["intermediate_size"]
        self.gate_proj = nn.Linear(hidden, intermediate, bias=False)
        self.up_proj = nn.Linear(hidden, intermediate, bias=False)
        self.down_proj = nn.Linear(intermediate, hidden, bias=False)

    def forward(self, x):
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


class DecoderLayer(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.input_layernorm = RMSNorm(config["hidden_size"], config["rms_norm_eps"])
        self.post_attention_layernorm = RMSNorm(config["hidden_size"], config["rms_norm_eps"])
        self.self_attn, self.mlp = Attention(config), MLP(config)

    def forward(self, x, positions, cache, layer):
        x = x + self.self_attn(self.input_layernorm(x), positions, cache, layer)
        return x + self.mlp(self.post_attention_layernorm(x))


class Qwen2(nn.Module):
    def __init__(self, config: dict):
        super().__init__()
        if config.get("model_type", "qwen2") != "qwen2":
            raise ValueError("Chapter 1 supports Qwen2 architecture only")
        if config.get("rope_scaling") or config.get("use_sliding_window", False):
            raise ValueError("Scaled RoPE and sliding-window attention are outside Chapter 1")
        if config.get("hidden_act", "silu") != "silu":
            raise ValueError("Only SwiGLU (silu) is supported")
        heads, kv_heads = config["num_attention_heads"], config["num_key_value_heads"]
        hidden = config["hidden_size"]
        if heads <= 0 or kv_heads <= 0 or hidden % heads or heads % kv_heads or (hidden // heads) % 2:
            raise ValueError("Attention requires even head_dim and heads divisible by kv_heads")
        if config["num_hidden_layers"] < 1:
            raise ValueError("At least one decoder layer is required")
        self.config = config
        self.embed_tokens = nn.Embedding(config["vocab_size"], hidden)
        self.layers = nn.ModuleList(DecoderLayer(config) for _ in range(config["num_hidden_layers"]))
        self.norm = RMSNorm(hidden, config["rms_norm_eps"])
        self.lm_head = nn.Linear(hidden, config["vocab_size"], bias=False)
        if config.get("tie_word_embeddings", False):
            self.lm_head.weight = self.embed_tokens.weight

    @classmethod
    def from_pretrained(cls, model: str = DEFAULT_MODEL, *, local_files_only=False, dtype=torch.float32):
        path = resolve_model_path(model, local_files_only)
        config = json.loads((path / "config.json").read_text())
        index = path / "model.safetensors.index.json"
        filenames = sorted(set(json.loads(index.read_text())["weight_map"].values())) if index.exists() else ["model.safetensors"]
        state = {}
        for filename in filenames:
            for name, value in load_file(path / filename).items():
                state[name.removeprefix("model.")] = value.to(dtype=dtype)
        if config.get("tie_word_embeddings", False):
            state["lm_head.weight"] = state["embed_tokens.weight"]
        # Meta construction avoids allocating/randomizing an extra copy of the model.
        with torch.device("meta"):
            instance = cls(config)
        instance.load_state_dict(state, strict=True, assign=True)
        if config.get("tie_word_embeddings", False):
            instance.lm_head.weight = instance.embed_tokens.weight
        instance.model_dir = path
        return instance.eval()

    def forward(self, input_ids: torch.Tensor, cache: KVCache | None = None):
        if input_ids.ndim != 2 or input_ids.shape[0] == 0 or input_ids.shape[1] == 0:
            raise ValueError("input_ids must be a non-empty [batch, tokens] tensor")
        if cache is not None and len(cache.keys) != len(self.layers):
            raise ValueError("KV cache layer count does not match the model")
        start = 0 if cache is None else cache.length
        if start + input_ids.shape[1] > self.config["max_position_embeddings"]:
            raise ValueError("Input plus KV cache exceeds max_position_embeddings")
        positions = torch.arange(start, start + input_ids.shape[1], device=input_ids.device)
        x = self.embed_tokens(input_ids)
        for index, layer in enumerate(self.layers):
            x = layer(x, positions, cache, index)
        # Generation needs only the final position's distribution over the vocabulary.
        return self.lm_head(self.norm(x[:, -1:, :]))
