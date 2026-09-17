// Read-only model probe: known scene positions are used for rendering and evaluation only.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base = process.env.DEMO_URL || 'http://127.0.0.1:8788';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const out = fileURLToPath(new URL('../../artifacts/', import.meta.url));
await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/demo/breakout/`);
  const scenes = await page.evaluate(async () => {
    const { createGame } = await import('./physics.mjs');
    const { drawBoard } = await import('./render.mjs');
    const { instructions, criteria } = await import('./observation.mjs');
    return [[30,480], [160,180], [290,480], [430,180], [610,480], [90,180], [220,480], [345,180], [490,480], [570,180]].map(([ball, paddle], index) => {
      const game = createGame(); game.paddle = paddle; game.ball.x = ball; game.ball.y = index % 2 ? 360 : 200;
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      drawBoard(canvas, game);
      const q = c => ({ type: 'choice', scoring: 'label', instructions, criteria: c });
      return { id: index, expected: String(Math.floor(ball / 128) + 1), input: {
        image: canvas.toDataURL('image/png'), mode: 'shared',
        questions: { action: q(criteria) },
      } };
    });
  });
  const records = [];
  for (const scene of scenes) {
    const response = await page.request.post(`${base}/v1/judge`, { data: scene.input, timeout: 120000 });
    if (!response.ok()) throw new Error(await response.text());
    const output = await response.json();
    records.push({ ...scene, output });
    console.log(scene.id, scene.expected, output.answers.action.choice);
  }
  await writeFile(`${out}breakout-lane-validation.json`, JSON.stringify(records, null, 2));
  console.log('Saved ten new lane-position probes to artifacts/breakout-lane-validation.json');
} finally { await browser.close(); }
