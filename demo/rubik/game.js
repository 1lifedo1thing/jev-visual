import { mountDemo } from "../shared.js";
import { Cube } from "./cube.mjs";
import { renderCube } from "./render.mjs";
import {
  NET_SIZE,
  renderObservation,
  colorQuestions,
  evaluateColors,
  ACTION_INSTRUCTIONS,
} from "./observation.mjs";

const canvas = document.createElement("canvas");
canvas.id = "rubik-game";
canvas.width = 768;
canvas.height = 550;
canvas.setAttribute(
  "aria-label",
  "Two synchronized views of the same 2×2 cube, showing all six faces",
);
const faceNames = { U: "Top", D: "Bottom", L: "Left", R: "Right", F: "Front", B: "Back" };
const englishFaces = {
  U: "UP / top",
  D: "DOWN / bottom",
  L: "LEFT",
  R: "RIGHT",
  F: "FRONT",
  B: "BACK",
};
const actions = [
  "U",
  "U'",
  "R",
  "R'",
  "F",
  "F'",
  "D",
  "D'",
  "L",
  "L'",
  "B",
  "B'",
].map((move) => ({
  id: move,
  label: `${move} · ${faceNames[move[0]]}${move.endsWith("'") ? " CCW" : " CW"}`,
  description: `Turn only the ${englishFaces[move[0]]} layer 90 degrees ${move.endsWith("'") ? "counterclockwise" : "clockwise"}, as viewed directly from outside that face. Do not rotate the whole cube or the camera.`,
}));
const instructions = ACTION_INSTRUCTIONS;

let cube,
  moves = 0,
  lastMove = "—",
  renderEpoch = 0;
const controls = document.createElement("div");
controls.className = "rubik-controls";
const label = document.createElement("label");
label.textContent = "Scramble depth ";
const difficulty = document.createElement("select");
difficulty.id = "scramble-depth";
for (const [value, text] of [
  ["1", "1 turn (easy)"],
  ["3", "3 turns"],
  ["8", "8 turns"],
]) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  difficulty.append(option);
}
label.append(difficulty);
controls.append(label);
const note = document.createElement("p");
note.className = "note";
note.textContent =
  "You see two 3D views; the model sees a flat six-face net with cell IDs and color letters. Check all 24 cells before trying actions. The check never corrects model decisions.";
controls.append(note);
const observation = document.createElement("canvas");
observation.id = "rubik-observation";
observation.width = NET_SIZE.width;
observation.height = NET_SIZE.height;
observation.style.cssText =
  "width:100%;height:auto;display:block;border:1px solid #dedbd2;margin-top:12px";
observation.setAttribute(
  "aria-label",
  "Actual model input: a six-face net with 24 labeled cells",
);
const preview = document.createElement("details"),
  summary = document.createElement("summary");
summary.textContent = "View actual AI input: six-face net";
preview.append(summary, observation);
controls.append(preview);
const probe = document.createElement("button");
probe.id = "inspect-colors";
probe.textContent = "Check 24 cells (no moves)";
probe.style.marginTop = "12px";
const report = document.createElement("div");
report.id = "color-report";
report.setAttribute("aria-live", "polite");
controls.append(probe, report);
function capture() {
  renderObservation(observation, cube);
  return observation.toDataURL("image/png");
}

