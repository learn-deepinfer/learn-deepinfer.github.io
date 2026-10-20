# Learn DeepInfer

从零理解与构建大模型推理引擎。Learn inference by building.

网站：<https://learn-deepinfer.github.io>

项目仓库：<https://github.com/learn-deepinfer/learn-deepinfer.github.io>

本仓库目前提供教程网站的欢迎页。完整教程正在开发中，围绕 token 生成、KV cache、批处理和调度，逐步构建可运行的推理引擎。

## 发布

GitHub Pages 从 `main` 分支的根目录发布。修改 `index.html` 并推送到 `main` 后，网站会自动更新。

`.nojekyll` 用于直接发布静态文件。使用默认 `github.io` 地址不需要 `CNAME` 文件或额外的 DNS 配置。

## 品牌素材

`assets/` 包含透明底 logo、组织头像、首页插画和网站分享封面；`favicon.ico` 包含多个小尺寸图标。Logo 和主插画通过项目维护者指定的 AIGC 工具生成，再进行单色整理、透明背景处理和网页尺寸优化。分享封面使用这些素材与真实文字排版制作。

主色：森林绿 `#19654e`、深墨绿 `#202d29`、暖白 `#f5f4ef`。插画用于品牌展示；教学中的推理机制需使用经过核对的源码与图表解释。
