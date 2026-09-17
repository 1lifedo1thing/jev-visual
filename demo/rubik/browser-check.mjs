import assert from "node:assert/strict";
import { Cube } from "./cube.mjs";
import { netCells } from "./observation.mjs";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Math.random = () => 0.25;
  }); // fixed U' scramble, test only
  let inputs = [];
  let reads = [];
  let holdProbe = false,
    releaseProbe;
  const reference = new Cube();
  reference.turn("U'");
  const expected = netCells(reference);
  await page.route("**/v1/judge", async (route) => {
    const request = route.request().postDataJSON();
    if (Object.keys(request.questions).length === 24) {
      reads.push(request);
      if (holdProbe) await new Promise((resolve) => (releaseProbe = resolve));
      const answers = Object.fromEntries(
        expected.map((c, i) => [
          c.id,
          {
            choice: i === 0 ? (c.letter === "W" ? "B" : "W") : c.letter,
            probabilities: {
              W: 1 / 6,
              Y: 1 / 6,
              R: 1 / 6,
              O: 1 / 6,
              G: 1 / 6,
              B: 1 / 6,
            },
          },
        ]),
      );
      try {
        await route.fulfill({ json: { answers, metrics: { elapsed_ms: 2 } } });
      } catch {}
      return;
    }

    inputs.push(route.request().postDataJSON());
    const ids = Object.keys(inputs.at(-1).questions.action.criteria);
    await route.fulfill({
      json: {
        answers: {
          action: {
            choice: "U",
            probabilities: Object.fromEntries(
              ids.map((x) => [x, x === "U" ? 0.89 : 0.01]),
            ),
          },
        },
        metrics: { elapsed_ms: 1 },
      },
    });
  });
  await page.goto(
    `${process.env.DEMO_URL || "http://127.0.0.1:8788"}/demo/rubik/`,
  );
  await page.waitForFunction(() => !!window.demoController);
  const snapshot = () =>
    page
      .locator("canvas")
      .first()
      .evaluate((c) => c.toDataURL());
  const initial = await snapshot();
  const modelImage = await page
    .locator("#rubik-observation")
    .evaluate((c) => c.toDataURL());
  await page.locator("#inspect-colors").click();
  await page.waitForFunction(() => !window.demoController.isBusy());
  assert.equal(reads.length, 1);
  assert.equal(reads[0].image, modelImage);
  assert.equal(await snapshot(), initial);
  assert.equal(await page.evaluate(() => window.rubikProbe.result.correct), 23);
  assert.deepEqual(Object.keys(reads[0]).sort(), [
    "image",
    "mode",
    "questions",
  ]);
  holdProbe = true;
  await page.locator("#inspect-colors").click();
  while (!releaseProbe) await page.waitForTimeout(20);
  await page.locator("#reset").click();
  releaseProbe();
  await page.waitForFunction(() => !window.demoController.isBusy());
  holdProbe = false;
  assert.equal(await page.locator("#color-report").textContent(), "");
  assert.equal(await page.evaluate(() => window.rubikProbe), null);
  await page.locator('[data-action="R"]').click();
  assert.equal(await page.locator("#single-step").isDisabled(), true);
  await page.waitForTimeout(90);
  assert.notEqual(await snapshot(), initial);
  await page.evaluate(() => window.demoController.run(false));
  assert.equal(inputs.length, 0, "never screenshot a moving layer");
  await page.waitForFunction(() => !window.demoController.isBusy());
  await page.locator('[data-action="R\'"]').click();
  await page.waitForFunction(() => !window.demoController.isBusy());
  assert.equal(
    await snapshot(),
    initial,
    "move and inverse restore the exact rendered image",
  );
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 250, { steps: 4 });
  await page.mouse.up();
  assert.equal(await snapshot(), initial, "drag cannot rotate camera");
  await page.locator('[data-action="R"]').click();
  await page.waitForTimeout(70);
  await page.locator("#reset").click();
  await page.waitForFunction(() => !window.demoController.isBusy());
  assert.equal(await snapshot(), initial, "reset cancels in-flight animation");
  await page.locator("#single-step").click();
  await page.waitForFunction(() => !window.demoController.isBusy());
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].image, modelImage);
  assert.notEqual(
    inputs[0].image,
    initial,
    "AI must receive the net, not the 3D canvas",
  );
  assert.deepEqual(Object.keys(inputs[0]).sort(), [
    "image",
    "mode",
    "questions",
  ]);
  assert.equal(await page.locator(".status").getAttribute("data-won"), "true");
  assert.equal(await page.locator(".probability").count(), 12);
  const ambiguous = await page.evaluate(async () => {
    const { Cube } = await import("./cube.mjs");
    const { renderCube } = await import("./render.mjs");
    const seqs = [
      ["D'", "R'", "R'", "R'", "R", "L", "R", "L", "B'", "R"],
      ["D'", "L'", "B", "D'", "B'", "R'", "R'", "U'", "R", "R"],
    ];
    return seqs.map((seq) => {
      const c = new Cube();
      seq.forEach((m) => c.turn(m));
      const canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 550;
      renderCube(canvas, c);
      return { full: c.snapshot(), image: canvas.toDataURL() };
    });
  });
  assert.notEqual(ambiguous[0].full, ambiguous[1].full);
  assert.notEqual(
    ambiguous[0].image,
    ambiguous[1].image,
    "complementary view must distinguish formerly hidden states",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: fileURLToPath(
      new URL("../../artifacts/rubik-multiview-verified.png", import.meta.url),
    ),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: fixed camera, 3D inverse parity, animation capture lock, reset cancellation, one-turn solution, complementary views distinguish formerly hidden states",
  );
} finally {
  await browser.close();
}
