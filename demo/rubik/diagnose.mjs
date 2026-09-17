// Actual model, six known test fixtures. Ground truth is used AFTER predictions only.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const out = fileURLToPath(new URL("../../artifacts/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
const trials = [];
try {
  for (const [i, scramble] of ["U", "U'", "R", "R'", "F", "F'"].entries()) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    });
    await page.addInitScript(
      (value) => {
        Math.random = () => value;
      },
      (i + 0.1) / 6,
    );
    await page.goto(
      `${process.env.DEMO_URL || "http://127.0.0.1:8788"}/demo/rubik/`,
    );
    await page.waitForFunction(() => !!window.demoController);
    await page.locator("#inspect-colors").click();
    await page.waitForFunction(
      () => !window.demoController.isBusy(),
      {},
      { timeout: 120000 },
    );
    const recognition = await page.evaluate(() => window.rubikProbe);
    if (!recognition)
      throw new Error(await page.locator(".status").textContent());
    await page.locator("#single-step").click();
    await page.waitForFunction(
      () =>
        window.demoController.records.length === 1 &&
        !window.demoController.isBusy(),
      {},
      { timeout: 120000 },
    );
    const action = await page.evaluate(() => window.demoController.records[0]);
    if (!action.output)
      throw new Error(action.error || "missing action output");
    const entries = Object.entries(action.input.questions.action.criteria);
    const orders = {
      original: entries,
      reversed: [...entries].reverse(),
      rotated: [...entries.slice(4), ...entries.slice(0, 4)],
    };
    const input = {
      image: action.input.image,
      mode: "shared",
      questions: Object.fromEntries(
        Object.entries(orders).map(([key, entries]) => [
          key,
          {
            ...action.input.questions.action,
            criteria: Object.fromEntries(entries),
          },
        ]),
      ),
    };
    const bias = await page.evaluate(async (input) => {
      const r = await fetch("/v1/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const output = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(output));
      return { input, output };
    }, input);
    const choices = Object.fromEntries(
      Object.entries(bias.output.answers).map(([key, a]) => [
        key,
        {
          action: a.choice,
          label: String.fromCharCode(
            65 + orders[key].findIndex(([id]) => id === a.choice),
          ),
        },
      ]),
    );
    trials.push({ scramble, recognition, action, bias, choices });
    console.log(
      JSON.stringify({
        scramble,
        readCorrect: recognition.result.correct,
        outOf: 24,
        action: action.action,
        solved: action.gameAfter?.won,
        choices,
      }),
    );
    await writeFile(
      `${out}rubik-net-diagnosis.json`,
      JSON.stringify(trials, null, 2),
    );
    if (i === 0) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `${out}rubik-net-diagnosis.png`,
        fullPage: true,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
