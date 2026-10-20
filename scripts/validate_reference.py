#!/usr/bin/env python3
"""Compare chapter one's model with Transformers using a real local checkpoint.

This is an opt-in correctness check, not a throughput benchmark. It defaults to
local files only and runs both implementations on CPU in float32.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Make `python scripts/validate_reference.py` work from a clean source checkout.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_deepinfer.model import KVCache, Qwen2, resolve_model_path  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct")
    parser.add_argument("--prompt", default="In one sentence, explain what a KV cache does.")
    parser.add_argument("--steps", type=int, default=6, help="Number of greedy tokens to verify.")
    parser.add_argument("--atol", type=float, default=2e-4)
    parser.add_argument("--rtol", type=float, default=2e-4)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--allow-download", action="store_true", help="Explicitly permit Hugging Face downloads.")
    args = parser.parse_args()
    if args.steps < 1 or args.threads < 1:
        parser.error("--steps and --threads must be positive")

    torch.set_num_threads(args.threads)
    torch.manual_seed(0)
    local_only = not args.allow_download
    # Resolve once so both implementations and the tokenizer see the same revision.
    model_dir = resolve_model_path(args.model, local_files_only=local_only)
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True)
    messages = [{"role": "user", "content": args.prompt}]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    tokens = tokenizer(prompt, return_tensors="pt", add_special_tokens=False).input_ids
    print(f"Loading {args.model}: CPU float32, local_files_only={local_only}", flush=True)
    reference = AutoModelForCausalLM.from_pretrained(
        str(model_dir),
        local_files_only=True,
        torch_dtype=torch.float32,
        attn_implementation="eager",
    ).cpu().eval()
    model = Qwen2.from_pretrained(str(model_dir), local_files_only=True).cpu().float().eval()
    cache = KVCache(reference.config.num_hidden_layers)
    reference_cache = None
    current_input = tokens
    generated = []
    max_absolute_error = 0.0
    expected_length = tokens.shape[1]

    with torch.inference_mode():
        for step in range(args.steps):
            expected_output = reference(current_input, past_key_values=reference_cache, use_cache=True)
            expected = expected_output.logits[:, -1:]
            actual = model(current_input, cache=cache)
            if actual.shape != expected.shape:
                raise AssertionError(f"Logit shape mismatch: {actual.shape} != {expected.shape}")
            max_error = (actual - expected).abs().max().item()
            max_absolute_error = max(max_absolute_error, max_error)
            torch.testing.assert_close(actual, expected, atol=args.atol, rtol=args.rtol)
            expected_token = expected[:, -1].argmax(dim=-1)
            actual_token = actual[:, -1].argmax(dim=-1)
            if not torch.equal(actual_token, expected_token):
                raise AssertionError(f"Greedy token mismatch at step {step}: {actual_token} != {expected_token}")
            if cache.length != expected_length:
                raise AssertionError(f"Cache length {cache.length} != expected {expected_length}")
            generated.append(actual_token.item())
            print(f"step={step} token={actual_token.item()} max_abs_error={max_error:.8g}", flush=True)
            reference_cache = expected_output.past_key_values
            current_input = actual_token[:, None]
            expected_length += 1

    print(json.dumps({
        "status": "passed",
        "model": args.model,
        "device": "cpu",
        "dtype": "float32",
        "prompt_tokens": tokens.shape[1],
        "greedy_tokens_checked": args.steps,
        "max_absolute_logit_error": max_absolute_error,
        "atol": args.atol,
        "rtol": args.rtol,
        "generated_token_ids": generated,
        "generated_text": tokenizer.decode(generated),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
