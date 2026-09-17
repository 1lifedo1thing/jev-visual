// Independent cubejs observations are fixtures only; no solver runs in the game.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const fixture = JSON.parse(
  readFileSync(new URL("./audit-fixture.json", import.meta.url)),
);
import { Cube, FACES } from "./cube.mjs";
import {
  scenePolygons,
  VIEWS,
  visibleFaces,
  rotateContinuous,
  turnAngle,
} from "./render.mjs";
const moves = Object.keys(FACES).flatMap((f) => [f, `${f}'`]);
test("every single turn and 2000 mixed turns match independent cubejs observations", () => {
  for (const move of moves) {
    const own = new Cube();
    own.turn(move);
    assert.equal(own.snapshot(), fixture.singles[move], move);
  }
  let seed = fixture.sequence.seed;
  const own = new Cube(),
    hash = createHash("sha256");
  for (let i = 0; i < fixture.sequence.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    own.turn(moves[(seed >>> 8) % moves.length]);
    hash.update(own.snapshot() + "\n");
  }
  assert.equal(hash.digest("hex"), fixture.sequence.sha256);
});
test("the renderer exposes only U, F, R stickers in the settled pose", () => {
  assert.deepEqual(new Set(visibleFaces()), new Set(["U", "F", "R"]));
  const tiles = scenePolygons(new Cube()).filter((p) => p.letter);
  assert.equal(tiles.length, 12);
  assert.deepEqual(
    new Set(tiles.map((p) => p.letter)),
    new Set(["W", "G", "R"]),
  );
});
test("every animated quarter-turn endpoint agrees with discrete sticker movement", () => {
  for (const move of moves) {
    const cube = new Cube();
    const before = structuredClone(cube.stickers);
    cube.turn(move);
    const face = FACES[move[0]];
    before.forEach((s, i) => {
      const selected = s.position[face.axis] === face.sign;
      for (const key of ["position", "normal"]) {
        const expected = selected
          ? rotateContinuous(s[key], face.axis, turnAngle(move, 1))
          : s[key];
        expected.forEach((x, j) =>
          assert.ok(
            Math.abs(x - cube.stickers[i][key][j]) < 1e-10,
            `${move} ${key}`,
          ),
        );
      }
    });
  }
});
export const ambiguousA = [
  "D'",
  "R'",
  "R'",
  "R'",
  "R",
  "L",
  "R",
  "L",
  "B'",
  "R",
];
export const ambiguousB = [
  "D'",
  "L'",
  "B",
  "D'",
  "B'",
  "R'",
  "R'",
  "U'",
  "R",
  "R",
];
test("two legal full states produce the same fixed three-face image data", () => {
  const a = new Cube(),
    b = new Cube();
  ambiguousA.forEach((m) => a.turn(m));
  ambiguousB.forEach((m) => b.turn(m));
  assert.notEqual(a.snapshot(), b.snapshot());
  for (const f of ["U", "F", "R"]) assert.deepEqual(a.face(f), b.face(f));
  // Includes all drawn plastic/stickers: hidden colors cannot leak via renderer.
  // JSON normalization treats +0 and -0 as the same rendering coordinate.
  assert.equal(
    JSON.stringify(scenePolygons(a)),
    JSON.stringify(scenePolygons(b)),
  );
});
test("all default one-turn scrambles have distinct three-face observations", () => {
  const keys = [];
  for (const move of ["U", "U'", "R", "R'", "F", "F'"]) {
    const cube = new Cube();
    cube.turn(move);
    keys.push(["U", "F", "R"].map((f) => cube.face(f).join("")).join("/"));
  }
  assert.equal(new Set(keys).size, 6);
});

test("complementary cameras cover all 24 stickers once and disambiguate hidden states", () => {
  const cube = new Cube();
  const faces = VIEWS.flatMap((view) => visibleFaces(view.camera));
  assert.equal(faces.length, 6);
  assert.equal(new Set(faces).size, 6);
  const tiles = VIEWS.flatMap((view) =>
    scenePolygons(cube, null, view.camera).filter((p) => p.letter),
  );
  assert.equal(tiles.length, 24);
  for (const letter of ["W", "Y", "O", "R", "G", "B"])
    assert.equal(tiles.filter((t) => t.letter === letter).length, 4);
  const a = new Cube(),
    b = new Cube();
  ambiguousA.forEach((m) => a.turn(m));
  ambiguousB.forEach((m) => b.turn(m));
  assert.notEqual(
    JSON.stringify(scenePolygons(a, null, VIEWS[1].camera)),
    JSON.stringify(scenePolygons(b, null, VIEWS[1].camera)),
  );
});
