<div align="center">

<a href="https://learn-deepinfer.github.io/zh/">
  <img src="web/public/brand/logo-192.png" alt="Learn DeepInfer 标识" width="80" height="80" />
</a>

# Learn DeepInfer

**从一个 token，读懂推理引擎。**

12 节循序渐进的课程，从普通电脑上能运行的生成循环开始。

[English](README.md) · [简体中文](README.zh-CN.md)

[![网站部署](https://github.com/learn-deepinfer/learn-deepinfer.github.io/actions/workflows/pages.yml/badge.svg)](https://github.com/learn-deepinfer/learn-deepinfer.github.io/actions/workflows/pages.yml) [![开源许可：Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-19654e?style=flat)](LICENSE) [![12 节课程](https://img.shields.io/badge/Lessons-12-19654e?style=flat)](https://learn-deepinfer.github.io/zh/timeline/)

**[开始学习 →](https://learn-deepinfer.github.io/zh/)** · **[English course →](https://learn-deepinfer.github.io/en/)** · [运行第一章](#在-cpu-上运行第一章)

</div>

---

先让模型生成真实文本，再逐个理解 KV cache、批处理、调度与专家并行。每章围绕一个机制展开，用短小的教学代码解释思路，再沿着固定版本的 [DeepInfer 源码](https://github.com/deepseek-ai/DeepInfer) 继续追踪。

**阅读课程、操作交互演示、运行第一章，都不需要 GPU。**

<a href="https://learn-deepinfer.github.io/zh/">
  <img src="docs/assets/site-branded-desktop.png" alt="Learn DeepInfer 网站：双语导航、最小 token 生成循环与学习入口" width="100%" />
</a>

## 你可以怎样学

| 读讲解 | 看源码 | 动手试 | 比变化 |
| :--- | :--- | :--- | :--- |
| 中英双语课程、练习与源码链接 | 沿着一条请求，理解四个架构层 | 单步、播放、重置，观察机制的状态变化 | 并排比较两章思路和关键代码 |

网站支持搜索、深浅主题、手机阅读与学习进度记录。进度保存在当前浏览器。

### 每次，只增加一个机制

| | 课程 | 这一章关注什么 |
| :---: | :--- | :--- |
| `s01` | [让模型真正吐出第一个 token](https://learn-deepinfer.github.io/zh/s01/) | 分词、prefill 与真实 CPU 生成 |
| `s02` | [把一次前向拆开来看](https://learn-deepinfer.github.io/zh/s02/) | 注意力、归一化与模型状态 |
| `s03` | [用 KV cache 留住过去的计算](https://learn-deepinfer.github.io/zh/s03/) | 复用历史位置的键和值 |
| `s04` | [从 logits 走到采样结果](https://learn-deepinfer.github.io/zh/s04/) | 下一枚 token 怎样被选出来 |
| `s05` | [把多条请求放到一次计算里](https://learn-deepinfer.github.io/zh/s05/) | 静态 batch 与每条请求的停止条件 |
| `s06` | [让 batch 在每一步变化](https://learn-deepinfer.github.io/zh/s06/) | 连续批处理与请求补位 |
| `s07` | [把连续上下文映射到分页内存](https://learn-deepinfer.github.io/zh/s07/) | 逻辑位置与物理内存页 |
| `s08` | [让相同前缀只计算一次](https://learn-deepinfer.github.io/zh/s08/) | 相同前缀的计算复用 |
| `s09` | [从推测解码走向 DSpark](https://learn-deepinfer.github.io/zh/s09/) | 先提出候选，再一起验证 |
| `s10` | [把 CPU 工作藏进设备执行时间](https://learn-deepinfer.github.io/zh/s10/) | 主机准备与设备执行的重叠 |
| `s11` | [让 token 找到跨卡专家](https://learn-deepinfer.github.io/zh/s11/) | MoE 分发、专家计算与结果合并 |
| `s12` | [给热点专家安排副本与位置](https://learn-deepinfer.github.io/zh/s12/) | 专家布局、副本与负载均衡 |

[查看学习路径 →](https://learn-deepinfer.github.io/zh/timeline/) · [浏览系统架构 →](https://learn-deepinfer.github.io/zh/layers/) · [对比两个章节 →](https://learn-deepinfer.github.io/zh/compare/)

> **当前进度：** 第一章提供完整、可运行的 CPU 实现。后续章节包含机制讲解、教学片段、练习与上游源码导读。浏览器中的交互面板演示预设状态变化，不执行模型推理。

## 在 CPU 上运行第一章

本章实现了可阅读的 Qwen2 前向、显式贪心生成循环和 KV cache。运行时使用 **PyTorch + safetensors + tokenizers**；Transformers 用于可选的正确性对照。

**环境要求：** Python 3.10+。首次运行下载约 1 GB 的 Qwen2.5-0.5B-Instruct 权重；FP32 参数约占 2 GB 内存，另需运行开销。

```bash
git clone https://github.com/learn-deepinfer/learn-deepinfer.github.io.git
cd learn-deepinfer.github.io

python -m venv .venv
source .venv/bin/activate
python -m pip install -e .

python -m build_deepinfer \
  --prompt "Explain KV cache in a transformer in one sentence." \
  --max-new-tokens 48
```

Windows 用户在 Command Prompt 中使用 `.venv\Scripts\activate`，在 PowerShell 中使用 `.venv\Scripts\Activate.ps1` 激活环境。

| 想试什么 | 添加参数 |
| :--- | :--- |
| 每步重算完整前缀，对照缓存的作用 | `--no-cache` |
| 不使用聊天模板，直接补全文本 | `--raw` |
| 加载兼容当前实现的本地 Qwen2 权重 | `--model /path/to/checkpoint --local-files-only` |
| 保存输出 token IDs 与生成计时 | `--json result.json` |

[阅读第一章完整说明](docs/chapter-01.md) · [下载独立源码 ZIP](https://learn-deepinfer.github.io/chapter-01-source.zip) · [查看源码地图](docs/source-map.md)

### 看一次真实运行

<p align="center">
  <a href="docs/assets/chapter-01.mp4">
    <img src="docs/assets/chapter-01.gif" alt="Qwen2.5-0.5B-Instruct 在 CPU 上生成文本的真实录屏，展示流式输出与 prefill、decode 计时" width="768" />
  </a>
</p>

录屏来自实际 CLI 运行。可以[观看视频](docs/assets/chapter-01.mp4)，或查看[原始记录](docs/assets/chapter-01-recording.json)。计时仅代表这次本地运行，不包含模型加载和分词时间。

<details>
<summary><strong>与 Transformers 对照，检查实现是否正确</strong></summary>

```bash
python -m pip install -e '.[dev]'
python -m pytest -q
python scripts/validate_reference.py
```

普通测试使用随机初始化的小模型与临时权重，不下载模型。单独的参考脚本读取本地缓存中的真实 Qwen 权重，比较 logits 和贪心选择；需要允许它下载权重时，添加 `--allow-download`。

</details>

## 本地启动网站

在已克隆的仓库中，安装 Node.js 20.19+，推荐使用 Node.js 22：

```bash
cd web
npm ci
npm run dev
```

打开 **[localhost:5178](http://127.0.0.1:5178/zh/)**。预览生产构建：

```bash
npm run build
npm run preview
```

网站基于 React + TypeScript + Vite。构建会预渲染 32 个中英文路由页面，并打包第一章下载文件。推送到 `main` 后，GitHub Actions 自动发布。[部署说明 →](docs/deployment.md)

## 从哪里读代码

```text
web/                     双语网站与交互机制演示
build_deepinfer/
  model.py               Qwen2 前向、GQA、RoPE、RMSNorm 与 KV cache
  engine.py              贪心生成与 Unicode 安全的流式输出
  cli.py                 命令行、计时结果与录屏记录
docs/                    章节说明、源码地图与演示素材
tests/                   注意力、缓存、权重加载与参考校验
```

## 一起完善

发现解释不清楚、步骤遗漏，或有想补充的例子，可以[提 Issue](https://github.com/learn-deepinfer/learn-deepinfer.github.io/issues) 或提交小规模 PR。欢迎修正文档、完善翻译，以及为下一个可运行机制补充独立示例。修改 CPU 实现时，请运行上面的校验命令。

## 致谢与许可

- 课程组织方式和文档设计参考了 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code)，其 MIT 许可声明保留在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 源码导读基于 [deepseek-ai/DeepInfer](https://github.com/deepseek-ai/DeepInfer)，固定版本为 [`8b16149`](https://github.com/deepseek-ai/DeepInfer/tree/8b16149741a4935e1dec8cea27853f273b374c5b)。本项目是独立的社区学习项目。
- 项目代码采用 [Apache-2.0](LICENSE)；模型权重遵循各自许可。第一章使用小型 Qwen 模型教学，不复现上游 DeepInfer 的模型执行或性能。

<div align="center">

**从第一个 token，走向它背后的系统。**

[开始学习](https://learn-deepinfer.github.io/zh/) · [Read in English](https://learn-deepinfer.github.io/en/)

</div>
