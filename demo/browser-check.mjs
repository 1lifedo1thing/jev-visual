// UI contract test uses mocked inference; --real runs actual local-model episodes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const base = process.env.DEMO_URL || "http://127.0.0.1:8788";
const real = process.argv.includes("--real");
const out = fileURLToPath(new URL("../artifacts/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
try {
  for (const game of ["rubik"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let pending,
      delay = false,
      seen = [];
    if (!real)
      await page.route("**/v1/judge", async (route) => {
        const request = route.request().postDataJSON();
        seen.push(request);
        assert.deepEqual(Object.keys(request).sort(), [
          "image",
          "mode",
          "questions",
        ]);
        assert.match(request.image, /^data:image\/png;base64,/);
        assert.deepEqual(Object.keys(request.questions), ["action"]);
        const ids = Object.keys(request.questions.action.criteria);
        assert.equal(ids.length, 12);
        if (seen.length > 1)
          assert.deepEqual(
            request.questions,
            seen[0].questions,
            "text prompt must remain fixed across states",
          );
        if (delay) await new Promise((resolve) => (pending = resolve));
        const choice = "R";
        try {
          await route.fulfill({
            json: {
              answers: {
                action: {
                  choice,
                  probabilities: Object.fromEntries(
                    ids.map((id) => [
                      id,
                      id === choice ? 0.9 : 0.1 / (ids.length - 1),
                    ]),
                  ),
                },
              },
              metrics: { elapsed_ms: 12 },
            },
          });
        } catch {
          /* Abort deliberately closes the request. */
        }
      });
    await page.goto(`${base}/demo/${game}/`);
    await page.waitForFunction(() => !!window.demoController);
    await page.locator("#single-step").click();
    await page.waitForFunction(
      () =>
        window.demoController.records.length === 1 &&
        !window.demoController.isBusy(),
      {},
      { timeout: 120000 },
    );
    assert.equal(
      await page.locator(".probability").count(),
      12,
    );
    assert.equal(
      await page.evaluate(() => window.demoController.records[0].executed),
      true,
    );
    if (!real) {
      await page.locator("#reset").click();
      delay = true;
      const before = await page
        .locator("canvas")
        .first()
        .evaluate((c) => c.toDataURL());
      await page.locator("#single-step").click();
      await page.waitForFunction(() => window.demoController.isBusy());
      assert.equal(
        await page.locator("[data-action]").first().isDisabled(),
        true,
      );
      // Stop while the response is pending: never execute a stale action.
      while (!pending) await page.waitForTimeout(20);
      await page.locator("#stop").click();
      pending();
      await page.waitForFunction(() => !window.demoController.isBusy());
      assert.equal(
        await page.locator("canvas").first().evaluate((c) => c.toDataURL()),
        before,
      );
      assert.equal(
        await page.evaluate(() => window.demoController.records[0].executed),
        false,
      );
      delay = false;
      await page.locator("#reset").click();
      assert.equal(await page.locator(".trace-step").count(), 0);
      await page.locator("[data-action]").first().click();
      await page.waitForFunction(() => !window.demoController.isBusy());
    } else {
      // Continue from the first real action; no solver, no state hints, no retries.
      if (!(await page.locator("#start").isDisabled())) {
        await page.locator("#start").click();
        await page.waitForFunction(
          () => !window.demoController.isBusy(),
          {},
          { timeout: 240000 },
        );
      }
      const result = await page.evaluate(() => ({
        status: document.querySelector(".status").textContent,
        records: window.demoController.records,
      }));
      await writeFile(
        `${out}${game}-real-episode.json`,
        JSON.stringify(result, null, 2),
      );
      console.log(
        game,
        JSON.stringify({
          steps: result.records.length,
          status: result.status,
          won: result.records.at(-1)?.gameAfter?.won,
        }),
      );
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${out}${game}-${real ? "real" : "ui"}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${game}: ${real ? "real episode recorded" : "UI contract PASS"}`,
    );
  }
} finally {
  await browser.close();
}
