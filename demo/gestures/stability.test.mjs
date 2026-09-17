import test from "node:test";
import assert from "node:assert/strict";
import { GestureStability } from "./stability.mjs";
const palm = { palm: 0.9, fist: 0.03, victory: 0.03, none: 0.04 },
  fist = { palm: 0.03, fist: 0.9, victory: 0.03, none: 0.04 },
  none = { palm: 0.03, fist: 0.03, victory: 0.04, none: 0.9 };
test("requires two confirmations and rejects a one-frame gesture flicker", () => {
  const s = new GestureStability();
  assert.equal(s.update(palm), "none");
  assert.equal(s.update(palm), "palm");
  assert.equal(s.update(fist), "palm");
  assert.equal(s.update(palm), "palm");
});
test("no-hand returns to idle and reset clears evidence", () => {
  const s = new GestureStability();
  s.update(palm);
  s.update(palm);
  s.update(none);
  assert.equal(s.update(none), "none");
  s.reset();
  assert.equal(s.update(fist), "none");
  assert.equal(s.update(fist), "fist");
});
test("ambiguous distribution does not trigger an effect", () => {
  const s = new GestureStability();
  for (let i = 0; i < 5; i++)
    assert.equal(
      s.update({ palm: 0.25, fist: 0.25, victory: 0.25, none: 0.25 }),
      "none",
    );
});