function reset() {
  renderEpoch++;
  cube = new Cube();
  const depth = Number(difficulty.value),
    choices = ["U", "U'", "R", "R'", "F", "F'"];
  let previous = "";
  for (let i = 0; i < depth; i++) {
    const available = choices.filter((m) => m[0] !== previous);
    const move = available[Math.floor(Math.random() * available.length)];
    cube.turn(move);
    previous = move[0];
  }
  moves = 0;
  lastMove = "—";
  renderCube(canvas, cube);
  renderObservation(observation, cube);
  report.replaceChildren();
  delete report.dataset.stale;
  window.rubikProbe = null;
}
function step(actionId) {
  if (cube.isSolved()) return false;
  const token = renderEpoch;
  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      if (token !== renderEpoch) {
        resolve(false);
        return;
      }
      const t = Math.min(1, (now - start) / 320),
        eased = t * t * (3 - 2 * t);
      renderCube(canvas, cube, { move: actionId, progress: eased });
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      cube.turn(actionId);
      moves++;
      lastMove = actionId;
      renderCube(canvas, cube);
      renderObservation(observation, cube);
      if (report.children.length && !report.dataset.stale) {
        report.dataset.stale = "true";
        report.prepend(
          Object.assign(document.createElement("p"), {
            textContent: "This report predates the last move. The cube has changed; run the check again.",
          }),
        );
      }
      resolve(true);
    }
    requestAnimationFrame(frame);
  });
}
function getStatus() {
  const won = cube.isSolved();
  return {
    done: won,
    won,
    message: won
      ? `All six faces solved in ${moves} moves.`
      : `${moves} moves · Last: ${lastMove} · Two views, all six faces`,
  };
}
reset();
const controller = mountDemo({
  title: "2×2 Cube · Two 3D Views",
  subtitle: "A visual reasoning experiment: inspect perception first, then try model-selected moves.",
  canvas,
  capture,
  actions,
  instructions,
  step,
  reset,
  getStatus,
  controls,
  maxSteps: 40,
});
const limitation = document.createElement("p");
limitation.id = "model-limitation";
limitation.className = "note model-limitation";
const limitationTitle = document.createElement("strong");
limitationTitle.textContent = "Model limitation: the current model cannot reliably solve this cube.";
limitation.append(limitationTitle, document.createTextNode(
  " Qwen3.5-0.8B-4bit uses non-thinking, direct candidate scoring here. In six one-turn trials, it solved only 1/6 in one action and read 99/144 cells correctly. Kept as a perception and decision failure demo; manual play and model experiments remain available. "
));
const evidence = document.createElement("a");
evidence.href = "./README.md";
evidence.textContent = "View results and limitations";
limitation.append(evidence);
document.querySelector(".header").append(limitation);
difficulty.onchange = () => controller.reset();

probe.onclick = () =>
  controller.inspect(async (signal) => {
    delete report.dataset.stale;
    report.textContent = "Reading 24 cells…";
    signal.addEventListener(
      "abort",
      () => {
        report.textContent = "Perception check canceled. No moves executed.";
      },
      { once: true },
    );
    const input = {
      image: capture(),
      mode: "shared",
      questions: colorQuestions(),
    };
    const response = await fetch("/v1/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    }).catch((error) => {
      if (!signal.aborted) report.textContent = "Check incomplete. Please try again.";
      throw error;
    });
    const output = await response.json();
    if (signal.aborted) return;
    if (!response.ok) {
      report.textContent = "Check failed. Please try again.";
      throw new Error(
        typeof output.detail === "string"
          ? output.detail
          : JSON.stringify(output.detail || output),
      );
    }
    const result = evaluateColors(cube, output.answers || {});
    window.rubikProbe = { input, output, result };
    report.replaceChildren();
    const heading = document.createElement("p");
    heading.textContent = `${result.correct} / ${result.total} cells correct · ${Math.round(output.metrics?.elapsed_ms || 0)} ms · No moves executed`;
    report.append(heading);
    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font:12px ui-monospace,monospace";
    for (const cell of result.cells) {
      const tile = document.createElement("div");
      tile.textContent = `${cell.id}: ${cell.predicted ?? "?"} / ${cell.expected}`;
      tile.title = "Prediction / actual color (evaluation only)";
      tile.style.cssText = `padding:7px;background:${cell.predicted === cell.expected ? "#e6efe4" : "#f8dfd6"}`;
      grid.append(tile);
    }
    report.append(grid);
    const details = document.createElement("details"),
      title = document.createElement("summary"),
      raw = document.createElement("pre");
    title.textContent = "Perception input, cell probabilities and evaluation";
    raw.textContent = JSON.stringify(
      {
        input: { mode: input.mode, questions: input.questions },
        output,
        result,
      },
      null,
      2,
    );
    details.append(title, raw);
    report.append(details);
  });
