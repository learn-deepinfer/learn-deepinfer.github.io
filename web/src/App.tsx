import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Code2, Copy, ExternalLink, GitCompareArrows, Github, Layers3, Menu, Moon, Search, Sparkles, Sun, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import { diffLines } from 'diff';
import { lessons, layers, type Lesson, type Locale, type LayerId } from './data/course';
import { InferenceLab } from './components/InferenceLab';
import { OfficialDesign } from './components/OfficialDesign';

hljs.registerLanguage('python', python);
const UPSTREAM = 'https://github.com/deepseek-ai/DeepInfer/blob/8b16149741a4935e1dec8cea27853f273b374c5b/';
const REFERENCE = 'https://github.com/shareAI-lab/learn-claude-code';
const colors: Record<LayerId, string> = { core: '#3b82f6', memory: '#10b981', scheduling: '#e9a123', distributed: '#8b5cf6' };
const text = (locale: Locale, zh: string, en: string) => locale === 'zh' ? zh : en;

function useStored<T,>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Persistence is optional. */ } }, [key, value]);
  return [value, setValue] as const;
}

function CodeBlock({ code, filename = 'framework_flow.py', language = 'python', numbered = false }: { code: string; filename?: string; language?: string; numbered?: boolean }) {
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const highlighted = useMemo(() => hljs.highlight(code, { language }).value, [code, language]);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopyState('done'); } catch { setCopyState('error'); }
    clearTimeout(timer.current); timer.current = setTimeout(() => setCopyState('idle'), 1800);
  }
  return <div className="code-window">
    <div className="code-title"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><span>{filename}</span><button className="copy-button" onClick={copy} aria-label="Copy code">{copyState === 'done' ? <Check size={15} /> : <Copy size={15} />}<span>{copyState === 'done' ? 'Copied' : copyState === 'error' ? 'Select to copy' : 'Copy'}</span></button></div>
    <div className="code-content">{numbered && <pre className="line-numbers" aria-hidden="true">{code.split('\n').map((_, i) => i + 1).join('\n')}</pre>}<pre><code dangerouslySetInnerHTML={{ __html: highlighted }} /></pre></div>
  </div>;
}

const coreCode = `# Framework pseudocode for reading responsibilities.
for request in inputs:
    llm_engine.add_request(request)

while llm_engine.has_unfinished_requests():
    ready_outputs = llm_engine.step()
    collect(ready_outputs)

collect(llm_engine.flush_inflight_reqs())
# step: schedule -> execute -> sample -> state updates
# ZOS may commit a prior round and defer current state.
# One round may involve multiple requests and token positions.`;

function Badge({ lesson }: { lesson: Lesson }) { return <span className="lesson-badge" style={{ '--layer': colors[lesson.layer] } as React.CSSProperties}>{lesson.id}</span>; }
function Progress({ completed, locale }: { completed: string[]; locale: Locale }) {
  return <div className="progress-display"><div><span>{text(locale, '学习进度', 'Your progress')}</span><b>{completed.length}<span> / {lessons.length}</span></b></div><div className="progress-track"><i style={{ width: `${completed.length / lessons.length * 100}%` }} /></div></div>;
}

function LessonCard({ lesson, locale, done }: { lesson: Lesson; locale: Locale; done: boolean }) {
  return <Link className="lesson-card" to={`/${locale}/${lesson.id}`} style={{ '--layer': colors[lesson.layer] } as React.CSSProperties}>
    <div className="card-meta"><Badge lesson={lesson} /><span>{done ? <CheckCircle2 size={15} aria-label={text(locale, '已完成', 'Completed')} /> : `${lesson.minutes} ${text(locale, '分钟', 'min')}`}</span></div>
    <h3>{lesson.title}<ArrowRight size={16} /></h3><p>{lesson.summary[locale]}</p><div className="card-footer"><span>{lesson.name[locale]}</span><span className="card-arrow">↗</span></div>
  </Link>;
}

