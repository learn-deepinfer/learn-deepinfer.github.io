/** Build real route documents for a domain-root GitHub Pages deployment. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'dist');
const origin = new URL(process.env.SITE_URL || 'https://learn-deepinfer.github.io');
if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('SITE_URL must be an HTTP(S) origin, such as https://learn-deepinfer.github.io');
}
const absolute = pathname => new URL(pathname, origin).href;
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const image = absolute('/brand/social-cover.jpg');
const template = await readFile(join(output, 'index.html'), 'utf8');
const rootPattern = /<div\s+id="root"\s*>\s*<\/div>/;
if (!rootPattern.test(template)) throw new Error('Vite output is missing its empty #root container');

const summaries = {
  zh: {
    '': ['Learn DeepInfer — 从一个 token 开始', '每次只加一个机制，从真实 token 生成开始，逐步理解 DeepInfer 的 KV cache、批处理、调度与专家并行。'],
    timeline: ['学习路径 — Learn DeepInfer', '12 节循序渐进的推理系统课程，从最小生成循环走向缓存、调度和分布式专家机制。'],
    compare: ['章节对比 — Learn DeepInfer', '比较两个章节的核心机制与教学代码，理解每一次状态、接口和执行流程的变化。'],
    layers: ['推理引擎架构 — Learn DeepInfer', '沿着推理核心、状态与内存、批处理与调度、分布式与专家四个层次，建立 DeepInfer 源码地图。'],
  },
  en: {
    '': ['Learn DeepInfer — One token at a time', 'Build an understanding of DeepInfer one mechanism at a time, from real token generation to KV caching, batching, scheduling, and expert parallelism.'],
    timeline: ['Learning path — Learn DeepInfer', 'Explore 12 progressive inference lessons, from a minimal generation loop to memory, scheduling, and distributed experts.'],
    compare: ['Compare lessons — Learn DeepInfer', 'Compare the ideas and teaching code behind two lessons to understand how state, interfaces, and execution evolve.'],
    layers: ['Inference architecture — Learn DeepInfer', 'Map DeepInfer source across four cooperating layers: inference core, state and memory, scheduling, and distributed experts.'],
  },
};

function metadata({ locale, page, title, description, canonical, noindex = false, redirect = false }) {
  const other = locale === 'zh' ? 'en' : 'zh';
  const path = language => `/${language}/${page ? `${page}/` : ''}`;
  return [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}" />`,
    `<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />`,
    ...(canonical ? [`<link rel="canonical" href="${escape(canonical)}" />`] : []),
    ...(!noindex ? [
      `<link rel="alternate" hreflang="zh-CN" href="${escape(absolute(path('zh')))}" />`,
      `<link rel="alternate" hreflang="en" href="${escape(absolute(path('en')))}" />`,
      `<link rel="alternate" hreflang="x-default" href="${escape(absolute(path('zh')))}" />`,
    ] : []),
    `<meta property="og:site_name" content="Learn DeepInfer" />`,
    `<meta property="og:type" content="${page?.startsWith('s') ? 'article' : 'website'}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    ...(canonical ? [`<meta property="og:url" content="${escape(canonical)}" />`] : []),
    `<meta property="og:locale" content="${locale === 'zh' ? 'zh_CN' : 'en_US'}" />`,
    `<meta property="og:locale:alternate" content="${other === 'zh' ? 'zh_CN' : 'en_US'}" />`,
    `<meta property="og:image" content="${escape(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Learn DeepInfer — understand inference, one token at a time" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escape(title)}" />`,
    `<meta name="twitter:description" content="${escape(description)}" />`,
    `<meta name="twitter:image" content="${escape(image)}" />`,
    ...(redirect ? ['<meta http-equiv="refresh" content="0; url=/zh/" />'] : []),
  ].join('\n    ');
}

function documentFor(html, details) {
  const clean = template
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']*)["']|property=["']og:[^"']*["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["'](?:canonical|alternate)["'][^>]*>/gi, '')
    .replace(/<html\b[^>]*>/i, `<html lang="${details.locale === 'zh' ? 'zh-CN' : 'en'}">`);
  return clean
    .replace('</head>', () => `    ${metadata(details)}\n  </head>`)
    .replace(rootPattern, () => `<div id="root">${html}</div>`);
}

const vite = await createServer({
  root,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  // Router 7's node export uses the module-sync condition. Keep its ESM modules
  // in one Vite module graph so StaticRouter and the route hooks share context.
  ssr: {
    noExternal: ['react-router-dom', 'react-router'],
    resolve: { conditions: ['module-sync', 'module', 'node', 'import'] },
  },
});
try {
  const { StaticRouter } = await vite.ssrLoadModule('react-router-dom');
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
  const { lessons } = await vite.ssrLoadModule('/src/data/course.ts');
  const render = pathname => renderToString(createElement(StaticRouter, { location: pathname }, createElement(App)));
  const pages = ['', 'timeline', 'compare', 'layers', ...lessons.map(lesson => lesson.id)];
  const routes = [];
  for (const locale of ['zh', 'en']) {
    for (const page of pages) {
      const pathname = `/${locale}/${page ? `${page}/` : ''}`;
      const lesson = lessons.find(item => item.id === page);
      const [title, description] = lesson
        ? [`${lesson.id.toUpperCase()} · ${lesson.title} — ${lesson.name[locale]} | Learn DeepInfer`, lesson.summary[locale]]
        : summaries[locale][page];
      const folder = join(output, locale, page);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'index.html'), documentFor(render(pathname), {
        locale, page, title, description, canonical: absolute(pathname),
      }));
      routes.push({ locale, page, pathname });
    }
  }

  // The domain root has a real, accessible link even when JavaScript is disabled.
  await writeFile(join(output, 'index.html'), documentFor(
    '<main><h1>Learn DeepInfer</h1><p><a href="/zh/">开始学习 · Start learning</a></p></main>',
    { locale: 'zh', page: '', title: summaries.zh[''][0], description: summaries.zh[''][1], canonical: absolute('/zh/'), redirect: true },
  ));

  // GitHub Pages serves this document at the original missing URL. Keep that URL
  // intact so BrowserRouter can resolve it; do not redirect every deep link home.
  await writeFile(join(output, '404.html'), documentFor(render('/zh/404'), {
    locale: 'zh', page: '404', title: 'Page not found — Learn DeepInfer',
    description: 'This page is not on the learning path. Explore the Learn DeepInfer lessons.', noindex: true,
  }));
  await writeFile(join(output, '.nojekyll'), '');
  const urls = routes.map(({ page, pathname }) => {
    const alternatives = ['zh', 'en'].map(locale => `<xhtml:link rel="alternate" hreflang="${locale === 'zh' ? 'zh-CN' : 'en'}" href="${escape(absolute(`/${locale}/${page ? `${page}/` : ''}`))}" />`).join('');
    return `  <url><loc>${escape(absolute(pathname))}</loc>${alternatives}</url>`;
  }).join('\n');
  await writeFile(join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
  await writeFile(join(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${absolute('/sitemap.xml')}\n`);
  console.log(`Prerendered ${routes.length} routes, root redirect, and SPA 404 for ${origin.origin}`);
} finally {
  await vite.close();
}
