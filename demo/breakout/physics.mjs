export const WIDTH = 640, HEIGHT = 480;
export const ACTIONS = ['left', 'hold', 'right'];
export const SPEEDS = { slow: 110, normal: 220 };
export const PADDLE_Y = 435, PADDLE_WIDTH = 144, PADDLE_SPEED = 300;
export const RADIUS = 14;

export function createGame(speed = 'slow') {
  if (!Object.hasOwn(SPEEDS, speed)) throw new Error('Unknown speed');
  return {
    speed, paddle: WIDTH / 2,
    ball: { x: WIDTH / 2, y: PADDLE_Y - RADIUS - 1, vx: 0, vy: 0 },
    bricks: Array.from({ length: 24 }, (_, i) => ({
      x: 24 + (i % 8) * 75, y: 65 + Math.floor(i / 8) * 30,
      width: 67, height: 20, alive: true, row: Math.floor(i / 8),
    })),
    lives: 3, cleared: 0, hits: 0, elapsed: 0, serves: 0,
    phase: 'ready', serveDelay: 0,
  };
}

export function launch(game) {
  if (game.phase !== 'ready') return;
  const speed = SPEEDS[game.speed];
  // Identical, alternating serves for human, model and baseline control.
  game.ball = { x: game.paddle, y: PADDLE_Y - RADIUS - 1,
    vx: speed * 0.42 * (game.serves % 2 ? -1 : 1), vy: -speed * Math.sqrt(1 - 0.42 ** 2) };
  game.serves++;
  game.phase = 'playing';
}

export function advance(game, action, dt) {
  if (!ACTIONS.includes(action)) throw new Error('Unknown action');
  if (!Number.isFinite(dt) || dt < 0 || dt > 0.1) throw new Error('Invalid timestep');
  if (game.phase === 'won' || game.phase === 'lost') return;
  game.elapsed += dt;
  game.paddle = Math.max(PADDLE_WIDTH / 2, Math.min(WIDTH - PADDLE_WIDTH / 2,
    game.paddle + (action === 'left' ? -1 : action === 'right' ? 1 : 0) * PADDLE_SPEED * dt));
  if (game.phase === 'ready') {
    game.ball.x = game.paddle;
    game.ball.y = PADDLE_Y - RADIUS - 1;
    game.serveDelay = Math.max(0, game.serveDelay - dt);
    if (game.serveDelay === 0) launch(game);
    return;
  }
  // Substeps prevent tunneling even for a caller using a 100 ms tick.
  const n = Math.max(1, Math.ceil(dt * 240));
  for (let i = 0; i < n && game.phase === 'playing'; i++) tick(game, dt / n);
}

function tick(game, dt) {
  const b = game.ball, oldY = b.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < RADIUS) { b.x = RADIUS; b.vx = Math.abs(b.vx); }
  if (b.x > WIDTH - RADIUS) { b.x = WIDTH - RADIUS; b.vx = -Math.abs(b.vx); }
  if (b.y < 36 + RADIUS) { b.y = 36 + RADIUS; b.vy = Math.abs(b.vy); }
  if (b.vy > 0 && oldY + RADIUS <= PADDLE_Y && b.y + RADIUS >= PADDLE_Y &&
      b.x + RADIUS >= game.paddle - PADDLE_WIDTH / 2 && b.x - RADIUS <= game.paddle + PADDLE_WIDTH / 2) {
    b.y = PADDLE_Y - RADIUS;
    const offset = Math.max(-1, Math.min(1, (b.x - game.paddle) / (PADDLE_WIDTH / 2)));
    const angle = offset * Math.PI / 3, speed = SPEEDS[game.speed];
    b.vx = speed * Math.sin(angle); b.vy = -speed * Math.cos(angle);
    game.hits++;
  }
  for (const brick of game.bricks) {
    if (!brick.alive) continue;
    const cx = Math.max(brick.x, Math.min(brick.x + brick.width, b.x));
    const cy = Math.max(brick.y, Math.min(brick.y + brick.height, b.y));
    if ((b.x - cx) ** 2 + (b.y - cy) ** 2 > RADIUS ** 2) continue;
    brick.alive = false; game.cleared++;
    const overlapX = Math.min(b.x + RADIUS - brick.x, brick.x + brick.width - b.x + RADIUS);
    const overlapY = Math.min(b.y + RADIUS - brick.y, brick.y + brick.height - b.y + RADIUS);
    if (overlapX < overlapY) {
      if (b.x < brick.x + brick.width / 2) { b.x = brick.x - RADIUS; b.vx = -Math.abs(b.vx); }
      else { b.x = brick.x + brick.width + RADIUS; b.vx = Math.abs(b.vx); }
    } else {
      if (b.y < brick.y + brick.height / 2) { b.y = brick.y - RADIUS; b.vy = -Math.abs(b.vy); }
      else { b.y = brick.y + brick.height + RADIUS; b.vy = Math.abs(b.vy); }
    }
    if (game.cleared === game.bricks.length) game.phase = 'won';
    break;
  }
  if (b.y - RADIUS > HEIGHT) {
    game.lives--;
    game.phase = game.lives ? 'ready' : 'lost';
    game.serveDelay = 1;
    b.vx = b.vy = 0;
  }
}

// Fixed controller targets, equally available to human and model. Never reads the ball.
export const LANES = Object.freeze(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i + 1), Math.max(PADDLE_WIDTH / 2, Math.min(WIDTH - PADDLE_WIDTH / 2, 64 + i * 128))])));
export function laneDirection(paddle, lane, dt) {
  if (!Object.hasOwn(LANES, lane)) throw new Error('Unknown lane');
  const delta = LANES[lane] - paddle;
  return Math.abs(delta) <= PADDLE_SPEED * dt / 2 ? 'hold' : delta < 0 ? 'left' : 'right';
}
