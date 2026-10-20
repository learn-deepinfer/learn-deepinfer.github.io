import { useEffect, useState } from 'react';
import './InferenceLab.css';

type Mode = 'loop' | 'cache' | 'static-batch' | 'batch' | 'speculation' | 'experts';
type Locale = 'zh' | 'en';
type Props = { mode?: Mode; locale?: Locale; compact?: boolean };

const finalStep: Record<Mode, number> = { loop: 6, cache: 5, 'static-batch': 7, batch: 5, speculation: 3, experts: 3 };
const modeTitles: Record<Mode, [string, string]> = {
  loop: ['一次请求，逐步展开', 'One request, step by step'],
  cache: ['把计算结果留给下一步', 'Keep the work for the next step'],
  'static-batch': ['固定一批成员，等待全部完成', 'A fixed batch waits for every request'],
  batch: ['一个位置，接住下一条请求', 'An open slot takes the next request'],
  speculation: ['先提出，再一起验证', 'Draft first. Verify together.'],
  experts: ['同一个专家，更多物理副本', 'One expert. More physical replicas.'],
};

function Icon({ name }: { name: 'play' | 'pause' | 'step' | 'reset' | 'arrow' }) {
  if (name === 'play') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'pause') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10" strokeWidth="2.5" /></svg>;
  if (name === 'reset') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8a6.2 6.2 0 1 1 .7 6M4 3v5h5" /></svg>;
  if (name === 'step') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 7 5-7 5ZM15 5v10" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>;
}

