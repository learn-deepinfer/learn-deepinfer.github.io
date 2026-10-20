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

export const layers: {
  id: LayerId;
  name: Localized;
  description: Localized;
  color: string;
}[] = [
  {
    id: 'core',
    name: { zh: '推理核心', en: 'Inference core' },
    description: { zh: '从输入 token 到下一个 token，亲手走完一次真实生成。', en: 'Follow a real generation from input tokens to the next token.' },
    color: '#3b82f6',
  },
  {
    id: 'memory',
    name: { zh: '状态与内存', en: 'State & memory' },
    description: { zh: '保存、分页和复用 KV，让历史计算成为可管理的状态。', en: 'Cache, page, and reuse KV to make past computation manageable.' },
    color: '#10b981',
  },
  {
    id: 'scheduling',
    name: { zh: '批处理与调度', en: 'Batching & scheduling' },
    description: { zh: '在请求、token 预算和设备时间之间做出执行决策。', en: 'Choose work under request, token, and device-time budgets.' },
    color: '#f59e0b',
  },
  {
    id: 'distributed',
    name: { zh: '分布式与专家', en: 'Distribution & experts' },
    description: { zh: '理解 MoE 跨卡路由，以及热点专家的放置和再平衡。', en: 'Understand cross-device MoE routing and the placement of hot experts.' },
    color: '#8b5cf6',
  },
];

