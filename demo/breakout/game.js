import { VisualClient, trace } from '../live.js';
import { createGame, advance, laneDirection, LANES } from './physics.mjs';
import { drawBoard } from './render.mjs';
import { instructions, criteria } from './observation.mjs';

const $ = id => document.getElementById(id);
const canvas = $('board');
const preview = $('observation'), previewCtx = preview.getContext('2d');
const client = new VisualClient();
const labels = Object.fromEntries(Object.keys(LANES).map(id => [id, `Lane ${id}`]));
let game = createGame(), running = false, ai = false, epoch = 0;
let manualAction = 'hold', targetLane = null, actionUntil = 0;
let records = [], nextDecision = 0;
let last = performance.now(), accumulator = 0;
const STEP = 1 / 120;

function invalidate() {
  epoch++;
  client.cancel();
  manualAction = 'hold';
  targetLane = null;
  actionUntil = 0;
}
function pause(message = 'Paused. No pending model action will execute.') {
  running = ai = false;
  invalidate();
  $('status').textContent = message;
}
function play(useAI) {
  if (game.phase === 'won' || game.phase === 'lost') return;
  invalidate();
  running = true; ai = useAI; accumulator = 0; last = performance.now();
  $('status').textContent = ai ? 'AI selects a visible target lane from the screenshot. No hidden game-state input.' : 'Manual control. Hold arrow keys, A / D or the direction buttons.';
}
function reset() {
  pause();
  game = createGame($('speed').value);
  records = [];
  $('feed').replaceChildren();
  previewCtx.clearRect(0, 0, preview.width, preview.height);
  $('latency').textContent = 'No inference yet.';
  $('status').textContent = 'New game. Press Play or Start AI.';
  draw();
}
$('play').onclick = () => play(false);
$('ai').onclick = () => {
  if (records.length >= 200) { $('status').textContent = 'Decision budget exhausted. Start a new game or play manually.'; return; }
  play(true);
};
$('manual').onclick = () => play(false);
$('pause').onclick = () => pause();
$('reset').onclick = reset;
$('speed').onchange = reset;

const keys = new Set();
function keyboardAction() {
  if (ai) return;
  const l = keys.has('ArrowLeft') || keys.has('a'), r = keys.has('ArrowRight') || keys.has('d');
  if (l || r) targetLane = null;
  manualAction = l === r ? 'hold' : l ? 'left' : 'right';
}
document.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) {
    event.preventDefault(); keys.add(key); keyboardAction();
  } else if (event.code === 'Space') {
    event.preventDefault(); if (!event.repeat) running ? pause() : play(false);
  }
});
document.addEventListener('keyup', event => { keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key); keyboardAction(); });
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('pointerdown', event => {
    if (ai || !running) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    targetLane = null;
    manualAction = button.dataset.action;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { manualAction = 'hold'; });
}
for (const button of document.querySelectorAll('[data-lane]')) {
  button.onclick = () => {
    if (!running || ai) return;
    manualAction = 'hold'; targetLane = button.dataset.lane;
  };
}
function controlAction(now) {
  if (targetLane !== null && (!ai || now < actionUntil)) return laneDirection(game.paddle, targetLane, STEP);
  return ai ? 'hold' : manualAction;
}
window.addEventListener('blur', () => { keys.clear(); pause('Paused because the game lost focus.'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); pause('Paused while the tab is hidden.'); }
});

function draw() { drawBoard(canvas, game); }

function metrics(now) {
  $('bricks').textContent = `${game.cleared} / 24`;
  $('lives').textContent = game.lives;
  $('hits').textContent = game.hits;
  $('time').textContent = `${game.elapsed.toFixed(1)} s`;
  const action = controlAction(now);
  if (running && ai) {
    $('status').textContent = targetLane === null ? 'Waiting for the model to select a lane…' :
      now >= actionUntil ? `Lane ${targetLane}: movement timed out; waiting for a fresh decision.` :
      action === 'hold' ? `At lane ${targetLane}, selected by the model. Waiting for its next target.` :
      `Moving ${action} toward lane ${targetLane}, selected by the model.`;
  }
  $('action').textContent = `${running ? ai ? 'AI' : 'MANUAL' : 'PAUSED'} / ${action === 'hold' ? 'IDLE' : action.toUpperCase()}${targetLane !== null ? ` → LANE ${targetLane}` : ''}`;
  for (const button of document.querySelectorAll('[data-action], [data-lane]')) button.disabled = ai || !running;
  const done = ['won', 'lost'].includes(game.phase);
  $('ai').disabled = ai || done;
  $('play').disabled = (running && !ai) || done;
  $('manual').disabled = !ai;
  $('pause').disabled = !running;
}
function capture(now) {
  previewCtx.drawImage(canvas, 0, 0);
  return { image: canvas.toDataURL('image/png'), capturedAt: now };
}
async function decide(capture) {
  const token = epoch;
  try {
    const result = await client.judge(capture.image, instructions, criteria);
    if (token !== epoch || !ai || !running) return;
    const age = performance.now() - capture.capturedAt, executed = age <= 800;
    if (executed) { targetLane = result.answer.choice; actionUntil = performance.now() + 800; }
    else { targetLane = null; actionUntil = 0; }
    const record = { ...result, executed, ageMs: age };
    records.push(record);
    trace($('feed'), result, labels, executed ? 'Move toward the selected fixed lane for up to 800 ms. No ball-coordinate tracking.' : 'Older than 800 ms: shown but not executed.');
    $('latency').textContent = `${Math.round(result.wallMs)} ms round trip / ${Math.round(result.output.metrics?.elapsed_ms || 0)} ms model · ${records.length}/200 decisions`;
    if (records.length >= 200) pause('200-decision budget reached. Paused; this is not a win.');
  } catch (error) {
    if (token !== epoch) return;
    pause(`Inference stopped: ${error.message}. Retry with Start AI or play manually.`);
  } finally { nextDecision = performance.now() + 80; }
}
function summary() {
  return { speed: game.speed, phase: game.phase, cleared: game.cleared, lives: game.lives,
    hits: game.hits, paddle: game.paddle, targetLane, elapsed: game.elapsed, decisions: records.length };
}
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ summary: summary(), records }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'breakout-run.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Read-only diagnostics; no structured game state is passed to the model.
window.breakoutDemo = { summary, get records() { return records; }, get busy() { return client.busy; } };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running) {
    accumulator += dt;
    while (accumulator >= STEP) {
      const lives = game.lives;
      advance(game, controlAction(now), STEP);
      accumulator -= STEP;
      if (game.lives !== lives) invalidate(); // A pending result from the old ball must never control a new serve.
      if (game.phase === 'won' || game.phase === 'lost') {
        pause(game.phase === 'won' ? 'You cleared all 24 bricks!' : 'Game over. Three balls lost. Start a new game to retry.');
        break;
      }
    }
  }
  draw(); metrics(now);
  if (running && ai && game.phase === 'playing') {
    if (!client.busy && now >= nextDecision) {
      void decide(capture(now));
    }
  }
  requestAnimationFrame(frame);
}
draw(); requestAnimationFrame(frame);
