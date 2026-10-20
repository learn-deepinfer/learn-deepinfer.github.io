# Reading DeepInfer through the official design article

[简体中文](official-design.zh-CN.md) · [Architecture guide](architecture.md) · [Source map](source-map.md)

DeepSeek's official article [《DeepSeek V4.1 Flash 大规模推理部署实践》](https://zhuanlan.zhihu.com/p/2095560295930508953) explains why several framework mechanisms need to be designed together. These community notes turn its design ideas into reading questions, connected to lessons and pinned source entries.

Establish the scope first: the article explicitly says that KVCache management and load-balancing components are coupled to internal infrastructure and have not been fully open-sourced. Read its complete system design separately from the [pinned DeepInfer release](https://github.com/deepseek-ai/DeepInfer/tree/8b16149741a4935e1dec8cea27853f273b374c5b). The source entries below help inspect related state and interfaces.

## Follow questions before optimization names

| Order and question | Relationship to retain | Lessons and source entries |
| --- | --- | --- |
| **1 · Why separate Prefill and Decode?** | Prefill processes input context; Decode continues generation from existing context. The stages have independent resources and scheduling. Identify the stage before following a round of work. | [Request lifecycle](chapter-01.md); [`llm_engine.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py), [`scheduler.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp) |
| **2 · Where should a request go?** | Request balancing depends on the stage. Prefill considers uncached work and the computed prefix; Decode considers both concurrent request count and total KV length. The complete request assignment components are not all public. | The abstract load models below; [official article](https://zhuanlan.zhihu.com/p/2095560295930508953) |
| **3 · Does a Block hit mean all state is ready?** | Long-lived paged Blocks and short-lived sliding-window attention (SWA) state have different lifetimes. A Block hit does not imply that the required SWA state is ready. | [s08 Prefix reuse](https://learn-deepinfer.github.io/en/s08/); [`cache_engine.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py), [`block_manager.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/block_manager.hpp) |
| **4 · How many drafts should each request verify?** | DSpark schedules variable verification lengths per request. Confidence informs selection; a total budget limits the round's work. Track these separately. | [s09 DSpark](https://learn-deepinfer.github.io/en/s09/); [`mtp_varlen.hpp`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/mtp_varlen.hpp), [`layers/sampler.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/layers/sampler.py) |
| **5 · Which round submits work, and which records its result?** | Schedule, forward, sample, and post-process can overlap across rounds. Follow dependencies and retained state; asynchronous operation does not make every stage universally cost-free. | [s10 Execution overlap](https://learn-deepinfer.github.io/en/s10/); [`worker.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py), [`llm_engine.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py) |
| **6 · How does an output constraint enter each step?** | Structured output (SO) compiles a grammar into an automaton separately from inference. Each step produces a legal-token mask from the current state, samples, and advances that state. | [s04 Sampling and state](https://learn-deepinfer.github.io/en/s04/); [`compiler.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/compiler.py), [`matcher.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/matcher.py), [`mask.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/mask.py) |
| **7 · How do request and expert balancing differ?** | Request LB assigns requests. EPLB adjusts expert placement and replicas. Keep request destinations separate from expert distribution. | [s12 EPLB](https://learn-deepinfer.github.io/en/s12/); [`eplb/policy.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py) |
| **8 · Which project owns API parsing?** | The article assigns API parsing to the separate `deepseek-recipe` project. Distinguish request output records, grammar constraints, and API parsing when reading DeepInfer. | [Source map: results and ownership](source-map.md#4-一轮工作如何跨模块跨轮次推进); [official article](https://zhuanlan.zhihu.com/p/2095560295930508953) |

## Two abstract models for different kinds of load

These are **conceptual reading models**, rather than complete scheduling policies or concrete cost functions from the open-source code.

A starting ledger for Prefill is a cost budget:

$$
\sum_{i\in\mathcal{A}}\operatorname{cost}(q_i,c_i)\le T.
$$

$\mathcal{A}$ is the selected request set, $q_i$ is the uncached token count assigned to request $i$ this round, $c_i$ is its computed prefix length, and $T$ is an abstract budget. Equal amounts of new token work need not have equal cost under different prefix conditions.

For Decode, start with a load vector:

$$
\mathbf{d}=\left(N,\sum_{i=1}^{N}L_i\right).
$$

$N$ is the concurrent request count, and $L_i$ is request $i$'s KV length. Request count alone misses differences in context length. This vector is not a complete assignment algorithm.

## Ask which kind of cached state is missing

The article's bounded replay approximately reconstructs missing short-lived SWA state using truncated context within a bounded replay segment. Existing long-lived Blocks are reused unchanged, without overwriting them. Track which Blocks hit, which SWA state is missing, which segment is replayed, and which step consumes the reconstructed state. Truncation within that replay segment does not imply recomputing the entire prefix.

After the article, return to the source with three questions: what metadata belongs to this round, which module owns the state, and when may its consumer read it? The article explains design motivations; pinned source establishes the concrete boundaries of the public implementation.
