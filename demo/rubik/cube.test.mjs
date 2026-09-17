import test from 'node:test';
import assert from 'node:assert/strict';
import { Cube, FACES } from './cube.mjs';

test('solved cube has six distinct uniform faces and 24 stickers', () => {
  const cube = new Cube();
  assert.equal(cube.stickers.length, 24);
  assert.equal(cube.isSolved(), true);
  for (const face of Object.keys(FACES)) assert.deepEqual(cube.face(face), Array(4).fill(face));
});

for (const face of Object.keys(FACES)) {
  test(`${face}: four turns restore, opposite turns cancel, one turn scrambles`, () => {
    const cube = new Cube();
    const initial = cube.snapshot();
    cube.turn(face);
    assert.equal(cube.isSolved(), false);
    for (let i = 0; i < 3; i += 1) cube.turn(face);
    assert.equal(cube.snapshot(), initial);
    cube.turn(face);
    cube.turn(`${face}'`);
    assert.equal(cube.snapshot(), initial);
  });
}

test('front clockwise turn moves up front row into right left column', () => {
  const cube = new Cube();
  cube.turn('F');
  assert.deepEqual(cube.face('R'), ['U', 'R', 'U', 'R']);
  assert.deepEqual(cube.face('D'), ['R', 'R', 'D', 'D']);
  assert.deepEqual(cube.face('L'), ['L', 'D', 'L', 'D']);
  assert.deepEqual(cube.face('U'), ['U', 'U', 'L', 'L']);
});

test('mixed scramble preserves sticker counts and inverse sequence restores exactly', () => {
  const cube = new Cube();
  const initial = cube.snapshot();
  const moves = ['R', 'U', "F'", 'D', 'L', "B'", 'R', 'U'];
  for (const move of moves) cube.turn(move);
  assert.equal(cube.isSolved(), false);
  const visibleStickers = Object.keys(FACES).flatMap(face => cube.face(face));
  for (const face of Object.keys(FACES)) {
    assert.equal(visibleStickers.filter(color => color === face).length, 4);
  }
  for (const move of moves.reverse()) cube.turn(move.endsWith("'") ? move[0] : `${move}'`);
  assert.equal(cube.snapshot(), initial);
  assert.equal(cube.isSolved(), true);
});

test('invalid moves fail explicitly', () => {
  assert.throws(() => new Cube().turn('R2'), /Invalid move/);
});
