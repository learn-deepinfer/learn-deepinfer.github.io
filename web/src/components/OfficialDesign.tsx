import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Locale, Localized } from '../data/course';
import './OfficialDesign.css';

type TopicId = 'stages' | 'cache' | 'balance' | 'overlap' | 'grammar';
type Topic = {
  id: TopicId;
  title: Localized;
  question: Localized;
  description: Localized;
  takeaway: Localized;
  relation: string;
  lessons: { id: string; label: Localized }[];
};

const ARTICLE = 'https://zhuanlan.zhihu.com/p/2095560295930508953';
const choose = (locale: Locale, zh: string, en: string) => locale === 'zh' ? zh : en;

const topics: Topic[] = [
  {
    id: 'stages',
    title: { zh: '阶段分离', en: 'Separate stages' },
    question: { zh: '为什么把 Prefill 与 Decode 分开？', en: 'Why separate prefill and decode?' },
    description: {
      zh: 'Prefill 处理输入上下文，Decode 持续生成后续 token。PD 分离为两类工作设置独立的资源与调度边界，并通过状态交接连接起来。读源码时，先分清请求当前处于哪个阶段，以及进入下一阶段需要什么状态。',
      en: 'Prefill processes the input context; decode generates subsequent tokens. PD disaggregation gives the stages separate resources and scheduling boundaries, connected by a state handoff. In the source, identify a request’s current stage and the state required to enter the next one.',
    },
    takeaway: { zh: '阶段可以独立调度，状态交接仍是明确的依赖。', en: 'Stages can be scheduled independently; the state handoff remains a dependency.' },
    relation: 'request → prefill → state_handoff → decode → output',
    lessons: [{ id: 's01', label: { zh: '请求的整体链路', en: 'The request flow' } }, { id: 's06', label: { zh: '调度边界', en: 'Scheduling boundaries' } }],
  },
  {
    id: 'cache',
    title: { zh: '缓存与回放', en: 'Cache & replay' },
    question: { zh: '前缀命中，为什么还需要回放？', en: 'Why can a prefix hit still need replay?' },
    description: {
      zh: 'Block 前缀命中不代表滑动窗口注意力的 SWA 状态已经就绪。缺失 SWA 时，官方设计通过有界回放近似重建所需的 SWA 状态；已经命中的 Block 原样复用。两类状态要分别检查，不能把一次命中理解成全部计算都可跳过。',
      en: 'A Block prefix hit does not mean sliding-window attention (SWA) state is ready. When SWA is missing, the official design uses bounded replay to approximately rebuild the required SWA state while reusing the matched Block unchanged. Check the two states separately: a hit does not make all remaining work disappear.',
    },
    takeaway: { zh: 'Block 原样复用；缺失的 SWA 状态由有限回放补齐。', en: 'Reuse Block unchanged; recover missing SWA state through bounded replay.' },
    relation: 'Block_hit ≠ SWA_ready\nBlock_reused + bounded_replay → approximate_SWA_state',
    lessons: [{ id: 's03', label: { zh: 'KV 状态与所有权', en: 'KV state & ownership' } }, { id: 's08', label: { zh: '前缀复用', en: 'Prefix reuse' } }],
  },
  {
    id: 'balance',
    title: { zh: '两层均衡', en: 'Two balancing layers' },
    question: { zh: '请求分配和专家均衡，各自解决什么？', en: 'What do request balancing and expert balancing solve?' },
    description: {
      zh: '请求级负载均衡决定一条请求交给哪个实例。Decode 分配同时考虑并发数与 KV 总长，避免只看请求数量。EPLB 则处理另一层映射：逻辑专家如何落到物理副本上。请求分配与专家副本布局相互关联，但职责和状态边界不同。',
      en: 'Request-level load balancing selects an instance for a request. Decode placement considers both concurrency and total KV length, rather than request count alone. EPLB manages a different mapping: logical experts to physical replicas. These decisions interact but have distinct responsibilities and state boundaries.',
    },
    takeaway: { zh: '请求选实例，逻辑专家映射物理副本。', en: 'Place requests on instances; map logical experts to physical replicas.' },
    relation: 'decode_placement = f(concurrency, total_KV_length)\nexpert_mapping: logical_expert → physical_replica',
    lessons: [{ id: 's11', label: { zh: '专家并行与路由', en: 'Expert parallelism & routing' } }, { id: 's12', label: { zh: 'EPLB 与物理副本', en: 'EPLB & physical replicas' } }],
  },
  {
    id: 'overlap',
    title: { zh: '跨轮异步', en: 'Overlap rounds' },
    question: { zh: '一轮的执行，为什么会涉及前一轮状态？', en: 'Why does a round also handle the previous round’s state?' },
    description: {
      zh: 'ZOS 将当前轮执行与前一轮状态后处理重叠，使执行与状态提交跨越轮次边界。schedule、forward、sample 与 post-process 仍受数据就绪和状态依赖约束；“异步”不等于任意并行。读代码时要同时追踪执行轮次与输出所属轮次。',
      en: 'ZOS overlaps current execution with state post-processing from the preceding round, so execution and state commitment cross round boundaries. Schedule, forward, sample, and post-process remain constrained by data readiness and state dependencies. Track both the execution round and the round that produced an output.',
    },
    takeaway: { zh: '当前执行与前轮状态处理重叠，数据依赖依然存在。', en: 'Overlap current execution with prior state processing while preserving dependencies.' },
    relation: 'round(r): execution(r) ∥ post_process(r − 1)\n∥ = permitted overlap; dependencies still apply',
    lessons: [{ id: 's06', label: { zh: '调度与状态依赖', en: 'Scheduling & dependencies' } }, { id: 's10', label: { zh: '跨轮流水与 ZOS', en: 'Cross-round pipelining & ZOS' } }],
  },
  {
    id: 'grammar',
    title: { zh: '结构化输出', en: 'Structured output' },
    question: { zh: '语法约束怎样进入每一步采样？', en: 'How does a grammar constrain each sampling step?' },
    description: {
      zh: '约束先编译成自动机，编译阶段与推理执行解耦。执行时根据当前语法状态生成合法 token 集合，以 mask 约束采样，再用选中的 token 推进自动机状态。约束会随状态逐步变化，因此不是仅在最后检查一次输出格式。',
      en: 'Constraints are compiled into an automaton, separating compilation from inference execution. At each step, the current grammar state determines the legal token set. A mask constrains sampling, and the selected token advances the automaton. The constraint evolves with the state throughout generation.',
    },
    takeaway: { zh: '先编译约束，再按当前语法状态逐步约束采样。', en: 'Compile constraints first, then constrain sampling using the current grammar state.' },
    relation: 'legal_tokens = automaton.allowed(grammar_state)\nnext_token ∈ legal_tokens\ngrammar_state = transition(grammar_state, next_token)',
    lessons: [{ id: 's04', label: { zh: '采样的职责与边界', en: 'Sampling responsibilities' } }, { id: 's01', label: { zh: '回到请求链路', en: 'Back to the request flow' } }],
  },
];

