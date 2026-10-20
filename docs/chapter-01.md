# 第一章：在 CPU 上写出真正的逐 token 生成

这一章从一段文字出发，亲手完成分词、模型前向、选择下一个 token，再把 token 交回模型。默认模型是 `Qwen/Qwen2.5-0.5B-Instruct`，默认设备是 CPU，计算使用 `float32`。回答来自下载的模型权重和本仓库的计算代码。

本章的三个入口是：

- [`model.py`](../build_deepinfer/model.py)：Qwen2 的网络结构、权重加载与 KV cache。
- [`engine.py`](../build_deepinfer/engine.py)：文本输入、聊天格式与显式生成循环。
- [`cli.py`](../build_deepinfer/cli.py)：把这些步骤变成可运行的命令。

安装后，在仓库目录运行：

```bash
python -m build_deepinfer --prompt '用一句话解释 KV cache。' --max-new-tokens 48 --threads 4
```

默认模型固定到 revision `7ae557604adf67be50417f59c2c2f167def9a775`。首次运行需要下载模型文件；本地已有完整模型目录时，用 `--model /path/to/model --local-files-only` 加载。下载与加载的耗时应当和真正的生成耗时分开看。

## 1. 先画出一条完整的数据路径

```text
用户文字
  → 拼接聊天格式
  → tokenizer 编码为 token IDs
  → prefill：一次处理全部输入
  → 取最后一个位置的 logits，贪心选择一个 token
  → decode：继续预测，直到结束 token 或长度上限
  → tokenizer 将新生成的 IDs 解码为文字
```

`tokenizers` 负责文字与 IDs 的转换；`safetensors` 负责读取权重；`huggingface_hub` 负责获取文件。Transformer 层和生成循环由本仓库实现。正常推理路径不使用 Transformers 的模型类或 `generate()`；可选的 Transformers 对照只用于检查实现是否算对。

“手写”指自己组织网络、注意力计算、缓存和生成步骤。矩阵乘法、softmax 等底层运算仍由 PyTorch 执行，不需要在第一章重写 BLAS。

## 2. 为什么先加聊天格式，再做分词

Instruct 模型训练时见到的输入带有角色和消息边界。本章采用的 Qwen 基本文本对话形状如下：

```text
<|im_start|>system
You are Qwen, created by Alibaba Cloud. You are a helpful assistant.<|im_end|>
<|im_start|>user
你好<|im_end|>
<|im_start|>assistant
```

这是本章固定的 system 指令。末尾的 assistant 起始标记告诉模型：接下来应继续生成助手的内容。换行、角色名、特殊标记都会影响 token IDs；只把“你好”送进去，是另一种输入。CLI 的 `--raw` 可以关闭这层包装，直接编码原始 prompt。

这里要分清两件事：聊天模板把多条消息变成模型约定的字符串；tokenizer 再把字符串变成整数序列。`tokenizers` 库加载 tokenizer，并不意味着它会自动执行 Hugging Face tokenizer 配置中的任意 Jinja 聊天模板。本章实现的是 Qwen 基本文本对话需要的格式；应当查看 `engine.py` 中的实际拼接规则，不要把它当成支持任意模型、工具调用和多模态的模板引擎。

分词也不是“一个汉字对应一个整数”。一个词可能拆成多个 token，特殊标记也有对应 ID。比较两种推理实现时，先确认它们收到的是**同一组 token IDs**。

## 3. 一次模型前向在计算什么

设输入 IDs 的形状为 `[batch, sequence]`。本章按单条请求生成，batch 为 1。embedding 查表后得到 `[batch, sequence, hidden]`，随后依次通过各个 decoder layer。本实现只对最后一个位置做最终归一化和词表投影，返回 `[batch, 1, vocab_size]` 的 logits，因为生成下一 token 不需要其他位置的词表打分。

每个位置的 logits 是一整张词表的打分。输入的最后一个位置，预测的是**接在整个输入之后**的 token。它不是在给当前最后一个输入 token 重新命名。

