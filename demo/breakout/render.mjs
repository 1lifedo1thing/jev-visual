import { WIDTH, HEIGHT, PADDLE_Y, PADDLE_WIDTH, RADIUS } from './physics.mjs';

export function drawBoard(canvas, game) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#121c29'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#a9bbcc'; ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`BREAKOUT    BRICKS ${game.cleared}/24    LIVES ${game.lives}`, 22, 24);
  const colors = ['#d77b65', '#eacb78', '#72b8b0'];
  for (const b of game.bricks) if (b.alive) {
    ctx.fillStyle = colors[b.row]; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, 4); ctx.fill();
  }
  ctx.fillStyle = '#ff994f'; ctx.beginPath(); ctx.roundRect(game.paddle - PADDLE_WIDTH / 2, PADDLE_Y, PADDLE_WIDTH, 12, 6); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(game.ball.x, game.ball.y, RADIUS, 0, Math.PI * 2); ctx.fill();
  // Public lane markings: identical in the player view and model screenshot.
  ctx.strokeStyle = '#67758a'; ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui'; ctx.textAlign = 'center';
  for (let j = 0; j < 5; j++) {
    ctx.fillText(String(j + 1), 64 + j * 128, 475);
    if (j) { ctx.beginPath(); ctx.moveTo(j * 128, 155); ctx.lineTo(j * 128, 420); ctx.stroke(); }
  }
  ctx.textAlign = 'left';
  if (game.phase === 'won'  || game.phase === 'lost') {
    ctx.fillStyle = '#121c29dd'; ctx.fillRect(100, 195, 440, 80);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(game.phase === 'won' ? 'ALL BRICKS CLEARED' : 'GAME OVER', WIDTH / 2, 243); ctx.textAlign = 'left';
  }
}
