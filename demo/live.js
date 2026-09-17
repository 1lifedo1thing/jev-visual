// One in-flight request per controller. Never enqueue stale camera frames.
export class VisualClient {
  constructor() {
    this.busy = false;
    this.controller = null;
    this.epoch = 0;
  }
  cancel() {
    this.epoch++;
    this.controller?.abort();
  }
  async judge(image, instructions, criteria) {
    if (this.busy) throw new Error("An inference request is already running");
    this.busy = true;
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    const input = {
      image,
      mode: "shared",
      questions: {
        action: { type: "choice", scoring: "label", instructions, criteria },
      },
    };
    const start = performance.now(),
      timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("/v1/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const output = await response.json();
      if (!response.ok)
        throw new Error(
          typeof output.detail === "string"
            ? output.detail
            : JSON.stringify(output.detail || output),
        );
      if (epoch !== this.epoch)
        throw new DOMException("Cancelled", "AbortError");
      const answer = output.answers?.action;
      if (
        !answer ||
        !Object.hasOwn(criteria, answer.choice) ||
        Object.keys(criteria).some(
          (k) => !Number.isFinite(answer.probabilities?.[k]),
        )
      )
        throw new Error("Invalid model response");
      return { input, output, answer, wallMs: performance.now() - start };
    } finally {
      clearTimeout(timer);
      if (this.controller === controller) this.controller = null;
      this.busy = false;
    }
  }
}
export function trace(container, result, labels, note = "") {
  const make = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const card = make("article");
  card.className = "live-record";
  const title = make(
    "h3",
    `${labels[result.answer.choice]} · ${Math.round(result.wallMs)} ms`,
  );
  card.append(title);
  const img = make("img");
  img.src = result.input.image;
  img.alt = "Actual screenshot sent to the local model";
  card.append(img);
  for (const [key, p] of Object.entries(result.answer.probabilities)) {
    const row = make("div");
    row.className = "live-prob";
    const track = make("span");
    track.className = "live-track";
    const bar = make("i");
    bar.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
    track.append(bar);
    row.append(
      make("span", labels[key]),
      track,
      make("span", `${(p * 100).toFixed(1)}%`),
    );
    card.append(row);
  }
  if (note) card.append(make("p", note));
  const details = make("details");
  details.append(make("summary", "Input rules / raw output"));
  const { image, ...text } = result.input;
  details.append(
    make(
      "pre",
      JSON.stringify({ input: text, output: result.output }, null, 2),
    ),
  );
  card.append(details);
  container.prepend(card);
  while (container.children.length > 12) container.lastElementChild.remove();
}
