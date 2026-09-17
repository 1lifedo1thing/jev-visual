import { VisualClient, trace } from "../live.js";
const $ = (id) => document.getElementById(id),
  canvas = $("factory"),
  ctx = canvas.getContext("2d");
const client = new VisualClient(),
  labels = { red: "Red lane", blue: "Blue lane", yellow: "Yellow lane" };
const criteria = {
  red: "The object is RED. Route it to the red bin.",
  blue: "The object is BLUE. Route it to the blue bin.",
  yellow: "The object is YELLOW. Route it to the yellow bin.",
};
const instructions =
  "Look at the single object in this image. Classify its main surface color: red, blue, or yellow. Ignore the gray conveyor and background. Choose the matching color bin.";
const colors = { red: "#e24637", blue: "#2676db", yellow: "#efc72e" },
  ys = { red: 110, blue: 260, yellow: 410 };
let items = [],
  serial = 0,
  enabled = false,
  generation = 0,
  completed = 0,
  correct = 0,
  belt = 0,
  last = performance.now(),
  particles = [];
const crop = document.createElement("canvas");
crop.width = crop.height = 192;
const cx = crop.getContext("2d");
function status(text) {
  $("status").textContent = text;
}
function metrics() {
  $("count").textContent = completed;
  $("accuracy").textContent = completed ? `${correct} / ${completed}` : "—";
  $("queue").textContent = `${items.length} / 12`;
  $("add").disabled = items.length >= 12;
  $("mix").disabled = items.length > 6;
  $("ai").disabled = enabled;
  $("stop").disabled = !enabled;
}
function add(shape = $("shape").value, color = $("color").value) {
  if (items.length >= 12) return;
  const waiting = items.filter((x) => !x.route);
  const position = waiting.length
    ? Math.min(50, Math.min(...waiting.map((x) => x.x)) - 180)
    : 50;
  items.push({
    id: ++serial,
    x: position,
    shape,
    color,
    choice: null,
    route: 0,
    pending: false,
  });
  metrics();
}
$("add").onclick = () => add();
$("mix").onclick = () => {
  for (let i = 0; i < 6; i++)
    add(
      ["box", "ball", "bottle", "pyramid"][i % 4],
      ["red", "blue", "yellow"][i % 3],
    );
};
$("ai").onclick = () => {
  enabled = true;
  status("AI running. Capture → classify color → sort.");
  metrics();
};
function stop() {
  enabled = false;
  generation++;
  client.cancel();
  items.forEach((i) => (i.pending = false));
  status("AI stopped. The belt keeps moving; unclassified objects wait at the gate.");
  metrics();
}
$("stop").onclick = stop;
$("reset").onclick = () => {
  stop();
  items = [];
  particles = [];
  completed = correct = 0;
  $("feed").replaceChildren();
  $("latency").textContent = "—";
  metrics();
  status("Factory cleared. Choose an object to add.");
};
function object(item, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(30,30,20,.13)";
  ctx.beginPath();
  ctx.ellipse(2, 33, 37, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors[item.color];
  ctx.strokeStyle = "rgba(0,0,0,.13)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (item.shape === "ball") {
    ctx.arc(0, 0, 33, 0, Math.PI * 2);
  } else if (item.shape === "pyramid") {
    ctx.moveTo(0, -39);
    ctx.lineTo(39, 31);
    ctx.lineTo(-39, 31);
    ctx.closePath();
  } else if (item.shape === "bottle") {
    ctx.roundRect(-13, -42, 26, 20, 3);
    ctx.roundRect(-26, -25, 52, 64, 10);
  } else {
    ctx.roundRect(-34, -32, 68, 64, 5);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.24)";
  if (item.shape === "box") ctx.fillRect(-5, -31, 10, 62);
  else if (item.shape === "ball") {
    ctx.beginPath();
    ctx.ellipse(-10, -12, 8, 13, 0.6, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}
function draw() {
  ctx.fillStyle = "#f7f5ed";
  ctx.fillRect(0, 0, 960, 540);
  ctx.fillStyle = "#777469";
  ctx.font = "12px monospace";
  ctx.fillText("OPTICAL SORTING / LOCAL VISION", 28, 34);
  ctx.fillText(enabled ? "AI ONLINE" : "MANUAL LOADING", 28, 56);
  ctx.fillStyle = "#d6d5ce";
  ctx.beginPath();
  ctx.roundRect(-30, 185, 610, 152, 30);
  ctx.fill();
  ctx.fillStyle = "#b4b5af";
  ctx.fillRect(0, 201, 550, 119);
  ctx.strokeStyle = "#94978f";
  ctx.lineWidth = 2;
  for (let x = -40 + (belt % 34); x < 550; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 204);
    ctx.lineTo(x, 317);
    ctx.stroke();
  }
  ctx.strokeStyle = "#ddd8cb";
  ctx.lineWidth = 38;
  for (const y of Object.values(ys)) {
    ctx.beginPath();
    ctx.moveTo(545, 260);
    ctx.bezierCurveTo(640, 260, 645, y, 778, y);
    ctx.stroke();
  }
  for (const [color, y] of Object.entries(ys)) {
    ctx.fillStyle = colors[color];
    ctx.globalAlpha = 0.13;
    ctx.beginPath();
    ctx.roundRect(776, y - 54, 155, 108, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors[color];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = colors[color];
    ctx.font = "bold 17px monospace";
    ctx.fillText(color.toUpperCase(), 797, y - 12);
    ctx.fillStyle = "#55554b";
    ctx.font = "12px monospace";
    ctx.fillText("SORTING BAY", 797, y + 15);
  }
  ctx.strokeStyle = "#a5bab1";
  ctx.lineWidth = 3;
  ctx.strokeRect(250, 175, 124, 174);
  ctx.fillStyle = "#527b6c";
  ctx.font = "12px monospace";
  ctx.fillText("VISION SCAN", 269, 162);
  if (enabled) {
    ctx.strokeStyle = `rgba(60,144,112,${0.45 + 0.25 * Math.sin(belt / 12)})`;
    ctx.beginPath();
    ctx.moveTo(250, 190 + (belt % 142));
    ctx.lineTo(374, 190 + (belt % 142));
    ctx.stroke();
  }
  for (const item of items) {
    if (item.x < -50) continue;
    if (item.route) {
      const t = item.route,
        s = t * t * (3 - 2 * t);
      object(
        item,
        520 + (820 - 520) * s,
        260 + (ys[item.choice] - 260) * s,
        1 - 0.2 * t,
      );
    } else object(item, item.x, 260);
  }
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#888378";
  ctx.font = "13px monospace";
  ctx.fillText("LOAD → SCAN → DECIDE → SORT", 28, 450);
  ctx.font = "12px system-ui";
  ctx.fillText("ASYNC INFERENCE / CONTINUOUS ANIMATION / IMAGE INPUT ONLY", 28, 476);
}
async function infer(item) {
  item.pending = true;
  const token = generation;
  // Crop pixels FROM the rendered conveyor. Object metadata never enters the request.
  cx.drawImage(canvas, item.x - 96, 164, 192, 192, 0, 0, 192, 192);
  const image = crop.toDataURL("image/png");
  try {
    const result = await client.judge(image, instructions, criteria);
    if (token !== generation || !items.includes(item)) return;
    item.choice = result.answer.choice;
    item.pending = false;
    $("latency").textContent =
      `${Math.round(result.wallMs)} / ${Math.round(result.output.metrics?.elapsed_ms || 0)} ms`;
    trace(
      $("feed"),
      result,
      labels,
      `Object #${item.id} · Route selected, approaching the gate`,
    );
    status(`Object #${item.id} → ${labels[item.choice]}.`);
  } catch (error) {
    if (token !== generation) return;
    item.pending = false;
    enabled = false;
    status(`Inference failed; object held at gate: ${error.message}. Press Start to retry.`);
    metrics();
  }
}
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.04);
  last = now;
  belt += dt * 85;
  let limit = 520;
  for (const item of items) {
    if (item.route) {
      item.route += dt * 1.2;
      continue;
    }
    item.x = Math.min(item.x + dt * 95, limit);
    limit = item.x - 180;
    if (item.x >= 520 && item.choice) item.route = 0.001;
  }
  const finished = items.filter((i) => i.route >= 1);
  for (const i of finished) {
    completed++;
    if (i.choice === i.color) correct++;
    for (let k = 0; k < 20; k++)
      particles.push({
        x: 825,
        y: ys[i.choice],
        vx: Math.random() * 120 - 60,
        vy: -Math.random() * 130,
        life: 1,
        color: colors[i.choice],
      });
    status(
      `Object #${i.id}: ${i.choice === i.color ? "correct route" : "wrong route"}. Evaluation does not override AI actions.`,
    );
  }
  items = items.filter((i) => i.route < 1);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
    p.life -= dt;
  }
  draw();
  if (enabled && !client.busy && !document.hidden) {
    const item = items.find(
      (i) => i.x >= 290 && !i.choice && !i.pending && !i.route,
    );
    if (item) infer(item);
  }
  if (finished.length) metrics();
  requestAnimationFrame(frame);
}
window.addEventListener("pagehide", () => client.cancel());
window.factoryDebug = {
  get state() {
    return {
      items: items.map((i) => ({ ...i })),
      completed,
      correct,
      enabled,
      belt,
      busy: client.busy,
    };
  },
};
metrics();
requestAnimationFrame(frame);
