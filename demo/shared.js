// The model sees only the canvas image plus fixed rules and fixed action labels.
// Game state is used locally for rendering, legal game mechanics and termination.
export function mountDemo(config) {
  const { canvas, actions, instructions } = config;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const button = (text, fn, cls = "") => {
    const b = el("button", cls, text);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  const shell = el("main", "shell");
  const head = el("header", "header");
  const home = el("a", "eyebrow", "JEV VISUAL / VISION-ONLY DEMOS");
  home.href = "../";
  head.append(
    home,
    el("h1", "", config.title),
    el("p", "subtitle", config.subtitle),
  );
  const layout = el("div", "layout"),
    left = el("section", "game-panel"),
    right = el("section", "trace-panel");
  const stage = el("div", "stage");
  stage.append(canvas);
  canvas.setAttribute("aria-label", config.title + " game view");
  const status = el("p", "status"),
    manual = el("div", "actions"),
    transport = el("div", "transport");
  const start = button("Start model", () => run(true), "primary");
  start.id = "start";
  const once = button("Model step", () => run(false));
  once.id = "single-step";
  const stopButton = button("Stop", () => stop());
  stopButton.id = "stop";
  const resetButton = button("Reset", () => reset());
  resetButton.id = "reset";
  transport.append(start, once, stopButton, resetButton);
  const actionButtons = actions.map((a) => {
    const b = button(a.label, () => act(a.id));
    b.dataset.action = a.id;
    manual.append(b);
    return b;
  });
  left.append(stage, status, el("h2", "", "Manual controls"), manual);
  if (config.controls) left.append(config.controls);
  left.append(
    transport,
    el(
      "p",
      "note",
      "Only a PNG screenshot, fixed rules and action candidates reach the local model. No coordinates, state arrays or solution steps are sent.",
    ),
  );
  left.append(
    el(
      "p",
      "note",
      `The model chooses one move at a time, pausing after ${config.maxSteps || 80} steps. It may fail or loop; a pause is not a win.`,
    ),
  );
  const traceHead = el("div", "trace-head");
  traceHead.append(el("h2", "", "Model decision log"));
  const exportButton = button("Export log", () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "vision-decisions.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  traceHead.append(exportButton);
  const feed = el("div", "feed");
  feed.setAttribute("aria-live", "polite");
  const empty = el(
    "p",
    "empty",
    "Choose Model step or Start model to see input screenshots, fixed prompts and every candidate probability.",
  );
  feed.append(empty);
  right.append(
    traceHead,
    el(
      "p",
      "note",
      "Probabilities are normalized scores among the candidates, not action accuracy. Newest steps appear first.",
    ),
    feed,
  );
  layout.append(left, right);
  shell.append(head, layout);
  document.body.append(shell);
  let busy = false,
    running = false,
    epoch = 0,
    controller = null,
    steps = 0,
    notice = "";
  const records = [];
  function refresh() {
    const s = config.getStatus();
    status.textContent = notice || s.message;
    status.dataset.won = String(s.won);
    start.disabled = busy || running || s.done;
    once.disabled = busy || running || s.done;
    stopButton.disabled = !busy && !running;
    actionButtons.forEach((b) => (b.disabled = busy || running || s.done));
    config.controls
      ?.querySelectorAll("button,input,select")
      .forEach((b) => (b.disabled = busy || running));
  }
  function stop() {
    epoch++;
    running = false;
    controller?.abort();
    notice = "Further decisions stopped. Any started move will finish; pending inference results will not be executed.";
    refresh();
  }
  function reset() {
    stop();
    config.reset();
    steps = 0;
    records.length = 0;
    feed.replaceChildren(empty);
    notice = "";
    refresh();
  }
  async function act(id) {
    if (busy || running || config.getStatus().done) return;
    busy = true;
    notice = "";
    refresh();
    try {
      await config.step(id);
    } finally {
      busy = false;
      refresh();
    }
  }
  function logInput(payload) {
    empty.remove();
    const row = el("article", "trace-step");
    row.append(el("h3", "", `STEP ${String(++steps).padStart(2, "0")}`));
    const img = el("img", "input-image");
    img.src = payload.image;
    img.alt = `Actual model input for step ${steps}`;
    row.append(img);
    const details = el("details");
    details.append(el("summary", "", "Full text input (no hidden state)"));
    const { image, ...text } = payload;
    details.append(el("pre", "", JSON.stringify(text, null, 2)));
    row.append(details);
    const outcome = el("p", "outcome", "Running local inference…");
    row.append(outcome);
    feed.prepend(row);
    // Bound DOM and exported image history to avoid unbounded browser memory.
    while (feed.children.length > 80) feed.lastElementChild.remove();
    const record = {
      step: steps,
      input: payload,
      output: null,
      executed: false,
    };
    records.push(record);
    if (records.length > 80) records.shift();
    return { row, outcome, record };
  }
  async function decision(token) {
    busy = true;
    notice = "Analyzing screenshot…";
    refresh();
    const payload = {
      image: config.capture ? config.capture() : canvas.toDataURL("image/png"),
      mode: "shared",
      questions: {
        action: {
          type: "choice",
          scoring: "label",
          instructions,
          criteria: Object.fromEntries(
            actions.map((a) => [a.id, a.description]),
          ),
        },
      },
    };
    const { row, outcome, record } = logInput(payload);
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 120000);
    try {
      const response = await fetch("/v1/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : JSON.stringify(result.detail || result),
        );
      const answer = result.answers?.action;
      record.output = result;
      if (
        !answer ||
        !actions.some((a) => a.id === answer.choice) ||
        actions.some((a) => !Number.isFinite(answer.probabilities?.[a.id]))
      )
        throw new Error("Model returned invalid actions or probabilities");
      const bars = el("div", "probabilities");
      for (const a of actions) {
        const probability = answer.probabilities[a.id];
        const line = el("div", "probability");
        const label = el("span", "", a.label);
        const track = el("div", "track"),
          fill = el("div", "fill");
        fill.style.width = `${Math.max(0, Math.min(1, probability)) * 100}%`;
        track.append(fill);
        line.append(
          label,
          track,
          el("span", "percent", `${(probability * 100).toFixed(2)}%`),
        );
        if (a.id === answer.choice) line.classList.add("selected");
        bars.append(line);
      }
      row.append(bars);
      const raw = el("details");
      raw.append(
        el("summary", "", "Raw model output"),
        el("pre", "", JSON.stringify(result, null, 2)),
      );
      row.append(raw);
      if (token !== epoch) {
        outcome.textContent = "Canceled: result recorded, no move executed.";
        return false;
      }
      const applied = await config.step(answer.choice);
      if (applied === false) {
        outcome.textContent = "Move canceled; not applied.";
        return false;
      }
      record.executed = true;
      record.action = answer.choice;
      record.gameAfter = config.getStatus();
      outcome.textContent = `Executed ${actions.find((a) => a.id === answer.choice).label} · ${Math.round(result.metrics?.elapsed_ms || 0)} ms`;
      notice = "";
      return true;
    } catch (error) {
      record.error = String(error);
      outcome.textContent =
        error.name === "AbortError"
          ? "Stopped or timed out; no move executed."
          : `Request failed: ${error.message}`;
      if (token === epoch) notice = outcome.textContent;
      return false;
    } finally {
      clearTimeout(timeout);
      controller = null;
      busy = false;
      refresh();
    }
  }
  async function run(auto) {
    if (busy || running || config.getStatus().done) return;
    const token = ++epoch;
    running = auto;
    notice = "";
    let count = 0;
    do {
      if (token !== epoch || config.getStatus().done) break;
      const ok = await decision(token);
      count++;
      if (!ok || !auto || token !== epoch || config.getStatus().done) break;
      if (count >= (config.maxSteps || 80)) {
        notice = "Step budget reached. Paused without solving the game.";
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 180));
    } while (running);
    if (token === epoch) running = false;
    refresh();
  }
  async function inspect(task) {
    if (busy || running) return;
    busy = true;
    const token = ++epoch;
    controller = new AbortController();
    const signal = controller.signal;
    const timer = setTimeout(() => controller?.abort(), 120000);
    notice = "Checking visual recognition; no moves will be executed…";
    refresh();
    try {
      await task(signal);
      if (token === epoch) notice = "Perception check complete; game state unchanged.";
    } catch (error) {
      if (token === epoch)
        notice = `Check incomplete: ${error.name === "AbortError" ? "canceled or timed out" : error.message}`;
    } finally {
      clearTimeout(timer);
      controller = null;
      busy = false;
      refresh();
    }
  }
  const api = {
    reset,
    inspect,
    stop,
    isBusy: () => busy || running,
    refresh,
    act,
    run,
    records,
  };
  window.demoController = api;
  refresh();
  return api;
}
