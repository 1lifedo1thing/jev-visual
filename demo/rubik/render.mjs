// Two synchronized fixed cameras show all six faces of the SAME cube.
import { FACES } from "./cube.mjs";
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v) => v.map((x) => x / Math.hypot(...v));
export const CAMERA = Object.freeze(unit([4, 3.2, 5]));
export const VIEWS = Object.freeze([
  {
    camera: CAMERA,
    center: [192, 283],
    scale: 83,
    title: "VIEW A / TOP · FRONT · RIGHT",
    faces: "U · F · R",
  },
  {
    camera: Object.freeze(unit([-4, -3.2, -5])),
    center: [576, 283],
    scale: 83,
    title: "VIEW B / BOTTOM · BACK · LEFT",
    faces: "D · B · L",
  },
]);
export const visibleFaces = (camera = CAMERA) =>
  Object.keys(FACES).filter((f) => {
    const n = [0, 0, 0];
    n[FACES[f].axis] = FACES[f].sign;
    return dot(n, camera) > 0;
  });
export function project(v, view = VIEWS[0]) {
  const right = unit(cross([0, 1, 0], view.camera));
  const up = cross(view.camera, right);
  const scale = (view.scale * 7) / (7 - dot(v, view.camera));
  return [
    view.center[0] + dot(v, right) * scale,
    view.center[1] - dot(v, up) * scale,
  ];
}
export function rotateContinuous(v, axis, angle) {
  const a = (axis + 1) % 3,
    b = (axis + 2) % 3,
    r = [...v];
  r[a] = v[a] * Math.cos(angle) - v[b] * Math.sin(angle);
  r[b] = v[a] * Math.sin(angle) + v[b] * Math.cos(angle);
  return r;
}
export function turnAngle(move, progress) {
  const face = FACES[move[0]];
  return (move.endsWith("'") ? 1 : -1) * face.sign * Math.PI * 0.5 * progress;
}
function faceVertices(center, normal, right, up, half) {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) =>
    center.map((x, i) => x + half * (a * right[i] + b * up[i])),
  );
}
export function scenePolygons(cube, animation = null, camera = CAMERA) {
  const polys = [];
  function add(
    center,
    normal,
    right,
    up,
    half,
    color,
    layerPosition,
    letter = null,
  ) {
    let vertices = faceVertices(center, normal, right, up, half),
      n = normal;
    if (animation) {
      const spec = FACES[animation.move[0]];
      if (layerPosition[spec.axis] === spec.sign) {
        const angle = turnAngle(animation.move, animation.progress);
        vertices = vertices.map((v) => rotateContinuous(v, spec.axis, angle));
        n = rotateContinuous(n, spec.axis, angle);
      }
    }
    const average = vertices[0].map(
      (_, i) => vertices.reduce((s, v) => s + v[i], 0) / 4,
    );
    const eye = camera.map((v, i) => v * 7 - average[i]);
    if (dot(n, eye) <= 0) return;
    polys.push({
      vertices,
      depth: dot(average, camera),
      color,
      normal: n,
      letter,
    });
  }
  // Eight actual plastic cubies, not a flat net styled as a cube.
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const pos = [x, y, z];
        for (const spec of Object.values(FACES)) {
          const n = [0, 0, 0];
          n[spec.axis] = spec.sign;
          const center = pos.map((p, i) => p * 0.505 + n[i] * 0.48);
          add(center, n, spec.right, spec.up, 0.48, "#282d31", pos);
        }
      }
  for (const sticker of cube.stickers) {
    const face = Object.values(FACES).find(
      (f) => sticker.normal[f.axis] === f.sign,
    );
    const center = sticker.position.map((p, i) =>
      sticker.normal[i] ? p * 0.992 : p * 0.505,
    );
    add(
      center,
      sticker.normal,
      face.right,
      face.up,
      0.419,
      FACES[sticker.color].color,
      sticker.position,
      FACES[sticker.color].letter,
    );
  }
  return polys.sort((a, b) => a.depth - b.depth);
}
export function renderCube(canvas, cube, animation = null, views = VIEWS) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#faf8f3";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#292721";
  ctx.font = "bold 23px system-ui";
  ctx.fillText("2 × 2 CUBE / TWO VIEWS", 24, 40);
  ctx.fillStyle = "#7e786c";
  ctx.font = "14px system-ui";
  ctx.fillText("Same cube, same moment. All six faces are visible.", 24, 68);
  ctx.strokeStyle = "#e0dbd0";
  ctx.beginPath();
  ctx.moveTo(384, 94);
  ctx.lineTo(384, 455);
  ctx.stroke();
  const faceNames = { U: "Top", D: "Bottom", F: "Front", B: "Back", R: "Right", L: "Left" };
  for (const view of views) {
    ctx.fillStyle = "#615b50";
    ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(view.title, view.center[0], 112);
    for (const poly of scenePolygons(cube, animation, view.camera)) {
      const points = poly.vertices.map((v) => project(v, view));
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = poly.color;
      ctx.fill();
      ctx.strokeStyle = poly.letter ? "rgba(0,0,0,.15)" : "#1a2024";
      ctx.lineWidth = poly.letter ? 1 : 1.5;
      ctx.stroke();
    }
    for (const face of visibleFaces(view.camera)) {
      const p = [0, 0, 0];
      p[FACES[face].axis] = FACES[face].sign * 1.6;
      let [x, y] = project(p, view);
      if (FACES[face].axis !== 1) x += x < view.center[0] ? -26 : 26;
      else y += face === "U" ? -8 : 10;
      ctx.font = "bold 17px system-ui";
      ctx.fillStyle = "#534e45";
      ctx.fillText(`${face} / ${faceNames[face]}`, x, y);
    }
  }
  ctx.textAlign = "left";
  ctx.font = "14px system-ui";
  ctx.fillStyle = "#615b50";
  ctx.fillText(
    "Both views turn together. Face names stay fixed in world coordinates.",
    24,
    494,
  );
  ctx.fillText(
    "X = clockwise viewed at face X; X′ = counterclockwise.",
    24,
    523,
  );
}
