// A 2×2 cube represented by 24 stickers with integer position/normal vectors.
// No solver or inverse-scramble hints are used by the model integration.
export const FACES = {
  U: { axis: 1, sign: 1, color: '#f4f3e9', letter: 'W', name: 'White', right: [1, 0, 0], up: [0, 0, -1] },
  D: { axis: 1, sign: -1, color: '#f0ce3a', letter: 'Y', name: 'Yellow', right: [1, 0, 0], up: [0, 0, 1] },
  R: { axis: 0, sign: 1, color: '#ca403b', letter: 'R', name: 'Red', right: [0, 0, -1], up: [0, 1, 0] },
  L: { axis: 0, sign: -1, color: '#ee913e', letter: 'O', name: 'Orange', right: [0, 0, 1], up: [0, 1, 0] },
  F: { axis: 2, sign: 1, color: '#3e986e', letter: 'G', name: 'Green', right: [1, 0, 0], up: [0, 1, 0] },
  B: { axis: 2, sign: -1, color: '#427cc1', letter: 'B', name: 'Blue', right: [-1, 0, 0], up: [0, 1, 0] },
};

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

function rotate(vector, axis, direction) {
  const result = [...vector];
  const a = (axis + 1) % 3;
  const b = (axis + 2) % 3;
  result[a] = -direction * vector[b];
  result[b] = direction * vector[a];
  return result;
}

export class Cube {
  constructor() {
    this.stickers = [];
    for (const [face, spec] of Object.entries(FACES)) {
      for (const horizontal of [-1, 1]) {
        for (const vertical of [-1, 1]) {
          const normal = [0, 0, 0];
          normal[spec.axis] = spec.sign;
          const position = normal.map((n, i) => n + horizontal * spec.right[i] + vertical * spec.up[i]);
          this.stickers.push({ color: face, position, normal });
        }
      }
    }
  }

  turn(move) {
    if (!/^[UDRLFB]'?$/.test(move)) throw new Error(`Invalid move: ${move}`);
    const { axis, sign } = FACES[move[0]];
    // Clockwise when looking directly at this face from outside the cube.
    const direction = move.endsWith("'") ? sign : -sign;
    for (const sticker of this.stickers) {
      if (sticker.position[axis] === sign) {
        sticker.position = rotate(sticker.position, axis, direction);
        sticker.normal = rotate(sticker.normal, axis, direction);
      }
    }
  }

  face(face) {
    const spec = FACES[face];
    const cells = Array(4);
    for (const sticker of this.stickers) {
      if (sticker.normal[spec.axis] !== spec.sign) continue;
      const col = (dot(sticker.position, spec.right) + 1) / 2;
      const row = (1 - dot(sticker.position, spec.up)) / 2;
      cells[row * 2 + col] = sticker.color;
    }
    return cells;
  }

  isSolved() {
    return Object.keys(FACES).every(face => new Set(this.face(face)).size === 1);
  }

  snapshot() {
    return Object.keys(FACES).map(face => this.face(face).join('')).join('/');
  }
}
