import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const base = process.env.DEMO_URL || "http://127.0.0.1:8788",
  real = process.argv.includes("--real");
const out = fileURLToPath(new URL("../artifacts/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
  args: ["--use-fake-device-for-media-stream"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  permissions: ["camera"],
});
const errors = [];
let page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const outputs = [];
try {
  if (!real) {
    let release,
      received = false;
    await page.route("**/v1/judge", async (route) => {
      const input = route.request().postDataJSON();
      assert.deepEqual(Object.keys(input).sort(), [
        "image",
        "mode",
        "questions",
      ]);
      assert.match(input.image, /^data:image\/png;base64,/);
      assert.equal(Object.keys(input.questions.action.criteria).length, 3);
      received = true;
      await new Promise((r) => (release = r));
      try {
        await route.fulfill({
          json: {
            answers: {
              action: {
                choice: "blue",
                probabilities: { red: 0.05, blue: 0.9, yellow: 0.05 },
              },
            },
            metrics: { elapsed_ms: 12 },
          },
        });
      } catch {}
    });
    await page.goto(`${base}/demo/factory/`);
    await page.locator("#add").click();
    await page.locator("#ai").click();
    while (!received) await page.waitForTimeout(50);
    const a = await page.evaluate(() => window.factoryDebug.state.belt);
    await page.waitForTimeout(350);
    assert.ok(
      (await page.evaluate(() => window.factoryDebug.state.belt)) > a,
      "belt must animate during inference",
    );
    await page.locator("#stop").click();
    release();
    await page.waitForFunction(() => !window.factoryDebug.state.busy);
    assert.equal(
      await page.evaluate(() => window.factoryDebug.state.items[0].choice),
      null,
      "stopped response must not route item",
    );
    await page.unroute("**/v1/judge");
    await page.route("**/v1/judge", (route) =>
      route.fulfill({
        json: {
          answers: {
            action: {
              choice: "blue",
              probabilities: { red: 0.05, blue: 0.9, yellow: 0.05 },
            },
          },
          metrics: { elapsed_ms: 12 },
        },
      }),
    );
    await page.locator("#ai").click();
    await page.waitForFunction(
      () => window.factoryDebug.state.completed === 1,
      {},
      { timeout: 15000 },
    );
    assert.equal(
      await page.evaluate(() => window.factoryDebug.state.correct),
      0,
      "wrong prediction must route to wrong bin, not corrected using metadata",
    );
    assert.equal(await page.locator(".live-prob").count(), 3);
  } else {
    page.on("response", async (response) => {
      if (response.url().endsWith("/v1/judge"))
        outputs.push({
          input: response.request().postDataJSON(),
          output: await response.json(),
        });
    });
    await page.goto(`${base}/demo/factory/`);
    for (const shape of ["box", "ball", "bottle", "pyramid"])
      for (const color of ["red", "blue", "yellow"]) {
        await page.selectOption("#shape", shape);
        await page.selectOption("#color", color);
        await page.locator("#add").click();
      }
    await page.locator("#ai").click();
    await page.waitForFunction(
      () =>
        window.factoryDebug.state.completed === 12 ||
        !window.factoryDebug.state.enabled,
      {},
      { timeout: 150000 },
    );
    const state = await page.evaluate(() => window.factoryDebug.state);
    console.log("REAL FACTORY", JSON.stringify(state));
    assert.equal(state.completed, 12, "all twelve objects should complete");
    await writeFile(
      `${out}factory-real.json`,
      JSON.stringify({ state, outputs }, null, 2),
    );
  }
  await page.screenshot({
    path: `${out}factory-${real ? "real" : "ui"}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
  // Camera test ALWAYS uses a synthetic browser camera + mocked model, never hardware.
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  let cameraRequests = 0;
  await page.route("**/v1/judge", async (route) => {
    cameraRequests++;
    const input = route.request().postDataJSON();
    assert.deepEqual(Object.keys(input).sort(), ["image", "mode", "questions"]);
    assert.equal(Object.keys(input.questions.action.criteria).length, 4);
    await route.fulfill({
      json: {
        answers: {
          action: {
            choice: "palm",
            probabilities: {
              palm: 0.95,
              fist: 0.02,
              victory: 0.02,
              none: 0.01,
            },
          },
        },
        metrics: { elapsed_ms: 20 },
      },
    });
  });
  await page.goto(`${base}/demo/gestures/`);
  assert.equal(cameraRequests, 0);
  assert.equal(
    await page.evaluate(() => window.gestureDebug.state.camera),
    false,
  );
  await page.locator("#camera-on").click();
  await page.waitForFunction(() => window.gestureDebug.state.camera);
  assert.equal(cameraRequests, 0, "opening preview must not send images");
  await page.locator("#ai-on").click();
  await page.waitForFunction(
    () => window.gestureDebug.state.mode === "palm",
    {},
    { timeout: 15000 },
  );
  assert.ok(cameraRequests >= 2);
  assert.ok(
    (await page.evaluate(() => window.gestureDebug.state.frameCount)) > 10,
  );
  await page.screenshot({ path: `${out}gestures-ui.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.locator("#camera-off").click();
  assert.deepEqual(
    await page.evaluate(() => ({
      camera: window.gestureDebug.state.camera,
      active: window.gestureDebug.state.active,
      mode: window.gestureDebug.state.mode,
    })),
    { camera: false, active: false, mode: "none" },
  );
  assert.equal(await page.locator(".live-record").count(), 0);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Test denial", "NotAllowedError");
    };
  });
  await page.locator("#camera-on").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("permission denied"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: factory asynchronous routing/cancellation + synthetic-camera privacy/stability/cleanup + mobile layouts",
  );
} finally {
  await browser.close();
}
