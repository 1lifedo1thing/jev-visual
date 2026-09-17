import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const real = process.argv.includes('--real');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const out = fileURLToPath(new URL('../../artifacts/', import.meta.url));
await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  let mode = 'normal', inFlight = 0, maxFlight = 0;
  if (!real) await page.route('**/v1/judge', async route => {
    const request = route.request().postDataJSON(); requests.push(request);
    assert.deepEqual(Object.keys(request).sort(), ['image', 'mode', 'questions']);
    assert.deepEqual(Object.keys(request.questions), ['action']);
    assert.deepEqual(Object.keys(request.questions.action.criteria), ['1', '2', '3', '4', '5']);
    if (requests.length > 1) assert.deepEqual(request.questions, requests[0].questions);
    inFlight++; maxFlight = Math.max(maxFlight, inFlight);
    const delay = mode === 'slow' ? 1100 : mode === 'pending' ? 500 : 30;
    const error = mode === 'error';
    await new Promise(r => setTimeout(r, delay));
    inFlight--;
    try {
      await route.fulfill(error ? { status: 500, json: { detail: 'Test failure' } } : {
        json: { answers: { action: { choice: '5', probabilities: { '1': .025, '2': .025, '3': .025, '4': .025, '5': .9 } } }, metrics: { elapsed_ms: 20 } },
      });
    } catch { /* Deliberately canceled request. */ }
  });
  await page.goto(`${process.env.DEMO_URL || 'http://127.0.0.1:8788'}/demo/breakout/`);
  await page.waitForFunction(() => !!window.breakoutDemo);
  if (real) {
    await page.locator('#ai').click();
    await page.waitForFunction(() => ['won', 'lost'].includes(window.breakoutDemo.summary().phase) || window.breakoutDemo.records.length >= 80, {}, { timeout: 100000 });
    await page.locator('#pause').click({ timeout: 1000 }).catch(() => {});
    const result = await page.evaluate(() => ({ summary: window.breakoutDemo.summary(), records: window.breakoutDemo.records }));
    await writeFile(`${out}breakout-real.json`, JSON.stringify(result, null, 2));
    console.log('Real model run:', JSON.stringify(result.summary));
  } else {
    // Manual movement verified from visible paddle pixels, without a hidden controller.
    const paddle = () => page.locator('#board').evaluate(c => {
      const data = c.getContext('2d').getImageData(0, 441, 640, 1).data;
      const xs = [];
      for (let x = 0; x < 640; x++) if (data[x * 4] > 230 && data[x * 4 + 1] > 120 && data[x * 4 + 1] < 190) xs.push(x);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    });
    const initial = await paddle();
    await page.locator('#play').click();
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(220); await page.keyboard.up('ArrowLeft');
    assert.ok(await paddle() < initial - 30);
    await page.locator('[data-lane="1"]').click();
    await page.waitForFunction(() => Math.abs(window.breakoutDemo.summary().paddle - 72) <= 1.25);
    await page.locator('[data-lane="5"]').click();
    await page.waitForFunction(() => Math.abs(window.breakoutDemo.summary().paddle - 568) <= 1.25);
    assert.equal(requests.length, 0, 'manual lane buttons never call the model');
    await page.locator('#pause').click();
    const stopped = await paddle(); await page.waitForTimeout(180); assert.equal(await paddle(), stopped);
    await page.locator('#reset').click();
    await page.locator('#ai').click();
    await page.waitForFunction(() => window.breakoutDemo.records.length >= 2);
    assert.equal(await page.locator('[data-action="left"]').isDisabled(), true);
    assert.ok(await paddle() > initial);
    assert.equal(await page.locator('.live-record').first().locator('.live-prob').count(), 5);
    const dimensions = await page.evaluate(async () => {
      const img = new Image(); img.src = window.breakoutDemo.records[0].input.image; await img.decode();
      return [img.width, img.height];
    });
    assert.deepEqual(dimensions, [640, 480]);
    await page.locator('#pause').click();
    await page.waitForFunction(() => !window.breakoutDemo.busy); await page.waitForTimeout(100);
    await page.locator('#reset').click(); mode = 'pending';
    await page.locator('#ai').click(); await page.waitForFunction(() => window.breakoutDemo.busy);
    await page.locator('#reset').click(); await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => window.breakoutDemo.records.length), 0);
    assert.equal(await paddle(), initial);
    mode = 'slow'; await page.locator('#ai').click();
    await page.waitForFunction(() => window.breakoutDemo.records.length >= 1);
    assert.equal(await page.evaluate(() => window.breakoutDemo.records[0].executed), false);
    assert.equal(await paddle(), initial);
    await page.locator('#pause').click(); await page.waitForFunction(() => !window.breakoutDemo.busy);
    await page.waitForTimeout(1200); await page.locator('#reset').click();
    mode = 'error'; await page.locator('#ai').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Test failure'));
    assert.equal(await page.locator('#pause').isDisabled(), true);
    assert.equal(maxFlight, 1);
    console.log('PASS: manual controls, image-only fixed payload, single full-size frame, probabilities, stale-response rejection, reset cancellation and error pause');
  }
  await page.screenshot({ path: `${out}breakout-${real ? 'real' : 'ui'}.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
