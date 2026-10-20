# 从官方文章理解 DeepInfer 的设计

[English](official-design.md) · [架构导读](architecture.zh-CN.md) · [源码地图](source-map.md)

DeepSeek 官方的[《DeepSeek V4.1 Flash 大规模推理部署实践》](https://zhuanlan.zhihu.com/p/2095560295930508953)解释了多个机制为什么需要协同设计。这份社区导读把设计思路整理成阅读问题，再连接课程与固定版本源码。

先确认范围：文章明确说明，KVCache 管理与负载均衡组件和内部基础设施耦合，尚未完整开源。文章中的完整系统设计与本仓库固定引用的 [DeepInfer 开源版本](https://github.com/deepseek-ai/DeepInfer/tree/8b16149741a4935e1dec8cea27853f273b374c5b)需要分别阅读。下面的源码入口用于检查相关状态和接口。

## 按问题读，不急着记优化名词

| 顺序与问题 | 从文章中带走的关系 | 课程与源码入口 |
| --- | --- | --- |
| **1 · 为什么区分 Prefill 与 Decode？** | Prefill 处理输入上下文，Decode 在已有上下文上继续生成；两阶段拥有独立资源与调度。先分清阶段，再追踪一轮工作的组织方式。 | [请求生命周期](chapter-01.md)；[`llm_engine.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py)、[`scheduler.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp) |
| **2 · 请求应该交给谁？** | 请求负载均衡要考虑阶段：Prefill 关注未命中工作与已计算前缀的代价；Decode 同时关注并发请求数和 KV 总长度。完整请求分配组件未全部公开。 | 本文下方的抽象负载模型；[官方文章](https://zhuanlan.zhihu.com/p/2095560295930508953) |
| **3 · Block 命中后，状态是否齐全？** | 长期分页 Block 与短期滑动窗口注意力（SWA）状态有不同生命周期；Block 命中不代表所需 SWA 状态已经就绪。 | [s08 前缀复用](https://learn-deepinfer.github.io/zh/s08/)；[`cache_engine.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py)、[`block_manager.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/block_manager.hpp) |
| **4 · 每条请求应验证多少草稿？** | DSpark 按请求安排变长验证。置信度提供选择依据，总预算约束整轮工作量，两者要分开记账。 | [s09 DSpark](https://learn-deepinfer.github.io/zh/s09/)；[`mtp_varlen.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/mtp_varlen.hpp)、[`layers/sampler.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/layers/sampler.py) |
| **5 · 哪一轮提交，哪一轮落账？** | Schedule、forward、sample 与 post-process 可以跨轮重叠；需要追踪依赖和保留状态，不能把异步理解成这些阶段普遍不再耗时。 | [s10 执行重叠](https://learn-deepinfer.github.io/zh/s10/)；[`worker.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py)、[`llm_engine.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py) |
| **6 · 输出约束怎样进入每一步？** | 结构化输出（SO）先把语法编译为自动机，与推理过程解耦；每步依据当前状态生成合法 token mask、采样，再推进状态。 | [s04 采样与状态](https://learn-deepinfer.github.io/zh/s04/)；[`compiler.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/compiler.py)、[`matcher.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/matcher.py)、[`mask.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/mask.py) |
| **7 · 请求均衡和专家均衡有什么不同？** | Request LB 分配请求；EPLB 调整专家放置与副本。前者解决请求去哪里，后者解决专家如何分布。 | [s12 EPLB](https://learn-deepinfer.github.io/zh/s12/)；[`eplb/policy.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py) |
| **8 · API 格式解析归谁负责？** | 文章将 API 解析交给另一个独立项目 `deepseek-recipe`。阅读 DeepInfer 的请求输出时，要继续区分结果记录、语法约束与 API 解析。 | [源码地图：结果与所有权](source-map.md#4-一轮工作如何跨模块跨轮次推进)；[官方文章](https://zhuanlan.zhihu.com/p/2095560295930508953) |

## 用两个抽象模型记住负载差别

下面是便于阅读的**概念模型**，不对应开源代码中的完整调度策略或具体代价函数。

Prefill 可以先用代价预算记账：

$$
\sum_{i\in\mathcal{A}}\operatorname{cost}(q_i,c_i)\le T.
$$

$\mathcal{A}$ 是本轮选中的请求集合，$q_i$ 是本轮安排处理的未命中 token 数，$c_i$ 是已计算前缀长度，$T$ 是抽象预算。它提醒我们：相同的新增 token 数，在不同前缀条件下不必具有相同代价。

Decode 可以先观察负载向量：

$$
\mathbf{d}=\left(N,\sum_{i=1}^{N}L_i\right).
$$

$N$ 是并发请求数，$L_i$ 是请求 $i$ 的 KV 长度。只看请求数会遗漏上下文长度带来的差异；这个向量本身不是完整的分配算法。

## 缓存复用还要问“缺了哪类状态”

文章中的 bounded replay 针对缺失的短期 SWA 状态，在受限回放片段内截断上下文并作近似重建。已命中的长期 Block 原样复用、不覆写。因此阅读时要分开标记：哪些 Block 已命中、哪些 SWA 状态缺失、哪一段需要回放，以及重建结果供哪一步使用。回放段内的截断不能被理解成整个前缀都要重算。

读完文章后，回到源码验证三个问题：本轮元数据包含什么，哪个模块持有状态，消费者何时可以读取它。文章解释设计动机，固定源码帮助确认公开实现的具体边界。
