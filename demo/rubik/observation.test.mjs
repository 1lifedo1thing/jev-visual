import test from "node:test";
import assert from "node:assert/strict";
import { Cube } from "./cube.mjs";
import {
  netCells,
  colorQuestions,
  evaluateColors,
  NET_SIZE,
} from "./observation.mjs";
test("net includes 24 uniquely named facelets in fixed positions within the image", () => {
  const a = new Cube(),
    cells = netCells(a);
  assert.equal(cells.length, 24);
  assert.equal(new Set(cells.map((c) => c.id)).size, 24);
  const u1 = cells.find((c) => c.id === "U1"),
    f1 = cells.find((c) => c.id === "F1"),
    d1 = cells.find((c) => c.id === "D1");
  assert.equal(u1.x, f1.x);
  assert.equal(f1.x, d1.x);
  assert.ok(u1.y < f1.y && f1.y < d1.y);
  cells.forEach((c) =>
    assert.ok(
      c.x >= 0 && c.x + 68 < NET_SIZE.width && c.y + 68 < NET_SIZE.height,
    ),
  );
  a.turn("R");
  const after = netCells(a);
  assert.deepEqual(
    after.map(({ id, x, y }) => ({ id, x, y })),
    cells.map(({ id, x, y }) => ({ id, x, y })),
  );
  assert.notDeepEqual(
    after.map((c) => c.letter),
    cells.map((c) => c.letter),
  );
});
test("recognition questions are static and never carry the actual colors", () => {
  const questions = colorQuestions();
  assert.equal(Object.keys(questions).length, 24);
  Object.values(questions).forEach((q) => {
    assert.deepEqual(Object.keys(q).sort(), [
      "criteria",
      "instructions",
      "scoring",
      "type",
    ]);
    assert.equal(Object.keys(q.criteria).length, 6);
  });
  assert.match(questions.U1.instructions, /top-left/);
  assert.match(questions.D4.instructions, /bottom-right/);
});
test("post-hoc scoring counts incorrect and missing predictions without modifying answers or cube", () => {
  const c = new Cube();
  c.turn("F'");
  const before = c.snapshot();
  const answers = Object.fromEntries(
    netCells(c).map((x) => [
      x.id,
      { choice: x.letter, probabilities: { [x.letter]: 1 } },
    ]),
  );
  assert.equal(evaluateColors(c, answers).correct, 24);
  delete answers.U1;
  answers.F2.choice = "invalid";
  const result = evaluateColors(c, answers);
  assert.equal(result.correct, 22);
  assert.equal(answers.F2.choice, "invalid");
  assert.equal(c.snapshot(), before);
});
