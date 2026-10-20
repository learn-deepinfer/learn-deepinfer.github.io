"""A deliberately explicit, single-request CPU generation loop.

Model loading and tokenization are excluded from generation timings. ``prefill``
is the first model forward plus greedy selection; ``decode`` is the remainder of
the generation loop. Token counts include a sampled EOS, even though it is not
printed. KV state belongs to one generate() call and never leaks across requests.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from time import perf_counter
from typing import Callable

import torch
from tokenizers import Tokenizer

from .model import DEFAULT_MODEL, KVCache, Qwen2


@dataclass
class GenerationResult:
    text: str
    token_ids: list[int]
    prompt_tokens: int
    generated_tokens: int
    prefill_seconds: float
    decode_seconds: float
    total_seconds: float
    tokens_per_second: float
    decode_tokens_per_second: float
    stopped_on_eos: bool


def chat_prompt(prompt: str) -> str:
    """Qwen2.5-Instruct's standard single-user chat template."""
    return (
        "<|im_start|>system\n"
        "You are Qwen, created by Alibaba Cloud. You are a helpful assistant."
        "<|im_end|>\n"
        f"<|im_start|>user\n{prompt}<|im_end|>\n"
        "<|im_start|>assistant\n"
    )


class Engine:
    def __init__(self, model: str = DEFAULT_MODEL, *, local_files_only: bool = False):
        self.model_name = model
        self.model = Qwen2.from_pretrained(model, local_files_only=local_files_only)
        self.tokenizer = Tokenizer.from_file(str(self.model.model_dir / "tokenizer.json"))
        self.eos_token_ids: set[int] = set()
        generation_config = self.model.model_dir / "generation_config.json"
        configs = [self.model.config]
        if generation_config.is_file():
            configs.append(json.loads(generation_config.read_text(encoding="utf-8")))
        for config in configs:
            eos = config.get("eos_token_id")
            if isinstance(eos, int):
                self.eos_token_ids.add(eos)
            elif isinstance(eos, list):
                self.eos_token_ids.update(token for token in eos if isinstance(token, int))

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 48,
        use_cache: bool = True,
        raw: bool = False,
        on_token: Callable[[str, float], None] | None = None,
    ) -> GenerationResult:
        """Greedily generate, optionally streaming complete Unicode fragments.

        The callback receives newly printable text and elapsed generation time.
        Decoding all generated IDs avoids corrupting UTF-8 characters spanning
        token boundaries. An incomplete trailing replacement character waits
        for subsequent tokens and is omitted if the token limit cuts it short.
        """
        if not isinstance(max_new_tokens, int) or isinstance(max_new_tokens, bool) or max_new_tokens < 1:
            raise ValueError("max_new_tokens must be a positive integer")
        if not isinstance(prompt, str):
            raise TypeError("prompt must be a string")
        encoded = self.tokenizer.encode(prompt if raw else chat_prompt(prompt), add_special_tokens=False).ids
        if not encoded:
            raise ValueError("The prompt contains no tokens; provide a nonempty prompt")
        context_limit = self.model.config["max_position_embeddings"]
        if len(encoded) + max_new_tokens - 1 > context_limit:
            raise ValueError(
                f"Prompt ({len(encoded)} tokens) plus generation ({max_new_tokens} tokens) "
                f"exceeds the context limit ({context_limit}); shorten the prompt or --max-new-tokens"
            )

        # A new cache is essential: this chapter has no persistent request state.
        cache = KVCache(len(self.model.layers)) if use_cache else None
        input_ids = torch.tensor([encoded], dtype=torch.long)
        generated: list[int] = []
        emitted = ""
        prefill_seconds = 0.0
        stopped_on_eos = False
        with torch.inference_mode():
            started = perf_counter()
            for step in range(max_new_tokens):
                logits = self.model(input_ids, cache=cache)
                next_token = int(logits[0, -1].argmax().item())
                if step == 0:
                    prefill_seconds = perf_counter() - started
                generated.append(next_token)
                decoded = self.tokenizer.decode(generated, skip_special_tokens=True).rstrip("\ufffd")
                if not decoded.startswith(emitted):
                    raise RuntimeError("Tokenizer changed previously emitted text; incremental decoding is unsupported")
                delta = decoded[len(emitted) :]
                if delta and on_token is not None:
                    on_token(delta, perf_counter() - started)
                emitted = decoded
                if next_token in self.eos_token_ids:
                    stopped_on_eos = True
                    break
                # With a cache, only the newest token needs another forward.
                # Without one, recompute the growing prefix for a fair baseline.
                input_ids = torch.tensor(
                    [[next_token]] if use_cache else [encoded + generated], dtype=torch.long
                )
            total_seconds = perf_counter() - started

        decode_seconds = max(0.0, total_seconds - prefill_seconds)
        count = len(generated)
        return GenerationResult(
            text=emitted,
            token_ids=generated,
            prompt_tokens=len(encoded),
            generated_tokens=count,
            prefill_seconds=prefill_seconds,
            decode_seconds=decode_seconds,
            total_seconds=total_seconds,
            tokens_per_second=count / total_seconds if total_seconds else 0.0,
            decode_tokens_per_second=(count - 1) / decode_seconds if count > 1 and decode_seconds else 0.0,
            stopped_on_eos=stopped_on_eos,
        )
