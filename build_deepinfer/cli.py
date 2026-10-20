"""Run the chapter-one CPU model and optionally save an honest recording."""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import shlex
import sys

import torch

from .engine import Engine
from .model import DEFAULT_MODEL


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(
        description="Build DeepInfer · Chapter 01: explicit Qwen2.5 greedy generation on CPU.",
        epilog="Generation timings exclude model loading and prompt tokenization. First download is approximately 1 GB.",
    )
    result.add_argument("--prompt", required=True, help="User message (chat template is applied by default).")
    result.add_argument("--model", default=DEFAULT_MODEL, help="Qwen2 Hugging Face repository or local checkpoint directory.")
    result.add_argument("--max-new-tokens", type=int, default=48)
    result.add_argument("--no-cache", action="store_true", help="Recompute the full prefix for every generated token.")
    result.add_argument("--raw", action="store_true", help="Use prompt text directly, without the Qwen2.5 chat template.")
    result.add_argument("--local-files-only", action="store_true", help="Use cached/local files; never download.")
    result.add_argument("--threads", type=int, default=4, help="PyTorch CPU threads (default: 4).")
    result.add_argument("--json", type=Path, metavar="PATH", help="Save text, token IDs and measured generation timings.")
    result.add_argument("--record", type=Path, metavar="PATH", help="Save timestamped printable fragments for demo rendering.")
    result.add_argument("--debug", action="store_true", help="Show a traceback if loading or generation fails.")
    return result


def public_model_name(model: str) -> tuple[str, bool]:
    path = Path(model).expanduser()
    if not path.is_dir():
        return model, False
    # Standard Hugging Face snapshots have a public repository identifier in
    # their parent directory; publish that instead of an absolute cache path.
    for parent in path.resolve().parents:
        if parent.name.startswith("models--"):
            return parent.name.removeprefix("models--").replace("--", "/"), True
    return "<local-model>", True


def recorded_command(args: argparse.Namespace) -> tuple[str, bool]:
    """Reproduce generation settings without leaking private output/model paths."""
    command = ["python", "-m", "build_deepinfer", "--prompt", args.prompt,
               "--max-new-tokens", str(args.max_new_tokens), "--threads", str(args.threads)]
    public_model, local_model = public_model_name(args.model)
    if public_model != DEFAULT_MODEL:
        command.extend(["--model", public_model])
    for flag, enabled in (("--no-cache", args.no_cache), ("--raw", args.raw), ("--local-files-only", args.local_files_only)):
        if enabled:
            command.append(flag)
    return shlex.join(command), local_model


def save_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argument_parser = parser()
    args = argument_parser.parse_args(argv)
    if args.max_new_tokens < 1:
        argument_parser.error("--max-new-tokens must be positive")
    if args.threads < 1:
        argument_parser.error("--threads must be positive")
    if args.json is not None and args.record is not None and args.json.resolve() == args.record.resolve():
        argument_parser.error("--json and --record need different output paths")

    events: list[dict[str, str | float]] = []

    def stream(delta: str, elapsed: float) -> None:
        events.append({"time": elapsed, "text": delta})
        print(delta, end="", flush=True)

    try:
        torch.set_num_threads(args.threads)
        print(f"Loading {args.model} · CPU float32 · {args.threads} threads", file=sys.stderr, flush=True)
        engine = Engine(args.model, local_files_only=args.local_files_only)
        generated = engine.generate(
            args.prompt, max_new_tokens=args.max_new_tokens,
            use_cache=not args.no_cache, raw=args.raw, on_token=stream,
        )
        print()
        result = asdict(generated)
        print(
            f"\n{generated.prompt_tokens} prompt + {generated.generated_tokens} generated tokens · "
            f"prefill {generated.prefill_seconds:.3f}s · decode {generated.decode_seconds:.3f}s · "
            f"total {generated.total_seconds:.3f}s · {generated.tokens_per_second:.2f} generation tok/s",
            file=sys.stderr,
        )
        print("Timings exclude model loading and tokenization; generated tokens include EOS.", file=sys.stderr)
        if args.json is not None:
            save_json(args.json, result)
            print(f"Result saved: {args.json}", file=sys.stderr)
        if args.record is not None:
            command, redacted = recorded_command(args)
            save_json(args.record, {
                "command": command,
                "command_redacted": redacted,
                "model": public_model_name(args.model)[0],
                "device": "cpu",
                "prompt": args.prompt,
                "events": events,
                "result": result,
                "timing_note": "Generation excludes model loading and tokenization; generated tokens include EOS.",
            })
            print(f"Recording saved: {args.record}", file=sys.stderr)
        return 0
    except KeyboardInterrupt:
        print("\nGeneration interrupted.", file=sys.stderr)
        return 130
    except Exception as error:
        if args.debug:
            raise
        print(f"\nCould not run the model: {error}", file=sys.stderr)
        print("Check the model path/network or try --local-files-only. Use --debug for a traceback.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
