import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, launch, WIDTH, PADDLE_Y, PADDLE_WIDTH, RADIUS, laneDirection, LANES } from './physics.mjs';
test('serves are reproducible and paddle stays inside the arena', () => {
  const a = createGame(), b = createGame();
  for (let i = 0; i < 100; i++) { advance(a, 'left', 0.01); advance(b, 'left', 0.01); }
  assert.deepEqual(a, b); assert.equal(a.paddle, PADDLE_WIDTH / 2);
  for (let i = 0; i < 200; i++) advance(a, 'right', 0.01);
  assert.equal(a.paddle, WIDTH - PADDLE_WIDTH / 2);
});
test('paddle intercept reverses vertical velocity without a hidden follow controller', () => {
  const g = createGame(); launch(g);
  g.ball = { x: g.paddle + 20, y: PADDLE_Y - RADIUS - 1, vx: 0, vy: 140 };
  advance(g, 'hold', 0.02);
  assert.equal(g.hits, 1); assert.ok(g.ball.vy < 0); assert.ok(g.ball.vx > 0);
  assert.equal(g.paddle, WIDTH / 2);
});
test('a miss consumes exactly one life, then a new ball serves after a delay', () => {
  const g = createGame(); launch(g);
  g.ball = { x: 20, y: 480 + RADIUS - 1, vx: 0, vy: 140 };
  advance(g, 'hold', 0.02);
  assert.equal(g.lives, 2); assert.equal(g.phase, 'ready');
  advance(g, 'hold', 0.1); assert.equal(g.phase, 'ready');
  for (let i = 0; i < 10; i++) advance(g, 'hold', 0.1);
  assert.equal(g.phase, 'playing'); assert.equal(g.lives, 2);
});
test('brick collision removes a brick once and the last brick wins', () => {
  const g = createGame(); launch(g);
  const brick = g.bricks[16];
  g.ball = { x: brick.x + 30, y: brick.y + brick.height + RADIUS + 1, vx: 0, vy: -140 };
  advance(g, 'hold', 0.02);
  assert.equal(g.cleared, 1); assert.equal(brick.alive, false); assert.ok(g.ball.vy > 0);
  const last = g.bricks[0];
  g.bricks.forEach(b => { b.alive = b === last; }); g.cleared = 23;
  g.ball = { x: last.x + 30, y: last.y + last.height + RADIUS + 1, vx: 0, vy: -140 };
  advance(g, 'hold', 0.02); assert.equal(g.phase, 'won'); assert.equal(g.cleared, 24);
  const final = structuredClone(g); advance(g, 'right', 0.1); assert.deepEqual(g, final);
});
test('third miss ends the game, walls reflect, invalid actions fail', () => {
  const g = createGame(); launch(g);
  g.ball = { x: 8, y: 300, vx: -140, vy: 0 }; advance(g, 'hold', 0.02); assert.ok(g.ball.vx > 0);
  g.lives = 1; g.ball = { x: 20, y: 480 + RADIUS - 1, vx: 0, vy: 140 }; advance(g, 'hold', 0.02);
  assert.equal(g.phase, 'lost'); assert.equal(g.lives, 0);
  assert.throws(() => advance(g, 'auto-follow', 0.01));
});

test('lane buttons move gradually to the selected fixed target and stop without oscillation', () => {
  const g = createGame();
  for (const lane of ['1', '5', '3']) {
    for (let i = 0; i < 300; i++) {
      const before = g.paddle;
      advance(g, laneDirection(g.paddle, lane, 1 / 120), 1 / 120);
      assert.ok(Math.abs(g.paddle - before) <= 2.501, 'no teleport');
    }
    assert.ok(Math.abs(g.paddle - LANES[lane]) <= 1.25);
    assert.equal(laneDirection(g.paddle, lane, 1 / 120), 'hold');
  }
  assert.throws(() => laneDirection(320, '6', 1 / 120));
});