function Arrow({ className = '' }: { className?: string }) {
  return <svg className={`od-arrow ${className}`} width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true"><path d="M1 8h18m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ExternalArrow() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 3h8v8M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function StageFlow({ locale, grammar = false }: { locale: Locale; grammar?: boolean }) {
  const items = grammar ? [
    { name: choose(locale, '约束', 'Constraint'), note: choose(locale, '定义输出语法', 'Define the grammar') },
    { name: choose(locale, '编译自动机', 'Compile automaton'), note: choose(locale, '独立编译阶段', 'Separate compilation') },
    { name: choose(locale, '合法 token', 'Legal tokens'), note: 'token mask' },
    { name: choose(locale, '采样', 'Sample'), note: choose(locale, '在允许范围内选择', 'Select an allowed token') },
    { name: choose(locale, '推进状态', 'Advance state'), note: choose(locale, '为下一步更新约束', 'Update the next step') },
  ] : [
    { name: choose(locale, '入口', 'Entry'), note: choose(locale, '接入请求', 'Accept a request') },
    { name: 'Prefill', note: choose(locale, '处理输入上下文', 'Process input context') },
    { name: choose(locale, '状态交接', 'State handoff'), note: choose(locale, '准备下一阶段状态', 'Prepare decode state') },
    { name: 'Decode', note: choose(locale, '推进后续生成', 'Generate subsequent tokens') },
    { name: choose(locale, '输出', 'Output'), note: choose(locale, '汇集就绪结果', 'Collect ready results') },
  ];
  return <div className={`od-stage-diagram ${grammar ? 'od-grammar-diagram' : ''}`}>
    <div className="od-diagram-kicker"><span>{grammar ? choose(locale, '编译与执行的边界', 'COMPILATION & EXECUTION') : choose(locale, '同一请求，不同阶段', 'ONE REQUEST, DISTINCT STAGES')}</span><i />{choose(locale, '概念流程', 'Conceptual flow')}</div>
    <div className="od-flow">{items.map((item, i) => <div className="od-flow-unit" key={item.name}>
      <div className={`od-flow-node ${i === 1 || i === 3 ? 'is-emphasized' : ''}`}><span className="od-node-index">0{i + 1}</span><b>{item.name}</b><small>{item.note}</small></div>{i < items.length - 1 && <Arrow />}
    </div>)}</div>
    <div className="od-diagram-foot"><span className="od-state-dot" /><span>{grammar ? choose(locale, '编译完成后，每一步都基于当前语法状态生成 mask。', 'After compilation, each step derives a mask from the current grammar state.') : choose(locale, '独立资源与调度边界，由状态交接连接。', 'Separate resource and scheduling boundaries, connected by state handoff.')}</span></div>
  </div>;
}

function CacheFlow({ locale }: { locale: Locale }) {
  return <div className="od-cache-diagram">
    <div className="od-diagram-kicker"><span>{choose(locale, '分别检查两类状态', 'CHECK BOTH KINDS OF STATE')}</span></div>
    <div className="od-cache-entry"><span className="od-small-node">{choose(locale, 'Block 前缀命中', 'Block prefix hit')}<i className="od-check">✓</i></span><Arrow /><span className="od-decision">{choose(locale, 'SWA 就绪？', 'SWA ready?')}</span></div>
    <div className="od-branches"><div className="od-branch"><span className="od-branch-label">{choose(locale, '是 / YES', 'YES')}</span><b>{choose(locale, '直接复用', 'Reuse directly')}</b><p>{choose(locale, '所需状态已经就绪', 'Required state is ready')}</p></div><div className="od-branch od-branch-replay"><span className="od-branch-label">{choose(locale, '否 / NO', 'NO')}</span><b>{choose(locale, '有限回放', 'Bounded replay')}</b><p>{choose(locale, '近似重建缺失的 SWA 状态', 'Approximately rebuild missing SWA state')}</p></div></div>
    <div className="od-cache-merge"><span>{choose(locale, '两条路径都保留命中的 Block', 'Both paths preserve the matched Block')}</span><Arrow /><b>{choose(locale, '继续处理', 'Continue')}</b></div>
    <div className="od-diagram-foot"><span className="od-state-dot" /><span>{choose(locale, 'Block 命中 ≠ SWA 就绪', 'Block hit ≠ SWA ready')}</span></div>
  </div>;
}

function BalanceFlow({ locale }: { locale: Locale }) {
  return <div className="od-balance-diagram">
    <div className="od-balance-level"><div className="od-level-title"><span>01</span><b>{choose(locale, '请求级负载均衡', 'Request-level balancing')}</b><small>{choose(locale, '选择实例', 'Choose an instance')}</small></div><div className="od-distribution"><span className="od-small-node">Decode<br /><small>{choose(locale, '请求', 'request')}</small></span><Arrow /><div className="od-instance-stack">{['A', 'B', 'C'].map((id) => <span className="od-instance" key={id}>{choose(locale, '实例', 'Instance')} {id}</span>)}</div><div className="od-dimensions"><span><i />{choose(locale, '并发数', 'Concurrency')}</span><span><i />{choose(locale, 'KV 总长', 'Total KV length')}</span></div></div></div>
    <div className="od-balance-level"><div className="od-level-title"><span>02</span><b>{choose(locale, '专家负载均衡 · EPLB', 'Expert balancing · EPLB')}</b><small>{choose(locale, '映射物理副本', 'Map physical replicas')}</small></div><div className="od-expert-mappings">{['E₀', 'E₁'].map((id, index) => <div className="od-expert-row" key={id}><span className="od-logical-expert">{id}<small>{choose(locale, '逻辑专家', 'Logical expert')}</small></span><Arrow /><div className="od-replicas"><span>{id}<sub>a</sub></span><span>{id}<sub>b</sub></span></div><small className="od-replica-label">{choose(locale, '物理副本', 'Physical replicas')} {index === 0 ? 'α' : 'β'}</small></div>)}</div></div>
    <p className="od-diagram-caption">{choose(locale, '示意映射关系；副本数量与实例布局不代表固定配置。', 'Illustrative mappings; replica counts and instance layout are not a fixed configuration.')}</p>
  </div>;
}

function OverlapFlow({ locale }: { locale: Locale }) {
  return <div className="od-overlap-diagram">
    <div className="od-diagram-kicker"><span>{choose(locale, '执行轮次与状态所属轮次', 'EXECUTION ROUND & STATE ROUND')}</span></div>
    <div className="od-rounds">{['r', 'r + 1'].map((round, i) => <div className="od-round" key={round}><div className="od-round-heading">{choose(locale, '执行轮次', 'Execution round')}<code>{round}</code></div><span className="od-lane-label">{choose(locale, '当前执行', 'Current execution')}</span><div className="od-execution-phases">{['schedule', 'forward', 'sample'].map(phase => <code key={phase}>{phase}<span>({round})</span></code>)}</div><div className="od-overlap-bracket"><span />{choose(locale, '允许的重叠', 'Permitted overlap')}<span /></div><span className="od-lane-label">{choose(locale, '前轮状态处理', 'Prior-round state processing')}</span><div className="od-post-process"><code>post-process ({i === 0 ? 'r − 1' : 'r'})</code></div></div>)}</div>
    <div className="od-dependency"><span className="od-dependency-mark" aria-hidden="true">↳</span><span>{choose(locale, 'sample(r) 产生的状态，后续由 post-process(r) 处理。', 'State produced by sample(r) is handled later by post-process(r).')}</span></div>
    <p className="od-diagram-caption">{choose(locale, '跨轮职责示意；位置不表示时长、完整执行顺序或任意并行。', 'A cross-round responsibility map; positions do not encode duration, full execution order, or unrestricted parallelism.')}</p>
  </div>;
}

function TopicDiagram({ topic, locale }: { topic: TopicId; locale: Locale }) {
  if (topic === 'cache') return <CacheFlow locale={locale} />;
  if (topic === 'balance') return <BalanceFlow locale={locale} />;
  if (topic === 'overlap') return <OverlapFlow locale={locale} />;
  return <StageFlow locale={locale} grammar={topic === 'grammar'} />;
}

export function OfficialDesign({ locale }: { locale: Locale }) {
  const [active, setActive] = useState<TopicId>('stages');
  const prefix = useId();
  const topic = topics.find(item => item.id === active)!;
  return <section className="official-design" id="official-design" aria-labelledby={`${prefix}-heading`}>
    <div className="od-heading"><div><span className="eyebrow">OFFICIAL DESIGN / FIVE QUESTIONS</span><h2 id={`${prefix}-heading`}>{choose(locale, '从官方设计，理解系统取舍。', 'Read the design. Understand the tradeoffs.')}</h2><p>{choose(locale, 'DeepSeek 官方文章《DeepSeek V4.1 Flash 大规模推理部署实践》介绍了 DeepInfer 背后的系统设计。用五个问题，把生产设计与课程中的框架机制连起来。', 'DeepSeek’s official article “DeepSeek V4.1 Flash Large-Scale Inference Deployment” explains the system design behind DeepInfer. Connect that design to the course through five questions.')}</p></div><a className="od-article-link" href={ARTICLE} target="_blank" rel="noreferrer"><span>{choose(locale, '阅读官方文章', 'Read the official article')}</span><ExternalArrow /></a></div>
    <div className="od-topic-buttons" role="group" aria-label={choose(locale, '选择设计主题', 'Choose a design topic')}>{topics.map((item, i) => <button id={`${prefix}-${item.id}`} key={item.id} type="button" aria-pressed={active === item.id} aria-controls={`${prefix}-panel`} onClick={() => setActive(item.id)}><span aria-hidden="true">0{i + 1}</span>{item.title[locale]}</button>)}</div>
    <div className="od-topic-panel" id={`${prefix}-panel`} role="region" aria-labelledby={`${prefix}-${active}`}>
      <div className="od-topic-content" key={active}><div className="od-explanation"><span className="od-question-label">{choose(locale, '这一节回答', 'THE QUESTION')}</span><h3>{topic.question[locale]}</h3><p>{topic.description[locale]}</p><div className="od-takeaway"><span aria-hidden="true">↳</span><p>{topic.takeaway[locale]}</p></div></div><div className="od-visual"><TopicDiagram topic={active} locale={locale} /></div><div className="od-relation"><span>{choose(locale, '概念关系', 'CONCEPTUAL RELATION')}</span><pre><code>{topic.relation}</code></pre></div><div className="od-lesson-links"><span>{choose(locale, '接着读源码课程', 'CONTINUE IN THE COURSE')}</span><div>{topic.lessons.map(lesson => <Link key={lesson.id} to={`/${locale}/${lesson.id}`}><code>{lesson.id}</code><span>{lesson.label[locale]}</span><Arrow /></Link>)}</div></div></div>
    </div>
    <p className="od-scope-note"><span>{choose(locale, '阅读边界', 'READING SCOPE')}</span>{choose(locale, '生产设计；缓存服务与负载均衡基础设施未完整开源，源码入口以课程固定版本为准。', 'Production design; cache services and load-balancing infrastructure are not fully open-sourced. Source entry points follow the course’s pinned revision.')}<code title="8b16149741a4935e1dec8cea27853f273b374c5b">8b16149</code></p>
  </section>;
}
