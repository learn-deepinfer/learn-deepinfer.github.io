# Learn DeepInfer

**Understand inference. One token at a time.**

[阅读中文教程](https://learn-deepinfer.github.io/zh/) · [Read in English](https://learn-deepinfer.github.io/en/)

An independent, bilingual learning site about the mechanisms behind modern inference engines, with a small CPU implementation you can actually run.

从一个 token 开始，每次只加一个机制，逐步理解 DeepInfer 的缓存、调度与并行设计。

## Run the website

Requires Node.js 20.19+ (Node.js 22 recommended).

```bash
cd web
npm ci
npm run dev
```

Open `http://127.0.0.1:5178/zh/`. Switch to English with the header control.

```bash
npm run build
npm run preview
```

The build creates a static site in `web/dist/`, including the Chapter 1 source download and a real CPU demo recording. The build prerenders 32 Chinese and English route documents, plus a sitemap and social metadata. GitHub Pages publishes `web/dist/` through the repository’s Pages workflow; Netlify and Vercel configurations are also included. Browser progress and theme preferences stay local; there is no account system.

## What you can explore

| Foundations | Memory | Scheduling | Distributed inference |
| --- | --- | --- | --- |
| Token loop | KV cache | Static batching | Expert parallelism |
| Model forward | Paged KV | Continuous batching | Expert load balancing |
| Sampling | Prefix reuse | Speculation / async execution | |

12 lessons include Chinese and English explanations, teaching excerpts, exercises, and links to pinned upstream source. Interactive panels support stepping, playback, reset, and scrubbing. Lesson comparison shows a diff between teaching excerpts.

The interactive panels are educational state demonstrations. They do not load a model or report device performance. Only Chapter 1 includes a complete locally runnable model implementation in this release; later lessons explain mechanisms and point to the production source.

## Run real inference on a CPU

Requires Python 3.10+. A default first run downloads approximately 1 GB of Qwen2.5-0.5B-Instruct weights. FP32 parameter memory is approximately 2 GB, plus runtime overhead.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .
python -m build_deepinfer \
  --prompt "Explain KV cache in a transformer in one sentence." \
  --max-new-tokens 48
```

On Windows, activate with `.venv\Scripts\activate` instead. Use `--model /path/to/checkpoint --local-files-only` for an existing local model, `--no-cache` to recompute the full prefix, and `--raw` for plain completion instead of the Qwen chat template.

The runtime uses **PyTorch + safetensors + tokenizers**, with an explicit Qwen2 forward pass and greedy generation loop. Hugging Face Hub resolves weights; Transformers is only an optional correctness oracle. Qwen is the small dense teaching model, not the DeepSeek model used by upstream DeepInfer.

Read [Chapter 1](docs/chapter-01.md) and the [source map](docs/source-map.md).

## Check correctness

```bash
python -m pip install -e '.[dev]'
python -m pytest -q
python scripts/validate_reference.py
```

The ordinary test suite uses small randomly initialized models and temporary checkpoints, with no model downloads. The separate oracle script reads the real Qwen checkpoint from the cache by default; add `--allow-download` to let that script download it. It compares logits and greedy decisions against Transformers on CPU.

The included [demo](docs/assets/chapter-01.mp4) was produced by the actual CLI. Measurements are specific to that local run, exclude model loading, and are not a benchmark against DeepInfer or another inference framework.

## Project layout

```text
web/                    Learning site (React + TypeScript + Vite)
build_deepinfer/model.py Qwen2 forward pass, GQA, RoPE, RMSNorm, KV cache
build_deepinfer/engine.py Explicit greedy generation and streaming
build_deepinfer/cli.py   Command-line interface and recording
docs/                   Chapter text, source mapping, actual demo assets
tests/                  Cache, attention, loading, and reference tests
```

## Deploy

Push to `main` to build and deploy with GitHub Actions. The Pages workflow installs the locked website dependencies and publishes only `web/dist/`. The production site is https://learn-deepinfer.github.io. See [deployment notes](docs/deployment.md).

## Credits

The progressive-course format and restrained documentation design are inspired by [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code). The reference project is MIT licensed; its notice is preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The inference mechanisms and source reading path refer to [deepseek-ai/DeepInfer](https://github.com/deepseek-ai/DeepInfer), pinned to `8b16149741a4935e1dec8cea27853f273b374c5b`. This is an independent community learning project and is not affiliated with or endorsed by DeepSeek or shareAI Lab.

Project code is Apache-2.0. Model weights remain subject to their own license.
