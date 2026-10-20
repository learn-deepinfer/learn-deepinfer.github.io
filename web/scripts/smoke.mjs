/**
 * Browser integration checks; no product dependencies are required.
 * Start Vite first, then run:
 * PLAYWRIGHT_MODULE=/path/to/playwright node scripts/smoke.mjs
 * Optional: BASE_URL, PLAYWRIGHT_EXECUTABLE, SMOKE_FILTER (test-name regex).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.BASE_URL || 'http://127.0.0.1:5178').replace(/\/$/, '');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const failures = [];
const runtimeErrors = [];
const filter = process.env.SMOKE_FILTER ? new RegExp(process.env.SMOKE_FILTER, 'i') : null;
let checks = 0;
page.on('pageerror', error => runtimeErrors.push(error.message));

async function goto(path) {
  const destination = new URL(path, `${base}/`);
  if (!destination.pathname.endsWith('/')) destination.pathname += '/';
  await page.goto(destination.href);
  await page.locator('.site-header').waitFor();
}
async function check(name, run) {
  if (filter && !filter.test(name)) return;
  checks += 1;
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function counter(expected) {
  await page.waitForFunction(value => document.querySelector('.il-step-counter')?.textContent?.replace(/\s/g, '') === value, expected);
}

try {
  await check('homepage contains twelve course cards', async () => {
    await goto('/zh/');
    assert.equal(await page.locator('.lesson-card').count(), 12);
    assert.equal(await page.locator('.home-lab .inference-lab').count(), 1);
    assert.match(await page.locator('h1').innerText(), /Learn DeepInfer/);
  });

  await check('framework guide has no execution or download entry points', async () => {
    for (const locale of ['zh', 'en']) {
      for (const route of ['', 's01', 's01?tab=code', 's01?tab=source']) {
        await goto(`/${locale}/${route}`);
        assert.equal(await page.locator('.local-experiment, video, a[download], a[href^="/source/"]').count(), 0);
        assert.equal(await page.locator('a[href$=".zip"]').count(), 0);
        assert.doesNotMatch(await page.locator('main').innerText(), /\b(?:CPU|GPU|Qwen|FP32)\b|生成真实文本|Download Chapter|RUN ON YOUR COMPUTER/i);
      }
    }
  });

  await check('architecture follows all seven framework boundaries', async () => {
    await goto('/en/layers');
    assert.deepEqual(await page.locator('.source-pipeline code').allTextContents(), [
      'LLM.generate', 'LLMEngine.step', 'Scheduler', 'Worker', 'ModelRunner', 'Sampling', 'State updates',
    ]);
    await goto('/en/s01?tab=code');
    assert.match(await page.locator('[role="tabpanel"] .code-window').innerText(), /Framework pseudocode/);
    await goto('/en/s10');
    assert.match(await page.locator('.lesson-heading h1').innerText(), /Overlap the Pipeline/);
  });

  await check('start link opens lesson and all four tabs work', async () => {
    await goto('/zh/');
    await page.locator('.hero-actions .primary').click();
    await page.waitForURL('**/zh/s01');
    await page.getByRole('tab', { name: '课程讲解', exact: true }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 4);
    await page.getByRole('tab', { name: '关键代码', exact: true }).click();
    await page.waitForURL('**?tab=code');
    assert.equal(await page.locator('[role="tabpanel"] .code-window').count() > 0, true);
    await page.getByRole('tab', { name: '机制演示', exact: true }).click();
    await page.locator('[role="tabpanel"] .inference-lab').waitFor();
    await page.getByRole('tab', { name: '源码对照', exact: true }).click();
    assert.match(await page.locator('.upstream-source').getAttribute('href'), /8b161497/);
    await page.getByRole('tab', { name: '课程讲解', exact: true }).click();
    assert.equal(await page.locator('.prose-section').count() > 0, true);
  });

  await check('keyboard tabs: arrows, Home, End, roving focus, and panel labels', async () => {
    await goto('/zh/s02');
    const tabs = page.getByRole('tab');
    await tabs.first().waitFor();
    await tabs.first().focus();
    async function activeTab(index) {
      await page.waitForFunction(expected => {
        const all = [...document.querySelectorAll('[role="tab"]')];
        return all[expected]?.getAttribute('aria-selected') === 'true' && document.activeElement === all[expected];
      }, index);
      assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
      assert.deepEqual(await tabs.evaluateAll(elements => elements.map(node => node.tabIndex)), Array.from({ length: 4 }, (_, i) => i === index ? 0 : -1));
      const panel = page.getByRole('tabpanel');
      assert.equal(await panel.getAttribute('aria-labelledby'), await tabs.nth(index).getAttribute('id'));
      assert.equal(await tabs.nth(index).getAttribute('aria-controls'), await panel.getAttribute('id'));
    }
    await activeTab(0);
    for (const [key, next] of [['ArrowRight', 1], ['ArrowRight', 2], ['ArrowLeft', 1], ['End', 3], ['ArrowRight', 0], ['ArrowLeft', 3], ['Home', 0]]) {
      await page.keyboard.press(key);
      await activeTab(next);
    }
  });

  await check('keyboard search: Escape restores the opening button focus', async () => {
    await goto('/zh/');
    const trigger = page.getByRole('button', { name: '搜索课程', exact: true });
    await trigger.focus();
    await trigger.press('Enter');
    await page.getByRole('dialog', { name: '搜索课程', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: '搜索关键词' }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.matches('.search-trigger'));
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  });

  await check('static batch: finished rows held, new arrivals wait, then all leave', async () => {
    await goto('/zh/s05?tab=lab');
    await counter('01/08');
    const next = page.getByRole('button', { name: '下一步', exact: true });
    await next.click();
    await next.click();
    await counter('03/08');
    assert.equal(await page.locator('.il-request-b.is-held').count(), 1);
    assert.equal(await page.locator('.il-request-c.is-held').count(), 1);
    assert.deepEqual(await page.locator('.il-slot .il-request-title b').allTextContents(), ['A', 'B', 'C']);
    assert.deepEqual((await page.locator('.il-batch-top .il-token').allTextContents()).map(value => value.replace(/\s/g, ' ')), ['req D', 'req E']);
    assert.equal(await page.locator('.il-request-b .il-request-steps .is-filled').count(), 2);
    assert.equal(await page.locator('.il-completed-request').count(), 0);
    await next.click();
    await next.click();
    await counter('05/08');
    assert.deepEqual(await page.locator('.il-slot .il-request-title b').allTextContents(), ['D', 'E']);
    assert.equal(await page.locator('.il-batch-top .il-token').count(), 0);
    const slider = page.getByRole('slider', { name: '演示步骤' });
    await slider.focus();
    await slider.press('End');
    await counter('08/08');
    assert.equal(await page.locator('.il-slot.is-vacant').count(), 3);
    assert.equal(await page.locator('.il-completed-request').count(), 5);
    await page.getByRole('button', { name: '重置演示', exact: true }).click();
    await counter('01/08');
  });

  for (const [mode, route, last, verify] of [
    ['loop', 's01', 6, async () => {
      assert.equal(await page.locator('.il-token--new').count(), 2);
      assert.match(await page.locator('.il-cache-count').innerText(), /^4/);
      assert.match(await page.locator('.il-stage.is-active').innerText(), /后处理/);
    }],
    ['cache', 's03', 5, async () => assert.deepEqual(await page.locator('.il-compute-metric b').allTextContents(), ['8', '1'])],
    ['batch', 's06', 5, async () => { assert.equal(await page.locator('.il-completed-request').count(), 5); assert.equal(await page.locator('.il-slot.is-vacant').count(), 3); }],
    ['speculation', 's09', 3, async () => { assert.equal(await page.locator('.il-commit-row .il-token--accepted').count(), 2); assert.equal(await page.locator('.il-commit-row .il-token--new').count(), 1); }],
    ['experts', 's12', 3, async () => assert.deepEqual(await page.locator('.il-expert-card .il-row-label b').allTextContents(), ['2 tokens', '1 tokens', '2 tokens', '3 tokens'])],
  ]) {
    await check(`lab ${mode}: step, final state, and reset`, async () => {
      await goto(`/zh/${route}?tab=lab`);
      const total = String(last + 1).padStart(2, '0');
      await counter(`01/${total}`);
      await page.getByRole('button', { name: '下一步', exact: true }).click();
      await counter(`02/${total}`);
      const slider = page.getByRole('slider', { name: '演示步骤' });
      await slider.focus();
      await slider.press('End');
      await counter(`${total}/${total}`);
      assert.equal(await page.getByRole('button', { name: '下一步', exact: true }).isDisabled(), true);
      await verify();
      await page.getByRole('button', { name: '重置演示', exact: true }).click();
      await counter(`01/${total}`);
    });
  }

  await check('framework loop separates sampling, commit, and cache growth', async () => {
    await goto('/en/s01?tab=lab');
    assert.match(await page.locator('.il-demo-label').innerText(), /preset framework states/i);
    const slider = page.getByRole('slider', { name: 'Demo step' });
    await slider.focus();
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await counter('03/07');
    assert.equal(await page.locator('.il-token--new').count(), 1);
    assert.match(await page.locator('.il-cache-count').innerText(), /^3/);
    assert.match(await page.locator('.il-stage.is-active').innerText(), /Sample/);
    await slider.press('ArrowRight');
    await counter('04/07');
    assert.match(await page.locator('.il-cache-count').innerText(), /^3/);
    assert.match(await page.locator('.il-stage.is-active').innerText(), /Commit/);
    await slider.press('ArrowRight');
    await counter('05/07');
    assert.equal(await page.locator('.il-token--new').count(), 1);
    assert.match(await page.locator('.il-cache-count').innerText(), /^4/);
  });

  await check('play advances, pause stops, and navigation cleans up timer', async () => {
    await goto('/zh/s01?tab=lab');
    await page.getByRole('button', { name: '播放演示', exact: true }).click();
    await counter('02/07');
    await page.getByRole('button', { name: '暂停演示', exact: true }).click();
    const stopped = await page.locator('.il-step-counter').innerText();
    await page.waitForTimeout(1850);
    assert.equal(await page.locator('.il-step-counter').innerText(), stopped);
    await page.getByRole('button', { name: '播放演示', exact: true }).click();
    await page.getByRole('tab', { name: '课程讲解', exact: true }).click();
    await page.getByRole('tab', { name: '机制演示', exact: true }).click();
    await counter('01/07');
  });

  await check('completion persists after reload', async () => {
    await goto('/zh/s01');
    await page.getByRole('button', { name: '标记为已完成', exact: true }).click();
    await page.reload();
    const complete = page.getByRole('button', { name: '已完成 · 点击撤销', exact: true });
    await complete.waitFor();
    assert.equal(await complete.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('learn-deepinfer:completed'))), ['s01']);
  });

  await check('language switch keeps lesson and selected tab', async () => {
    await goto('/zh/s09?tab=source');
    await page.getByRole('link', { name: 'EN', exact: true }).click();
    await page.waitForURL('**/en/s09?tab=source');
    assert.equal(await page.getByRole('tab', { name: 'Source', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.getByRole('link', { name: '中文', exact: true }).click();
    await page.waitForURL('**/zh/s09?tab=source');
  });

  await check('theme choice persists after reload', async () => {
    await goto('/en/');
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.reload();
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  });

  await check('global search filters and navigates to a result', async () => {
    await goto('/zh/');
    await page.getByRole('button', { name: '搜索课程', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '搜索课程', exact: true });
    await dialog.getByRole('textbox', { name: '搜索关键词' }).fill('KV cache');
    const results = dialog.locator('.search-results a');
    assert.equal((await results.count()) > 0 && (await results.count()) < 12, true);
    const destination = await results.first().getAttribute('href');
    await results.first().click();
    await page.waitForURL(`${base}${destination}`);
    assert.equal(await page.getByRole('dialog').count(), 0);
  });

  await check('course filters, local search, and empty-state reset', async () => {
    await goto('/zh/timeline');
    await page.getByRole('button', { name: '推理核心', exact: true }).click();
    assert.equal(await page.locator('.lesson-card').count(), 3);
    await page.getByRole('button', { name: '全部课程', exact: false }).click();
    await page.getByRole('textbox', { name: '搜索课程', exact: true }).fill('s12');
    assert.equal(await page.locator('.lesson-card').count(), 1);
    await page.getByRole('textbox', { name: '搜索课程', exact: true }).fill('no-such-mechanism-xyz');
    assert.equal(await page.locator('.lesson-card').count(), 0);
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    assert.equal(await page.locator('.lesson-card').count(), 12);
  });

  await check('comparison selectors update code diff', async () => {
    await goto('/zh/compare');
    const initial = await page.locator('.code-diff').innerText();
    await page.locator('#compare-0').selectOption('s02');
    await page.locator('#compare-1').selectOption('s11');
    assert.notEqual(await page.locator('.code-diff').innerText(), initial);
    assert.equal(await page.locator('.diff-added').count() > 0, true);
    assert.equal(await page.locator('.diff-removed').count() > 0, true);
    await page.locator('#compare-0').selectOption('s11');
    assert.equal(await page.locator('.diff-added,.diff-removed').count(), 0);
  });

  await check('mobile 390px: no page-level horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/zh/', '/zh/timeline', '/zh/compare', '/zh/layers', '/zh/s01', '/zh/s01?tab=lab', '/zh/s03?tab=lab', '/zh/s06?tab=lab', '/zh/s09?tab=lab', '/zh/s12?tab=lab', '/en/s09?tab=lab']) {
      await goto(path);
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dimensions.scroll <= dimensions.width + 1, true, `${path}: viewport=${dimensions.width}, scrollWidth=${dimensions.scroll}`);
    }
  });

  await check('no uncaught browser runtime errors', async () => assert.deepEqual(runtimeErrors, []));
  console.log(JSON.stringify({ checks, failed: failures.length, failures, runtimeErrors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
if (failures.length) process.exitCode = 1;
