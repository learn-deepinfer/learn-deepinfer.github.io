# DeepInfer 固定版本源码地图

[第一章：请求生命周期](chapter-01.md) · [架构导读](architecture.zh-CN.md) · [English architecture guide](architecture.md)

这份地图按要回答的问题组织源码入口。所有上游链接固定在 [`deepseek-ai/DeepInfer@8b16149741a4935e1dec8cea27853f273b374c5b`](https://github.com/deepseek-ai/DeepInfer/tree/8b16149741a4935e1dec8cea27853f273b374c5b)，方便把文档中的状态变化与同一版本的实现逐项对照。

第一遍只沿主链阅读：`LLM.generate → LLMEngine.add_request` 建立请求；随后 `LLM._run_engine → LLMEngine.step → Scheduler → Worker.execute_model_step → 后处理 → RequestOutput` 推进各轮并收集结果。先分清外层循环、一轮编排与调度选择，再找清各模块的输入、持有状态、返回值和释放时机。

## 1. 请求如何进入，又如何返回

| 要回答的问题 | 固定源码入口 | 要追踪的状态 |
| --- | --- | --- |
| 输入如何组织成多条请求？ | [`LLM.generate`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L90) | 输入集合、默认采样参数、请求加入顺序 |
| 请求身份在哪里建立？ | [`LLM._add_request`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L144) | request ID、复制后的参数、规范化的输入 IDs |
| 入队前建立了哪些内部记录？ | [`LLMEngine.add_request`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L472) | 请求记录、序列初始状态、附加输入与等待条件 |
| 请求参数有哪些语义？ | [`SamplingParams`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/sampling_params.py#L13) | 停止条件、长度限制、采样与结构化输出选项 |
| 循环何时继续，何时收尾？ | [`LLM._run_engine`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/entrypoints/llm.py#L168)、[`has_unfinished_requests`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L665) | 未完成请求、已经就绪的输出、请求顺序与在途结果 |

`_run_engine` 很适合作为阅读起点和终点：先看它期待 `step` 返回什么，再进入引擎，最后回来确认结果如何被保存和排序。没有未完成请求时，它仍会调用 `flush_inflight_reqs`，收集延迟后处理的结果。

## 2. 调度器如何维护请求状态

| 要回答的问题 | 固定源码入口 | 要追踪的状态 |
| --- | --- | --- |
| 等待、运行和各种结束原因如何表示？ | [`SequenceStatus`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/sequence.hpp#L30) | 状态枚举、结束判断与异常分支 |
| 一条请求跨轮保留什么？ | [`Sequence`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/sequence.hpp#L275)、[`SequenceMetadata`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/sequence.hpp#L325) | 长期序列记录与本轮执行元数据的区别 |
| 本轮计划包含哪些内容？ | [`SchedulerOutputs`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L45) | 已调度序列、结束序列、阶段标记和缓存状态操作 |
| 本轮选择哪类工作？ | [`Scheduler::_schedule`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L275) | 等待与运行队列、阶段选择、参与者之间的协调 |
| 等待请求如何进入 prefill？ | [`_schedule_prefill`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L351) | 准入条件、分块边界、本轮预算、无法分配时的处理 |
| 已运行请求如何继续 decode？ | [`_schedule_decode`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/scheduler.hpp#L559) | 可继续的序列、追加位置、资源限制与退出条件 |

阅读时给两条请求各留一行账本，记录“请求状态、本轮位置数、已有块、待完成操作”。沿一个分支走完，再解释为什么某条请求进入本轮、继续等待或结束。不要把一次 `step` 等同于每条请求恰好增加一个 token。

## 3. 状态如何分配、共享与回收

| 要回答的问题 | 固定源码入口 | 要追踪的状态 |
| --- | --- | --- |
| 块记录包含什么？谁持有管理责任？ | [`Blocks`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/block_manager.hpp#L27)、[`BlockManager`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/block_manager.hpp#L119) | 块标识、空闲资源、序列与块之间的关系 |
| 序列何时能获得所需资源？ | [`BlockManagerMutexAcquire::try_allocate_seq`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/block_manager.hpp#L217) | 分配条件、失败路径、受保护的管理操作 |
| 缓存记录与状态块如何表示？ | [`KVCache`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L206)、[`StateBlock`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L221) | 保存的状态、块组织与跨轮存活范围 |
| 分配记录如何落实为缓存操作？ | [`KVCacheManager`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L309)、[`CacheEngine`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L851) | 缓存存储、状态克隆、清理以及完成后的释放 |

把逻辑 token 位置、逻辑块和物理存储分别记账。前缀相同只是共享状态的条件之一；还需要兼容的计算与位置状态，以及不会破坏其他请求的后续写入。引擎内部的这些机制，也应与额外服务组件提供的缓存能力分开理解。

## 4. 一轮工作如何跨模块、跨轮次推进

| 要回答的问题 | 固定源码入口 | 要追踪的状态 |
| --- | --- | --- |
| 调度结果如何进入执行链？ | [`LLMEngine.step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L860)、[`_execute_model_async_step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L961) | 本轮元数据、状态操作、worker 调用与延迟释放记录 |
| 当前轮与前一轮怎样衔接？ | [`Worker.execute_model_step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L89) | 当前前向、前一轮后处理、当前采样与延迟后处理 |
| 滞后一轮的序列元数据如何修正？ | [`Worker._correct_seqlens_qk`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L191) | 序列长度、上一轮接受结果与当前输入之间的关系 |
| 执行输入与采样输入怎样分工？ | [`ModelRunner.execute_main_model`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py#L308)、[`execute_sample`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/model_runner.py#L337) | 各阶段需要的元数据、阶段返回值及其消费者 |
| 后处理如何写回请求结果？ | [`SamplerOutput`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/sequence.py#L172)、[`LLMEngine._process_model_outputs`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L687) | 接受的输出位置、结束标记与待返回结果 |
| 已返回对象能保存多久？ | [`RequestOutput` 绑定与 `clone`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/pybind_output.cpp#L16)、[`RequestOutputPool`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/pybind_output.cpp#L37) | 池中对象、独立副本以及引用与所有权的区别 |
| 最后一轮之后如何收集在途结果？ | [`LLMEngine.flush_inflight_reqs`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L977) | 延迟后处理、待返回输出与收尾释放 |

`Worker.execute_model_step` 的注释给出了很好的阅读顺序。给每份元数据标上所属轮次，观察当前轮提交工作后，为什么可以处理前一轮结果。再回到 `LLMEngine.step` 的返回值说明和 `_run_engine` 的 `clone`，确认调用方如何安全保留输出。

## 5. 沿附加状态扩展阅读

主链清楚以后，再进入这些机制。它们都要维持请求身份、序列位置和状态所有权之间的一致关系。

| 要回答的问题 | 固定源码入口 | 要追踪的状态 |
| --- | --- | --- |
| 结构化输出约束何时准备并进入请求？ | [`SOMatcherBuilder`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/structure_output/so_matcher_builder.py#L19)、[`LLMEngine.step`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/engine/llm_engine.py#L860) | matcher 的就绪状态、请求关联与失败处理 |
| Draft 输入如何衔接接受位置？ | [`DFlashMetadataMixin.build_dflash_input`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/input_metadata/dflash.py#L36) | 请求起始行、已接受偏移、位置与写入槽位 |
| 本轮输入和采样元数据怎样拆分？ | [`input_metadata.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/input_metadata/input_metadata.py)、[`sampling_inputs.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/sampling_inputs.py) | 布局、选中位置与各阶段读取的字段 |
| 路由结果怎样对应到专家处理结果？ | [`v4_modules/moe.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/moe.py)、[`v4_modules/mlp.py`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/models/v4_modules/mlp.py) | 逻辑专家 ID、token 对应关系、dispatch 与 combine |
| 负载均衡改变了哪一层映射？ | [`rebalance_experts_global`](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py#L73) | 专家放置、物理副本与逻辑专家映射 |

读 DFlash 元数据时，留意浅复制后的对象仍共享未覆盖的张量，不能据此把副本中的每个字段都当成独立可写状态。读专家负载均衡时，则把物理放置调整与 token 的逻辑专家选择分开。

完成一遍阅读后，试着只用五个动词复述一条请求：**入队、准入、提交、收集、释放**。每个动词都应能找到状态变化和对应源码；暂时找不到的地方，就是下一遍需要补齐的依赖。

## 官方文章与开源边界

DeepSeek 官方[《DeepSeek V4.1 Flash 大规模推理部署实践》](https://zhuanlan.zhihu.com/p/2095560295930508953)提供阶段分离、缓存状态、请求负载、DSpark、异步重叠和结构化输出的设计背景。可先读[中文问题导读](official-design.zh-CN.md)或 [English reading guide](official-design.md)，再回来核对本表中的固定版本源码。

文章明确说明，KVCache 管理和负载均衡组件与内部基础设施耦合，尚未完整开源。上表中的引擎内缓存与调度入口不代表完整服务组件；请求负载均衡也不同于 `eplb/policy.py` 中的专家放置与副本策略。文章提到的 API 解析属于另一个独立项目 `deepseek-recipe`，不能据此归为 DeepInfer 内置模块。