Qwen2 的一层保留了几块值得逐个读懂的结构：

### RMSNorm 与残差

RMSNorm 按 hidden 维度的均方根缩放激活，再乘可学习权重：

```text
rmsnorm(x) = x / sqrt(mean(x²) + eps) × weight
```

它不会像 LayerNorm 那样先减去均值。`eps` 以及权重必须来自模型配置和 checkpoint；改变这些细节，就不再是同一个前向计算。注意力与 MLP 的输出分别加回残差，使信息能沿层间传播。

### GQA：Q 头和 KV 头数量可以不同

注意力把激活投影为 Q、K、V。Qwen2 使用 grouped-query attention：多个 query 头共享一组 K/V 头。实现中先保留较少的 KV 头，需要计算注意力时再建立与 query 头的对应关系。

这也决定了 cache 的形状：应保存模型实际的 KV 头，不能误按 query 头数量分配。是否使用 GQA、头数和每头维度，都从配置读取。

### RoPE：位置属于 Q/K 的计算

RoPE 按 token 的绝对位置旋转 Q 与 K。prefill 从位置 0 开始；已有 `P` 个缓存 token 后，新输入的位置从 `P` 开始。

decode 虽然只输入一个 token，它的位置也不是每轮都回到 0。缓存中的 K 已经带有对应的位置旋转；读取时不应再把旧 K 按新位置旋转一次。检查实现时，还要确认旋转维度的配对方式与 Qwen2 一致，不能把不同 RoPE 变体随意互换。

### 因果注意力：只能看自己和前面的输入

对每个 query，计算缩放后的 QK 分数、遮住未来位置，再经 softmax 加权 V：

```text
attention(Q, K, V) = softmax(QKᵀ / sqrt(head_dim) + causal_mask) V
```

带缓存时，query 与 key 的长度往往不一样。若过去已有 `past_len` 个 token，本次第 `i` 个 query 能看到的 key 下标应满足：

```text
key_index <= past_len + i
```

因此不能只根据本次 query 长度构造一个从位置 0 开始的三角形，再假设它适用于所有缓存形状。

### SwiGLU：稠密的前馈网络

MLP 的两路上投影分别经过门控与相乘，再投影回 hidden 维：

```text
mlp(x) = down_proj(silu(gate_proj(x)) × up_proj(x))
```

本章的 Qwen2.5-0.5B 是稠密模型，每个 token 都经过相同的 MLP。这里没有专家路由、专家并行或 EPLB。

## 4. Prefill 也会产生第一个输出 token

假设 prompt 分成了 `P` 个 token。prefill 一次把这 `P` 个 token 送入模型，并为每层建立历史 K/V。模型返回最后一个输入位置的 logits，我们从中选择第一个输出 token。

本章使用贪心选择：

```text
next_token = argmax(last_position_logits)
```

不必先计算 softmax 再找最大值，因为 softmax 不会改变最大值所在的位置。贪心生成也没有 temperature、top-k 或 top-p 抽样；这让第一章能集中验证“前向与循环是否正确”。

## 5. Decode 循环只有几步，顺序很重要

下面是对应 `engine.py` 主流程的伪代码，省略了张量维度、计时和结果封装；`cache` 是否启用决定每次送入哪些 IDs。

```python
prompt_ids = encode(format_chat(user_text))
all_ids = prompt_ids
cache = new_cache() if use_cache else None
step_input = prompt_ids
generated = []

for _ in range(max_new_tokens):
    logits = model(step_input, cache=cache)
    next_id = argmax(logits_at_last_position(logits))
    generated.append(next_id)
    if next_id in eos_token_ids:
        break

    all_ids = concat(all_ids, next_id)
    step_input = [next_id] if use_cache else all_ids

answer = decode(generated, skip_special_tokens=True)
```

第一轮是 prefill；之后的每轮才是 decode。带 cache 时，历史上下文留在每层 K/V 中，模型只需要接收刚选出的一个 token。关闭 cache 时，每轮都把 prompt 加上已经生成的内容重新计算。