function LearningPath({ locale, completed, full = false }: { locale: Locale; completed: string[]; full?: boolean }) {
  const [selected, setSelected] = useState<LayerId | 'all'>('all');
  const [query, setQuery] = useState('');
  const filtered = lessons.filter(l => (selected === 'all' || l.layer === selected) && `${l.title} ${l.name[locale]} ${l.summary[locale]} ${l.id}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={`path-section ${full ? 'standalone-section' : ''}`} id="learning-path">
    <div className="section-top"><div><span className="eyebrow">{full ? 'THE LEARNING PATH' : '02 / THE LEARNING PATH'}</span><h2>{text(locale, '每次，只增加一个机制。', 'One mechanism at a time.')}</h2><p className="section-description">{text(locale, '12 节循序渐进的课程，沿请求链路理解 DeepInfer 的架构与机制。', '12 progressive lessons that follow requests through DeepInfer’s architecture and mechanisms.')}</p></div><Progress completed={completed} locale={locale} /></div>
    <div className="path-toolbar"><div className="filter-tabs" aria-label={text(locale, '按架构层筛选', 'Filter by layer')}><button className={selected === 'all' ? 'selected' : ''} onClick={() => setSelected('all')}>{text(locale, '全部课程', 'All lessons')}<span>{lessons.length}</span></button>{layers.map(layer => <button key={layer.id} className={selected === layer.id ? 'selected' : ''} onClick={() => setSelected(layer.id)}><i style={{ background: colors[layer.id] }} />{layer.name[locale]}</button>)}</div><label className="course-search"><Search size={15} /><input aria-label={text(locale, '搜索课程', 'Search lessons')} placeholder={text(locale, '搜索课程…', 'Search lessons…')} value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="lesson-grid">{filtered.map(lesson => <LessonCard key={lesson.id} lesson={lesson} locale={locale} done={completed.includes(lesson.id)} />)}</div>
    {filtered.length === 0 && <div className="empty-state"><Search size={24} /><h3>{text(locale, '没有找到相关课程', 'No matching lessons')}</h3><button className="text-link" onClick={() => { setQuery(''); setSelected('all'); }}>{text(locale, '清除筛选', 'Clear filters')}</button></div>}
    {!full && <p className="path-note"><BookOpen size={14} />{text(locale, '所有章节均可直接阅读。阅读进度只保存在当前浏览器。', 'Every lesson is open. Reading progress stays in your browser.')}</p>}
  </section>;
}

function Architecture({ locale, full = false }: { locale: Locale; full?: boolean }) {
  return <section className={`architecture-section ${full ? 'standalone-section' : ''}`} id="architecture">
    <div className="section-heading"><span className="eyebrow">{full ? 'THE BIG PICTURE' : '03 / THE BIG PICTURE'}</span><h2>{text(locale, '把机制，放回系统里。', 'Put each mechanism in context.')}</h2><p className="section-description">{text(locale, '从四个协作层次，理解 DeepInfer 的职责与状态边界。', 'Understand DeepInfer through four layers of responsibilities and state.')}</p></div>
    <div className="architecture-stack">{layers.map((layer, index) => <div className="architecture-row" key={layer.id} style={{ '--layer': colors[layer.id] } as React.CSSProperties}><span className="layer-index">0{index + 1}</span><div className="layer-description"><h3><i />{layer.name[locale]}</h3><p>{layer.description[locale]}</p></div><div className="layer-lessons">{lessons.filter(l => l.layer === layer.id).map(l => <Link key={l.id} to={`/${locale}/${l.id}`}><span>{l.id}</span>{l.title}<ChevronRight size={13} /></Link>)}</div></div>)}</div>
    {full && <div className="architecture-reading"><span className="eyebrow">FOLLOW THE SOURCE</span><h2>{text(locale, '沿着一条请求，读 DeepInfer。', 'Follow a request through DeepInfer.')}</h2><div className="source-pipeline">{['LLM.generate', 'LLMEngine.step', 'Scheduler', 'Worker', 'ModelRunner', 'Sampling', 'State updates'].map((item, i) => <div key={item}><span>0{i + 1}</span><code>{item}</code>{i < 6 && <ArrowRight size={16} />}</div>)}</div><p className="section-description">{text(locale, '按职责追踪请求：入口、调度、执行、采样，再回到状态更新。一次 step 可能涉及多请求与多个 token；ZOS 后处理还可延迟到下一轮。下方链接固定到上游版本。', 'Follow entry, scheduling, execution, sampling, and state updates. One step may involve several requests and tokens; ZOS can defer post-processing to the next round. Source links use a pinned revision.')}</p><div className="source-file-list">{[
      ['deepinfer/entrypoints/llm.py', 'LLM / request entry'], ['deepinfer/engine/llm_engine.py', 'Engine / coordination'], ['csrc/engine/scheduler.hpp', 'Scheduler / batch planning'], ['deepinfer/worker/worker.py', 'Worker / pipelined execution'], ['deepinfer/worker/model_runner.py', 'Model runner / execution boundary'], ['deepinfer/model_executor/layers/sampler.py', 'Sampler / selection and verification']
    ].map(([path, label]) => <a key={path} href={`${UPSTREAM}${path}`} target="_blank" rel="noreferrer"><div><b>{label}</b><code>{path}</code></div><ExternalLink size={16} /></a>)}</div></div>}
  </section>;
}

function Home({ locale, completed }: { locale: Locale; completed: string[] }) {
  return <><section className="hero"><div className="hero-kicker"><span className="live-dot" />{text(locale, '框架导读 · 逐层理解', 'READ THE FRAMEWORK · UNDERSTAND EVERY LAYER')}</div><h1>Learn DeepInfer<span className="title-dot">.</span></h1><p className="hero-subtitle">{text(locale, '沿着请求，读懂 DeepInfer。', 'Understand DeepInfer. Follow the request.')}</p><p className="hero-description">{text(locale, '从请求入口出发，追踪每一轮调度与执行，\n逐步理解 DeepInfer 的缓存、采样、状态更新与专家协作。', 'Start at request entry and trace each scheduling and execution round.\nExplore how DeepInfer connects caching, sampling, state updates, and experts.')}</p><div className="hero-actions"><Link className="button primary" to={`/${locale}/s01`}>{text(locale, '开始学习', 'Start learning')}<ArrowRight size={16} /></Link><a className="button secondary" href="#learning-path">{text(locale, '浏览学习路径', 'Explore the path')}<ArrowDown size={15} /></a></div><div className="hero-footnotes"><span><BookOpen size={14} />{text(locale, '框架讲解与理解', 'Framework guide')}</span><span><Layers3 size={14} />{text(locale, '12 个核心机制', '12 core mechanisms')}</span><a href="https://github.com/deepseek-ai/DeepInfer" target="_blank" rel="noreferrer"><Code2 size={14} />{text(locale, '对照真实源码', 'Grounded in source')}</a></div></section>
    <section className="core-section"><div className="section-heading"><span className="eyebrow">01 / THE REQUEST FLOW</span><h2>{text(locale, '从一条请求，看清协作关系。', 'One request. A connected framework.')}</h2><p className="section-description">{text(locale, 'LLMEngine.step 协调调度、执行、采样与状态更新。\n沿着输入、输出和共享状态，理解各模块为何分开。', 'LLMEngine.step coordinates scheduling, execution, sampling, and state updates.\nFollow inputs, outputs, and shared state to understand each module boundary.')}</p></div><div className="core-code"><CodeBlock code={coreCode} /><p className="code-caption">{text(locale, '框架职责伪代码 · 一轮可涉及多请求与多个 token 位置', 'Framework pseudocode · a round may cover several requests and token positions')}</p></div><div className="home-lab"><InferenceLab mode="loop" locale={locale} compact /></div></section>
    <LearningPath locale={locale} completed={completed} /><Architecture locale={locale} />
    <p className="path-note"><BookOpen size={14} /><Link className="text-link" to={`/${locale}/layers`}>{text(locale, '继续阅读：官方系统设计与源码地图', 'Keep reading: official system design and source map')}<ArrowRight size={14} /></Link></p>
    <section className="closing-cta"><img className="closing-art" src="/brand/inference-lab.webp" width="230" height="172" loading="lazy" alt="" /><div><span className="eyebrow">FOLLOW THE REQUEST</span><h2>{text(locale, '读懂框架，从请求入口开始。', 'Understand it through the source.')}</h2><p>{text(locale, '第一章：沿着入口、调度、执行与状态更新，建立全局视图。', 'Chapter 1: map entry, scheduling, execution, and state updates.')}</p></div><Link className="button primary" to={`/${locale}/s01`}>{text(locale, '从第一章开始', 'Open Chapter 1')}<ArrowRight size={16} /></Link></section>
  </>;
}

function Markdown({ children }: { children: string }) { return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noreferrer" /> }}>{children}</ReactMarkdown>; }

function LessonPage({ lesson, locale, completed, toggleComplete }: { lesson: Lesson; locale: Locale; completed: string[]; toggleComplete: (id: string) => void }) {
  const [params, setParams] = useSearchParams();
  const tab = ['read', 'code', 'lab', 'source'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'read';
  const [menuOpen, setMenuOpen] = useState(false);
  const index = lessons.indexOf(lesson);
  const done = completed.includes(lesson.id);
  useEffect(() => setMenuOpen(false), [lesson.id]);
  const tabList = [ ['read', text(locale, '课程讲解', 'Lesson'), BookOpen], ['code', text(locale, '关键代码', 'Code'), Code2], ['lab', text(locale, '机制演示', 'Explore'), Sparkles], ['source', text(locale, '源码对照', 'Source'), Github] ] as const;
  return <div className="lesson-layout"><aside className={`course-sidebar ${menuOpen ? 'expanded' : ''}`}><button className="sidebar-mobile-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><BookOpen size={16} />{text(locale, '课程目录', 'Lesson directory')}<Menu size={17} /></button><div className="sidebar-body"><Link className="sidebar-back" to={`/${locale}/timeline`}><ArrowLeft size={14} />{text(locale, '学习路径', 'Learning path')}</Link><Progress locale={locale} completed={completed} />{layers.map(layer => <div className="sidebar-group" key={layer.id}><h4><i style={{ background: colors[layer.id] }} />{layer.name[locale]}</h4>{lessons.filter(l => l.layer === layer.id).map(l => <Link key={l.id} className={l.id === lesson.id ? 'active' : ''} to={`/${locale}/${l.id}`}><span>{l.id}</span><b>{l.name[locale]}</b>{completed.includes(l.id) && <Check size={13} />}</Link>)}</div>)}</div></aside>
    <article className="lesson-article"><div className="breadcrumb"><Link to={`/${locale}`}>Learn DeepInfer</Link><ChevronRight size={12} /><span>{lesson.id}</span></div><div className="lesson-heading"><div className="lesson-heading-meta"><Badge lesson={lesson} /><span>{layers.find(l => l.id === lesson.layer)?.name[locale]}</span><i />{lesson.minutes} {text(locale, '分钟阅读', 'min read')}</div><h1>{lesson.title}</h1><h2>{lesson.name[locale]}</h2><p>{lesson.summary[locale]}</p></div>
    <div className="lesson-tabs" role="tablist" aria-label={text(locale, '课程内容', 'Lesson content')}>{tabList.map(([id, label, Icon], tabIndex) => <button key={id} id={`lesson-${lesson.id}-tab-${id}`} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`lesson-${lesson.id}-panel`} onClick={() => setParams(id === 'read' ? {} : { tab: id })} onKeyDown={e => {
      const next = e.key === 'ArrowRight' ? (tabIndex + 1) % tabList.length : e.key === 'ArrowLeft' ? (tabIndex + tabList.length - 1) % tabList.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabList.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      const nextId = tabList[next][0];
      setParams(nextId === 'read' ? {} : { tab: nextId });
      document.getElementById(`lesson-${lesson.id}-tab-${nextId}`)?.focus();
    }}><Icon size={15} />{label}</button>)}</div>
    <div className="lesson-tab-content" id={`lesson-${lesson.id}-panel`} role="tabpanel" aria-labelledby={`lesson-${lesson.id}-tab-${tab}`} tabIndex={0} key={`${lesson.id}-${tab}`}>
      {tab === 'read' && <><div className="insight-callout"><Sparkles size={18} /><p>{lesson.insight[locale]}</p></div>{lesson.sections.map((section, i) => <section className="prose-section" id={`part-${i}`} key={i}><h2><span>0{i + 1}</span>{section.heading[locale]}</h2><div className="prose"><Markdown>{section.body[locale]}</Markdown></div>{i === 0 && <CodeBlock code={lesson.code} filename={lesson.filename} numbered />}</section>)}<div className="exercise-card"><span className="eyebrow">TRY IT YOURSELF</span><h3>{text(locale, '动手想一想', 'Make it yours')}</h3><div className="prose"><Markdown>{lesson.exercise[locale]}</Markdown></div><button className="text-link" onClick={() => { setParams({ tab: 'lab' }); window.scrollTo({ top: 160, behavior: 'smooth' }); }}>{text(locale, '打开机制演示', 'Open the interactive')}<ArrowRight size={15} /></button></div></>}
      {tab === 'code' && <><div className="tab-intro"><h2>{text(locale, '这次，我们只关注这个机制。', 'Focus on one mechanism.')}</h2><p>{text(locale, '以下框架伪代码用于标出职责与状态依赖；具体接口和分支见“源码对照”。', 'Framework pseudocode marks responsibilities and state dependencies. Inspect concrete interfaces and branches in Source.')}</p></div><CodeBlock code={lesson.code} filename={lesson.filename} numbered /></>}
      {tab === 'lab' && <><div className="tab-intro"><h2>{text(locale, '让机制，一步步发生。', 'Watch the mechanism unfold.')}</h2><p>{text(locale, '用单步、播放与重置观察状态变化，回到代码核对每一步。', 'Step, play, and reset to inspect state changes. Then connect each step to the code.')}</p></div><InferenceLab mode={lesson.demo} locale={locale} /><div className="lab-reading-note"><BookOpen size={17} /><p>{lesson.insight[locale]}</p></div></>}
      {tab === 'source' && <><div className="tab-intro"><h2>{text(locale, '把讲解放回上游源码。', 'Connect the lesson to upstream source.')}</h2><p>{text(locale, '上游源码固定在 8b16149，避免主分支变化让链接失去上下文。', 'Source links are pinned to 8b16149 so the reading context stays stable.')}</p></div><a className="upstream-source" href={`${UPSTREAM}${lesson.sourcePath}`} target="_blank" rel="noreferrer"><Github size={23} /><div><b>deepseek-ai / DeepInfer</b><code>{lesson.sourcePath}</code></div><ExternalLink size={17} /></a><div className="prose"><p>{text(locale, '本网站使用小而清晰的片段解释机制。DeepInfer 的生产实现还包含分布式通信、设备算子和状态管理；阅读时先确认模块的输入、输出和状态，再追踪具体优化。', 'The site explains mechanisms with small excerpts. Production DeepInfer also includes distributed communication, device kernels, and state management. First establish the module’s inputs, outputs, and state, then trace its optimizations.')}</p></div><Link className="text-link" to={`/${locale}/layers`}>{text(locale, '查看完整架构映射', 'See the architecture map')}<ArrowRight size={15} /></Link></>}
    </div>
    <div className="lesson-completion"><div><CheckCircle2 size={21} /><span>{done ? text(locale, '这一章，已经读懂了。', 'One more mechanism understood.') : text(locale, '把这个机制，加入你的工具箱。', 'Add this mechanism to your toolkit.')}</span></div><button className={`button ${done ? 'secondary' : 'primary'}`} aria-pressed={done} onClick={() => toggleComplete(lesson.id)}>{done ? <Check size={16} /> : null}{done ? text(locale, '已完成 · 点击撤销', 'Completed · undo') : text(locale, '标记为已完成', 'Mark as complete')}</button></div>
    <div className="lesson-pagination">{index > 0 ? <Link to={`/${locale}/${lessons[index - 1].id}`}><ArrowLeft size={16} /><div><span>{text(locale, '上一章', 'Previous')}</span><b>{lessons[index - 1].title}</b></div></Link> : <span />}{index < lessons.length - 1 ? <Link to={`/${locale}/${lessons[index + 1].id}`} className="next"><div><span>{text(locale, '下一章', 'Next')}</span><b>{lessons[index + 1].title}</b></div><ArrowRight size={16} /></Link> : <Link className="next" to={`/${locale}/timeline`}>{text(locale, '回顾学习路径', 'Review the path')}<ArrowRight size={16} /></Link>}</div></article>
    <aside className="page-toc"><span>{text(locale, '本章内容', 'ON THIS PAGE')}</span>{lesson.sections.map((s, i) => <a key={i} href={`#part-${i}`} onClick={() => { if (tab !== 'read') setParams({}); }}>{s.heading[locale]}</a>)}<div className="toc-source"><Code2 size={16} /><p>{text(locale, '理解机制，也读懂源码。', 'Learn the mechanism. Read the source.')}</p><a href={`${UPSTREAM}${lesson.sourcePath}`} target="_blank" rel="noreferrer">DeepInfer<ExternalLink size={12} /></a></div></aside>
  </div>;
}

function ComparePage({ locale }: { locale: Locale }) {
  const [a, setA] = useState('s01'); const [b, setB] = useState('s03');
  const left = lessons.find(l => l.id === a)!; const right = lessons.find(l => l.id === b)!;
  const diff = useMemo(() => diffLines(left.code, right.code), [left.code, right.code]);
  return <section className="compare-page standalone-section"><div className="section-heading"><span className="eyebrow">WHAT CHANGES?</span><h1>{text(locale, '每一步，为什么而改变？', 'What changes, and why?')}</h1><p className="section-description">{text(locale, '并排比较章节的职责与状态，再观察框架伪代码如何变化。', 'Compare responsibilities and state across lessons, then inspect their framework pseudocode.')}</p></div><div className="compare-selectors">{[[a, setA, text(locale, '起点', 'FROM')], [b, setB, text(locale, '下一步', 'TO')]].map(([value, setter, label], i) => <div key={i}><label htmlFor={`compare-${i}`}>{label as string}</label><select id={`compare-${i}`} value={value as string} onChange={e => (setter as (v: string) => void)(e.target.value)}>{lessons.map(l => <option key={l.id} value={l.id}>{l.id} · {l.title}</option>)}</select></div>)}<GitCompareArrows className="compare-center" size={22} /></div><div className="comparison-insights">{[left, right].map((l, i) => <div key={i}><Badge lesson={l} /><h2>{l.name[locale]}</h2><p>{l.insight[locale]}</p><Link className="text-link" to={`/${locale}/${l.id}`}>{text(locale, '阅读这一章', 'Read lesson')}<ArrowRight size={14} /></Link></div>)}</div><div className="diff-heading"><h2>{text(locale, '关键代码对比', 'Teaching excerpt diff')}</h2><span><i className="removed" />{text(locale, '移除', 'Removed')}<i className="added" />{text(locale, '增加', 'Added')}</span></div><div className="code-diff"><div className="diff-filenames"><code>{left.filename}</code><ArrowRight size={14} /><code>{right.filename}</code></div><pre>{diff.map((part, i) => <span key={i} className={part.added ? 'diff-added' : part.removed ? 'diff-removed' : ''}>{part.value.replace(/\n$/, '').split('\n').map((line, j) => <span className="diff-line" key={j}><i>{part.added ? '+' : part.removed ? '−' : ' '}</i>{line || ' '}{'\n'}</span>)}</span>)}</pre></div><p className="path-note">{text(locale, '对比对象为框架阅读伪代码，用来理解职责与状态依赖。', 'The comparison uses framework reading pseudocode to explain responsibilities and state dependencies.')}</p></section>;
}

function SearchDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const [query, setQuery] = useState(''); const box = useRef<HTMLDivElement>(null);
  const results = lessons.filter(l => `${l.id} ${l.title} ${l.name.zh} ${l.name.en} ${l.summary.zh} ${l.summary.en}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = old; }; }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="search-dialog" ref={box} role="dialog" aria-modal="true" aria-label={text(locale, '搜索课程', 'Search lessons')} onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab') { const items = box.current?.querySelectorAll<HTMLElement>('button,input,a'); if (items?.length) { const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } } }}><div className="search-input-row"><Search size={20} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={text(locale, '搜索机制、章节或关键词…', 'Search mechanisms, lessons, or keywords…')} aria-label={text(locale, '搜索关键词', 'Search query')} /><button onClick={onClose} aria-label={text(locale, '关闭搜索', 'Close search')}><X size={19} /></button></div><div className="search-results"><span>{query ? text(locale, `${results.length} 条结果`, `${results.length} results`) : text(locale, '全部课程', 'ALL LESSONS')}</span>{results.map(l => <Link to={`/${locale}/${l.id}`} onClick={onClose} key={l.id}><Badge lesson={l} /><div><b>{l.title}</b><p>{l.name[locale]}</p></div><ArrowRight size={15} /></Link>)}{results.length === 0 && <p className="search-empty">{text(locale, '试试 KV cache、调度或 MoE。', 'Try KV cache, scheduling, or MoE.')}</p>}</div><div className="search-footer"><kbd>esc</kbd>{text(locale, '关闭', 'to close')}<span>Learn DeepInfer</span></div></div></div>;
}

function Site() {
  const { locale: localeParam = 'zh', page = '' } = useParams();
  const locale: Locale = localeParam === 'en' ? 'en' : 'zh';
  const location = useLocation();
  const [theme, setTheme] = useStored<'light' | 'dark'>('learn-deepinfer:theme', 'light');
  const [storedCompleted, setCompleted] = useStored<string[]>('learn-deepinfer:completed', []);
  const completed = Array.isArray(storedCompleted) ? storedCompleted.filter(id => lessons.some(l => l.id === id)) : [];
  const [searchOpen, setSearchOpen] = useState(false); const [mobileMenu, setMobileMenu] = useState(false);
  const searchReturnFocus = useRef<HTMLElement | null>(null);
  function openSearch() { searchReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSearchOpen(true); }
  function closeSearch() { setSearchOpen(false); requestAnimationFrame(() => { if (searchReturnFocus.current?.isConnected) searchReturnFocus.current.focus(); }); }
  const lesson = lessons.find(l => l.id === page);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; document.title = `${lesson ? lesson.title + ' — ' : ''}Learn DeepInfer`; window.scrollTo({ top: 0 }); setMobileMenu(false); setSearchOpen(false); }, [location.pathname, locale, lesson]);
  useEffect(() => { function key(e: KeyboardEvent) { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (searchOpen) closeSearch(); else openSearch(); } if (e.key === 'Escape' && searchOpen) closeSearch(); } window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [searchOpen]);
  function toggleComplete(id: string) { setCompleted(completed.includes(id) ? completed.filter(x => x !== id) : [...completed, id]); }
  if (!['zh', 'en'].includes(localeParam)) return <Navigate to="/zh/" replace />;
  const navItems = [['timeline', text(locale, '学习路径', 'Learning path')], ['compare', text(locale, '章节对比', 'Compare')], ['layers', text(locale, '架构层', 'Architecture')]];
  return <><a className="skip-link" href="#main">{text(locale, '跳转到正文', 'Skip to content')}</a><header className="site-header"><div className="header-inner"><Link className="brand" to={`/${locale}/`} aria-label="Learn DeepInfer home"><img className="brand-mark" src="/brand/logo-192.png" alt="" width="30" height="30" /><span>Learn DeepInfer</span></Link><nav className={`main-nav ${mobileMenu ? 'is-open' : ''}`} aria-label={text(locale, '主导航', 'Main navigation')}>{navItems.map(([route, label]) => <Link key={route} className={page === route ? 'active' : ''} to={`/${locale}/${route}`}>{label}</Link>)}</nav><div className="header-controls"><button className="search-trigger" onClick={openSearch} aria-label={text(locale, '搜索课程', 'Search lessons')}><Search size={16} /><kbd>⌘ K</kbd></button><div className="language-switch" aria-label="Language"><Link className={locale === 'en' ? 'active' : ''} to={`/en/${page}${location.search}`}>EN</Link><Link className={locale === 'zh' ? 'active' : ''} to={`/zh/${page}${location.search}`}>中文</Link></div><span className="header-divider" /><button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={text(locale, theme === 'dark' ? '切换浅色主题' : '切换深色主题', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button><a className="icon-button github-link" href="https://github.com/learn-deepinfer/learn-deepinfer.github.io" target="_blank" rel="noreferrer" aria-label={text(locale, '网站 GitHub 仓库', 'Website GitHub repository')}><Github size={20} /></a><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-label={text(locale, '打开导航', 'Toggle navigation')}>{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button></div></div></header>
    <main id="main" className={lesson ? 'site-main lesson-main' : 'site-main'}>{page === '' ? <Home locale={locale} completed={completed} /> : page === 'timeline' ? <LearningPath locale={locale} completed={completed} full /> : page === 'compare' ? <ComparePage locale={locale} /> : page === 'layers' ? <><Architecture locale={locale} full /><OfficialDesign locale={locale} /></> : lesson ? <LessonPage key={lesson.id} lesson={lesson} locale={locale} completed={completed} toggleComplete={toggleComplete} /> : <div className="empty-state not-found"><span className="eyebrow">404</span><h1>{text(locale, '这一页，还不在学习路径上。', 'This page is off the learning path.')}</h1><Link className="button primary" to={`/${locale}/`}>{text(locale, '返回首页', 'Back home')}<ArrowRight size={16} /></Link></div>}</main>
    <footer className="site-footer"><div><Link className="footer-brand" to={`/${locale}/`}><img className="brand-mark" src="/brand/logo-192.png" alt="" width="24" height="24" />Learn DeepInfer</Link><p>{text(locale, '独立社区学习项目 · DeepInfer 框架讲解与理解', 'An independent guide to understanding the DeepInfer framework')}</p></div><div className="footer-links"><a href="https://github.com/deepseek-ai/DeepInfer" target="_blank" rel="noreferrer">DeepInfer<ExternalLink size={12} /></a><a href={REFERENCE} target="_blank" rel="noreferrer">{text(locale, '灵感来自 Learn Claude Code', 'Inspired by Learn Claude Code')}<ExternalLink size={12} /></a><span>Made for the curious.</span></div></footer>{searchOpen && <SearchDialog locale={locale} onClose={closeSearch} />}
  </>;
}

export default function App() { return <Routes><Route path="/" element={<Navigate to="/zh/" replace />} /><Route path="/:locale/:page?" element={<Site />} /><Route path="*" element={<Navigate to="/zh/404" replace />} /></Routes>; }
