export type Locale = 'zh' | 'en';
export type Localized = { zh: string; en: string };
export type LayerId = 'core' | 'memory' | 'scheduling' | 'distributed';

export type Lesson = {
  id: string;
  title: string;
  name: Localized;
  summary: Localized;
  insight: Localized;
  minutes: number;
  layer: LayerId;
  filename: string;
  code: string;
  sections: { heading: Localized; body: Localized }[];
  exercise: Localized;
  sourcePath: string;
  demo: 'loop' | 'cache' | 'static-batch' | 'batch' | 'speculation' | 'experts';
};

// Reading aids: excerpts describe framework responsibilities and state dependencies.
export const layers: { id: LayerId; name: Localized; description: Localized; color: string }[] = [
  {
    "id": "core",
    "name": {
      "zh": "推理核心",
      "en": "Inference core"
    },
    "description": {
      "zh": "从请求入口到采样与状态更新，串起框架的主链路。",
      "en": "Connect request entry, sampling, and state updates through the framework."
    },
    "color": "#3b82f6"
  },
  {
    "id": "memory",
    "name": {
      "zh": "状态与内存",
      "en": "State & memory"
    },
    "description": {
      "zh": "理解缓存的所有权、分页映射与前缀复用。",
      "en": "Understand cache ownership, block mappings, and prefix reuse."
    },
    "color": "#10b981"
  },
  {
    "id": "scheduling",
    "name": {
      "zh": "批处理与调度",
      "en": "Batching & scheduling"
    },
    "description": {
      "zh": "在请求、token 预算和执行依赖之间安排每一轮工作。",
      "en": "Plan each round under request, token-budget, and execution dependencies."
    },
    "color": "#f59e0b"
  },
  {
    "id": "distributed",
    "name": {
      "zh": "分布式与专家",
      "en": "Distribution & experts"
    },
    "description": {
      "zh": "追踪专家路由、物理副本与分布式协作。",
      "en": "Trace expert routes, physical replicas, and distributed coordination."
    },
    "color": "#8b5cf6"
  }
];

