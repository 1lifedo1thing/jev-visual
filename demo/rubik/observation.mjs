// Model-facing image: same physical state, no perspective and no solver hints.
import { FACES } from "./cube.mjs";
export const NET_SIZE = { width: 768, height: 660 };
export const FACE_LAYOUT = {
  U: [1, 0],
  L: [0, 1],
  F: [1, 1],
  R: [2, 1],
  B: [3, 1],
  D: [1, 2],
};
export const FACE_NAMES = {
  U: "UP",
  L: "LEFT",
  F: "FRONT",
  R: "RIGHT",
  B: "BACK",
  D: "DOWN",
};
export const COLOR_OPTIONS = {
  W: "White, letter W",
  Y: "Yellow, letter Y",
  R: "Red, letter R",
  O: "Orange, letter O",
  G: "Green, letter G",
  B: "Blue, letter B",
};
const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"];
export const ACTION_INSTRUCTIONS =
  "Read the standard unfolded net of ONE 2x2 Rubik cube. U is above F; L, F, R, B form the middle row; D is below F. All faces are viewed directly from outside. Each sticker has a small cell ID such as U1 and a LARGE color letter: W white, Y yellow, R red, O orange, G green, B blue. The cell ID identifies position, not color. Choose one face-layer turn that helps make every face a single color. A turn need not solve the cube immediately. Clockwise is viewed directly at the named face; prime means counterclockwise. Use only this image.";
export function netCells(cube) {
  return Object.entries(FACE_LAYOUT).flatMap(([face, [col, row]]) =>
    cube
      .face(face)
      .map((color, index) => ({
        id: `${face}${index + 1}`,
        face,
        index,
        x: 26 + col * 184 + (index % 2) * 70,
        y: 92 + row * 176 + Math.floor(index / 2) * 70,
        color: FACES[color].color,
        letter: FACES[color].letter,
      })),
  );
}
export function renderObservation(canvas, cube) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#222";
  ctx.textAlign = "left";
  ctx.font = "bold 23px system-ui";
  ctx.fillText("CUBE OBSERVATION / SIX FACES", 26, 34);
  ctx.font = "14px system-ui";
  ctx.fillText("Small text = cell ID. Large letter = sticker color.", 26, 58);
  for (const [face, [col, row]] of Object.entries(FACE_LAYOUT)) {
    ctx.font = "bold 18px system-ui";
    ctx.fillStyle = "#222";
    ctx.fillText(
      `${face} / ${FACE_NAMES[face]}`,
      26 + col * 184,
      84 + row * 176,
    );
  }
  for (const cell of netCells(cube)) {
    ctx.fillStyle = cell.color;
    ctx.fillRect(cell.x, cell.y, 68, 68);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cell.x, cell.y, 68, 68);
    ctx.fillStyle = ["W", "Y", "O"].includes(cell.letter) ? "#111" : "#fff";
    ctx.textAlign = "left";
    ctx.font = "12px ui-monospace,monospace";
    ctx.fillText(cell.id, cell.x + 6, cell.y + 16);
    ctx.font = "bold 33px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.fillText(cell.letter, cell.x + 34, cell.y + 53);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#333";
  ctx.font = "14px system-ui";
  ctx.fillText(
    "W white   Y yellow   R red   O orange   G green   B blue",
    26,
    620,
  );
  ctx.fillText(
    "1 top-left · 2 top-right · 3 bottom-left · 4 bottom-right",
    26,
    645,
  );
}
export function colorQuestions() {
  return Object.fromEntries(
    Object.keys(FACE_LAYOUT).flatMap((face) =>
      POSITIONS.map((position, index) => [
        `${face}${index + 1}`,
        {
          type: "choice",
          scoring: "label",
          instructions: `Read ONLY sticker ${face}${index + 1}: the ${position} cell of face ${face} (${FACE_NAMES[face]}) in the unfolded cube image. What is its color? Read the LARGE letter inside that cell. The small ID ${face}${index + 1} is NOT its color.`,
          criteria: { ...COLOR_OPTIONS },
        },
      ]),
    ),
  );
}
export function evaluateColors(cube, answers) {
  const cells = netCells(cube).map((cell) => ({
    id: cell.id,
    expected: cell.letter,
    predicted: answers[cell.id]?.choice ?? null,
    probabilities: answers[cell.id]?.probabilities ?? null,
  }));
  return {
    correct: cells.filter((c) => c.expected === c.predicted).length,
    total: cells.length,
    cells,
  };
}