// These are original teaching excerpts, not copies of complete upstream modules.
// Chapter 01 has a runnable CPU implementation in the repository; later excerpts
// isolate mechanisms and deliberately omit production runtime dependencies.
export const lessons: Lesson[] = [
  {
    id: 's01',
    title: 'The Token Loop',
    name: { zh: '让模型真正吐出第一个 token', en: 'Generate the first real token' },
    summary: {
      zh: '用真实 Qwen2.5 权重，在 CPU 上打通分词、prefill 和贪心生成循环。',
      en: 'Use real Qwen2.5 weights on a CPU to connect tokenization, prefill, and greedy decoding.',
    },
    insight: { zh: '生成是一个会更新状态的循环：这一步的输出，是下一步的输入。', en: 'Generation is a stateful loop: this step’s output becomes the next step’s input.' },
    minutes: 15,
    layer: 'core',
    filename: 's01_token_loop.py',
    code: `# Teaching excerpt: the explicit greedy loop.
ids = encode(format_chat(prompt))
history = ids
cache = KVCache(model.num_layers)
current = ids
generated = []

for _ in range(max_new_tokens):
    logits = model(current, cache=cache)
    token = logits[:, -1].argmax(-1)
    generated.append(token.item())
    if token.item() in eos_token_ids:
        break
    history = append_token(history, token)
    current = token[:, None]

answer = decode(generated, skip_special_tokens=True)`,
    sections: [
      {
        heading: { zh: '先把文字变成模型见过的输入', en: 'Build the input the model was trained to read' },
        body: {
          zh: 'Instruct 模型需要角色边界。先把 system、user 和尚未结束的 assistant 消息拼成 Qwen 的聊天格式，再用 tokenizer 转为整数序列。特殊标记和换行也是输入的一部分；直接输入原始文字会得到另一组 token。本章使用固定的基本文本模板，不能把它理解为通用工具调用模板。',
          en: 'An instruct model expects role boundaries. Format system and user messages plus an open assistant turn using Qwen’s chat format, then tokenize the result. Special markers and newlines are part of the input; raw text produces different token IDs. This chapter uses a fixed basic text template, rather than a general template engine for tools or multimodal messages.',
        },
      },
      {
        heading: { zh: '第一轮与后面的轮次不同', en: 'The first pass differs from the later passes' },
        body: {
          zh: 'prefill 一次处理整个 prompt，并用最后位置的 logits 选择第一个新 token。之后每轮只送入刚选出的 token，历史信息保留在 KV cache 中。选择出的 token 要到下一次前向才进入 cache；因此生成 G 个 token 通常需要一次 prefill 和 G−1 次 decode，提前遇到结束标记时还会更少，结果应逐步核对。',
          en: 'Prefill processes the whole prompt and selects the first new token from the final position’s logits. Later passes input only the token just selected, with history retained in the KV cache. A selected token enters the cache only on the following forward pass. Generating G tokens therefore normally takes one prefill and G−1 decode passes, with early stopping shortening the run. Check the state step by step.',
        },
      },
      {
        heading: { zh: '从这个循环走向上游引擎', en: 'Connect the loop to the upstream engine' },
        body: {
          zh: '本仓库第一章的 model.py 与 engine.py 真正执行 Qwen2 前向，不在运行时调用 Transformers generate。DeepInfer 的 LLM._run_engine 也不断推进 engine.step，但一步可能处理多个请求与 draft token。这里先固定单请求、CPU 和贪心策略，从小模型建立完整计算直觉，不宣称兼容上游模型或接口，学习时应始终区分这些边界。',
          en: 'Chapter 01’s model.py and engine.py execute a real Qwen2 forward pass without calling Transformers generate at runtime. DeepInfer’s LLM._run_engine also repeatedly advances engine.step, but one upstream step can handle several requests and draft tokens. We begin with one request, CPU execution, and greedy selection to build a complete understanding with a small model, without claiming upstream model or API compatibility. Keep those boundaries distinct while learning.',
        },
      },
    ],
    exercise: { zh: '运行同一个 prompt，分别设置 1 和 8 个新 token。解释两次运行各有多少次 prefill、多少次 decode；遇到 EOS 时按实际停止位置核对。', en: 'Run the same prompt with limits of 1 and 8 new tokens. Explain the number of prefill and decode passes in each run, accounting for the actual stopping position if EOS appears.' },
    sourcePath: 'deepinfer/entrypoints/llm.py',
    demo: 'loop',
  },
  {
    id: 's02',
    title: 'Inside a Forward Pass',
    name: { zh: '把一次前向拆开来看', en: 'Open up a forward pass' },
    summary: { zh: '读懂 RMSNorm、GQA、RoPE 与 SwiGLU，让每个张量形状都说得通。', en: 'Understand RMSNorm, GQA, RoPE, and SwiGLU by following tensor shapes.' },
    insight: { zh: '架构名称不能代替计算：位置、头数和 mask 共同决定下一 token 的分数。', en: 'Architecture names are not the computation: positions, heads, and masks determine the scores.' },
    minutes: 22,
    layer: 'core',
    filename: 's02_forward.py',
    code: `# Qwen2-shaped teaching excerpt, not the V4 architecture.
past = 0 if cache is None else cache.length
positions = arange(past, past + ids.shape[1])
x = embedding(ids)

for layer_id, layer in enumerate(layers):
    residual = x
    h = layer.input_norm(x)
    q, k, v = layer.project_qkv(h)
    q, k = apply_rope(q, k, positions)
    if cache is not None:
        k, v = cache.append(layer_id, k, v)
    h = causal_gqa(q, k, v, positions)
    x = residual + layer.output_proj(h)
    h = layer.post_attention_norm(x)
    x = x + layer.down(silu(layer.gate(h)) * layer.up(h))

logits = lm_head(final_norm(x[:, -1:, :]))`,
    sections: [
      {
        heading: { zh: '先沿着形状走，不急着背术语', en: 'Follow shapes before memorizing names' },
        body: {
          zh: '输入 IDs 的形状是 batch×sequence，embedding 后多出 hidden 维。每层先归一化再做注意力，加回残差，然后经过第二次归一化与 MLP。生成只需要最后位置的词表打分，本章因此只对最后位置做最终投影。权重名、bias 与归一化 epsilon 都必须与 checkpoint 对齐，并注意数据类型。',
          en: 'Input IDs have batch×sequence shape; embedding adds a hidden dimension. Each layer normalizes, applies attention, and adds a residual, then repeats the pattern with an MLP. Generation needs vocabulary scores only for the final position, so this chapter projects that position only. Weight names, biases, and normalization epsilon must all match the checkpoint, with data types checked as well.',
        },
      },
      {
        heading: { zh: '三个容易算错的注意力细节', en: 'Three attention details that cause real errors' },
        body: {
          zh: 'GQA 让多个 Q 头共享较少的 KV 头，缓存应保留真实 KV 头数量。RoPE 旋转 Q/K，位置从历史长度继续增加，不能每轮归零。带缓存时 Q 长度可能只有一，而 K 包含全部历史；mask 必须比较绝对位置，不能照搬一个未考虑 past 长度的方形下三角矩阵。',
          en: 'GQA lets several query heads share fewer KV heads, so the cache should retain the actual KV-head count. RoPE rotates Q/K using positions that continue from the history length, rather than restarting each pass. With caching, Q may contain one token while K contains the full history. The mask must compare absolute positions instead of reusing a square lower-triangular mask that ignores the past.',
        },
      },
      {
        heading: { zh: 'Qwen 的前向不是 DeepSeek V4 的缩小版', en: 'Qwen is not a scaled-down DeepSeek V4' },
        body: {
          zh: '上游 DeepseekModel.forward 同样串联 embedding 和 decoder layers，但 V4Attention 还包含 MLA、压缩 KV、滑动窗口与跨层状态等机制。这里用稠密 Qwen2 学会读取前向的输入输出边界，不能把两种模型的张量布局直接互换。对照参考实现时，应先比较相同 IDs 的 logits，再看生成文本，这样更易定位差异。',
          en: 'Upstream DeepseekModel.forward also connects embeddings and decoder layers, but V4Attention includes MLA, compressed KV, sliding windows, and cross-layer state. The dense Qwen2 model teaches how to read forward-pass boundaries; its tensor layouts are not interchangeable with V4’s. Compare logits for identical input IDs before generated text to make differences easier to locate.',
        },
      },
    ],
    exercise: { zh: '选一个长度为 4 的输入，写出 embedding、Q、缓存 K、最后位置 logits 的形状。然后加入一个 decode token，标出哪些维度发生变化。', en: 'For a four-token input, write the shapes of the embeddings, Q, cached K, and final-position logits. Add one decode token and identify which dimensions change.' },
    sourcePath: 'deepinfer/model_executor/models/deepseek.py',
    demo: 'loop',
  },
  {
    id: 's03',
    title: 'Remember with KV',
    name: { zh: '用 KV cache 留住过去的计算', en: 'Keep past computation in a KV cache' },
    summary: { zh: '实现每层 K/V 的追加，理解 decode 为什么只需要输入一个 token。', en: 'Append per-layer K/V and see why decoding can input a single token.' },
    insight: { zh: '缓存省去历史 token 的重复计算，新 query 仍然需要读取历史。', en: 'Caching removes repeated work on past tokens; a new query still reads the history.' },
    minutes: 18,
    layer: 'memory',
    filename: 's03_kv_cache.py',
    code: `# Educational contiguous cache; append copies old tensors.
class KVCache:
    def __init__(self, layers):
        self.keys = [None] * layers
        self.values = [None] * layers

    def append(self, layer, k, v):
        old_k = self.keys[layer]
        old_v = self.values[layer]
        if old_k is not None:
            k = cat([old_k, k], dim=-2)
            v = cat([old_v, v], dim=-2)
        self.keys[layer] = k
        self.values[layer] = v
        return k, v

# K is stored after the position rotation.
q, k = apply_rope(q, k, positions)
k, v = cache.append(layer_id, k, v)`,
    sections: [
      {
        heading: { zh: '重复计算从哪里来', en: 'Where repeated work comes from' },
        body: {
          zh: '关闭 cache 时，生成第二个 token 要重新输入 prompt 加第一个输出；下一轮又多算一次全部前缀。因果注意力中，旧位置看不到未来，它们已经算出的 K/V 可以复用。缓存把这些结果留在每一层，让后续前向只计算新输入的位置，再用新 Q 查询历史 K/V。',
          en: 'Without a cache, generating the second token inputs the prompt and first output again; the next pass repeats the entire longer prefix. In causal attention, old positions cannot see future tokens, so their previously computed K/V can be reused. A cache retains those results in every layer, allowing later passes to compute new positions only and query historical K/V with the new Q.',
        },
      },
      {
        heading: { zh: '长度和位置必须一起更新', en: 'Update lengths and positions together' },
        body: {
          zh: '先读取本次前向之前的缓存长度，再为所有层建立相同的位置序列。每层追加自己的 K/V，不能在经过一层后就把全局位置再加一次。保存旋转后的 K 时，旧缓存也不能重复应用 RoPE。一个请求结束后要释放或清空缓存，否则下一条请求可能错误地继承上一条的上下文。',
          en: 'Read the cache length before the forward pass and create one position sequence shared by all layers. Each layer appends its own K/V; do not advance the global position again after every layer. If K is stored after RoPE, old cached keys must not be rotated again. Release or clear the cache when a request finishes, or the next request may accidentally inherit its context.',
        },
      },
      {
        heading: { zh: '易读缓存与生产缓存的距离', en: 'From a readable cache to a production cache' },
        body: {
          zh: '片段用 cat 追加，便于理解，但它会反复分配和复制。DeepInfer 的 CacheEngine 管理设备侧块与模型专用布局，不能用这段追加代码代表其实现。CPU 比较 cache 开关时也要区分加载、prefill 和 decode；相同输出长度只是比较前提，不等于在任何短输入上都保证更快。',
          en: 'The excerpt appends with cat for clarity, which repeatedly allocates and copies. DeepInfer’s CacheEngine manages device blocks and model-specific layouts; this append routine does not represent that implementation. CPU cache comparisons should separate loading, prefill, and decode. Matching output lengths is a prerequisite for comparison, not a promise that caching wins on every short input.',
        },
      },
    ],
    exercise: { zh: '用相同 prompt 对照 --no-cache。先检查 token IDs，再记录各次前向的输入长度；解释为什么最后生成的 token 不一定已经存入 cache。', en: 'Compare the same prompt with --no-cache. Check token IDs first, then record each forward pass’s input length. Explain why the final generated token may not yet be in the cache.' },
    sourcePath: 'deepinfer/worker/cache_engine.py',
    demo: 'cache',
  },
  {
    id: 's04',
    title: 'Choose the Next Token',
    name: { zh: '从 logits 走到采样结果', en: 'Turn logits into a token choice' },
    summary: { zh: '区分贪心、温度和 top-p，并把随机性与模型计算分开。', en: 'Separate greedy choice, temperature, and top-p from the model computation.' },
    insight: { zh: '模型给出分数，采样器定义如何把这些分数变成下一 token。', en: 'The model supplies scores; the sampler defines how scores become a token.' },
    minutes: 16,
    layer: 'core',
    filename: 's04_sampling.py',
    code: `# Conceptual top-p sampler; chapter 01 uses greedy only.
def choose(logits, temperature, top_p, generator):
    if temperature == 0:
        return logits.argmax(-1)
    if temperature < 0 or not 0 < top_p <= 1:
        raise ValueError("invalid sampling parameters")
    probs = softmax(logits / temperature, dim=-1)
    ranked, indices = probs.sort(descending=True)
    mass_before = ranked.cumsum(-1) - ranked
    keep = mass_before < top_p
    ranked = ranked * keep
    ranked = ranked / ranked.sum(-1, keepdim=True)
    slot = multinomial(ranked, 1, generator=generator)
    return indices.gather(-1, slot).squeeze(-1)

# Keep a request's RNG state separate from its logits.
token = choose(logits, temperature, top_p, request_rng)`,
    sections: [
      {
        heading: { zh: '先分清预测与选择', en: 'Separate prediction from selection' },
        body: {
          zh: 'logits 是词表上未归一化的打分，不是已经选好的文字。贪心直接取最大值，softmax 不会改变这个位置。随机采样先把打分变成概率，再按分布抽取。第一章固定贪心，是为了让前向与 cache 的错误更容易复现；更丰富的采样策略是此后的独立扩展。',
          en: 'Logits are unnormalized vocabulary scores, not selected text. Greedy decoding takes their maximum directly, and softmax does not change that position. Random sampling converts scores to probabilities and draws from the distribution. Chapter 01 fixes greedy decoding so forward-pass and cache errors are easier to reproduce; richer sampling policies are a separate extension.',
        },
      },
      {
        heading: { zh: '温度和 top-p 改的是不同环节', en: 'Temperature and top-p change different stages' },
        body: {
          zh: '温度缩放 logits，较小的正温度使概率更集中。top-p 先按概率排序，再保留累计质量足够的一小组 token，并重新归一化。越过阈值的那个 token 也应被保留，否则可能错误地丢掉第一个候选。参数校验、全被屏蔽的分布以及结束标记，都需要明确处理。',
          en: 'Temperature scales logits; a smaller positive value concentrates probability. Top-p sorts probabilities, keeps the smallest prefix reaching the desired mass, and renormalizes it. The token crossing the threshold must be kept, or even the first candidate can be dropped incorrectly. Parameter validation, fully masked distributions, and end markers all need explicit handling.',
        },
      },
      {
        heading: { zh: '固定 seed 还不等于所有场景都相同', en: 'A fixed seed does not settle every reproducibility question' },
        body: {
          zh: '上游 Sampler 还处理 logits processors、约束输出和 draft 验证，远多于片段里的随机抽取。请求独立 RNG 能避免批次变化随意消耗同一随机流，但矩阵计算本身也可能随 batch 变化。DeepInfer 把 batch-invariant 和 deterministic sampling 分别列出；本章的 CPU 贪心不等于已经复现这些 NVIDIA 路径，需要另做硬件验证。',
          en: 'The upstream Sampler also handles logits processors, constrained output, and draft verification, far beyond this random draw. Per-request RNG avoids arbitrary sharing of a random stream as batches change, but matrix computation can also vary with batching. DeepInfer lists batch invariance and deterministic sampling separately; CPU greedy decoding does not reproduce those NVIDIA paths, which need their own hardware validation.',
        },
      },
    ],
    exercise: { zh: '用一组固定 logits 手算 top-p 保留集合，再将温度减半。区分“最大概率 token 是否变化”和“随机结果是否更集中”这两个问题。', en: 'For fixed logits, calculate the top-p candidate set, then halve the temperature. Distinguish whether the highest-probability token changes from whether random draws become more concentrated.' },
    sourcePath: 'deepinfer/model_executor/layers/sampler.py',
    demo: 'loop',
  },
  {
    id: 's05',
    title: 'Work in Batches',
    name: { zh: '把多条请求放到一次计算里', en: 'Put multiple requests into one computation' },
    summary: { zh: '从单请求扩展到静态 batch，学习 padding、长度和完成标记。', en: 'Extend a single request to a static batch with padding, lengths, and completion flags.' },
    insight: { zh: 'batch 共享一次计算，不能共享每条请求的进度与停止条件。', en: 'A batch shares computation, not each request’s progress or stopping condition.' },
    minutes: 18,
    layer: 'scheduling',
    filename: 's05_static_batch.py',
    code: `# Conceptual static batch; requires per-row cache positions.
batch = prepare_left_padded(prompts)
finished = [False] * len(prompts)
outputs = [[] for _ in prompts]
state = create_batched_state(batch.lengths)

for _ in range(max_new_tokens):
    logits = batched_forward(batch, state)
    tokens = logits.argmax(-1)
    for row, token in enumerate(tokens):
        if finished[row]:
            continue
        outputs[row].append(token)
        finished[row] = token in eos_token_ids
    if all(finished):
        break
    batch = prepare_next_step(tokens, finished, state)

return [decode(ids) for ids in outputs]`,
    sections: [
      {
        heading: { zh: '一次只算一条请求浪费了什么', en: 'What a one-request-at-a-time loop leaves unused' },
        body: {
          zh: '模型参数很大，而单个 decode token 的计算往往不足以充分利用设备。把多条请求拼到一次前向，可以共享权重读取和矩阵运算的组织成本。静态 batch 在开始时固定成员，直到这组请求全部结束再接受下一组；它容易理解，也让最长的请求成为整批结束时间的决定因素。',
          en: 'Model weights are large, while one decode token often provides too little work to use a device well. Combining requests in one forward pass can share weight reads and matrix-operation overhead. A static batch fixes its members at the start and accepts the next group only after all members finish. This is simple, but the longest request determines when the batch can end.',
        },
      },
      {
        heading: { zh: '形状对齐后，语义仍要分开', en: 'Aligned shapes still need independent semantics' },
        body: {
          zh: '不同 prompt 长度需要 padding 或变长布局，mask 必须阻止读取补齐的位置。每行还有自己的位置、缓存长度、生成上限和结束状态。上面的 batched state 是待实现的抽象，不能把第一章共享位置的一维 cache 直接套上。完成的行应停止累计输出，其他行才不会被同批 EOS 提前截断。',
          en: 'Different prompt lengths require padding or a variable-length layout, with masks preventing reads from padded positions. Each row also needs its own positions, cache length, generation limit, and completion state. The batched state above is an abstraction to implement; chapter 01’s shared one-dimensional cache positions cannot simply be reused. Finished rows must stop accumulating output without ending other rows.',
        },
      },
      {
        heading: { zh: '上游的自动组批不等于这段静态循环', en: 'Upstream automatic batching goes beyond this loop' },
        body: {
          zh: 'DeepInfer 的 LLM.generate 将输入逐条加入引擎，再由 Scheduler 根据 token、序列数量和缓存约束组批。它不是把任意长短的输入直接 stack 起来。静态 batch 是理解多请求元数据的起点；本课片段用来暴露这些职责，并不代表本仓库已经提供了可运行的批量服务实现。',
          en: 'DeepInfer’s LLM.generate adds inputs individually, then lets the Scheduler form batches under token, sequence-count, and cache constraints. It does not simply stack arbitrary input lengths. Static batching is a starting point for understanding per-request metadata. This teaching excerpt exposes those responsibilities; it does not mean the repository already offers a runnable batched serving implementation.',
        },
      },
    ],
    exercise: { zh: '画出三条输出长度为 2、5、8 的请求。标出静态 batch 每轮的有效行，以及等待整批结束才进来的第四条请求要等多久；只比较轮次，不虚构耗时。', en: 'Draw requests with output lengths of 2, 5, and 8. Mark active rows on each static-batch round and how many rounds a fourth request waits. Compare rounds rather than inventing timings.' },
    sourcePath: 'deepinfer/entrypoints/llm.py',
    demo: 'static-batch',
  },
  {
    id: 's06',
    title: 'Schedule Every Step',
    name: { zh: '让 batch 在每一步变化', en: 'Let the batch change at every step' },
    summary: { zh: '用 waiting、running 和 token 预算理解 continuous batching。', en: 'Understand continuous batching through waiting and running queues plus token budgets.' },
    insight: { zh: '调度单位变成一步之后，请求可以独立离开，也可以在空位出现时加入。', en: 'Scheduling one step at a time lets requests finish independently and new work enter available slots.' },
    minutes: 22,
    layer: 'scheduling',
    filename: 's06_continuous_batch.py',
    code: `# Conceptual scheduler: phase selection is simplified here.
waiting, running = Queue(), []

while waiting or running:
    for request in completed(running):
        release_cache(request)
        running.remove(request)
    budget = max_tokens_per_step
    selected = []
    for request in runnable(running, waiting):
        cost = query_tokens_this_step(request)
        if cost > budget or not cache_can_fit(request):
            continue
        reserve_cache(request)
        selected.append(request)
        budget -= cost
    results = execute_step(selected)
    update_requests(results, running, waiting)`,
    sections: [
      {
        heading: { zh: '不再等待最慢的成员', en: 'Stop waiting for the slowest batch member' },
        body: {
          zh: '静态 batch 中，短请求结束后留下空位，却不能立刻补入新请求。continuous batching 在每一轮重新选择工作，完成的请求退出，等待的请求在资源允许时进入。请求仍保留自己的 KV 和进度，改变的是本轮执行集合；这使请求生命周期与一次前向的 batch 成员关系分离。',
          en: 'In a static batch, short requests leave unused slots when they finish, but new requests cannot immediately enter. Continuous batching selects work again each round: finished requests leave and waiting requests enter when resources permit. Requests retain their own KV and progress; what changes is the current execution set. A request’s lifetime is therefore separate from membership in one forward-pass batch.',
        },
      },
      {
        heading: { zh: '预算不能只数请求个数', en: 'A budget must count more than requests' },
        body: {
          zh: '一条长 prompt 的 prefill 和一条单 token decode 对计算与内存的需求不同。调度器既要限制序列数量，也要计算本步 query token 总量，并确认缓存能分配。chunked prefill 把长输入切成多步处理，避免一次占满全部预算。公平性、首次响应和吞吐之间需要明确策略，不能只靠队列顺序碰运气。',
          en: 'A long prompt prefill and a one-token decode have different compute and memory needs. A scheduler limits both sequence count and total query tokens for the step, while checking cache availability. Chunked prefill spreads a long input over several steps instead of consuming the entire budget at once. Fairness, first-response latency, and throughput need explicit policies rather than accidental queue ordering.',
        },
      },
      {
        heading: { zh: '读清 DeepInfer 的步型约束', en: 'Read DeepInfer’s step-type constraints carefully' },
        body: {
          zh: '上游 C++ Scheduler 在 NORMAL 模式下决定本轮做 prefill 还是 decode，并让 DP 组通过投票保持步型一致。它并不等同于任意混合两种 token 的通用片段。ALL 与 ANY 尝试点兼顾无效陪跑和等待上限；理解这些分支前，先追踪 waiting、running、缓存分配和完成回收的变化。',
          en: 'In NORMAL mode, the upstream C++ Scheduler decides whether a step is prefill or decode and uses voting to keep the DP group on the same step type. This is more specific than a generic loop that freely mixes both kinds of tokens. ALL and ANY attempt points balance idle participation against waiting bounds. Start by tracing waiting, running, cache allocation, and completion cleanup before following those branches.',
        },
      },
    ],
    exercise: { zh: '让长 prompt、短 prompt 和正在 decode 的请求同时到达。在固定 token 预算下安排五轮执行，写明每轮不能加入某条请求的具体原因。', en: 'Combine a long prompt, a short prompt, and an already-decoding request. Plan five rounds under a fixed token budget and state exactly why an excluded request cannot enter each round.' },
    sourcePath: 'csrc/engine/scheduler.hpp',
    demo: 'batch',
  },
  {
    id: 's07',
    title: 'Page the KV Cache',
    name: { zh: '把连续上下文映射到分页内存', en: 'Map a continuous context onto paged memory' },
    summary: { zh: '用 block table 把逻辑 token 位置与物理缓存块解耦。', en: 'Use a block table to separate logical token positions from physical cache blocks.' },
    insight: { zh: '序列在逻辑上连续，存储它的物理块不必连续。', en: 'A sequence can be logically continuous without occupying contiguous physical blocks.' },
    minutes: 20,
    layer: 'memory',
    filename: 's07_paged_kv.py',
    code: `# Conceptual address translation for fixed-size blocks.
def kv_address(request, token_position):
    logical_block = token_position // block_size
    offset = token_position % block_size
    physical_block = request.block_table[logical_block]
    return physical_block, offset

def reserve_next_token(request):
    needs_block = request.length % block_size == 0
    if needs_block:
        block = pool.allocate()  # fail before mutating length
        request.block_table.append(block)
    address = kv_address(request, request.length)
    request.length += 1
    return address

for block in finished_request.block_table:
    pool.release(block)`,
    sections: [
      {
        heading: { zh: '连续分配为什么难以管理', en: 'Why contiguous allocation is hard to manage' },
        body: {
          zh: '请求的最终输出长度通常未知。预留一大段连续 KV 会浪费空间，增长时重新分配又需要复制。分页把 cache 分成固定大小的块，每条请求只保存逻辑块到物理块的映射。序列增长时补一个块即可，完成后回收各块；尾块仍可能有内部浪费，因此块大小也存在取舍。',
          en: 'A request’s final output length is usually unknown. Reserving a large contiguous KV region wastes memory, while reallocating as it grows causes copies. Paging divides the cache into fixed-size blocks and stores a logical-to-physical mapping per request. Growth adds a block, and completion releases the blocks. A partially filled final block still wastes space, making block size a tradeoff.',
        },
      },
      {
        heading: { zh: '地址翻译必须贯穿读写两端', en: 'Address translation applies to both reads and writes' },
        body: {
          zh: 'token 位置除以 block size 得到逻辑块号，余数给出块内偏移，再查 block table 得到物理地址。写入新 K/V 和读取历史 K/V 都必须遵守同一个映射。分配失败时不能先增加长度，也不能重复释放共享块。真正的分页注意力还要让算子直接理解块表，而非每步重新拼出连续张量。',
          en: 'Divide a token position by block size to obtain its logical block and remainder, then consult the block table for the physical block. New K/V writes and historical K/V reads must use the same mapping. Failed allocation must not advance length, and shared blocks cannot be released twice. Real paged attention also requires kernels that consume block tables directly instead of rebuilding contiguous tensors each step.',
        },
      },
      {
        heading: { zh: '区分块管理和模型缓存布局', en: 'Separate block management from model cache layouts' },
        body: {
          zh: 'DeepInfer 的 block_manager.hpp 负责空闲块、引用计数和分配约束；设备侧 CacheEngine 决定具体张量布局。V4 的缓存还涉及模型专用格式和状态，不能用普通 GQA 的 K/V 数组推断其字节数。本课片段仅解释地址翻译，没有实现上游分页算子、并发锁或完整缓存生命周期。',
          en: 'DeepInfer’s block_manager.hpp manages free blocks, reference counts, and allocation constraints; device-side CacheEngine determines tensor layouts. V4 caches also involve model-specific formats and state, so a plain GQA K/V array cannot determine their byte sizes. This excerpt explains address translation only, without implementing upstream paged kernels, concurrency locks, or the full cache lifecycle.',
        },
      },
    ],
    exercise: { zh: '设 block size 为 4，某请求 block table 为 [7,2,9]。计算第 0、5、10 个 token 的物理地址，再说明第 12 个 token 到来时需要做什么。', en: 'With block size 4 and block table [7,2,9], calculate the addresses of tokens 0, 5, and 10. Explain what must happen before writing token 12.' },
    sourcePath: 'csrc/engine/block_manager.hpp',
    demo: 'cache',
  },
  {
    id: 's08',
    title: 'Reuse a Prefix',
    name: { zh: '让相同前缀只计算一次', en: 'Compute a shared prefix once' },
    summary: { zh: '从请求分叉理解前缀复用、引用计数与写时复制。', en: 'Use request forks to understand prefix reuse, reference counts, and copy-on-write.' },
    insight: { zh: '可复用的是相同计算状态，不只是看起来相同的一段文字。', en: 'Reuse requires identical computation state, not merely similar-looking text.' },
    minutes: 20,
    layer: 'memory',
    filename: 's08_prefix_reuse.py',
    code: `# Conceptual immutable prefix sharing, not a cache service.
prefix = prefill_once(shared_token_ids)

def fork_request(prefix, suffix_ids):
    child = Request(suffix_ids)
    child.block_table = prefix.block_table.copy()
    for block in child.block_table:
        pool.pin(block)
    child.cached_tokens = prefix.token_count
    return child

def prepare_write(request, logical_block):
    block = request.block_table[logical_block]
    if pool.references(block) > 1:
        fresh = pool.clone(block)
        request.block_table[logical_block] = fresh
        pool.release(block)
    return request.block_table[logical_block]`,
    sections: [
      {
        heading: { zh: '相同开头带来重复 prefill', en: 'Shared beginnings cause repeated prefill' },
        body: {
          zh: '多条请求可能带着相同系统消息、长文档或少样本示例。只要输入 token、位置与模型计算条件一致，这段前缀产生的 KV 就可以共享。复用后每条请求从自己的后缀继续，不必重复计算开头。文本相似或渲染相同还不够，聊天模板与特殊 token 的差别也会改变实际前缀。',
          en: 'Requests may share a system message, long document, or few-shot examples. If tokens, positions, and model computation conditions match, the prefix’s KV can be shared. Each request continues from its own suffix instead of recomputing the beginning. Similar-looking or identically rendered text is not sufficient: chat formatting and special tokens can change the actual prefix.',
        },
      },
      {
        heading: { zh: '共享状态需要所有权规则', en: 'Shared state needs ownership rules' },
        body: {
          zh: '共享只读块时增加引用计数，请求结束时减少，最后一个引用消失后才能回收。如果分叉发生在未写满的尾块，后续写入不能覆盖另一条请求正在使用的内容，需要复制或其他隔离策略。查找键还应区分模型版本、位置与缓存格式；把这些条件遗漏，命中率再高也可能算错。',
          en: 'Sharing read-only blocks increments references; finishing a request decrements them, and reclamation waits for the final reference. If a fork shares a partially filled final block, later writes must not overwrite another request’s state, requiring copying or equivalent isolation. Lookup keys should also distinguish model revision, positions, and cache format. Omitting those conditions can turn a high hit rate into incorrect computation.',
        },
      },
      {
        heading: { zh: '上游示例证明了什么', en: 'What the upstream example actually demonstrates' },
        body: {
          zh: 'DeepInfer benchmark 先计算共同的 cached prefix，再通过 scheduler.fork_seq 构建后续请求，展示了显式分叉与状态复用。它不能单独证明发布版包含任意请求自动检索的完整 KV 服务。阅读时将分叉机制、前缀索引、跨机器传输与服务级淘汰分开；本课仅讲共享与生命周期这条主线。',
          en: 'The DeepInfer benchmark computes a common cached prefix and uses scheduler.fork_seq to create later requests, demonstrating explicit forks and state reuse. This alone does not establish a complete KV service with automatic lookup for arbitrary requests. Separate the fork mechanism from prefix indexing, cross-machine transfer, and service-level eviction. This lesson follows sharing and lifetime management only.',
        },
      },
    ],
    exercise: { zh: '两个请求共享一个完整块和一个半满块，再分别追加不同 token。画出引用计数与写时复制过程，并指出哪一步可以安全释放旧块。', en: 'Two requests share one full block and one half-full block, then append different tokens. Draw reference counts and copy-on-write, marking when the old block can safely be released.' },
    sourcePath: 'examples/benchmark.py',
    demo: 'cache',
  },
  {
    id: 's09',
    title: 'Draft, Then Verify',
    name: { zh: '从推测解码走向 DSpark', en: 'From speculative decoding to DSpark' },
    summary: { zh: '把草稿、目标模型验证和置信度预算分开，理解一次推进多个 token。', en: 'Separate drafting, target verification, and confidence budgets to advance several tokens at once.' },
    insight: { zh: '草稿的价值取决于接受的 token 数与验证成本，而不是草稿长度本身。', en: 'A draft’s value depends on accepted tokens and verification cost, not draft length alone.' },
    minutes: 25,
    layer: 'scheduling',
    filename: 's09_speculative_decode.py',
    code: `# Greedy speculation concept; not DSpark's full sampler.
draft = draft_model.propose(context, max_draft_tokens)
verified = target_model.score_with_causal_prefix(context, draft)
accepted = []

for index, candidate in enumerate(draft):
    golden = verified.next_token_at(index).argmax()
    if candidate != golden:
        accepted.append(golden)
        break
    accepted.append(candidate)
else:
    accepted.append(verified.bonus_logits.argmax())

accepted = truncate_at_eos_and_length_limit(accepted)
context.extend(accepted)
rollback_unaccepted_cache(target_cache, context)
rollback_unaccepted_cache(draft_cache, context)`,
    sections: [
      {
        heading: { zh: '让廉价的草稿先往前走', en: 'Let a cheaper draft move ahead' },
        body: {
          zh: '逐 token 调用大模型有固定开销。推测解码先让草稿机制提出多个候选，再让目标模型验证，希望一次昂贵前向接纳多个 token。贪心场景可直观比较候选与目标 argmax，随机采样则需要正确的接受与修正规则，不能把简单匹配当成通用算法。草稿不被接受时，仍要保证最终选择服从目标规则。',
          en: 'Calling a large model for every token incurs fixed overhead. Speculative decoding proposes several candidates with a draft mechanism, then verifies them with the target model, hoping one expensive pass accepts multiple tokens. Greedy decoding can compare candidates with target argmax choices; stochastic sampling needs proper acceptance and correction rules. Simple matching is not a general algorithm, and rejected drafts must still lead to a target-correct choice.',
        },
      },
      {
        heading: { zh: '拒绝之后，缓存也要回到正确位置', en: 'After rejection, restore the right cache position' },
        body: {
          zh: '验证会计算尚未确定能留下的候选。发生拒绝后，未接受的 token 不能留在后续可见的 KV 中，草稿状态也要同步修正。全接受时通常还可以得到额外的目标 token，但 EOS 和长度上限可能截断结果。实际收益应看每轮提交了多少有效输出，并包含草稿、验证、采样和状态维护成本。',
          en: 'Verification computes candidates before knowing which will remain. After rejection, unaccepted tokens must not stay visible in later KV reads, and draft state must also be repaired. Accepting the whole draft can normally produce a bonus target token, but EOS and length limits may truncate the result. Evaluate useful outputs per round while including drafting, verification, sampling, and state-maintenance costs.',
        },
      },
      {
        heading: { zh: 'DeepInfer 还会按置信度分配验证预算', en: 'DeepInfer also allocates verification by confidence' },
        body: {
          zh: '上游将 DSpark 与 confidence-scheduled verification 配合使用。mtp_varlen.hpp 根据各候选的接受率估计、设备性能曲线与运行时采样成本选择总 query 预算，再分配到请求。它并非给所有请求固定相同草稿长度；片段只是贪心推测的教学模型，本章 CPU 引擎尚未实现 DSpark 或其验证正确性。',
          en: 'Upstream combines DSpark with confidence-scheduled verification. mtp_varlen.hpp uses candidate acceptance estimates, device performance curves, and observed sampling cost to choose a total query budget and allocate it across requests. It does not simply assign every request the same draft length. The excerpt is a greedy speculation teaching model; the chapter 01 CPU engine does not implement DSpark or validate that sampler.',
        },
      },
    ],
    exercise: { zh: '给两条请求各列出三个候选置信度，并限定只能验证三个草稿位置。比较平均分配与按预期有效输出分配；解释为什么只看平均接受率仍不足以预测提速。', en: 'Assign three draft confidences to each of two requests, with budget for only three draft positions. Compare equal allocation with expected-output allocation, and explain why average acceptance alone cannot predict speedup.' },
    sourcePath: 'csrc/engine/mtp_varlen.hpp',
    demo: 'speculation',
  },
  {
    id: 's10',
    title: 'Hide CPU Work',
    name: { zh: '把 CPU 工作藏进设备执行时间', en: 'Overlap CPU work with device execution' },
    summary: { zh: '读懂 ZOS 的前向、后处理、采样顺序，以及滞后一轮的状态修正。', en: 'Read ZOS forward, postprocess, and sampling order, including one-step-late state correction.' },
    insight: { zh: '异步首先是一组依赖关系：先发出可执行的工作，再在需要结果时等待。', en: 'Asynchrony starts with dependencies: launch ready work, then wait only when its result is needed.' },
    minutes: 24,
    layer: 'scheduling',
    filename: 's10_async_step.py',
    code: `# Conceptual ZOS order; GPU helpers preserve stream ordering.
previous = None

for plan in scheduler:
    metadata = prepare_inputs(plan)
    if previous is not None:
        metadata = correct_on_device(metadata, previous)
    forward = launch_forward(metadata)  # no host wait
    if previous is not None:
        wait_for(previous.sample_end)
        process_outputs(previous)
    sample = launch_sample(forward, metadata)
    current = StepState(plan, sample, record_event())
    if plan.is_prefill or not zos_enabled:
        wait_for(current.sample_end)
        process_outputs(current)
        previous = None
    else:
        previous = current

flush_if_present(previous)`,
    sections: [
      {
        heading: { zh: '串行等待会在设备时间线上留下空洞', en: 'Serial waits leave gaps on the device timeline' },
        body: {
          zh: '若每轮都等待采样回传、更新请求、重新组批，再发出下一次前向，设备会在 CPU 工作期间空等。异步调度尝试让两侧时间重叠。这里重要的不是给 Python 函数加 async，而是明确哪些数据已可用、哪些状态允许预测，以及何时才必须读取完成事件并同步。',
          en: 'If every round waits for sampling, updates requests, rebuilds a batch, and only then launches the next forward, the device sits idle during CPU work. Asynchronous scheduling tries to overlap those timelines. The important change is not adding async to a Python function; it is identifying available data, state that can be predicted, and the exact points where completion events must be read and synchronized.',
        },
      },
      {
        heading: { zh: '先发本轮前向，再处理上一轮结果', en: 'Launch this forward before processing the prior result' },
        body: {
          zh: 'DeepInfer Worker 的统一顺序是当前前向、上一轮后处理、当前采样。ZOS decode 把当前后处理保留到下一轮，从而让它与下一次前向重叠。prefill 或关闭 ZOS 时则当轮处理。最后没有下一轮可借用，必须显式 flush，否则最后一批已经生成的结果可能还没有交回请求层。',
          en: 'DeepInfer Worker follows a unified order: current forward, previous postprocess, then current sampling. ZOS decode defers its postprocess to the next round so it overlaps that round’s forward. Prefill and non-ZOS steps process results immediately. At the end, no next round exists to borrow, so an explicit flush is necessary or the final generated results may never reach the request layer.',
        },
      },
      {
        heading: { zh: '滞后的长度不能直接用于计算', en: 'Stale lengths cannot be used unchanged' },
        body: {
          zh: '上一轮尚未后处理时，CPU 上的序列长度可能落后一拍，尤其推测解码接受的 token 数还没落账。上游在设备上根据采样结果修正 q/k 长度与 token 输入，并约束前向热路径不意外同步。网页片段只表达依赖顺序，不提供线程安全、跨流事件或多进程执行的完整实现。',
          en: 'Before the previous result is postprocessed, CPU sequence lengths may lag by one step, especially when speculative acceptance counts are not yet recorded. Upstream corrects q/k lengths and token inputs on-device using sampling results, while preventing accidental synchronization in the forward hot path. This excerpt expresses dependency order, not a complete implementation of thread safety, cross-stream events, or multiprocessing.',
        },
      },
    ],
    exercise: { zh: '在纸上画三轮 CPU/GPU 时间线，标出 forward、sample、postprocess 和 flush。再假设上一轮只接受一个草稿，指出下一轮哪些元数据不能信任旧值。', en: 'Draw three rounds of CPU/GPU timelines with forward, sample, postprocess, and flush. If the previous round accepted only one draft, identify metadata that cannot safely use its old value.' },
    sourcePath: 'deepinfer/worker/worker.py',
    demo: 'batch',
  },
  {
    id: 's11',
    title: 'Route to Experts',
    name: { zh: '让 token 找到跨卡专家', en: 'Route tokens to experts across devices' },
    summary: { zh: '沿着 gate、dispatch、专家计算和 combine 走完一次 MoE。', en: 'Follow a MoE pass through gating, dispatch, expert computation, and combine.' },
    insight: { zh: 'EP 分散的是专家参数；token 必须移动到参数所在的设备。', en: 'EP distributes expert parameters; tokens must travel to the devices holding them.' },
    minutes: 24,
    layer: 'distributed',
    filename: 's11_expert_parallel.py',
    code: `# Conceptual EP flow; communication needs a real backend.
expert_ids, weights = gate.topk(hidden, experts_per_token)
physical_ids = resolve_replicas(expert_ids, replica_map)
routes = pack_routes(hidden, physical_ids, weights)

received, handle = dispatch_to_owners(routes)
local_outputs = empty_like(received.hidden)
for expert in local_experts:
    rows = received.rows_for(expert.id)
    local_outputs[rows] = expert(received.hidden[rows])

returned = combine_to_origins(local_outputs, handle)
output = zeros_like(hidden)
for route in returned:
    output[route.token] += route.weight * route.hidden

if shared_expert is not None:
    output += shared_expert(hidden)`,
    sections: [
      {
        heading: { zh: '稀疏激活不等于没有大模型参数', en: 'Sparse activation does not remove large parameter sets' },
        body: {
          zh: 'MoE 为每个 token 选择少量 routed experts，因此一次计算只激活部分参数，但整个模型仍需存放全部专家。专家并行将专家参数分散到不同设备，gate 给出逻辑专家与权重。它不同于让每张卡各自完整处理独立请求的数据并行；同一个 token 的一次 MoE 可能跨越多张设备。',
          en: 'MoE selects a small number of routed experts per token, activating only part of the parameters for that computation while the full expert set still needs storage. Expert parallelism spreads expert parameters across devices, and the gate supplies logical expert IDs and weights. Unlike data parallelism, where replicas handle independent requests, one token’s MoE computation may cross several devices.',
        },
      },
      {
        heading: { zh: '通信的两端必须能互相还原', en: 'Communication must preserve enough information to return' },
        body: {
          zh: 'dispatch 把 token 及其路由信息送往持有专家的设备，专家执行后 combine 把结果交回原始位置并按权重合并。一条 token 可被复制到多个专家，因此顺序、来源下标与权重都不能丢。真实系统还要处理不同设备 token 数不均、通信缓冲和计算重叠，通信成本也可能抵消部分稀疏计算收益。',
          en: 'Dispatch sends tokens and routing metadata to expert-owning devices; combine returns expert results to their original positions and merges weighted contributions. A token may be copied to multiple experts, so ordering, origin indices, and weights must survive. Real systems also handle uneven per-device token counts, communication buffers, and compute overlap. Communication can offset part of the benefit from sparse computation.',
        },
      },
      {
        heading: { zh: '上游的逻辑专家与物理专家', en: 'Logical and physical experts upstream' },
        body: {
          zh: 'DeepInfer 的 DeepseekMoE 对接 DeepEP dispatch/combine。模型选择 logical expert，实际路由还要映射到包含冗余副本的 physical expert，后者总数必须能按 EP 大小分配。Attention 的 DP/CP 与 MoE 的 EP 是不同职责的进程组；第一章的稠密 Qwen 不包含这些路径，跨卡正确性还要核对路由与返回顺序，并非安装依赖就能获得。',
          en: 'DeepInfer’s DeepseekMoE integrates DeepEP dispatch/combine. The model selects a logical expert, while routing resolves a physical expert that may be one of several redundant replicas. The physical-expert count must divide across the EP size. Attention DP/CP and MoE EP serve different roles; chapter 01’s dense Qwen has none of these paths. Cross-device correctness requires checking route and return ordering, rather than simply installing dependencies.',
        },
      },
    ],
    exercise: { zh: '将四个专家放到两张卡，为三个 token 各选两个专家。画出 dispatch 的消息、专家输出和 combine 的加权结果，保留每条消息的来源 token。', en: 'Place four experts on two devices and choose two experts for each of three tokens. Draw dispatch messages, expert results, and the weighted combine, retaining each message’s origin token.' },
    sourcePath: 'deepinfer/model_executor/models/v4_modules/mlp.py',
    demo: 'experts',
  },
  {
    id: 's12',
    title: 'Balance the Hot Experts',
    name: { zh: '给热点专家安排副本与位置', en: 'Place and replicate hot experts' },
    summary: { zh: '用历史 token 计数理解 EPLB，再用下一段流量检验布局。', en: 'Understand EPLB through historical token counts, then evaluate placement on the next window.' },
    insight: { zh: '整组前进的速度受最忙设备影响，平均负载好看还不够。', en: 'The busiest device limits group progress; a good average load is not enough.' },
    minutes: 25,
    layer: 'distributed',
    filename: 's12_expert_balance.py',
    code: `# Offline policy sketch, not measured GPU performance.
history, future = split_windows(expert_token_counts)
assert physical_experts % ep_size == 0
local_capacity = physical_experts // ep_size

placement, replicas, counts = rebalance_experts_global(
    history,
    num_physical_experts=physical_experts,
    num_local_physical_experts=local_capacity,
)

for name, layout in candidate_layouts(placement):
    # Equal sharing between replicas is an explicit proxy assumption.
    load = estimate_rank_tokens(future, layout)
    bottleneck = load.max(axis=-1).sum()
    imbalance = load.max(axis=-1) / load.mean(axis=-1)
    report(name, bottleneck, imbalance)

export_case(history, future, placement, policy_revision)`,
    sections: [
      {
        heading: { zh: '为什么专家数量均匀，卡仍会不均匀', en: 'Equal expert counts do not imply equal work' },
        body: {
          zh: 'gate 的选择受输入影响，不同专家收到的 token 数可能差别很大。即便每张卡放相同数量的专家，热点也可能集中在一张卡上，其他卡只能等待。EPLB 根据历史路由计数，给热点 logical expert 增加 physical 副本，并重新安排副本位置；参数副本增加同时消耗额外存储。',
          en: 'Gate decisions depend on inputs, so experts can receive very different token counts. Even with equal expert counts per device, hot experts may cluster on one device while others wait. EPLB uses historical routing counts to add physical replicas of hot logical experts and rearrange their placement. Additional parameter replicas also consume additional storage.',
        },
      },
      {
        heading: { zh: '历史窗口的互补性比总量更细', en: 'Window-level complementarity is richer than totals' },
        body: {
          zh: '上游策略先决定冗余副本，再按历史各 step 的负载向量贪心放置，目标涉及每步最忙 rank 的负载之和。两个总量相同的专家可能同时忙，也可能交替忙，放在同一张卡的效果不同。因此只按历史总数平均分组会丢失时序信息；策略中的稳定排序和同分处理也影响可复现实验。',
          en: 'The upstream policy first assigns redundant replicas, then greedily places experts using their load vectors across historical steps. Its objective involves the sum of each step’s busiest-rank load. Experts with equal totals may peak together or alternate, making their co-location behave differently. Grouping by totals alone discards that timing structure, while stable sorting and tie-breaking matter for reproducible experiments.',
        },
      },
      {
        heading: { zh: '负载改善还不是吞吐提速', en: 'Better token balance is not a measured speedup' },
        body: {
          zh: 'policy.py 的张量策略可以单独在 CPU 上研究，上游运行时还需收集计数、通信并迁移真实权重。用历史窗口优化后，应在后续窗口评估热点漂移；比较布局时保持相同副本预算。最大 token 负载只是代理指标，不能直接写成 GPU 提速百分比，还缺少通信、权重迁移和真实算子时间。',
          en: 'The tensor policy in policy.py can be studied separately on a CPU, while the upstream runtime must also gather counts, communicate, and move real weights. Optimize on a history window and evaluate a subsequent window to expose hotspot drift, keeping replica budgets identical across comparisons. Maximum token load is a proxy, not a GPU speedup percentage: communication, weight migration, and real kernel time are still missing.',
        },
      },
    ],
    exercise: { zh: '构造热点从专家 0 转移到专家 3 的两段流量。比较静态布局、随机布局和历史优化布局在后半段的负载，解释为何训练窗口上的最优布局可能不再占优。', en: 'Create two traffic windows whose hotspot moves from expert 0 to expert 3. Compare static, random, and history-optimized layouts on the second window, explaining why the best history layout can lose its advantage.' },
    sourcePath: 'deepinfer/model_executor/eplb/policy.py',
    demo: 'experts',
  },
];
