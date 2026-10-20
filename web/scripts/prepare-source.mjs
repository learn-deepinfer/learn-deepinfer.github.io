import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public', 'source');
const project = path.resolve(root, '..');
await mkdir(output, { recursive: true });
const files = (await readdir(path.join(project, 'build_deepinfer'))).filter(f => f.endsWith('.py'));
for (const file of files) await copyFile(path.join(project, 'build_deepinfer', file), path.join(output, file));
for (const file of ['chapter-01.md', 'source-map.md']) {
  try { await copyFile(path.join(project, 'docs', file), path.join(output, file)); }
  catch { /* A source file can be authored independently of the website. */ }
}
const manifest = await Promise.all(files.map(async name => ({ name, lines: (await readFile(path.join(output, name), 'utf8')).trimEnd().split('\n').length })));
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
const media = path.join(root, 'public', 'media');
await mkdir(media, { recursive: true });
for (const name of ['chapter-01.mp4', 'chapter-01.gif', 'chapter-01-preview.png', 'chapter-01-recording.json', 'chapter-01-result.json']) {
  await copyFile(path.join(project, 'docs', 'assets', name), path.join(media, name));
}
const zipFiles = {};
for (const relative of [
  ...files.map(name => `build_deepinfer/${name}`),
  'pyproject.toml', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'docs/chapter-01.md', 'docs/source-map.md', 'scripts/validate_reference.py',
]) zipFiles[`build-deepinfer-chapter-01/${relative}`] = new Uint8Array(await readFile(path.join(project, relative)));
const quickstart = 'python -m venv .venv\nsource .venv/bin/activate\npython -m pip install -e .\npython -m build_deepinfer --prompt "Explain KV cache in a transformer in one sentence." --max-new-tokens 48';
const chapterReadme = `# Learn DeepInfer · Chapter 1 / 第一章

Generate real text on a CPU with a readable Qwen2 forward pass and an explicit greedy loop.
在普通电脑的 CPU 上，用手写 Qwen2 前向与贪心循环生成真实文本。

## Start here / 开始运行

Unzip the download and open a terminal inside \`build-deepinfer-chapter-01\`.
解压后，在 \`build-deepinfer-chapter-01\` 文件夹中打开终端。

Requires Python 3.10+. The first run downloads approximately 1 GB of model weights.
CPU FP32 parameters use approximately 2 GB of memory, plus runtime overhead.
需要 Python 3.10+。首次运行下载约 1 GB 权重；FP32 参数约占 2 GB 内存，另需运行开销。

\`\`\`bash
${quickstart}
\`\`\`

On Windows, replace the activation line with \`.venv\\Scripts\\activate\` (Command Prompt)
or \`.venv\\Scripts\\Activate.ps1\` (PowerShell).
Windows 用户请用上面对应终端的命令替换环境激活行。

## Try the mechanism / 对照缓存机制

- Add \`--no-cache\` to recompute the growing prefix on every step.
  添加此参数可关闭 KV cache，每轮重算完整前缀。
- Add \`--json result.json\` to save output IDs and measured generation timings.
  添加此参数可保存输出 token IDs 与本次生成计时。
- Use \`--model /path/to/checkpoint --local-files-only\` to load an existing local model.
  使用此参数可只读取已有本地模型。

Read the [complete Chapter 1 walkthrough](docs/chapter-01.md) and
[pinned upstream source map](docs/source-map.md) alongside the code.
结合代码阅读完整第一章和固定版本的上游源码地图。

## Optional reference check / 可选参考校验

After the first generation has cached the model, install the optional dependencies and run:
首次生成完成、模型已缓存后，可安装开发依赖并与 Transformers 对照 logits 和贪心选择：

\`\`\`bash
python -m pip install -e '.[dev]'
python scripts/validate_reference.py
\`\`\`

The reference script uses local files by default; add \`--allow-download\` if it needs to download the checkpoint.
参考校验默认只读取本地文件；需要下载模型时，显式添加 \`--allow-download\`。

## Included files / 文件说明

- \`build_deepinfer/\`: CPU model, cache, generation engine, and CLI.
- \`docs/chapter-01.md\`: step-by-step Chinese lesson.
- \`docs/source-map.md\`: conceptual mapping to pinned DeepInfer source.
- \`scripts/validate_reference.py\`: optional real-checkpoint reference check.

This is the standalone Chapter 1 package. The lesson website, repository-wide tests, and demo media belong to the full project.
这是独立的第一章下载包；课程网站、全仓库测试和演示媒体属于完整项目。

Qwen2.5-0.5B-Instruct is the dense teaching model. The CPU implementation does not execute DeepSeek-V4.1 or reproduce DeepInfer performance.
Qwen2.5-0.5B-Instruct 是本章使用的稠密教学模型；此 CPU 实现不运行 DeepSeek-V4.1，也不代表 DeepInfer 的性能。

Project code is Apache-2.0; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
Model weights retain their own license.
`;
zipFiles['build-deepinfer-chapter-01/README.md'] = strToU8(chapterReadme);
zipFiles['build-deepinfer-chapter-01/START-HERE.txt'] = strToU8(`Unzip, then open a terminal inside build-deepinfer-chapter-01.\n${quickstart}\n\nFor Windows activation and the optional reference check, see README.md.\nFor the complete walkthrough, see docs/chapter-01.md.\n`);
await writeFile(path.join(root, 'public', 'chapter-01-source.zip'), zipSync(zipFiles, { level: 6 }));
console.log(`Prepared ${files.length} source files, real demo media, and Chapter 1 download.`);
