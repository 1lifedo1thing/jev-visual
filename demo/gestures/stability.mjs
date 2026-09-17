export class GestureStability {
  constructor() {
    this.reset();
  }
  reset() {
    this.scores = null;
    this.candidate = null;
    this.count = 0;
    this.mode = "none";
  }
  update(probabilities) {
    this.scores = Object.fromEntries(
      Object.entries(probabilities).map(([key, p]) => [
        key,
        this.scores?.[key] === undefined
          ? p
          : 0.65 * p + 0.35 * this.scores[key],
      ]),
    );
    const [top, p] = Object.entries(this.scores).sort((a, b) => b[1] - a[1])[0];
    if (p < 0.45) {
      this.count = 0;
      this.candidate = null;
      return this.mode;
    }
    this.count = top === this.candidate ? this.count + 1 : 1;
    this.candidate = top;
    if (this.count >= 2) this.mode = top;
    return this.mode;
  }
}
