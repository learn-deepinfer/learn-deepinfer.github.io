import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

function Token({ children, state = 'default', motionKey }: { children: React.ReactNode; state?: string; motionKey?: string }) {
  return <span className={`il-token il-token--${state}`} data-motion-key={motionKey} data-motion-state={state}>{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="il-note"><span aria-hidden="true">↳</span>{children}</p>;
}

type MotionSnapshot = { bounds: DOMRect; state?: string };

// Follow the same object between preset states instead of flashing the panel.
// Capture before changing the step so scrubbing can interrupt an in-flight move.
function useMechanismMotion(mode: Mode, locale: Locale, step: number) {
  const rootRef = useRef<HTMLElement>(null);
  const previous = useRef(new Map<string, MotionSnapshot>());
  const animations = useRef<Animation[]>([]);
  const scope = useRef(`${mode}:${locale}`);

  const capture = useCallback(() => {
    const snapshot = new Map<string, MotionSnapshot>();
    rootRef.current?.querySelectorAll<HTMLElement>('[data-motion-key]').forEach(node => {
      snapshot.set(node.dataset.motionKey!, { bounds: node.getBoundingClientRect(), state: node.dataset.motionState });
    });
    previous.current = snapshot;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    const sameScope = scope.current === `${mode}:${locale}`;
    scope.current = `${mode}:${locale}`;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const snapshot = new Map<string, MotionSnapshot>();
    root.querySelectorAll<HTMLElement>('[data-motion-key]').forEach(node => {
      const key = node.dataset.motionKey!;
      const bounds = node.getBoundingClientRect();
      snapshot.set(key, { bounds, state: node.dataset.motionState });
      if (!sameScope || reduced || typeof node.animate !== 'function') return;
      const origin = previous.current.get(key) ?? previous.current.get(node.dataset.motionFrom ?? '');
      if (!origin) return;
      const x = origin.bounds.left - bounds.left;
      const y = origin.bounds.top - bounds.top;
      const moved = Math.abs(x) + Math.abs(y) > 1;
      if (!moved && origin.state === node.dataset.motionState) return;
      animations.current.push(node.animate(
        moved
          ? [{ transform: `translate(${x}px, ${y}px)`, opacity: .72 }, { transform: 'translate(0, 0)', opacity: 1 }]
          : [{ transform: 'translateY(5px)', opacity: .6 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: moved ? 620 : 280, easing: 'cubic-bezier(.2,.75,.2,1)' },
      ));
    });
    previous.current = snapshot;
  }, [mode, locale, step]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => { if (preference.matches) animations.current.forEach(animation => animation.cancel()); };
    preference.addEventListener('change', cancel);
    return () => {
      preference.removeEventListener('change', cancel);
      animations.current.forEach(animation => animation.cancel());
    };
  }, []);
  return { rootRef, capture };
}

function LoopView({ step, locale, compact }: { step: number; locale: Locale; compact: boolean }) {
  const zh = locale === 'zh';
  const tokens = ['41', '872', '330'];
  const generated = ['19', '760'];
  const count = step >= 5 ? 2 : step >= 2 ? 1 : 0;
  const cacheLength = step === 0 ? 0 : step >= 4 ? 4 : 3;
  const active = step === 0 ? 0 : step === 1 || step === 4 ? 1 : step === 2 || step === 5 ? 2 : 3;
  const stages = zh ? ['输入准备', '模型执行', '采样', '后处理'] : ['Prepare', 'Execute', 'Sample', 'Commit'];
  const descriptions = zh ? [
    '输入准备：预设的 token IDs 已进入请求状态，等待计划执行。',
    '模型执行：本轮处理 3 个输入位置，并保存对应 K/V。',
    '采样：示例选择 ID 19。选出的 token 尚未进入 K/V。',
    '后处理：提交采样结果，更新请求长度与结束状态，再交回调度器。',
    '下一轮模型执行：处理刚加入的 token，K/V 历史增长到 4 个位置。',
    '再次采样：示例选择 ID 760，等待后处理提交。',
    '请求状态再次推进。未结束的请求继续下一轮；异步后处理可以延后执行。',
  ] : [
    'Prepare: preset token IDs are in request state, waiting for an execution plan.',
    'Model execution: process the 3 input positions and store their K/V.',
    'Sample: the preset choice is ID 19. The selected token is not cached yet.',
    'Postprocess: commit the selection, update request length and stop state, then return to scheduling.',
    'Next model execution: process the new token and grow the cached history to 4 positions.',
    'Sample again: preset ID 760 waits for postprocessing.',
    'Request state advances again. Unfinished work continues; asynchronous postprocessing may be deferred.',
  ];
  return <>
    <div className="il-flow" aria-label={zh ? '执行阶段' : 'Execution stages'}>
      {stages.map((stage, index) => <div key={stage} className={`il-stage ${active === index ? 'is-active' : ''}`}>
        <span className="il-stage-num">0{index + 1}</span><span>{stage}</span>
        {active === index && <span className="il-stage-indicator" data-motion-key="execution-phase" aria-hidden="true" />}
        {index < stages.length - 1 && <span className="il-stage-arrow"><Icon name="arrow" /></span>}
      </div>)}
    </div>
    <div className="il-sequence-panel">
      <div className="il-row-label"><span>{zh ? '预设 token 序列' : 'Preset token sequence'}</span><span className="il-tiny">{zh ? '示意 ID' : 'Illustrative IDs'}</span></div>
      <div className="il-token-stream">
        {tokens.map(token => <Token key={token} state="input">{token}</Token>)}
        <span className="il-stream-divider" aria-hidden="true" />
        {generated.map((token, index) => <Token key={token} motionKey={`selected-${token}`} state={index < count ? 'new' : 'empty'}>{index < count ? token : '·'}</Token>)}
        <span className="il-cursor" aria-hidden="true" />
      </div>
      <div className="il-stream-caption"><span>{zh ? '输入 · 3 tokens' : 'Input · 3 tokens'}</span><span>{zh ? `已选出 · ${count} tokens` : `Selected · ${count} tokens`}</span></div>
    </div>
    {!compact && <div className="il-cache-panel">
      <div className="il-row-label"><span>KV cache</span><span className="il-cache-count">{cacheLength}<span> / 4 {zh ? '位置' : 'positions'}</span></span></div>
      {['K', 'V'].map(kind => <div className="il-cache-row" key={kind}>
        <span className="il-cache-kind">{kind}</span>
        {Array.from({ length: 4 }, (_, index) => <span className={`il-cache-cell ${index < cacheLength ? index < 3 ? 'is-stored' : 'is-added' : ''}`} key={index} data-motion-key={`cache-${kind}-${index}`} data-motion-state={index < cacheLength ? 'stored' : 'empty'}>{index < cacheLength ? index + 1 : '–'}</span>)}
        <span className="il-tiny">{zh ? '每层' : 'per layer'}</span>
      </div>)}
    </div>}
    <p className="il-explanation" key={step} aria-live="polite">{descriptions[step]}</p>
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
          return <span key={index} className={`il-compute-cell ${visible ? cached ? 'is-reused' : 'is-computed' : ''}`} data-motion-key={`projection-${reuse}-${index}`} data-motion-state={visible ? cached ? 'reused' : 'computed' : 'empty'}>{visible ? index + 1 : '·'}{visible && <small>{cached ? zh ? '复用' : 'reuse' : zh ? '计算' : 'calc'}</small>}</span>;
        })}</div>
        <div className="il-compute-metric"><b>{reuse && step > 0 ? 1 : length}</b><span>{zh ? '本步计算的位置' : 'positions computed this step'}</span></div>
      </div>)}
    </div>
    <Note>{zh ? '色块表示预设的计算与复用位置。缓存避免重复投影历史 K/V，注意力仍需读取可见历史。' : 'Cells show preset compute and reuse states. Caching avoids repeated K/V projection; attention still reads visible history.'}</Note>
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
    'B、C 均已完成，只有 A 继续推进。空出的计算位置不能接收 D 或 E。',
    'A 最后完成，第一批全部结束。下一步才能整体退出并开始下一批。',
    '第一批整体退出；D、E 一起进入第二批。成员只在整批边界改变。',
    'E 已完成并停止推进，D 继续；此时仍不会向第二批补入新成员。',
    'D 最后完成，第二批全部结束，下一步整体退出。',
    '两批均已结束。短请求提前完成时，静态 batch 仍要等这一批的最长请求。',
  ] : [
    'A, B, and C form the fixed first batch. D and E wait and cannot join midway. Request lengths are preset.',
    'B has finished and stops advancing, but its fixed row is held. D still waits for the whole batch.',
    'B and C have finished; only A continues. Their unused compute cannot take D or E yet.',
    'A finishes last, completing the first batch. It can leave and admit the next group on the next step.',
    'The entire first batch leaves. D and E enter together as the second batch; membership changes only at batch boundaries.',
    'E has finished and stops advancing while D continues. No new member can enter the second batch midway.',
    'D finishes last, completing the second batch. The whole group leaves on the next step.',
    'Both batches are complete. When a short request finishes, a static batch still waits for its longest member.',
  ];
  return <>
    {staticBatch && <div className="il-batch-policy"><span>STATIC BATCH</span><strong>{step === 7 ? zh ? '两批已结束' : 'Both batches finished' : zh ? `第 ${step < 4 ? '1' : '2'} 批 · 固定成员` : `Batch ${step < 4 ? '1' : '2'} · fixed members`}</strong></div>}
    <div className="il-batch-top"><span>{zh ? '等待队列' : 'Waiting queue'}</span><div>{frame.queue.length ? frame.queue.map(id => <Token key={id}>req&nbsp;<b data-motion-key={`request-${id}`}>{id}</b></Token>) : <span className="il-tiny">{zh ? '队列已清空' : 'Queue is empty'}</span>}</div></div>
    <div className="il-slot-grid">{frame.slots.map((request, index) => <div className={`il-slot ${request ? `il-request-${request.id.toLowerCase()}` : 'is-vacant'} ${staticBatch && request && request.current === request.total ? 'is-held' : ''}`} key={index}>
      <span className="il-slot-label">SLOT 0{index + 1}</span>
      {request ? <><div className="il-request-title">{zh ? '请求' : 'Request'} <b data-motion-key={`request-${request.id}`}>{request.id}</b><span className="il-request-state">{request.current === request.total ? staticBatch ? zh ? '完成·等待整批' : 'done · held' : zh ? '完成' : 'done' : zh ? '执行中' : 'active'}</span></div>
        <div className="il-request-steps">{Array.from({ length: request.total }, (_, j) => <span key={j} className={j < request.current ? 'is-filled' : ''} />)}</div><span className="il-tiny">{request.current} / {request.total} {zh ? '步' : 'steps'}</span></> : <div className="il-vacant-mark">{staticBatch ? '—' : '+'}<span>{staticBatch ? frame.slots.some(Boolean) ? zh ? '本批不补入新请求' : 'No mid-batch admission' : zh ? '批次已结束' : 'Batch finished' : zh ? '等待下一条请求' : 'Ready for a request'}</span></div>}
    </div>)}</div>
    <div className="il-completed"><span>{zh ? '已离开 batch' : 'Left the batch'}</span><div>{frame.done.length ? frame.done.map(id => <span key={id} className="il-completed-request">✓ <b data-motion-key={`request-${id}`}>{id}</b></span>) : <span className="il-tiny">—</span>}</div></div>
    <Note>{staticBatch ? staticDescriptions[step] : zh ? '每一步都重新组织 batch。B 完成后 D 即可进入，无需等待 A 与 C。请求长度是预设示例。' : 'The batch is rebuilt each step. D can enter after B finishes, while A and C continue. Request lengths are preset.'}</Note>
  </>;
}

