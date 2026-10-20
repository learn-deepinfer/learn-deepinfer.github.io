# 沿着源码理解 DeepInfer 架构

[English](architecture.md) · [课程网站](https://learn-deepinfer.github.io/zh/) · [源码地图](source-map.md)

理解 DeepInfer，先分清一条请求、一次调度轮次和一份返回结果。本篇沿着框架职责，追踪它们之间传递的状态。上游链接统一固定在 [commit `8b16149741a4935e1dec8cea27853f273b374c5b`](https://github.com/deepseek-ai/DeepInfer/tree/8b16149741a4935e1dec8cea27853f273b374c5b)。

图用于说明关系，公式用于表达概念约束。具体分支、数据结构与约束条件以固定版本源码为准。

## 1. 先建立职责边界

![DeepInfer 课程地图：引擎编排、状态管理、调度协作与专家路由](assets/diagrams/architecture.png)

图中的四层是课程的组织方式。下面按请求经过的职责来读：入口与执行协调属于引擎编排，状态管理跨越多个阶段，调度决定本轮工作，专家路由位于执行链内部。它们是观察同一框架的两种视角。

读框架时，先回答四个问题：

| 职责 | 要追踪的问题 | 阅读入口 |
| --- | --- | --- |
| 请求入口 | 接收什么、如何规范化、在哪里分配请求身份？ | `LLM.generate`、`LLM._add_request` |
| 调度 | 本轮哪些请求可执行，哪些工作符合预算？ | `Scheduler::_schedule`、`_schedule_prefill`、`_schedule_decode` |
| 状态管理 | 哪些序列位置、缓存块与所有权记录要跨轮保留？ | `Sequence`、`BlockManager`、`CacheEngine` |
| 执行协调 | 工作何时提交，结果何时可读，资源何时可回收？ | `Worker.execute_model_step`、`LLMEngine.step` |

一条请求可以经历许多轮，一轮可以包含多条请求，某轮提交的工作也可能在后续轮次才形成可收集的结果。后面的箭头都要放在这三个区别中理解。

## 2. 沿着请求走一遍

![DeepInfer 请求主链：入口入队、调度、执行协调与结果收集](assets/diagrams/production-pipeline.png)

[`LLM.generate`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L90) 规范化输入，逐条加入请求，再进入 `_run_engine`。`_add_request` 会复制采样参数、生成请求 ID，把规范化后的输入 IDs 交给 `LLMEngine.add_request`。

[`LLMEngine.step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L860) 取得调度结果和序列元数据，并协调本轮涉及的缓存状态操作，再把这一轮工作交给 worker。调度输出描述本轮执行计划，尚不是一条请求的最终答复。

[`LLM._run_engine`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L168) 按请求 ID 收集已经就绪的输出。即使没有未完成请求，也还需要通过 `flush_inflight_reqs` 收集在途结果。它保留结果前先做 clone，因为输出对象池中的存储会在后续 step 被释放。

第一遍完整阅读可从[第一章：请求生命周期](chapter-01.md)开始。

## 3. 把调度理解成约束下的准入

![固定批处理与连续批处理：固定成员等待整批结束，或在轮次之间重新考虑准入](assets/diagrams/batching.png)

固定批处理保持一批成员，直到整批完成；连续批处理在轮次之间重新考虑成员，让符合条件的等待请求进入空出的容量。图解释这一区别，不能代替 DeepInfer 完整调度器的各个分支。

可以先用下面的预算关系建立直觉：

$$
\sum_{i\in\mathcal{A}_t}q_i\le B_t.
$$

$\mathcal{A}_t$ 是第 $t$ 轮准入的请求集合，$q_i$ 是请求 $i$ 本轮安排处理的输入位置数，$B_t$ 是教学抽象中的 token 预算。$q_i$ 不是请求最终要输出的总长度。

这里的 **prefill** 处理已有输入，为后续生成建立状态；**decode** 利用已有状态继续生成；**chunk** 是一次处理的输入分块；**draft** 是等待验证的候选序列。已有状态、本轮处理的位置和刚刚确定的输出，需要分别记录。

实际调度还受序列状态、可分配块、阶段限制、分块边界与参与者之间的协调约束。Prefill 可以拆成多个 chunk；包含 draft 验证的轮次也不能按每请求一个 token 理解。因此这个不等式只表达一项约束，不是一套完整调度策略，也不是耗时公式。

读 [`scheduler.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L275) 时，可以在纸上列出等待请求、已调度请求、分配的块和已结束请求。每经过一个分支，记录哪个条目发生变化，以及变化的条件。

## 4. 分开看序列顺序与缓存位置

请求中的 token 有逻辑顺序，保存状态的物理块却不需要按这个顺序连续排列。分页寻址的概念关系是：

$$
u=\left\lfloor\frac{t}{P}\right\rfloor,\qquad o=t\bmod P,\qquad p=\operatorname{BlockTable}[r,u].
$$

$r$ 标识请求，$t$ 是从零开始的 token 位置，$P$ 是每页容纳的位置数，$u$ 是逻辑页，$o$ 是页内偏移，$p$ 标识物理页。这是地址转换的概念表达，不承诺上游采用某种具体张量布局或压缩状态表示。

先读 [`BlockManager`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/block_manager.hpp#L119) 的所有权和分配，再读 [`CacheEngine`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L851) 协调的缓存状态操作。分配、保留、克隆与释放是不同的状态变化。

前缀共享还需要满足比可见文字相同更严格的条件。可以用下面的教学不变量记住这些要求：

$$
\operatorname{Share}(a,b,\ell)\Rightarrow
\operatorname{Tokens}_a[:\ell]=\operatorname{Tokens}_b[:\ell]
\;\land\;\operatorname{CompatibleState}(a,b,\ell)
\;\land\;\operatorname{SafeWrites}(a,b,\ell).
$$

共享段的输入前缀要一致，计算与位置状态要兼容，后续写入也不能破坏另一个请求的状态。兼容条件可能涉及配置、缓存格式、版本与附加状态。这些是必要的概念条件，不是一套充分的命中算法。还要区分引擎内部的缓存机制与上游 README 所说的额外服务级缓存系统。

## 5. 分开追踪提交与完成

[`Worker.execute_model_step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L89) 的注释明确给出顺序：发出当前轮前向工作、后处理前一轮、执行当前轮采样，再决定是否延迟当前轮后处理。

开启异步调度后，decode 后处理可以推迟到下一轮。框架必须保留这条依赖涉及的元数据和资源，直到结果可消费。[`_correct_seqlens_qk`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L191) 是阅读跨轮序列元数据修正的一个入口。

图中指向“输出”的箭头表达依赖，不能据此认定本轮提交的结果都在本轮立即返回。阅读时始终分清当前轮工作、前一轮后处理，以及已经就绪的请求输出。

## 6. 分开看逻辑专家与物理放置

![MoE 概念路径：按路由分发 token 表示，经选中专家处理，再按权重合并](assets/diagrams/expert-routing.png)

一个 token 的路由专家结果可以抽象为：

$$
y_i=\sum_{e\in\mathcal{S}_i}\alpha_{i,e}\,E_e(x_i).
$$

$x_i$ 是 token 表示，$\mathcal{S}_i$ 是选中的逻辑专家集合，$E_e$ 表示专家 $e$ 的贡献，$\alpha_{i,e}$ 是相应路由权重。这是省略了共享分支、分数处理及其他具体细节的教学公式。

Dispatch 为选中的专家组织 token 表示；combine 恢复 token 对应关系并合并贡献。专家并行负载均衡调整的是放置与副本分配，不应被描述成随意改变 token 原本需要的逻辑专家函数。

结合 [`v4_modules/moe.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/moe.py)、[`v4_modules/mlp.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/mlp.py) 和 [`rebalance_experts_global`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py#L73) 阅读。把逻辑专家 ID、物理放置和 token 到结果的对应关系分别记账。

继续查看[固定版本源码地图](source-map.md)。对每个模块，先确认输入、持有的状态、输出与释放时机，再进入具体优化。

想进一步理解这些边界为什么这样设计，可接着读[官方系统设计导读](official-design.zh-CN.md)，或打开网站的[可切换架构图解](https://learn-deepinfer.github.io/zh/layers/)。导读将官方生产系统的设计描述与固定开源版本分开对照。
