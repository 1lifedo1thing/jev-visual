import { VisualClient, trace } from "../live.js";
import { GestureStability } from "./stability.mjs";
const $ = (id) => document.getElementById(id),
  video = $("camera"),
  canvas = $("particles"),
  ctx = canvas.getContext("2d");
const capture = document.createElement("canvas");
capture.width = capture.height = 256;
const cameraCtx = capture.getContext("2d");
const client = new VisualClient(),
  stable = new GestureStability();
const labels = {
  palm: "Open palm",
  fist: "Fist",
  victory: "V sign",
  none: "No gesture",
};
const criteria = {
  palm: "An open palm with five fingers extended.",
  fist: "A closed fist with fingers curled into the palm.",
  victory: "A V / peace sign: only index and middle fingers extended.",
  none: "No hand is visible, or the hand gesture is none of these.",
};
const instructions =
  "Identify the hand gesture in this camera image. Choose open palm, closed fist, V sign, or no target gesture. Focus only on the visible hand, not the face or background. If there is no visible hand, choose no target gesture.";
let stream = null,
  active = false,
  epoch = 0,
  cameraEpoch = 0,
  timer = null,
  samples = 0,
  mode = "none",
  last = performance.now(),
  time = 0,
  frameCount = 0;
const points = Array.from({ length: 1000 }, (_, i) => ({
  x: 480,
  y: 285,
  z: Math.random(),
  a: i * 2.3999632297,
  r: Math.sqrt((i + 0.5) / 1000),
  seed: Math.random() * 10,
}));
function status(text) {
  $("status").textContent = text;
}
function setMode(value) {
  mode = value;
  $("mode").textContent = {
    palm: "PALM / STARBURST",
    fist: "FIST / GRAVITY CORE",
    victory: "VICTORY / SPIRAL RING",
    none: "IDLE / NEBULA",
  }[value];
}
async function openCamera() {
  if (stream) return;
  const ticket = ++cameraEpoch;
  $("camera-on").disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Camera access requires localhost or HTTPS");
    const media = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
      audio: false,
    });
    if (ticket !== cameraEpoch) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = media;
    video.srcObject = media;
    await video.play();
    if (ticket !== cameraEpoch) return;
    stream.getVideoTracks().forEach((track) =>
      track.addEventListener("ended", () => {
        if (stream) closeCamera();
      }),
    );
    $("ai-on").disabled = false;
    $("camera-off").disabled = false;
    status("Camera preview is on. Start recognition to send frames to the model.");
  } catch (error) {
    if (ticket !== cameraEpoch) return;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    $("camera-on").disabled = false;
    status(
      error.name === "NotAllowedError"
        ? "Camera permission denied. Allow camera access in your browser and retry."
        : `Cannot open camera: ${error.message}`,
    );
  }
}
function closeCamera() {
  cameraEpoch++;
  epoch++;
  active = false;
  clearTimeout(timer);
  client.cancel();
  const old = stream;
  stream = null;
  old?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  stable.reset();
  setMode("none");
  samples = 0;
  $("samples").textContent = "0";
  $("prediction").textContent = "—";
  $("latency").textContent = "—";
  $("feed").replaceChildren();
  $("camera-on").disabled = false;
  $("ai-on").disabled = true;
  $("ai-on").textContent = "Start recognition";
  $("camera-off").disabled = true;
  status("Camera and recognition stopped. Frame history cleared.");
}
function stopAI() {
  active = false;
  epoch++;
  clearTimeout(timer);
  client.cancel();
  stable.reset();
  setMode("none");
  $("ai-on").textContent = "Start recognition";
  status("Recognition paused. Camera preview remains on; no new frames are sent.");
}
async function recognize(token) {
  if (!active || token !== epoch || !stream) return;
  if (document.hidden || client.busy || video.readyState < 2) {
    timer = setTimeout(() => recognize(token), 200);
    return;
  }
  const size = Math.min(video.videoWidth, video.videoHeight);
  cameraCtx.drawImage(
    video,
    (video.videoWidth - size) / 2,
    (video.videoHeight - size) / 2,
    size,
    size,
    0,
    0,
    256,
    256,
  );
  const image = capture.toDataURL("image/png");
  try {
    const result = await client.judge(image, instructions, criteria);
    if (token !== epoch || !active) return;
    samples++;
    $("samples").textContent = samples;
    $("prediction").textContent = labels[result.answer.choice];
    $("latency").textContent =
      `${Math.round(result.wallMs)} / ${Math.round(result.output.metrics?.elapsed_ms || 0)} ms`;
    if (result.wallMs <= 2500) {
      setMode(stable.update(result.answer.probabilities));
      status(
        `Model: ${labels[result.answer.choice]} · Stable mode: ${labels[mode]}. Hold your gesture to confirm.`,
      );
    } else {
      stable.reset();
      setMode("none");
      status("Response exceeded 2.5 seconds. Control result discarded; idle restored. Sampling a fresh frame.");
    }
    trace(
      $("feed"),
      result,
      labels,
      result.wallMs <= 2500
        ? `Stable mode: ${labels[mode]} · Confirmed twice`
        : "Stale response: not used for control",
    );
  } catch (error) {
    if (token !== epoch) return;
    stopAI();
    status(`Recognition paused: ${error.message}. Preview remains on; press Start to retry.`);
    return;
  }
  if (active && token === epoch)
    timer = setTimeout(() => recognize(token), 150);
}
$("camera-on").onclick = openCamera;
$("camera-off").onclick = closeCamera;
$("ai-on").onclick = () => {
  if (active) {
    stopAI();
    return;
  }
  if (!stream) return;
  active = true;
  const token = ++epoch;
  $("ai-on").textContent = "Pause recognition";
  status("Classifying the center crop…");
  recognize(token);
};
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.04);
  last = now;
  time += dt;
  frameCount++;
  ctx.fillStyle = "rgba(13,18,29,.24)";
  ctx.fillRect(0, 0, 960, 570);
  const glow = ctx.createRadialGradient(480, 285, 10, 480, 285, 300);
  glow.addColorStop(0, "rgba(61,74,137,.10)");
  glow.addColorStop(1, "rgba(10,17,30,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 960, 570);
  const ease = 1 - Math.exp(-dt * 4.5);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    let x,
      y,
      hue = 210 + p.z * 55;
    if (mode === "palm") {
      const r = 90 + p.r * 190 + Math.sin(time * 2 + p.seed) * 22,
        a = p.a + time * 0.1;
      x = Math.cos(a) * r * (1.1 + 0.15 * Math.sin(time));
      y = Math.sin(a) * r * 0.8;
      hue = 185 + p.z * 45;
    } else if (mode === "fist") {
      const r = 20 + p.r * 65,
        a = p.a + time * (1.2 + p.z);
      x = Math.cos(a) * r;
      y = Math.sin(a) * r * 0.7;
      hue = 20 + p.z * 35;
    } else if (mode === "victory") {
      const a = p.a + time * 0.7,
        r = 70 + p.r * 210;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r * 0.33 + Math.sin(a * 2 + time) * 35;
      hue = 260 + p.z * 60;
    } else {
      const a = p.a + time * 0.12,
        r = 40 + p.r * 145;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r * 0.7 + Math.sin(time + p.seed) * 16;
    }
    p.x += (480 + x - p.x) * ease;
    p.y += (285 + y - p.y) * ease;
    ctx.fillStyle = `hsla(${hue},85%,${65 + p.z * 25}%,${0.35 + p.z * 0.65})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.7 + p.z * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(144,166,225,.13)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(480, 285, 330, 150, 0, 0, Math.PI * 2);
  ctx.stroke();
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stable.reset();
    setMode("none");
  }
});
window.addEventListener("pagehide", closeCamera);
window.gestureDebug = {
  get state() {
    return {
      active,
      camera: !!stream,
      mode,
      samples,
      busy: client.busy,
      frameCount,
      tracks: stream?.getTracks().map((t) => t.readyState) || [],
    };
  },
};
requestAnimationFrame(frame);