function Token({ children, state = 'default' }: { children: React.ReactNode; state?: string }) {
  return <span className={`il-token il-token--${state}`}>{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="il-note"><span aria-hidden="true">↳</span>{children}</p>;
}

function LoopView({ step, locale, compact }: { step: number; locale: Locale; compact: boolean }) {
  const zh = locale === 'zh';
  const tokens = ['41', '872', '330'];
  const generated = ['19', '760', '12'];
  const count = step >= 6 ? 3 : step >= 4 ? 2 : step >= 2 ? 1 : 0;
  const cacheLength = step === 0 ? 0 : step <= 2 ? 3 : step <= 4 ? 4 : 5;
  const active = step === 0 ? 0 : step === 1 ? 1 : step % 2 === 0 ? 2 : 3;
  const stages = zh ? ['输入', 'Prefill', '采样', 'Decode'] : ['Input', 'Prefill', 'Sample', 'Decode'];
  const descriptions = zh ? [
    '输入已分词，等待进入引擎。',
    'Prefill 同时处理 3 个输入位置，并保存它们的 K/V。',
    '从最后一个位置的 logits 中，选出下一个 token。',
    '只计算刚加入的 token；已有 K/V 直接复用。',
    '再次采样。新 token 尚未写入 K/V，下一次前向才会处理它。',
    '继续 Decode，K/V 历史从 4 个位置增长到 5 个。',
    '得到第三个预设输出 token。本次演示到此结束。',
  ] : [
    'The input is tokenized and ready for the engine.',
    'Prefill processes all 3 input positions and saves their K/V.',
    'Sample the next token from the final position’s logits.',
    'Compute only the new token and reuse the previous K/V.',
    'Sample again. The new token enters the cache on the next forward pass.',
    'Decode continues. The cached history grows from 4 positions to 5.',
    'The third preset output token is selected. This example is complete.',
  ];
  return <>
    <div className="il-flow" aria-label={zh ? '推理阶段' : 'Inference stages'}>
      {stages.map((stage, index) => <div key={stage} className={`il-stage ${active === index ? 'is-active' : ''}`}>
        <span className="il-stage-num">0{index + 1}</span><span>{stage}</span>
        {index < stages.length - 1 && <span className="il-stage-arrow"><Icon name="arrow" /></span>}
      </div>)}
    </div>
    <div className="il-sequence-panel">
      <div className="il-row-label"><span>{zh ? '预设 token 序列' : 'Preset token sequence'}</span><span className="il-tiny">{zh ? '示意 ID' : 'Illustrative IDs'}</span></div>
      <div className="il-token-stream">
        {tokens.map(token => <Token key={token} state="input">{token}</Token>)}
        <span className="il-stream-divider" aria-hidden="true" />
        {generated.map((token, index) => <Token key={token} state={index < count ? 'new' : 'empty'}>{index < count ? token : '·'}</Token>)}
        <span className="il-cursor" aria-hidden="true" />
      </div>
      <div className="il-stream-caption"><span>{zh ? '输入 · 3 tokens' : 'Input · 3 tokens'}</span><span>{zh ? `已选出 · ${count} tokens` : `Selected · ${count} tokens`}</span></div>
    </div>
    {!compact && <div className="il-cache-panel">
      <div className="il-row-label"><span>KV cache</span><span className="il-cache-count">{cacheLength}<span> / 5 {zh ? '位置' : 'positions'}</span></span></div>
      {['K', 'V'].map(kind => <div className="il-cache-row" key={kind}>
        <span className="il-cache-kind">{kind}</span>
        {Array.from({ length: 5 }, (_, index) => <span className={`il-cache-cell ${index < cacheLength ? index < 3 ? 'is-stored' : 'is-added' : ''}`} key={index}>{index < cacheLength ? index + 1 : '–'}</span>)}
        <span className="il-tiny">{zh ? '每层' : 'per layer'}</span>
      </div>)}
    </div>}
    <p className="il-explanation" aria-live="polite">{descriptions[step]}</p>
    {compact && <span className="il-inline-cache">KV cache <b>{cacheLength}</b> {zh ? '个位置' : 'positions'}</span>}
  </>;
}

function CacheView({ step, locale }: { step: number; locale: Locale }) {
  const zh = locale === 'zh';
  const length = 3 + step;
  return <>
    <div className="il-compare-header"><span>{zh ? '观察：每一步要重新投影多少个位置？' : 'How many positions are projected on each step?'}</span><span className="il-tiny">{length} {zh ? '个历史位置' : 'history positions'}</span></div>
    <div className="il-comparison">
      {[false, true].map(reuse => <div className={`il-comparison-card ${reuse ? 'is-efficient' : ''}`} key={String(reuse)}>
        <div className="il-row-label"><strong>{reuse ? 'KV cache' : zh ? '完整重算' : 'Full recompute'}</strong><span className="il-tiny">{reuse ? zh ? '保留历史 K/V' : 'Keep history K/V' : zh ? '不保留历史' : 'No saved history'}</span></div>
        <div className="il-compute-grid">{Array.from({ length: 8 }, (_, index) => {
          const visible = index < length;
          const cached = reuse && step > 0 && index < length - 1;
          return <span key={index} className={`il-compute-cell ${visible ? cached ? 'is-reused' : 'is-computed' : ''}`}>{visible ? index + 1 : '·'}{visible && <small>{cached ? zh ? '复用' : 'reuse' : zh ? '计算' : 'calc'}</small>}</span>;
        })}</div>
        <div className="il-compute-metric"><b>{reuse && step > 0 ? 1 : length}</b><span>{zh ? '本步计算的位置' : 'positions computed this step'}</span></div>
      </div>)}
    </div>
    <Note>{zh ? '复用省下的是历史 K/V 的重复投影。注意力仍需读取可见的历史 K/V；这里不代表实测加速比。' : 'Reuse avoids projecting previous K/V again. Attention still reads visible history. This is not a measured speedup.'}</Note>
  </>;
}

type Request = { id: string; current: number; total: number };
type BatchFrame = { slots: (Request | null)[]; queue: string[]; done: string[] };
const staticBatchFrames: BatchFrame[] = [
  { slots: [{ id: 'A', current: 1, total: 4 }, { id: 'B', current: 1, total: 2 }, { id: 'C', current: 1, total: 3 }], queue: ['D', 'E'], done: [] },
  { slots: [{ id: 'A', current: 2, total: 4 }, { id: 'B', current: 2, total: 2 }, { id: 'C', current: 2, total: 3 }], queue: ['D', 'E'], done: [] },
  { slots: [{ id: 'A', current: 3, total: 4 }, { id: 'B', current: 2, total: 2 }, { id: 'C', current: 3, total: 3 }], queue: ['D', 'E'], done: [] },
  { slots: [{ id: 'A', current: 4, total: 4 }, { id: 'B', current: 2, total: 2 }, { id: 'C', current: 3, total: 3 }], queue: ['D', 'E'], done: [] },
  { slots: [{ id: 'D', current: 1, total: 3 }, { id: 'E', current: 1, total: 2 }, null], queue: [], done: ['A', 'B', 'C'] },
  { slots: [{ id: 'D', current: 2, total: 3 }, { id: 'E', current: 2, total: 2 }, null], queue: [], done: ['A', 'B', 'C'] },
  { slots: [{ id: 'D', current: 3, total: 3 }, { id: 'E', current: 2, total: 2 }, null], queue: [], done: ['A', 'B', 'C'] },
  { slots: [null, null, null], queue: [], done: ['A', 'B', 'C', 'D', 'E'] },
];
const continuousBatchFrames: BatchFrame[] = [
  { slots: [{ id: 'A', current: 1, total: 4 }, { id: 'B', current: 1, total: 2 }, { id: 'C', current: 1, total: 3 }], queue: ['D', 'E'], done: [] },
  { slots: [{ id: 'A', current: 2, total: 4 }, { id: 'B', current: 2, total: 2 }, { id: 'C', current: 2, total: 3 }], queue: ['D', 'E'], done: [] },
  { slots: [{ id: 'A', current: 3, total: 4 }, { id: 'D', current: 1, total: 3 }, { id: 'C', current: 3, total: 3 }], queue: ['E'], done: ['B'] },
  { slots: [{ id: 'A', current: 4, total: 4 }, { id: 'D', current: 2, total: 3 }, { id: 'E', current: 1, total: 2 }], queue: [], done: ['B', 'C'] },
  { slots: [null, { id: 'D', current: 3, total: 3 }, { id: 'E', current: 2, total: 2 }], queue: [], done: ['B', 'C', 'A'] },
  { slots: [null, null, null], queue: [], done: ['B', 'C', 'A', 'D', 'E'] },
];

function BatchView({ step, locale, staticBatch = false }: { step: number; locale: Locale; staticBatch?: boolean }) {
  const zh = locale === 'zh';
  const frame = (staticBatch ? staticBatchFrames : continuousBatchFrames)[step];
  const staticDescriptions = zh ? [
    'A、B、C 固定组成第一批。D、E 等待，不能中途加入。请求长度是预设示例。',
    'B 已完成，停止增加输出，但仍保留固定行；D 继续等待整批结束。',
    'B、C 均已完成，只有 A 继续生成。空出的计算能力不能接收 D 或 E。',
    'A 最后完成，第一批全部结束。下一步才能整体退出并开始下一批。',
    '第一批整体退出；D、E 一起进入第二批。成员只在整批边界改变。',
    'E 已完成并停止生成，D 继续；此时仍不会向第二批补入新成员。',
    'D 最后完成，第二批全部结束，下一步整体退出。',
    '两批均已结束。短请求提前完成时，静态 batch 仍要等这一批的最长请求。',
  ] : [
    'A, B, and C form the fixed first batch. D and E wait and cannot join midway. Request lengths are preset.',
    'B has finished and stops generating, but its fixed row is held. D still waits for the whole batch.',
    'B and C have finished; only A continues. Their unused compute cannot take D or E yet.',
    'A finishes last, completing the first batch. It can leave and admit the next group on the next step.',
    'The entire first batch leaves. D and E enter together as the second batch; membership changes only at batch boundaries.',
    'E has finished and stops generating while D continues. No new member can enter the second batch midway.',
    'D finishes last, completing the second batch. The whole group leaves on the next step.',
    'Both batches are complete. When a short request finishes, a static batch still waits for its longest member.',
  ];
  return <>
    {staticBatch && <div className="il-batch-policy"><span>STATIC BATCH</span><strong>{step === 7 ? zh ? '两批已结束' : 'Both batches finished' : zh ? `第 ${step < 4 ? '1' : '2'} 批 · 固定成员` : `Batch ${step < 4 ? '1' : '2'} · fixed members`}</strong></div>}
    <div className="il-batch-top"><span>{zh ? '等待队列' : 'Waiting queue'}</span><div>{frame.queue.length ? frame.queue.map(id => <Token key={id}>req {id}</Token>) : <span className="il-tiny">{zh ? '队列已清空' : 'Queue is empty'}</span>}</div></div>
    <div className="il-slot-grid">{frame.slots.map((request, index) => <div className={`il-slot ${request ? `il-request-${request.id.toLowerCase()}` : 'is-vacant'} ${staticBatch && request && request.current === request.total ? 'is-held' : ''}`} key={index}>
      <span className="il-slot-label">SLOT 0{index + 1}</span>
      {request ? <><div className="il-request-title">{zh ? '请求' : 'Request'} <b>{request.id}</b><span className="il-request-state">{request.current === request.total ? staticBatch ? zh ? '完成·等待整批' : 'done · held' : zh ? '完成' : 'done' : zh ? '运行中' : 'running'}</span></div>
        <div className="il-request-steps">{Array.from({ length: request.total }, (_, j) => <span key={j} className={j < request.current ? 'is-filled' : ''} />)}</div><span className="il-tiny">{request.current} / {request.total} {zh ? '步' : 'steps'}</span></> : <div className="il-vacant-mark">{staticBatch ? '—' : '+'}<span>{staticBatch ? frame.slots.some(Boolean) ? zh ? '本批不补入新请求' : 'No mid-batch admission' : zh ? '批次已结束' : 'Batch finished' : zh ? '等待下一条请求' : 'Ready for a request'}</span></div>}
    </div>)}</div>
    <div className="il-completed"><span>{zh ? '已离开 batch' : 'Left the batch'}</span><div>{frame.done.length ? frame.done.map(id => <span key={id} className="il-completed-request">✓ {id}</span>) : <span className="il-tiny">—</span>}</div></div>
    <Note>{staticBatch ? staticDescriptions[step] : zh ? '每一步都重新组织 batch。B 完成后 D 即可进入，无需等待 A 与 C。请求长度是预设示例。' : 'The batch is rebuilt each step. D can enter after B finishes, while A and C continue. Request lengths are preset.'}</Note>
  </>;
}

function SpeculationView({ step, locale }: { step: number; locale: Locale }) {
  const zh = locale === 'zh';
  const drafts = ['61', '240', '17', '820'];
  return <>
    <div className="il-spec-row"><div className="il-spec-label"><b>01</b><span>{zh ? 'Draft 提案' : 'Draft proposal'}</span></div><div className="il-draft-tokens">{drafts.map((token, index) => <div className="il-draft-item" key={token}>
      <Token state={step === 0 ? 'empty' : step < 2 ? 'draft' : index < 2 ? 'accepted' : index === 2 ? 'rejected' : 'skipped'}>{step === 0 ? '·' : token}</Token>
      <small>{step < 2 ? `d${index + 1}` : index < 2 ? zh ? '接受' : 'accept' : index === 2 ? zh ? '拒绝' : 'reject' : zh ? '丢弃' : 'discard'}</small>
    </div>)}</div></div>
    <div className={`il-verifier ${step >= 2 ? 'is-active' : ''}`}><span className="il-verifier-icon">✓</span><div><strong>{zh ? '目标模型联合验证' : 'Target model verification'}</strong><p>{step < 2 ? zh ? '等待提案后，进行一次验证前向' : 'One verification pass after drafting' : zh ? '前 2 个通过；第 3 个拒绝，后续作废' : 'Accept 2; reject the 3rd and discard the rest'}</p></div><span className="il-tiny">{step >= 2 ? '2 / 4' : '—'}</span></div>
    <div className="il-spec-row il-commit-row"><div className="il-spec-label"><b>02</b><span>{zh ? '提交结果' : 'Committed result'}</span></div><div className="il-draft-tokens">{['61', '240', '909'].map((token, index) => <div className="il-draft-item" key={token}><Token state={step === 3 ? index < 2 ? 'accepted' : 'new' : 'empty'}>{step === 3 ? token : '·'}</Token><small>{index < 2 ? zh ? '接受的提案' : 'accepted draft' : zh ? '目标模型补采样' : 'target resample'}</small></div>)}</div></div>
    <Note>{zh ? '预设的拒绝采样路径。验证接受率依赖模型与请求，不能从这组示例推导吞吐提升。' : 'A preset rejection-sampling path. Acceptance depends on the model and workload; this example does not predict throughput.'}</Note>
  </>;
}

const logicalExperts = [0, 0, 0, 0, 1, 2, 2, 3];
function ExpertsView({ step, locale }: { step: number; locale: Locale }) {
  const zh = locale === 'zh';
  const counts = step === 0 ? [0, 0, 0, 0] : step < 3 ? [4, 1, 2, 1] : [2, 1, 2, 3];
  const descriptions = zh ? ['8 个 token，逻辑专家选择已确定。', 'E0 热点集中在 rank 0，其他 rank 仍有空闲。', '把 E0 的权重副本放入 rank 3 的空闲专家槽。', 'E0 请求在两个副本间分流；逻辑专家选择保持一致。'] : ['8 tokens have fixed logical expert choices.', 'E0 traffic is concentrated on rank 0.', 'Copy E0 weights into a free expert slot on rank 3.', 'Split E0 traffic between replicas. Logical expert choices stay the same.'];
  return <>
    <div className="il-expert-tokens">{logicalExperts.map((expert, index) => <span key={index} className={`il-routed-token ${expert === 0 ? 'is-hot' : ''}`}><b>t{index + 1}</b><small>E{expert}</small>{step > 0 && <span>r{step === 3 && expert === 0 && index > 1 ? 3 : expert}</span>}</span>)}</div>
    <div className="il-routing-rule"><span className="il-routing-line" /><span>{step >= 2 ? zh ? '逻辑专家不变 · 调整物理副本' : 'Same logical experts · different replicas' : zh ? '按专家路由到物理 rank' : 'Route experts to physical ranks'}</span><span className="il-routing-line" /></div>
    <div className="il-experts-grid">{counts.map((count, rank) => <div className={`il-expert-card ${rank === 0 && step === 1 ? 'is-busy' : ''} ${rank === 3 && step >= 2 ? 'has-replica' : ''}`} key={rank}>
      <div className="il-row-label"><span>rank {rank}</span><b>{count}<small> tokens</small></b></div>
      <div className="il-expert-inventory"><span>E{rank}</span>{rank === 3 && step >= 2 ? <span className="il-replica">E0 <small>{zh ? '副本' : 'replica'}</small></span> : <span className="il-free-slot">+</span>}</div>
      <div className="il-load-track">{Array.from({ length: 4 }, (_, index) => <span key={index} className={index < count ? 'is-loaded' : ''} />)}</div>
    </div>)}</div>
    <p className="il-explanation" aria-live="polite">{descriptions[step]}</p>
    <Note>{zh ? '简化的 EPLB 机制：假设有空闲专家槽，省略权重搬移与通信开销；不是性能基准。' : 'Simplified EPLB with spare expert slots. Weight transfer and communication costs are omitted. Not a performance benchmark.'}</Note>
  </>;
}

export function InferenceLab({ mode = 'loop', locale = 'zh', compact = false }: Props) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const zh = locale === 'zh';
  const maxStep = finalStep[mode];

  useEffect(() => { setStep(0); setPlaying(false); }, [mode]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStep(previous => Math.min(previous + 1, maxStep)), 1700);
    return () => window.clearInterval(timer);
  }, [playing, maxStep]);
  useEffect(() => { if (step >= maxStep) setPlaying(false); }, [step, maxStep]);

  function togglePlay() {
    if (!playing && step >= maxStep) setStep(0);
    setPlaying(previous => !previous);
  }

  const displayedStep = Math.min(step, maxStep);
  return <section className={`inference-lab ${compact ? 'inference-lab--compact' : ''}`} aria-label={`${modeTitles[mode][zh ? 0 : 1]} ${zh ? '交互机制演示' : 'interactive mechanism demonstration'}`}>
    <div className="il-header"><span className="il-demo-label"><span />{zh ? '机制演示 · 无需加载模型' : 'Mechanism demo · no model required'}</span><span className="il-step-counter">{String(displayedStep + 1).padStart(2, '0')}<span> / {String(maxStep + 1).padStart(2, '0')}</span></span></div>
    <div className="il-title-row"><h3>{modeTitles[mode][zh ? 0 : 1]}</h3><span className="il-code-label">{mode === 'loop' ? 'engine.step()' : mode === 'cache' ? 'cache.append()' : mode === 'static-batch' ? 'batch.run_until_done()' : mode === 'batch' ? 'scheduler.step()' : mode === 'speculation' ? 'draft → verify' : 'expert.rebalance()'}</span></div>
    <div className="il-content">
      {mode === 'loop' && <LoopView step={displayedStep} locale={locale} compact={compact} />}
      {mode === 'cache' && <CacheView step={displayedStep} locale={locale} />}
      {mode === 'static-batch' && <BatchView step={displayedStep} locale={locale} staticBatch />}
      {mode === 'batch' && <BatchView step={displayedStep} locale={locale} />}
      {mode === 'speculation' && <SpeculationView step={displayedStep} locale={locale} />}
      {mode === 'experts' && <ExpertsView step={displayedStep} locale={locale} />}
    </div>
    <div className="il-controls">
      <button type="button" className="il-play-button" onClick={togglePlay} aria-label={playing ? zh ? '暂停演示' : 'Pause demo' : displayedStep === maxStep ? zh ? '重新播放演示' : 'Replay demo' : zh ? '播放演示' : 'Play demo'} aria-pressed={playing}><Icon name={playing ? 'pause' : 'play'} /><span>{playing ? zh ? '暂停' : 'Pause' : displayedStep === maxStep ? zh ? '重播' : 'Replay' : zh ? '播放' : 'Play'}</span></button>
      <input className="il-scrubber" type="range" min={0} max={maxStep} value={displayedStep} aria-label={zh ? '演示步骤' : 'Demo step'} aria-valuetext={`${displayedStep + 1} / ${maxStep + 1}`} onChange={event => { setPlaying(false); setStep(Number(event.target.value)); }} />
      <button type="button" className="il-icon-button" onClick={() => { setPlaying(false); setStep(previous => Math.min(previous + 1, maxStep)); }} disabled={displayedStep === maxStep} aria-label={zh ? '下一步' : 'Next step'} title={zh ? '下一步' : 'Next step'}><Icon name="step" /></button>
      <button type="button" className="il-icon-button" onClick={() => { setPlaying(false); setStep(0); }} aria-label={zh ? '重置演示' : 'Reset demo'} title={zh ? '重置演示' : 'Reset demo'}><Icon name="reset" /></button>
    </div>
  </section>;
}