function SpeculationView({ step, locale }: { step: number; locale: Locale }) {
  const zh = locale === 'zh';
  const drafts = ['61', '240', '17', '820'];
  return <>
    <div className="il-spec-row"><div className="il-spec-label"><b>01</b><span>{zh ? 'Draft 提案' : 'Draft proposal'}</span></div><div className="il-draft-tokens">{drafts.map((token, index) => <div className="il-draft-item" key={token}>
      <Token motionKey={step === 3 && index < 2 ? undefined : `proposal-${index}`} state={step === 0 ? 'empty' : step < 2 ? 'draft' : index < 2 ? 'accepted' : index === 2 ? 'rejected' : 'skipped'}>{step === 0 ? '·' : token}</Token>
      <small>{step < 2 ? `d${index + 1}` : index < 2 ? zh ? '接受' : 'accept' : index === 2 ? zh ? '拒绝' : 'reject' : zh ? '丢弃' : 'discard'}</small>
    </div>)}</div></div>
    <div className={`il-verifier ${step >= 2 ? 'is-active' : ''}`}><span className="il-verifier-icon">✓</span><div><strong>{zh ? '目标模型联合验证' : 'Target model verification'}</strong><p>{step < 2 ? zh ? '等待提案后，进行一次验证前向' : 'One verification pass after drafting' : zh ? '前 2 个通过；第 3 个拒绝，后续作废' : 'Accept 2; reject the 3rd and discard the rest'}</p></div><span className="il-tiny">{step >= 2 ? '2 / 4' : '—'}</span></div>
    <div className="il-spec-row il-commit-row"><div className="il-spec-label"><b>02</b><span>{zh ? '提交结果' : 'Committed result'}</span></div><div className="il-draft-tokens">{['61', '240', '909'].map((token, index) => <div className="il-draft-item" key={token}><Token motionKey={step === 3 && index < 2 ? `proposal-${index}` : `commit-${index}`} state={step === 3 ? index < 2 ? 'accepted' : 'new' : 'empty'}>{step === 3 ? token : '·'}</Token><small>{index < 2 ? zh ? '接受的提案' : 'accepted draft' : zh ? '目标模型补采样' : 'target resample'}</small></div>)}</div></div>
    <Note>{zh ? '预设的验证路径：拒绝位置之后的提案被丢弃，再按目标规则补采样，最后提交一致的请求状态。' : 'Preset verification: discard proposals after rejection, resample under the target rule, then commit consistent request state.'}</Note>
  </>;
}