export const lessons: Lesson[] = [
  {
    "id": "s01",
    "title": "Follow a Request",
    "name": {
      "zh": "沿着一条请求读懂引擎",
      "en": "Follow a request through the engine"
    },
    "summary": {
      "zh": "从 LLM.generate 进入，追踪调度、执行、采样与状态更新。",
      "en": "Start at LLM.generate and trace scheduling, execution, sampling, and state updates."
    },
    "insight": {
      "zh": "引擎的一轮是一次协作边界，不等于单条请求恰好推进一个 token。",
      "en": "An engine round is a coordination boundary, not exactly one token for one request."
    },
    "minutes": 15,
    "layer": "core",
    "filename": "s01_request_flow.py",
    "code": "# Framework pseudocode, not an executable implementation.\nfor request in inputs:\n    llm_engine.add_request(request)\n\nwhile llm_engine.has_unfinished_requests():\n    ready_outputs = llm_engine.step()\n    collect(ready_outputs)\n\ncollect(llm_engine.flush_inflight_reqs())\n\n# Inside a scheduled round:\n# Scheduler -> Worker -> ModelRunner -> sampling\n# -> ready state updates and request outputs\n# A round may cover several requests and token positions.",
    "sections": [
      {
        "heading": {
          "zh": "入口负责接入，请求由引擎推进",
          "en": "Entry and execution have different responsibilities"
        },
        "body": {
          "zh": "LLM.generate 接收输入，将各条请求加入引擎，再由 LLM._run_engine 持续推进。入口关心请求如何创建、结果如何汇集；LLMEngine 负责把当前请求状态转换为下一轮工作。先区分这两层，可以避免把用户的一次 generate 调用误认为一次模型前向。",
          "en": "LLM.generate receives inputs, adds requests to the engine, and delegates progress to LLM._run_engine. The entry layer creates requests and collects results; LLMEngine turns current request state into the next round of work. Separating them prevents confusing one user-facing generate call with one model forward."
        }
      },
      {
        "heading": {
          "zh": "一次 step 穿过哪些边界",
          "en": "Which boundaries one step crosses"
        },
        "body": {
          "zh": "LLMEngine.step 先调用 C++ Scheduler 选择本轮序列和 token 预算，再交给 Worker 与 ModelRunner 组织执行。采样决定候选的选择或接受结果，后处理再更新请求状态。一次 step 可以涉及多条请求、prefill 分块或多个 draft 位置，不能画成每轮固定一个 token 的循环。",
          "en": "LLMEngine.step asks the C++ Scheduler to select sequences and a token budget, then delegates execution to Worker and ModelRunner. Sampling chooses or accepts candidates; post-processing updates request state. A step can involve multiple requests, prefill chunks, or several draft positions, so it is not a fixed one-token loop."
        }
      },
      {
        "heading": {
          "zh": "输出就绪与引擎轮次不完全重合",
          "en": "Output readiness can cross round boundaries"
        },
        "body": {
          "zh": "开启 ZOS 时，当前前向、上一轮后处理与当前采样有明确顺序，部分状态更新延迟到下一轮。_run_engine 因此还要处理在途输出，并在结束时 flush。教学伪代码只标出这些职责；具体参数、分支和生命周期应在固定版本的上游源码中核对。",
          "en": "With ZOS, current forward, previous-step post-processing, and current sampling follow a defined order, and some updates are deferred to the next round. _run_engine must also drain in-flight outputs and flush at the end. This pseudocode marks responsibilities; inspect pinned upstream source for concrete arguments, branches, and lifetimes."
        }
      }
    ],
    "exercise": {
      "zh": "沿源码写出入口、调度、执行、采样和状态更新各由哪个模块负责。再说明为什么一轮 step 返回的输出不一定全部属于本轮采样。",
      "en": "Map entry, scheduling, execution, sampling, and state updates to their modules. Explain why outputs returned by a step need not all come from its current sampling."
    },
    "sourcePath": "deepinfer/entrypoints/llm.py",
    "demo": "loop"
  },
  {
    "id": "s02",
    "title": "Inside an Execution Step",
    "name": {
      "zh": "拆开一次执行轮次",
      "en": "Inspect an execution step"
    },
    "summary": {
      "zh": "理解 Worker 与 ModelRunner 如何传递输入元数据、缓存引用和采样结果。",
      "en": "Understand how Worker and ModelRunner pass input metadata, cache references, and sampling results."
    },
    "insight": {
      "zh": "框架边界围绕输入、状态与依赖划分，不能只看函数调用顺序。",
      "en": "Framework boundaries follow inputs, state, and dependencies, not just call order."
    },
    "minutes": 22,
    "layer": "core",
    "filename": "s02_execution_step.py",
    "code": "# Framework pseudocode summarizing Worker responsibilities.\nmetadata = prepare_inputs(scheduled_sequences, cache_state)\nmain_output = model_runner.execute_main_model(metadata)\n\npost_process(previous_step_state)\nsampled = model_runner.execute_sample(main_output, metadata)\ncurrent = StepState(metadata, sampled)\n\nif is_prompt_step or not zos_enabled:\n    ready_outputs = post_process(current)\n    previous_step_state = None\nelse:\n    previous_step_state = current\n\n# Concrete metadata and method signatures live upstream.",
    "sections": [
      {
        "heading": {
          "zh": "先读输入元数据，再进入模型",
          "en": "Read input metadata before entering the model"
        },
        "body": {
          "zh": "调度器给出哪些序列参与、每条序列本轮处理多少位置，以及缓存块如何定位。ModelRunner 将这些信息整理为执行输入。读 execute_main_model 时先追踪序列长度、位置与缓存引用，再看前向入口；框架的关键在于让同一轮中的不同请求保持各自语义。",
          "en": "The scheduler selects sequences, positions processed per sequence, and cache-block references. ModelRunner organizes them as execution inputs. Read sequence lengths, positions, and cache references before following execute_main_model into the forward entry. The framework must preserve each request’s semantics within shared work."
        }
      },
      {
        "heading": {
          "zh": "前向与采样是两个边界",
          "en": "Forward and sampling are separate boundaries"
        },
        "body": {
          "zh": "execute_main_model 返回模型输出及相关元数据；execute_sample 再准备 sampler 输入并调用模型的 sample 路径。把两者拆开，才能承载约束输出、draft 验证和状态后处理。教学代码不展开模型层内部计算，而是关注这些对象由谁创建、传给谁，以及何时能够消费。",
          "en": "execute_main_model returns model output and metadata; execute_sample prepares sampler inputs and calls the model’s sample path. Separating these boundaries accommodates constrained output, draft verification, and state post-processing. The excerpt focuses on who creates, passes, and consumes these objects rather than model-layer mathematics."
        }
      },
      {
        "heading": {
          "zh": "Worker 决定依赖顺序",
          "en": "Worker orders the dependencies"
        },
        "body": {
          "zh": "Worker.execute_model_step 的顺序是当前前向、上一轮后处理、当前采样。prefill 或关闭 ZOS 时当轮后处理；ZOS decode 则保留当前 StepState，供下一轮处理。因此示意图中的箭头是数据依赖，不意味着当前采样必然在当前调用结束前完成请求状态更新。",
          "en": "Worker.execute_model_step orders current forward, previous-step post-processing, and current sampling. Prefill and non-ZOS paths post-process immediately; ZOS decode retains the current StepState for the following round. Arrows express data dependencies, not a guarantee that current sampling updates request state before the call returns."
        }
      }
    ],
    "exercise": {
      "zh": "把 Worker 的四个阶段画成两轮时间线，分别标出 main_output、sampler_output 和 StepState 的产生与消费位置。",
      "en": "Draw two Worker rounds and mark where main_output, sampler_output, and StepState are created and consumed."
    },
    "sourcePath": "deepinfer/worker/model_runner.py",
    "demo": "loop"
  },
  {
    "id": "s03",
    "title": "Remember with KV",
    "name": {
      "zh": "用缓存连接请求的执行状态",
      "en": "Connect execution state with the cache"
    },
    "summary": {
      "zh": "从 CacheEngine 与请求生命周期理解历史状态如何保留、定位和释放。",
      "en": "Follow CacheEngine and request lifetimes to see how historical state is retained, located, and released."
    },
    "insight": {
      "zh": "请求状态、已处理位置与缓存所有权必须一起维护。",
      "en": "Request state, processed positions, and cache ownership must advance together."
    },
    "minutes": 18,
    "layer": "memory",
    "filename": "s03_kv_cache.py",
    "code": "# Framework pseudocode for request-owned cache state.\nstate = sequence_table[request_id]\nblocks = block_manager.resolve(state.block_table)\nmetadata = build_input_metadata(\n    query_tokens=planned_tokens,\n    cached_positions=state.computed_positions,\n    cache_blocks=blocks,\n)\nworker.execute_model_step(metadata, cache_engine.cache)\n\n# Execution consumes input positions and updates cache state.\n# A selected token becomes input only if the request continues.\n# Reclaim blocks only when their references are no longer needed.",
    "sections": [
      {
        "heading": {
          "zh": "缓存把历史计算变成请求状态",
          "en": "Caching makes past computation request state"
        },
        "body": {
          "zh": "后续位置需要读取已经处理过的上下文。框架不仅要保留模型所需的历史状态，还要记录它属于哪条请求、覆盖哪些位置。CacheEngine 管理具体存储，序列与块管理器维护定位和生命周期；不能只按已返回文本长度推断缓存长度。",
          "en": "Later positions read previously processed context. The framework retains model-specific historical state and tracks its owning request and covered positions. CacheEngine handles storage, while sequence and block management track addressing and lifetimes. Returned text length alone does not determine cached length."
        }
      },
      {
        "heading": {
          "zh": "输入位置与选择结果分开记账",
          "en": "Account for input positions and selected outputs separately"
        },
        "body": {
          "zh": "前向处理的是本轮输入，采样结果在之后才产生。新选出的 token 只有继续作为下一轮输入时，才会贡献对应缓存状态。draft 验证还会引入接受长度与回退位置。读框架时分别追踪计划位置、已计算位置、已接受输出和已发布结果，避免把它们合成一个计数器。",
          "en": "A forward processes current inputs; sampling results follow. A newly selected token contributes its cache state only when consumed by a subsequent forward. Draft verification adds accepted lengths and rollback positions. Track planned positions, computed positions, accepted outputs, and published results separately."
        }
      },
      {
        "heading": {
          "zh": "缓存格式由模型与运行时共同约定",
          "en": "Model and runtime define the cache layout"
        },
        "body": {
          "zh": "上游 CacheEngine 包含模型专用布局与状态管理，块管理器还要处理分配、共享和回收。不能把普通 K/V 数组的形状直接套在全部上游路径上。此处伪代码用于定位框架职责；具体格式、引用关系和有效位置应沿 cache_engine.py 与调用处核对。",
          "en": "Upstream CacheEngine includes model-specific layouts and state management, while block management handles allocation, sharing, and reclamation. Plain K/V-array shapes do not describe every upstream path. This pseudocode locates framework responsibilities; inspect cache_engine.py and its callers for formats, references, and valid positions."
        }
      }
    ],
    "exercise": {
      "zh": "某请求已处理一段输入、选出一个输出但尚未进入下一轮。分别标出已计算位置、已选输出和缓存覆盖范围，再加入一次 draft 拒绝。",
      "en": "A request has processed its input and selected an output before the next round begins. Mark computed positions, selected outputs, and cache coverage, then add a draft rejection."
    },
    "sourcePath": "deepinfer/worker/cache_engine.py",
    "demo": "cache"
  },
  {
    "id": "s04",
    "title": "Choose the Next Token",
    "name": {
      "zh": "从 logits 走到采样结果",
      "en": "Turn logits into a token choice"
    },
    "summary": {
      "zh": "追踪模型输出如何进入采样器，再成为可提交的请求状态。",
      "en": "Trace model output through sampling into request state that can be committed."
    },
    "insight": {
      "zh": "采样结果与请求状态更新属于不同阶段，必须通过元数据保持对应。",
      "en": "Sampling results and request-state updates are separate stages linked by metadata."
    },
    "minutes": 16,
    "layer": "core",
    "filename": "s04_sampling.py",
    "code": "# Framework pseudocode for the sampling boundary.\nsampler_inputs = prepare_sampler_inputs(\n    sequence_metadata, input_metadata,\n)\nsampler_output = model.sample(\n    model_output=main_output,\n    sampler_inputs=sampler_inputs,\n)\nstep_state = StepState(sequence_metadata, sampler_output)\n\n# Sampling can choose tokens or verify draft candidates.\n# Post-processing commits accepted positions and stop states.\nready_outputs = post_process_when_ready(step_state)\n# Under ZOS, readiness can cross a round boundary.",
    "sections": [
      {
        "heading": {
          "zh": "模型输出还不是请求输出",
          "en": "Model output is not yet request output"
        },
        "body": {
          "zh": "模型前向返回用于选择的分数与相关状态。采样器结合各请求参数、约束和 draft 信息形成选择或接受结果；请求层随后才知道哪些输出可以提交。读 ModelRunner.execute_sample 时先追踪 sampler_inputs 如何由序列元数据建立，再进入模型的 sample 路径。",
          "en": "A model forward returns scores and associated state. Sampling combines request parameters, constraints, and draft information into choices or acceptance results; the request layer then determines what can be committed. Trace sampler_inputs from sequence metadata in ModelRunner.execute_sample before entering the model’s sample path."
        }
      },
      {
        "heading": {
          "zh": "策略参数不能丢失请求身份",
          "en": "Selection policies must retain request identity"
        },
        "body": {
          "zh": "贪心、温度、top-p 与约束输出影响不同的选择环节。组批后，各请求仍要保留自己的参数和随机状态，draft 验证还要关联候选位置与接受长度。教学片段只描述框架接口，不把一个简单 argmax 或随机抽取函数当作上游完整采样器。",
          "en": "Greedy choice, temperature, top-p, and constrained output affect different selection stages. Batching must preserve each request’s parameters and random state; draft verification also links candidate positions to accepted lengths. This excerpt describes the framework boundary rather than treating argmax or a random draw as the full upstream sampler."
        }
      },
      {
        "heading": {
          "zh": "提交状态要等待所需依赖",
          "en": "Committing state waits for its dependencies"
        },
        "body": {
          "zh": "后处理把采样结果写回序列，更新接受位置、结束标记和对外输出。开启 ZOS 时，这部分工作可能在下一轮前向发出后进行。阅读时区分采样已产生、状态已落账和结果已发布三个时刻，才能解释为什么一轮返回的输出未必来自当前采样。",
          "en": "Post-processing commits sampling results to sequences, including accepted positions, stop flags, and public outputs. With ZOS, it may run after the next round’s forward is launched. Distinguish produced samples, committed state, and published outputs to explain why a round can return results from earlier sampling."
        }
      },
      {
        "heading": {
          "zh": "结构化输出还维护一份语法状态",
          "en": "Structured output carries grammar state"
        },
        "body": {
          "zh": "**官方生产设计**：[官方部署文章](https://zhuanlan.zhihu.com/p/2095560295930508953)将结构化输出放进生成链路：已确认的前缀决定当前语法状态，状态再决定下一步的合法 token 集合。采样必须遵守这份集合。它约束输出的语法与结构，字段内容是否符合事实仍由具体任务决定。 **开源核对**：固定版本的 [sampler.py](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/layers/sampler.py#L351)先把已接受的 token 推进请求自己的 matcher，再为各个 draft 位置临时推进状态、生成 mask，最后回滚临时推进。mask 在[采样与 draft 验证之前](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/layers/sampler.py#L433)应用，因此语法状态也必须遵守“只有确认的前缀才能长期保留”的规则。",
          "en": "**Official production design**: The [official deployment article](https://zhuanlan.zhihu.com/p/2095560295930508953) places structured output inside generation: the confirmed prefix determines the grammar state, which determines the legal next-token set. Sampling must respect that set. This constrains syntax and structure; factual correctness of field values still depends on the task. **Public-code check**: The pinned [sampler.py](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/layers/sampler.py#L351) advances each request’s matcher with accepted tokens, temporarily advances through draft positions to build masks, then rolls those temporary advances back. Masks apply [before sampling and draft verification](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/layers/sampler.py#L433). Grammar state follows the same rule as other request state: only the confirmed prefix persists."
        }
      }
    ],
    "exercise": {
      "zh": "选一个带结束条件的请求，画出 model_output、sampler_output、序列状态与 RequestOutput 四种对象之间的依赖。",
      "en": "For a request with a stop condition, draw dependencies between model_output, sampler_output, sequence state, and RequestOutput."
    },
    "sourcePath": "deepinfer/model_executor/layers/sampler.py",
    "demo": "loop"
  },
  {
    "id": "s05",
    "title": "Work in Batches",
    "name": {
      "zh": "把多条请求放到一次计算里",
      "en": "Put multiple requests into one computation"
    },
    "summary": {
      "zh": "用静态 batch 对照理解请求身份、输入布局与独立停止条件。",
      "en": "Use static batching to understand request identity, input layouts, and independent stopping conditions."
    },
    "insight": {
      "zh": "batch 共享一次计算，不能共享每条请求的进度与停止条件。",
      "en": "A batch shares computation, not each request’s progress or stopping condition."
    },
    "minutes": 18,
    "layer": "scheduling",
    "filename": "s05_static_batch.py",
    "code": "# Framework pseudocode for fixed batch membership.\nmembers = choose_initial_requests(waiting)\nwhile not all_finished(members):\n    metadata = prepare_batch_metadata(members)\n    outputs = execute_scheduled_round(metadata)\n    apply_ready_updates(outputs)\n    for request in members:\n        if request.finished:\n            preserve_finished_status(request)\n    # Do not admit waiting requests into this fixed group.\n\nrelease_group_references(members)\n# Static batching is a comparison model for the scheduler.\n# Upstream scheduling has additional phase and budget rules.",
    "sections": [
      {
        "heading": {
          "zh": "一次只算一条请求浪费了什么",
          "en": "What a one-request-at-a-time loop leaves unused"
        },
        "body": {
          "zh": "模型参数很大，而单个 decode token 的计算往往不足以充分利用设备。把多条请求拼到一次前向，可以共享权重读取和矩阵运算的组织成本。静态 batch 在开始时固定成员，直到这组请求全部结束再接受下一组；它容易理解，也让最长的请求成为整批结束时间的决定因素。",
          "en": "Model weights are large, while one decode token often provides too little work to use a device well. Combining requests in one forward pass can share weight reads and matrix-operation overhead. A static batch fixes its members at the start and accepts the next group only after all members finish. This is simple, but the longest request determines when the batch can end."
        }
      },
      {
        "heading": {
          "zh": "形状对齐后，语义仍要分开",
          "en": "Aligned shapes still need independent semantics"
        },
        "body": {
          "zh": "不同输入长度需要 padding 或变长布局，位置与可见范围由元数据表达。每条请求还有自己的缓存长度、输出上限和结束状态。完成的请求应停止累计输出，但不能让同批的其他请求提前结束；固定成员与独立生命周期是两回事。",
          "en": "Different input lengths require padding or variable-length layouts, with positions and visibility carried by metadata. Every request retains its own cache length, output limit, and stop state. Finished requests stop accumulating output without ending their peers; fixed membership and independent lifetimes are distinct."
        }
      },
      {
        "heading": {
          "zh": "上游的自动组批不等于这段静态循环",
          "en": "Upstream automatic batching goes beyond this loop"
        },
        "body": {
          "zh": "DeepInfer 的 LLM.generate 将输入逐条加入引擎，再由 Scheduler 根据 token、序列数量和缓存约束组批，而不是把任意长短输入直接 stack。静态 batch 是用于比较的概念模型；阅读重点是哪些元数据随请求保留，哪些执行集合在调度时建立。",
          "en": "DeepInfer’s LLM.generate adds inputs individually; Scheduler forms work under token, sequence-count, and cache constraints rather than stacking arbitrary input lengths. Static batching is a conceptual comparison. Focus on metadata retained by requests versus execution sets formed by scheduling."
        }
      }
    ],
    "exercise": {
      "zh": "画出三条输出长度为 2、5、8 的请求。标出静态 batch 每轮的有效行，以及等待整批结束才进来的第四条请求要等多久；只比较轮次，不虚构耗时。",
      "en": "Draw requests with output lengths of 2, 5, and 8. Mark active rows on each static-batch round and how many rounds a fourth request waits. Compare rounds rather than inventing timings."
    },
    "sourcePath": "deepinfer/entrypoints/llm.py",
    "demo": "static-batch"
  },
  {
    "id": "s06",
    "title": "Schedule Every Step",
    "name": {
      "zh": "让 batch 在每一步变化",
      "en": "Let the batch change at every step"
    },
    "summary": {
      "zh": "用 waiting、running 和 token 预算理解 continuous batching。",
      "en": "Understand continuous batching through waiting and running queues plus token budgets."
    },
    "insight": {
      "zh": "调度单位变成一步之后，请求可以独立离开，也可以在空位出现时加入。",
      "en": "Scheduling one step at a time lets requests finish independently and new work enter available slots."
    },
    "minutes": 22,
    "layer": "scheduling",
    "filename": "s06_continuous_batch.py",
    "code": "# Framework pseudocode; phase selection is simplified.\nfor round in engine_rounds:\n    reclaim_finished_requests()\n    budget = max_query_tokens\n    selected = []\n    for request in eligible_requests(waiting, running):\n        cost = planned_query_tokens(request)\n        if cost <= budget and cache_can_fit(request):\n            reserve_planned_state(request)\n            selected.append(request)\n            budget -= cost\n    ready_outputs = execute_scheduled_round(selected)\n    apply_ready_updates(ready_outputs)\n    # Some sampling/post-processing may still be in flight.\n# Inspect upstream NORMAL-mode prefill/decode coordination.",
    "sections": [
      {
        "heading": {
          "zh": "不再等待最慢的成员",
          "en": "Stop waiting for the slowest batch member"
        },
        "body": {
          "zh": "静态 batch 中，短请求结束后留下空位，却不能立刻补入新请求。continuous batching 在每一轮重新选择工作，完成的请求退出，等待的请求在资源允许时进入。请求仍保留自己的 KV 和进度，改变的是本轮执行集合；这使请求生命周期与一次前向的 batch 成员关系分离。",
          "en": "In a static batch, short requests leave unused slots when they finish, but new requests cannot immediately enter. Continuous batching selects work again each round: finished requests leave and waiting requests enter when resources permit. Requests retain their own KV and progress; what changes is the current execution set. A request’s lifetime is therefore separate from membership in one forward-pass batch."
        }
      },
      {
        "heading": {
          "zh": "预算不能只数请求个数",
          "en": "A budget must count more than requests"
        },
        "body": {
          "zh": "一条长 prompt 的 prefill 和一条单 token decode 对计算与内存的需求不同。调度器既要限制序列数量，也要计算本步 query token 总量，并确认缓存能分配。chunked prefill 把长输入切成多步处理，避免一次占满全部预算。公平性、首次响应和吞吐之间需要明确策略，不能只靠队列顺序碰运气。",
          "en": "A long prompt prefill and a one-token decode have different compute and memory needs. A scheduler limits both sequence count and total query tokens for the step, while checking cache availability. Chunked prefill spreads a long input over several steps instead of consuming the entire budget at once. Fairness, first-response latency, and throughput need explicit policies rather than accidental queue ordering."
        }
      },
      {
        "heading": {
          "zh": "读清 DeepInfer 的步型约束",
          "en": "Read DeepInfer’s step-type constraints carefully"
        },
        "body": {
          "zh": "上游 C++ Scheduler 在 NORMAL 模式下决定本轮做 prefill 还是 decode，并让 DP 组通过投票保持步型一致。它并不等同于任意混合两种 token 的通用片段。ALL 与 ANY 尝试点兼顾无效陪跑和等待上限；理解这些分支前，先追踪 waiting、running、缓存分配和完成回收的变化。",
          "en": "In NORMAL mode, the upstream C++ Scheduler decides whether a step is prefill or decode and uses voting to keep the DP group on the same step type. This is more specific than a generic loop that freely mixes both kinds of tokens. ALL and ANY attempt points balance idle participation against waiting bounds. Start by tracing waiting, running, cache allocation, and completion cleanup before following those branches."
        }
      }
    ],
    "exercise": {
      "zh": "让长 prompt、短 prompt 和正在 decode 的请求同时到达。在固定 token 预算下安排五轮执行，写明每轮不能加入某条请求的具体原因。",
      "en": "Combine a long prompt, a short prompt, and an already-decoding request. Plan five rounds under a fixed token budget and state exactly why an excluded request cannot enter each round."
    },
    "sourcePath": "csrc/engine/scheduler.hpp",
    "demo": "batch"
  },
  {
    "id": "s07",
    "title": "Page the KV Cache",
    "name": {
      "zh": "把连续上下文映射到分页内存",
      "en": "Map a continuous context onto paged memory"
    },
    "summary": {
      "zh": "用 block table 把逻辑 token 位置与物理缓存块解耦。",
      "en": "Use a block table to separate logical token positions from physical cache blocks."
    },
    "insight": {
      "zh": "序列在逻辑上连续，存储它的物理块不必连续。",
      "en": "A sequence can be logically continuous without occupying contiguous physical blocks."
    },
    "minutes": 20,
    "layer": "memory",
    "filename": "s07_paged_kv.py",
    "code": "# Framework pseudocode for block-table responsibilities.\ndef resolve_position(request, token_position):\n    logical = token_position // block_size\n    offset = token_position % block_size\n    return request.block_table[logical], offset\n\nrequired = ceil_div(computed_positions + planned_tokens, block_size)\nnew_blocks = pool.reserve(max(0, required - len(request.block_table)))\nrequest.block_table.extend(new_blocks)\n# Reservation does not mean these positions were computed.\n\nfor block in finished_request.block_table:\n    pool.release_reference(block)\n# Reclaim storage only after the final reference is released.",
    "sections": [
      {
        "heading": {
          "zh": "连续分配为什么难以管理",
          "en": "Why contiguous allocation is hard to manage"
        },
        "body": {
          "zh": "请求的最终输出长度通常未知。预留一大段连续 KV 会浪费空间，增长时重新分配又需要复制。分页把 cache 分成固定大小的块，每条请求只保存逻辑块到物理块的映射。序列增长时补一个块即可，完成后回收各块；尾块仍可能有内部浪费，因此块大小也存在取舍。",
          "en": "A request’s final output length is usually unknown. Reserving a large contiguous KV region wastes memory, while reallocating as it grows causes copies. Paging divides the cache into fixed-size blocks and stores a logical-to-physical mapping per request. Growth adds a block, and completion releases the blocks. A partially filled final block still wastes space, making block size a tradeoff."
        }
      },
      {
        "heading": {
          "zh": "地址翻译必须贯穿读写两端",
          "en": "Address translation applies to both reads and writes"
        },
        "body": {
          "zh": "token 位置除以 block size 得到逻辑块号，余数给出块内偏移，再查 block table 得到物理地址。写入新 K/V 和读取历史 K/V 都必须遵守同一个映射。分配失败时不能先增加长度，也不能重复释放共享块。真正的分页注意力还要让算子直接理解块表，而非每步重新拼出连续张量。",
          "en": "Divide a token position by block size to obtain its logical block and remainder, then consult the block table for the physical block. New K/V writes and historical K/V reads must use the same mapping. Failed allocation must not advance length, and shared blocks cannot be released twice. Real paged attention also requires kernels that consume block tables directly instead of rebuilding contiguous tensors each step."
        }
      },
      {
        "heading": {
          "zh": "区分块管理和模型缓存布局",
          "en": "Separate block management from model cache layouts"
        },
        "body": {
          "zh": "DeepInfer 的 block_manager.hpp 负责空闲块、引用计数和分配约束；设备侧 CacheEngine 决定具体张量布局。V4 的缓存还涉及模型专用格式和状态，不能用普通 GQA 的 K/V 数组推断其字节数。本课片段仅解释地址翻译，没有实现上游分页算子、并发锁或完整缓存生命周期。",
          "en": "DeepInfer’s block_manager.hpp manages free blocks, reference counts, and allocation constraints; device-side CacheEngine determines tensor layouts. V4 caches also involve model-specific formats and state, so a plain GQA K/V array cannot determine their byte sizes. This excerpt explains address translation only, without implementing upstream paged kernels, concurrency locks, or the full cache lifecycle."
        }
      }
    ],
    "exercise": {
      "zh": "设 block size 为 4，某请求 block table 为 [7,2,9]。计算第 0、5、10 个 token 的物理地址，再说明第 12 个 token 到来时需要做什么。",
      "en": "With block size 4 and block table [7,2,9], calculate the addresses of tokens 0, 5, and 10. Explain what must happen before writing token 12."
    },
    "sourcePath": "csrc/engine/block_manager.hpp",
    "demo": "cache"
  },
  {
    "id": "s08",
    "title": "Reuse a Prefix",
    "name": {
      "zh": "让相同前缀只计算一次",
      "en": "Compute a shared prefix once"
    },
    "summary": {
      "zh": "从请求分叉理解前缀复用、引用计数与写时复制。",
      "en": "Use request forks to understand prefix reuse, reference counts, and copy-on-write."
    },
    "insight": {
      "zh": "可复用的是相同计算状态，不只是看起来相同的一段文字。",
      "en": "Reuse requires identical computation state, not merely similar-looking text."
    },
    "minutes": 20,
    "layer": "memory",
    "filename": "s08_prefix_reuse.py",
    "code": "# Framework pseudocode for explicit prefix-state sharing.\n# The prefix state is already available; no automatic lookup is assumed.\nchild = create_child_request(suffix_request)\nchild.block_table = prefix_state.block_table.copy()\nfor block in child.block_table:\n    pool.retain_reference(block)\n\nshared_tail = child.block_table[-1]\nif append_would_modify_shared_state(shared_tail):\n    private_tail = pool.copy_for_write(shared_tail)\n    child.block_table[-1] = private_tail\n    pool.release_reference(shared_tail)\n\n# Inspect scheduler.fork_seq usage in examples/benchmark.py.\n# Sharing also requires matching computation conditions.",
    "sections": [
      {
        "heading": {
          "zh": "相同开头带来重复 prefill",
          "en": "Shared beginnings cause repeated prefill"
        },
        "body": {
          "zh": "多条请求可能带着相同系统消息、长文档或少样本示例。只要输入 token、位置与模型计算条件一致，这段前缀产生的 KV 就可以共享。复用后每条请求从自己的后缀继续，不必重复计算开头。文本相似或渲染相同还不够，聊天模板与特殊 token 的差别也会改变实际前缀。",
          "en": "Requests may share a system message, long document, or few-shot examples. If tokens, positions, and model computation conditions match, the prefix’s KV can be shared. Each request continues from its own suffix instead of recomputing the beginning. Similar-looking or identically rendered text is not sufficient: chat formatting and special tokens can change the actual prefix."
        }
      },
      {
        "heading": {
          "zh": "共享状态需要所有权规则",
          "en": "Shared state needs ownership rules"
        },
        "body": {
          "zh": "共享只读块时增加引用计数，请求结束时减少，最后一个引用消失后才能回收。如果分叉发生在未写满的尾块，后续写入不能覆盖另一条请求正在使用的内容，需要复制或其他隔离策略。查找键还应区分模型版本、位置与缓存格式；把这些条件遗漏，命中率再高也可能算错。",
          "en": "Sharing read-only blocks increments references; finishing a request decrements them, and reclamation waits for the final reference. If a fork shares a partially filled final block, later writes must not overwrite another request’s state, requiring copying or equivalent isolation. Lookup keys should also distinguish model revision, positions, and cache format. Omitting those conditions can turn a high hit rate into incorrect computation."
        }
      },
      {
        "heading": {
          "zh": "上游示例证明了什么",
          "en": "What the upstream example actually demonstrates"
        },
        "body": {
          "zh": "上游前缀复用示例先计算共同的 cached prefix，再通过 scheduler.fork_seq 构建后续请求，展示了显式分叉与状态复用。它不能单独证明发布版包含任意请求自动检索的完整 KV 服务。阅读时将分叉机制、前缀索引、跨机器传输与服务级淘汰分开；本课仅讲共享与生命周期这条主线。",
          "en": "The upstream prefix-reuse example computes a common cached prefix and uses scheduler.fork_seq to create later requests, demonstrating explicit forks and state reuse. This alone does not establish a complete KV service with automatic lookup for arbitrary requests. Separate the fork mechanism from prefix indexing, cross-machine transfer, and service-level eviction. This lesson follows sharing and lifetime management only."
        }
      },
      {
        "heading": {
          "zh": "前缀块命中后，还要确认 SWA 状态",
          "en": "A prefix hit still needs ready SWA state"
        },
        "body": {
          "zh": "**官方生产设计**：[官方部署文章](https://zhuanlan.zhihu.com/p/2095560295930508953)区分前缀 KV 块命中与滑动窗口注意力（SWA）状态就绪。部分 SWA 状态没有随前缀保存时，可以回放有限长度的后缀，近似恢复继续执行所需的窗口状态。读这类方案时要同时追踪命中位置、状态有效范围和回放边界，不能仅凭块命中就直接开始 decode。 **开源核对**：[StateBlock](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L221)明确区分保存与丢弃的状态，并注明 consumer SWA 依赖 prefill 重算；[截断元数据入口](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/input_metadata/prepare_tensor_input_v4.cpp#L348)要求保留后缀覆盖 SWA 窗口与回退余量。公开版本包含这些恢复机制，但 [README](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L38)仍将完整 KV cache 服务列为未提供的基础设施，不能据此推断完整的生产前缀检索与恢复服务已经开源。",
          "en": "**Official production design**: The [official deployment article](https://zhuanlan.zhihu.com/p/2095560295930508953) distinguishes a prefix KV-block hit from ready sliding-window attention (SWA) state. When some SWA state was not retained with the prefix, a bounded suffix can be replayed to approximately recover the window state needed to continue. Track the hit position, valid state range, and replay boundary together before starting decode. **Public-code check**: [StateBlock](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/cache_engine.py#L221) separates stored and dropped state and states that consumer SWA recovery depends on prefill recomputation. The [truncation metadata entry](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/input_metadata/prepare_tensor_input_v4.cpp#L348) requires the retained suffix to cover the SWA window plus backtracking allowance. These recovery mechanisms are public, while the [README](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L38) still lists a complete KV cache service as missing infrastructure. They do not establish that the full production prefix-lookup and recovery service is released."
        }
      }
    ],
    "exercise": {
      "zh": "两个请求共享一个完整块和一个半满块，再分别追加不同 token。画出引用计数与写时复制过程，并指出哪一步可以安全释放旧块。",
      "en": "Two requests share one full block and one half-full block, then append different tokens. Draw reference counts and copy-on-write, marking when the old block can safely be released."
    },
    "sourcePath": "examples/benchmark.py",
    "demo": "cache"
  },
  {
    "id": "s09",
    "title": "Draft, Then Verify",
    "name": {
      "zh": "从推测解码走向 DSpark",
      "en": "From speculative decoding to DSpark"
    },
    "summary": {
      "zh": "把草稿、目标模型验证和置信度预算分开，理解一次推进多个 token。",
      "en": "Separate drafting, target verification, and confidence budgets to advance several tokens at once."
    },
    "insight": {
      "zh": "草稿的价值取决于接受的 token 数与验证成本，而不是草稿长度本身。",
      "en": "A draft’s value depends on accepted tokens and verification cost, not draft length alone."
    },
    "minutes": 25,
    "layer": "scheduling",
    "filename": "s09_speculative_decode.py",
    "code": "# Framework pseudocode for draft-verification planning.\nquery_budget = confidence_policy.choose_budget(request_states)\nplan = scheduler.plan_verification(request_states, query_budget)\nmain_output = model_runner.execute_main_model(plan)\nsampler_output = model_runner.execute_sample(main_output, plan)\n\nstep_state = StepState(plan, sampler_output)\n# Accepted lengths control committed token positions.\n# Rejected positions must not remain visible as accepted state.\nready_outputs = post_process_when_ready(step_state)\npublish(ready_outputs)\n\n# Variable draft lengths can share one scheduling round.\n# Inspect mtp_varlen.hpp for upstream allocation rules.",
    "sections": [
      {
        "heading": {
          "zh": "让廉价的草稿先往前走",
          "en": "Let a cheaper draft move ahead"
        },
        "body": {
          "zh": "逐 token 调用大模型有固定开销。推测解码先让草稿机制提出多个候选，再让目标模型验证，希望一次昂贵前向接纳多个 token。贪心场景可直观比较候选与目标 argmax，随机采样则需要正确的接受与修正规则，不能把简单匹配当成通用算法。草稿不被接受时，仍要保证最终选择服从目标规则。",
          "en": "Calling a large model for every token incurs fixed overhead. Speculative decoding proposes several candidates with a draft mechanism, then verifies them with the target model, hoping one expensive pass accepts multiple tokens. Greedy decoding can compare candidates with target argmax choices; stochastic sampling needs proper acceptance and correction rules. Simple matching is not a general algorithm, and rejected drafts must still lead to a target-correct choice."
        }
      },
      {
        "heading": {
          "zh": "拒绝之后，缓存也要回到正确位置",
          "en": "After rejection, restore the right cache position"
        },
        "body": {
          "zh": "验证会处理尚未确定能留下的候选。拒绝发生后，未接受位置不能成为后续可见的上下文，草稿状态也需要同步修正。EOS、长度上限和接受长度共同决定可提交结果。框架需要把计划 query 数、实际接受数与状态回退分开维护，不能只按草稿长度前移请求位置。",
          "en": "Verification processes candidates before knowing which will remain. Rejected positions must not become visible context, and draft state must also be reconciled. EOS, length limits, and accepted lengths determine committed results. The framework tracks planned queries, accepted counts, and state rollback separately rather than advancing positions by draft length."
        }
      },
      {
        "heading": {
          "zh": "DeepInfer 还会按置信度分配验证预算",
          "en": "DeepInfer also allocates verification by confidence"
        },
        "body": {
          "zh": "上游将 DSpark 与 confidence-scheduled verification 配合使用。mtp_varlen.hpp 根据候选接受率估计与执行成本模型选择总 query 预算，再分配到各请求，而不是给每条请求固定相同草稿长度。这里的教学伪代码标出预算、验证、采样和落账的边界，具体选择策略应回到上游核对。",
          "en": "Upstream combines DSpark with confidence-scheduled verification. mtp_varlen.hpp chooses a total query budget using candidate-acceptance estimates and execution-cost models, then distributes it across requests rather than fixing one draft length for everyone. This pseudocode marks budgeting, verification, sampling, and commit boundaries; inspect upstream for the concrete policy."
        }
      },
      {
        "heading": {
          "zh": "置信度决定验证机会，验证决定接受结果",
          "en": "Confidence schedules verification; verification decides acceptance"
        },
        "body": {
          "zh": "**官方生产设计**：[官方部署文章](https://zhuanlan.zhihu.com/p/2095560295930508953)中的 DSpark 将候选置信度用于变长验证：同一轮预算内，不同请求可以得到不同数量的验证位置。置信度是候选被接受的估计；它可以影响哪些候选值得验证，却不能直接把未验证的草稿变成正式输出。最终提交仍取决于目标模型的验证与采样规则。 **开源核对**：[MTPVarlen.schedule](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/mtp_varlen.hpp#L160)为总预算选择和逐请求长度分配维护不同的接受率队列与历史快照，并明确要求后面候选的置信度不能反向决定前面候选是否被验证。预算确定后，[剩余验证位置按接受率排序分配](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/mtp_varlen.hpp#L251)。阅读时把置信度估计、query 长度、实际接受长度分开，才能理解变长验证与状态回退如何配合。",
          "en": "**Official production design**: DSpark in the [official deployment article](https://zhuanlan.zhihu.com/p/2095560295930508953) uses candidate confidence for variable-length verification: requests can receive different numbers of verification positions within one round’s budget. Confidence estimates acceptance. It can prioritize candidates for verification, but cannot turn an unverified draft into committed output. Target-model verification and sampling rules still determine what is accepted. **Public-code check**: [MTPVarlen.schedule](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/mtp_varlen.hpp#L160) maintains separate acceptance-rate queues and historical snapshots for total-budget selection and per-request lengths. It explicitly requires later candidates’ confidence not to determine whether an earlier candidate is verified. Once the budget is selected, [remaining verification positions are allocated by acceptance-rate order](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/csrc/engine/mtp_varlen.hpp#L251). Keep confidence estimates, query lengths, and accepted lengths separate when tracing verification and rollback."
        }
      }
    ],
    "exercise": {
      "zh": "给两条请求各列出三个候选置信度，并限定只能验证三个草稿位置。比较平均分配与按预期接受数分配，标出不同接受结果需要修正哪些状态。",
      "en": "Give each of two requests three candidate confidences with budget for three draft positions. Compare equal allocation with expected-acceptance allocation and identify state corrections for different outcomes."
    },
    "sourcePath": "csrc/engine/mtp_varlen.hpp",
    "demo": "speculation"
  },
  {
    "id": "s10",
    "title": "Overlap the Pipeline",
    "name": {
      "zh": "让执行与状态处理重叠",
      "en": "Overlap execution and state processing"
    },
    "summary": {
      "zh": "读懂 ZOS 的前向、后处理、采样顺序，以及滞后一轮的状态修正。",
      "en": "Read ZOS forward, postprocess, and sampling order, including one-step-late state correction."
    },
    "insight": {
      "zh": "异步首先是一组依赖关系：先发出可执行的工作，再在需要结果时等待。",
      "en": "Asynchrony starts with dependencies: launch ready work, then wait only when its result is needed."
    },
    "minutes": 24,
    "layer": "scheduling",
    "filename": "s10_async_step.py",
    "code": "# Framework pseudocode for ZOS dependencies and deferred state.\nprevious = None\n\nfor plan in scheduler:\n    metadata = prepare_inputs(plan)\n    if previous is not None:\n        metadata = correct_on_device(metadata, previous)\n    forward = launch_forward(metadata)  # preserve execution dependencies\n    if previous is not None:\n        wait_for(previous.sample_end)\n        process_outputs(previous)\n    sample = launch_sample(forward, metadata)\n    current = StepState(plan, sample, record_event())\n    if plan.is_prefill or not zos_enabled:\n        wait_for(current.sample_end)\n        process_outputs(current)\n        previous = None\n    else:\n        previous = current\n\nflush_if_present(previous)",
    "sections": [
      {
        "heading": {
          "zh": "串行等待会在设备时间线上留下空洞",
          "en": "Serial waits leave gaps on the device timeline"
        },
        "body": {
          "zh": "若每轮都等待采样回传、更新请求、重新组批，再发出下一次前向，执行链路就会在控制工作期间等待。异步调度尝试重叠这些阶段。关键是明确哪些数据已可用、哪些状态可先修正，以及何时必须检查完成事件，而不是仅给函数加 async。",
          "en": "If each round waits for samples, updates requests, rebuilds work, and only then launches the next forward, execution waits during control work. Asynchronous scheduling overlaps these stages. The key is identifying available data, state that can be corrected early, and completion dependencies rather than merely adding async to a function."
        }
      },
      {
        "heading": {
          "zh": "先发本轮前向，再处理上一轮结果",
          "en": "Launch this forward before processing the prior result"
        },
        "body": {
          "zh": "DeepInfer Worker 的统一顺序是当前前向、上一轮后处理、当前采样。ZOS decode 把当前后处理保留到下一轮，从而让它与下一次前向重叠。prefill 或关闭 ZOS 时则当轮处理。最后没有下一轮可借用，必须显式 flush，否则最后一批已经生成的结果可能还没有交回请求层。",
          "en": "DeepInfer Worker follows a unified order: current forward, previous postprocess, then current sampling. ZOS decode defers its postprocess to the next round so it overlaps that round’s forward. Prefill and non-ZOS steps process results immediately. At the end, no next round exists to borrow, so an explicit flush is necessary or the final generated results may never reach the request layer."
        }
      },
      {
        "heading": {
          "zh": "滞后的长度不能直接用于计算",
          "en": "Stale lengths cannot be used unchanged"
        },
        "body": {
          "zh": "上一轮尚未后处理时，控制侧序列长度可能落后一拍，尤其草稿接受数还未落账。上游 _correct_seqlens_qk 根据采样结果修正长度与输入，并约束前向路径的同步边界。伪代码用于阅读依赖关系，具体事件、元数据和状态所有权应沿 Worker 的实现核对。",
          "en": "Before previous-step post-processing, control-side sequence lengths can lag, especially while draft-acceptance counts are uncommitted. Upstream _correct_seqlens_qk corrects lengths and inputs from sampling results and constrains synchronization boundaries. Use the pseudocode to read dependencies, then inspect Worker for events, metadata, and ownership."
        }
      },
      {
        "heading": {
          "zh": "跨轮重叠要保留完成事件与状态所有权",
          "en": "Cross-round overlap retains events and state ownership"
        },
        "body": {
          "zh": "**官方生产设计**：[官方部署文章](https://zhuanlan.zhihu.com/p/2095560295930508953)把调度、执行与结果处理放到跨轮流水线中重叠。理解这条时间线时，每个阶段都要标出它消费哪一轮数据、由谁持有结果，以及哪些状态尚未提交。下一轮前向已经发出，不代表上一轮结果已经对请求层可见。 **开源核对**：[WorkerStepState 的构造](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L167)把采样结果与完成事件一起保留；[_post_process_step](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L247)等待该事件后才消费结果并回调引擎。ZOS decode 将这份状态交给下一轮，结束时再由 flush 排空。因此重叠既需要前向与后处理的先后安排，也需要明确的就绪信号和在途状态生命周期。",
          "en": "**Official production design**: The [official deployment article](https://zhuanlan.zhihu.com/p/2095560295930508953) overlaps scheduling, execution, and result processing across rounds. Annotate which round each stage consumes, who owns its results, and which state remains uncommitted. Launching the next forward does not mean the previous result is already visible to the request layer. **Public-code check**: [WorkerStepState construction](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L167) retains sampling results together with a completion event. [_post_process_step](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/worker/worker.py#L247) waits for that event before consuming results and calling the engine. ZOS decode passes this state to the following round, and flush drains it at the end. Overlap therefore needs readiness signals and an explicit lifetime for in-flight state as well as stage ordering."
        }
      }
    ],
    "exercise": {
      "zh": "画出三轮控制与执行时间线，标注 forward、sample、postprocess 和 flush。假设上一轮只接受一个草稿，指出下一轮哪些元数据需要修正。",
      "en": "Draw three rounds of control and execution with forward, sample, postprocess, and flush. If the prior round accepted one draft, identify metadata that needs correction."
    },
    "sourcePath": "deepinfer/worker/worker.py",
    "demo": "batch"
  },
  {
    "id": "s11",
    "title": "Route to Experts",
    "name": {
      "zh": "沿着专家路由追踪 token",
      "en": "Follow tokens through expert routing"
    },
    "summary": {
      "zh": "沿着 gate、dispatch、专家计算和 combine 走完一次 MoE。",
      "en": "Follow a MoE pass through gating, dispatch, expert computation, and combine."
    },
    "insight": {
      "zh": "EP 分散的是专家参数；token 必须移动到参数所在的设备。",
      "en": "EP distributes expert parameters; tokens must travel to the devices holding them."
    },
    "minutes": 24,
    "layer": "distributed",
    "filename": "s11_expert_parallel.py",
    "code": "# Framework pseudocode for EP routing and return correspondence.\nexpert_ids, weights = gate.topk(hidden, experts_per_token)\nphysical_ids = resolve_replicas(expert_ids, replica_map)\nroutes = pack_routes(hidden, physical_ids, weights)\n\nreceived, handle = dispatch_to_owners(routes)\nlocal_outputs = empty_like(received.hidden)\nfor expert in local_experts:\n    rows = received.rows_for(expert.id)\n    local_outputs[rows] = expert(received.hidden[rows])\n\nreturned = combine_to_origins(local_outputs, handle)\noutput = zeros_like(hidden)\nfor route in returned:\n    output[route.token] += route.weight * route.hidden\n\nif shared_expert is not None:\n    output += shared_expert(hidden)",
    "sections": [
      {
        "heading": {
          "zh": "稀疏激活不等于没有大模型参数",
          "en": "Sparse activation does not remove large parameter sets"
        },
        "body": {
          "zh": "MoE 为每个 token 选择少量 routed experts，因此一次计算只激活部分参数，但整个模型仍需存放全部专家。专家并行将专家参数分散到不同设备，gate 给出逻辑专家与权重。它不同于让每张卡各自完整处理独立请求的数据并行；同一个 token 的一次 MoE 可能跨越多张设备。",
          "en": "MoE selects a small number of routed experts per token, activating only part of the parameters for that computation while the full expert set still needs storage. Expert parallelism spreads expert parameters across devices, and the gate supplies logical expert IDs and weights. Unlike data parallelism, where replicas handle independent requests, one token’s MoE computation may cross several devices."
        }
      },
      {
        "heading": {
          "zh": "通信的两端必须能互相还原",
          "en": "Communication must preserve enough information to return"
        },
        "body": {
          "zh": "dispatch 把 token 及其路由信息送往持有专家的设备，专家执行后 combine 把结果交回原始位置并按权重合并。一条 token 可被复制到多个专家，因此顺序、来源下标与权重都不能丢。真实系统还要处理不同设备 token 数不均、通信缓冲和计算重叠，通信成本也可能抵消部分稀疏计算收益。",
          "en": "Dispatch sends tokens and routing metadata to expert-owning devices; combine returns expert results to their original positions and merges weighted contributions. A token may be copied to multiple experts, so ordering, origin indices, and weights must survive. Real systems also handle uneven per-device token counts, communication buffers, and compute overlap. Communication can offset part of the benefit from sparse computation."
        }
      },
      {
        "heading": {
          "zh": "上游的逻辑专家与物理专家",
          "en": "Logical and physical experts upstream"
        },
        "body": {
          "zh": "DeepInfer 的 DeepseekMoE 对接 dispatch/combine 路径。模型选择 logical expert，框架再映射到包含冗余副本的 physical expert；物理专家数量需要满足 EP 分配约束。Attention 的 DP/CP 与 MoE 的 EP 属于不同职责的进程组，阅读时还要追踪路由来源与返回顺序。",
          "en": "DeepInfer’s DeepseekMoE connects dispatch/combine paths. The model selects logical experts, then the framework resolves physical experts, including redundant replicas; their count must satisfy EP allocation constraints. Attention DP/CP and MoE EP serve different roles. Trace route origins and return order alongside process-group responsibilities."
        }
      }
    ],
    "exercise": {
      "zh": "将四个专家放到两个 rank，为三个 token 各选两个专家。画出 dispatch 消息、专家输出与 combine 的加权结果，保留每条消息的来源 token。",
      "en": "Place four experts on two ranks and choose two experts for each of three tokens. Draw dispatch messages, expert outputs, and weighted combine while retaining each message’s origin token."
    },
    "sourcePath": "deepinfer/model_executor/models/v4_modules/mlp.py",
    "demo": "experts"
  },
  {
    "id": "s12",
    "title": "Balance the Hot Experts",
    "name": {
      "zh": "给热点专家安排副本与位置",
      "en": "Place and replicate hot experts"
    },
    "summary": {
      "zh": "用历史 token 计数理解 EPLB，再用下一段流量检验布局。",
      "en": "Understand EPLB through historical token counts, then evaluate placement on the next window."
    },
    "insight": {
      "zh": "整组前进的速度受最忙设备影响，平均负载好看还不够。",
      "en": "The busiest device limits group progress; a good average load is not enough."
    },
    "minutes": 25,
    "layer": "distributed",
    "filename": "s12_expert_balance.py",
    "code": "# Framework pseudocode for expert placement policy.\nhistory, future = split_windows(expert_token_counts)\nassert physical_experts % ep_size == 0\nlocal_capacity = physical_experts // ep_size\n\nplacement, replicas, counts = rebalance_experts_global(\n    history,\n    num_physical_experts=physical_experts,\n    num_local_physical_experts=local_capacity,\n)\n\nfor name, layout in candidate_layouts(placement):\n    # Equal sharing between replicas is an explicit proxy assumption.\n    load = estimate_rank_tokens(future, layout)\n    bottleneck = load.max(axis=-1).sum()\n    imbalance = load.max(axis=-1) / load.mean(axis=-1)\n    report(name, bottleneck, imbalance)\n\nexport_case(history, future, placement, policy_revision)",
    "sections": [
      {
        "heading": {
          "zh": "为什么专家数量均匀，卡仍会不均匀",
          "en": "Equal expert counts do not imply equal work"
        },
        "body": {
          "zh": "gate 的选择受输入影响，不同专家收到的 token 数可能差别很大。即便每张卡放相同数量的专家，热点也可能集中在一张卡上，其他卡只能等待。EPLB 根据历史路由计数，给热点 logical expert 增加 physical 副本，并重新安排副本位置；参数副本增加同时消耗额外存储。",
          "en": "Gate decisions depend on inputs, so experts can receive very different token counts. Even with equal expert counts per device, hot experts may cluster on one device while others wait. EPLB uses historical routing counts to add physical replicas of hot logical experts and rearrange their placement. Additional parameter replicas also consume additional storage."
        }
      },
      {
        "heading": {
          "zh": "历史窗口的互补性比总量更细",
          "en": "Window-level complementarity is richer than totals"
        },
        "body": {
          "zh": "上游策略先决定冗余副本，再按历史各 step 的负载向量贪心放置，目标涉及每步最忙 rank 的负载之和。两个总量相同的专家可能同时忙，也可能交替忙，放在同一张卡的效果不同。因此只按历史总数平均分组会丢失时序信息；策略中的稳定排序和同分处理也影响可复现实验。",
          "en": "The upstream policy first assigns redundant replicas, then greedily places experts using their load vectors across historical steps. Its objective involves the sum of each step’s busiest-rank load. Experts with equal totals may peak together or alternate, making their co-location behave differently. Grouping by totals alone discards that timing structure, while stable sorting and tie-breaking matter for reproducible experiments."
        }
      },
      {
        "heading": {
          "zh": "策略输出怎样交给运行时",
          "en": "How policy output meets runtime responsibilities"
        },
        "body": {
          "zh": "policy.py 根据历史计数提出副本分配与布局，运行时还要维护计数、通信、参数迁移和逻辑到物理映射。历史窗口中的热点不保证延续到下一窗口，因此要把策略输入、布局输出和后续路由分开阅读。最大 token 负载只是布局决策的一项代理信息，不等于整个框架的执行表现。",
          "en": "policy.py proposes replica counts and placement from historical counts; runtime responsibilities include counting, communication, parameter movement, and logical-to-physical mapping. Hotspots can change between windows. Read policy input, layout output, and later routing separately. Maximum token load is a proxy for placement decisions, not the behavior of the whole framework."
        }
      },
      {
        "heading": {
          "zh": "请求负载均衡与 EPLB 管的是不同对象",
          "en": "Request balancing and EPLB act on different objects"
        },
        "body": {
          "zh": "**官方生产设计**：[官方部署文章](https://zhuanlan.zhihu.com/p/2095560295930508953)中的请求负载均衡决定请求交给哪组服务实例，在 prefill 与 decode 的服务副本之间分配工作。EPLB 则作用于专家执行内部，安排 logical expert 的 physical 副本及其位置。一条请求选中了服务副本之后，其中的 token 仍可能经过专家路由；这两层决策需要各自的状态与统计。 **开源核对**：[rebalance_experts_global](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py#L73)接收专家历史 token 计数，输出专家副本数与逻辑、物理映射，验证的是 EPLB 策略。[README](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L38)明确将 prefill 和 decode 的数据并行副本负载均衡列为未提供的服务基础设施。因此不能把公开的 EPLB 策略或单个引擎的 Scheduler 当作完整生产请求负载均衡器。",
          "en": "**Official production design**: Request balancing in the [official deployment article](https://zhuanlan.zhihu.com/p/2095560295930508953) chooses which serving-instance group receives a request and distributes work among prefill and decode service replicas. EPLB acts inside expert execution, choosing physical replicas of logical experts and their placement. After a request reaches a service replica, its tokens can still undergo expert routing. These decisions require separate state and statistics. **Public-code check**: [rebalance_experts_global](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/deepinfer/model_executor/eplb/policy.py#L73) consumes historical expert token counts and returns replica counts and logical/physical maps, establishing the EPLB policy. The [README](https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/README.md#L38) explicitly lists balancing across data-parallel prefill and decode replicas as missing service infrastructure. The public EPLB policy and a single engine’s Scheduler therefore do not establish a complete production request load balancer."
        }
      }
    ],
    "exercise": {
      "zh": "构造热点从专家 0 转移到专家 3 的两段流量。比较静态布局、随机布局和历史优化布局在后半段的负载，解释为何训练窗口上的最优布局可能不再占优。",
      "en": "Create two traffic windows whose hotspot moves from expert 0 to expert 3. Compare static, random, and history-optimized layouts on the second window, explaining why the best history layout can lose its advantage."
    },
    "sourcePath": "deepinfer/model_executor/eplb/policy.py",
    "demo": "experts"
  }
];