“刚生成”与“已进入 cache”也有一拍之差：选择一个新 token 时，它还没有作为输入经过模型；下一次前向才为它计算并存入 K/V。如果一共选择了 `G` 个 token、没有提前结束，通常是一次 prefill 加 `G - 1` 次 decode 前向。最后选出的 token 不一定进入 cache，因为生成已经结束。

结束 token 的 ID 与可见文字是两回事。引擎应按模型的结束标记停止；解码时跳过特殊 token，避免把消息边界当作回答打印。长度上限以**新生成 token 数**计，不是汉字数。

## 6. Cache 省掉了什么，又增加了什么

假设输入长度是 `P`，下面列出各轮进入模型的新输入长度：

| 前向轮次 | 开启 KV cache | 关闭 KV cache |
| --- | --- | --- |
| 第 1 轮，prefill | `P` | `P` |
| 第 2 轮 | `1` | `P + 1` |
| 第 3 轮 | `1` | `P + 2` |
| 后续 | 每轮 `1` | 继续增长 |

cache 保存的是每层历史 token 的 K/V，省去历史位置反复经过投影和网络的计算。新 query 仍然要访问历史 K/V，cache 也会随上下文增长占用内存。它不会让 attention 的历史读取成本消失。

第一章采用易读的缓存数据结构。它能讲清状态如何跨前向保留；生产系统还要解决预分配、分页、回收、多请求共享与并发等问题。不要用本章缓存的实现成本推断 DeepInfer 的性能。

比较开关前后，先验证生成内容或 token IDs，再比较时间。数学上两条路径应表达同一组因果依赖；浮点计算顺序可能有差异，logits 的数值检查应使用合理容差。如果很接近的候选被舍入误差换了顺序，后续贪心文本也可能分叉，因此仅凭最终文字不同还不能定位问题。

## 7. 用三个检查理解这条路径

**检查一：分清 tokenizer 与模型。** 换一个短 prompt，观察输入 token 数与输出 token 数。确认系统消息、用户消息和 assistant 起始边界都在 prefill 输入中；输出只解码新生成部分。

**检查二：对照 cache 开关。** 固定模型、prompt 和最大生成长度，给同一条命令添加 `--no-cache` 再运行。先核对 token IDs 与停止原因。`--json result.json` 可保存结构化结果。要看性能时，排除首次下载和权重加载，保留机器、线程数、实际输出长度和计时范围；不要拿两次长度不同的整段耗时直接相除。

**检查三：对照参考前向。** 安装可选开发依赖后，运行 `python scripts/validate_reference.py`，把同一 checkpoint、同一输入 IDs 交给 Transformers 的 Qwen2 实现，比较 prefill logits，再比较带 past K/V 的单 token logits。脚本默认只读取本地文件，允许下载时需显式添加 `--allow-download`。这是在验证本仓库的计算；日常生成仍经过这里的 `model.py` 与显式循环。

发现不一致时，按这个顺序排查：输入 IDs、权重名与形状、RMSNorm、RoPE 位置、GQA 头对应、causal mask、cache 更新。先在短输入上找出第一个不一致的位置，比反复观察一长段回答更容易找到原因。

## 8. 现在回到 DeepInfer

读到这里，你已经掌握了理解推理引擎所需的一条真实主链：请求变成 tokens，prefill 建立状态，decode 使用状态逐步生成，引擎决定何时继续和何时停止。

DeepInfer 把这条主链扩展到 DeepSeek-V4.1-Flash、多请求调度、专用算子和分布式执行。本章使用 Qwen2.5 稠密小模型，是为了让同一条基本数据路径能在普通 CPU 上被完整读懂和运行。两者的 attention 结构、权重格式、cache 布局与执行系统都有实质差异。

继续阅读 [源码地图](source-map.md)，把本章每个职责对应到固定版本的上游入口。那些链接用于帮助理解生产引擎的职责边界；本仓库不因此获得运行 DeepSeek-V4.1、兼容 DeepInfer API 或复现其性能的能力。