const logicalExperts = [0, 0, 0, 0, 1, 2, 2, 3];
function ExpertsView({ step, locale }: { step: number; locale: Locale }) {
  const zh = locale === 'zh';
  const counts = step === 0 ? [0, 0, 0, 0] : step < 3 ? [4, 1, 2, 1] : [2, 1, 2, 3];
  const destination = (expert: number, index: number) => step === 3 && expert === 0 && index > 1 ? 3 : expert;
  const descriptions = zh ? ['8 个预设 token，逻辑专家选择已确定。', 'E0 热点集中在 rank 0，其他 rank 仍有空闲。', '在 rank 3 的空闲专家槽增加 E0 副本。', 'E0 请求在两个副本间分流；逻辑专家选择保持一致。'] : ['8 preset tokens have fixed logical expert choices.', 'E0 traffic is concentrated on rank 0.', 'Add an E0 replica in a free expert slot on rank 3.', 'Split E0 traffic between replicas. Logical expert choices stay the same.'];
  return <>
    <div className="il-expert-tokens">{logicalExperts.map((expert, index) => <span key={index} className={`il-routed-token ${expert === 0 ? 'is-hot' : ''}`}><b data-motion-key={step === 0 ? `route-token-${index}` : undefined}>t{index + 1}</b><small>E{expert}</small>{step > 0 && <span>r{destination(expert, index)}</span>}</span>)}</div>
    <div className="il-routing-rule"><span className="il-routing-line" /><span>{step >= 2 ? zh ? '逻辑专家不变 · 调整物理副本' : 'Same logical experts · different replicas' : zh ? '按专家路由到物理 rank' : 'Route experts to physical ranks'}</span><span className="il-routing-line" /></div>
    <div className="il-experts-grid">{counts.map((count, rank) => <div className={`il-expert-card ${rank === 0 && step === 1 ? 'is-busy' : ''} ${rank === 3 && step >= 2 ? 'has-replica' : ''}`} key={rank}>
      <div className="il-row-label"><span>rank {rank}</span><b>{count}<small> tokens</small></b></div>
      <div className="il-expert-inventory"><span data-motion-key={`expert-${rank}`}>E{rank}</span>{rank === 3 && step >= 2 ? <span className="il-replica" data-motion-key="replica-E0" data-motion-from="expert-0">E0 <small>{zh ? '副本' : 'replica'}</small></span> : <span className="il-free-slot">+</span>}</div>
      <div className="il-rank-tokens" aria-label={zh ? `rank ${rank} 的预设 token` : `Preset tokens on rank ${rank}`}>{step > 0 && logicalExperts.map((expert, index) => destination(expert, index) === rank ? <span key={index} data-motion-key={`route-token-${index}`}>t{index + 1}</span> : null)}</div>
      <div className="il-load-track">{Array.from({ length: 4 }, (_, index) => <span key={index} className={index < count ? 'is-loaded' : ''} />)}</div>
    </div>)}</div>
    <p className="il-explanation" key={step} aria-live="polite">{descriptions[step]}</p>
    <Note>{zh ? '预设 EPLB 状态：逻辑专家选择固定，通过副本映射改变物理 rank 的负载分配。' : 'Preset EPLB states: fixed logical expert choices, with replica mappings changing the distribution across ranks.'}</Note>
  </>;
}

