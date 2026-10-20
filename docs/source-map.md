# 从第一章走到 DeepInfer 源码

这张地图把第一章的职责对应到 DeepInfer 中值得阅读的位置。上游参考固定为 [`deepseek-ai/DeepInfer@8b16149741a4935e1dec8cea27853f273b374c5b`](https://github.com/deepseek-ai/DeepInfer/tree/8b16149741a4935e1dec8cea27853f273b374c5b)，避免跟随主分支变化后，文档与源码失去对应。

第一章实现的是 Qwen2.5-0.5B-Instruct 的 CPU 推理。表里的对应关系是**职责上的类比**，不表示复用了上游实现、具有相同的模型结构或兼容接口。

## 先沿主链读一遍

```text
本章：    CLI → Engine → Qwen2.forward → greedy token → 下一轮

DeepInfer：LLM.generate
             → LLMEngine.step
             → C++ Scheduler
             → Worker.execute_model_step
             → ModelRunner → DeepseekForCausalLM / sampler
             → 更新请求状态 → 下一轮
```

上游把调度、设备执行和后处理拆开，是为了容纳多请求、跨卡协作与异步重叠。第一章保留顺序执行的一条请求，方便先检查每个 token 是怎么产生的。

| 本章阅读位置 | 已经能理解的职责 | 对应的上游阅读入口 | 需要保留的差别 |
| --- | --- | --- | --- |
| [`cli.py`](../build_deepinfer/cli.py)、[`engine.py`](../build_deepinfer/engine.py) | 接收文字与生成参数，启动一次生成 | [`LLM.generate`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L90) | 上游支持批量输入，先将各个请求加入引擎；本章按单请求生成 |
| [`engine.py`](../build_deepinfer/engine.py) 的编码流程 | 把格式化后的输入转换为 IDs | [`LLM._add_request`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L144) | 上游这一处调用 tokenizer 编码并入队，不应据此认为它实现了与本章相同的 Qwen 聊天模板 |
| [`engine.py`](../build_deepinfer/engine.py) 的逐 token 循环 | 重复前向，检查结束条件，收集结果 | [`LLM._run_engine`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L168)、[`LLMEngine.step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L860) | 上游一次 step 是一次调度与执行轮次；可能有多个请求，也可能涉及多个 draft token，不能等同于“恰好生成一个 token” |
| 第一章没有对应调度器 | 从多条请求中选择本轮工作，管理预算与等待 | [`Scheduler::_schedule`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L275)、[`_schedule_prefill`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L347) | 上游调度热路径在 C++，NORMAL 引擎还通过 DP 组投票统一 prefill/decode 步型；普通 Python for 循环没有这些能力 |
| [`model.py`](../build_deepinfer/model.py) 的权重加载 | 根据配置建立网络，把 checkpoint 张量装入参数 | [`get_model`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/model_loader.py#L65)、[`load_hf_checkpoint`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/model_loader.py#L136) | 上游要选择模型架构、处理设备和专用运行时布局；本章只覆盖自己实现的 Qwen2 结构 |
| [`model.py`](../build_deepinfer/model.py) 的 `Qwen2` 前向 | embedding、各层计算、归一化与词表打分 | [`DeepseekModel.forward`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/deepseek.py#L154)、[`DeepseekForCausalLM`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/deepseek.py#L251) | Qwen2 的 GQA 稠密模型不是 DeepSeek-V4.1；上游包含跨层状态、MoE 和 draft 模块等路径 |
| [`model.py`](../build_deepinfer/model.py) 的 `Attention` | 计算 Q/K/V、位置编码、因果注意力，读写历史状态 | [`v4_modules/attn.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/attn.py#L1) | 上游是 V4 的 MLA 运行时，含压缩 KV、稀疏索引、滑动窗口和 YoCo 等路径；不能直接套用本章 GQA 张量形状 |
| [`model.py`](../build_deepinfer/model.py) 的 `KVCache` | 保存每层已处理输入的 K/V，跨前向复用 | [`KVCache`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L206)、[`CacheEngine`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L851) | 上游按模型缓存格式和块管理设备内存；本章的单请求缓存没有分页、多请求共享和服务级缓存系统 |
| [`engine.py`](../build_deepinfer/engine.py) 中的 `argmax` | 从最后一个位置的 logits 选择下一个 ID | [`ModelRunner.execute_sample`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py#L337)、[`DeepseekForCausalLM.sample`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/deepseek.py#L385) | 上游 sampler 有独立输入元数据，并可能使用 MTP/draft、结构化输出等；贪心是本章刻意选择的窄范围 |

## 第二遍读：为什么设备执行需要单独一层

先读 [`ModelRunner.execute_main_model`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py#L308)。它准备输入，选择 CUDA Graph replay 或模型前向，返回模型输出与元数据。本章可以直接调用 `model(...)`；上游必须把一次设备执行需要的输入形状、图和 cache 组织好。

再读 [`Worker.execute_model_step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L89)。函数注释给出了顺序：当前步前向、上一步后处理、当前步采样，再决定当前步是否延后处理。

开启 ZOS 时，decode 的后处理延迟到下一轮，在下一轮 GPU 前向已经发出后执行。CPU 调度因此可以与设备工作重叠。与之配套的 [`_correct_seqlens_qk`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L191) 处理 CPU 元数据滞后一轮的问题。这是执行依赖和状态维护上的改造；第一章的同步循环还没有实现异步调度。

## 哪些内容需要换模型、换硬件以后再实现

| 上游能力 | 已核实的源码入口 | 第一章的边界 |
| --- | --- | --- |
| MoE 专家与 EP | [`v4_modules/moe.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/moe.py#L1)、[`v4_modules/mlp.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/mlp.py#L1) | Qwen2.5-0.5B 的稠密 SwiGLU 没有路由门或跨设备 dispatch/combine |
| EPLB | [`rebalance_experts_global`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py#L73) | 本章没有专家，所以没有副本分配与重排 |
| CP、DP、EP 分组 | [`ParallelProcessGroup.create_process_groups`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/parallel_utils/parallel_state.py#L70) | 本章在一台机器的 CPU 上执行一条请求，没有分布式通信 |
| CUDA Graph 与专用算子 | [`execute_main_model`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py#L308)、[上游功能清单](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L20) | PyTorch CPU 算子的正确执行不能证明这些优化已被复现 |

上游 README 明确列出该版本支持 DeepSeek-V4.1-Flash，硬件为 NVIDIA SM100 和 Huawei Ascend 950，并说明完整在线服务仍需要另外的系统组件，参见 [支持范围](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L3) 与 [硬件和服务组件](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L33)。其中“还需要 KV cache system”不等于上游没有设备内 KV cache；上表已经链接了它的设备缓存实现。

第一章的验收是：真实权重经过本仓库的 Qwen2 前向和显式生成循环，能产生文本，且缓存路径可被检查。上游性能图、模型能力、服务接口与硬件支持均不能作为本章的实测结果。