export function InferenceLab({ mode = 'loop', locale = 'zh', compact = false }: Props) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const zh = locale === 'zh';
  const maxStep = finalStep[mode];
  const displayedStep = Math.min(step, maxStep);
  const { rootRef, capture } = useMechanismMotion(mode, locale, displayedStep);

  useEffect(() => { setStep(0); setPlaying(false); }, [mode]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      capture();
      setStep(previous => Math.min(previous + 1, maxStep));
    }, 1700);
    return () => window.clearInterval(timer);
  }, [playing, maxStep, capture]);
  useEffect(() => { if (step >= maxStep) setPlaying(false); }, [step, maxStep]);

  function changeStep(next: number | ((previous: number) => number)) {
    capture();
    setStep(next);
  }

  function togglePlay() {
    if (!playing && step >= maxStep) changeStep(0);
    setPlaying(previous => !previous);
  }

  return <section ref={rootRef} className={`inference-lab ${compact ? 'inference-lab--compact' : ''}`} aria-label={`${modeTitles[mode][zh ? 0 : 1]} ${zh ? '交互机制演示' : 'interactive mechanism demonstration'}`}>
    <div className="il-header"><span className="il-demo-label"><span />{zh ? '机制演示 · 预设框架状态' : 'Mechanism demo · preset framework states'}</span><span className="il-step-counter">{String(displayedStep + 1).padStart(2, '0')}<span> / {String(maxStep + 1).padStart(2, '0')}</span></span></div>
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
      <input className="il-scrubber" type="range" min={0} max={maxStep} value={displayedStep} aria-label={zh ? '演示步骤' : 'Demo step'} aria-valuetext={`${displayedStep + 1} / ${maxStep + 1}`} onChange={event => { setPlaying(false); changeStep(Number(event.target.value)); }} />
      <button type="button" className="il-icon-button" onClick={() => { setPlaying(false); changeStep(previous => Math.min(previous + 1, maxStep)); }} disabled={displayedStep === maxStep} aria-label={zh ? '下一步' : 'Next step'} title={zh ? '下一步' : 'Next step'}><Icon name="step" /></button>
      <button type="button" className="il-icon-button" onClick={() => { setPlaying(false); changeStep(0); }} aria-label={zh ? '重置演示' : 'Reset demo'} title={zh ? '重置演示' : 'Reset demo'}><Icon name="reset" /></button>
    </div>
  </section>;
}
