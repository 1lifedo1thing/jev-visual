# Visual inference demos

Four browser demos use the local Jev Visual model. No cloud API, frontend build or Node server is needed to play.

| Demo | What it does | Current capability |
|---|---|---|
| [Breakout](breakout/) | Selects one of five visible paddle targets from a screenshot | One 80-decision run: 9 bricks, 6 returns, 2 lives remaining; not completed |
| [Sorting factory](factory/) | Classifies object screenshots while a conveyor keeps moving | 12/12 correct in one fixed local trial |
| [Gesture console](gestures/) | Uses camera frames to control a particle field | UI tested with a synthetic camera; real-hand accuracy not evaluated |
| [2×2 cube](rubik/) | Shows two 3D views, sends a labeled flat net, and exposes perception/action decisions | **Current model cannot reliably solve it** in the default non-thinking, direct-scoring mode |

## Run on macOS

Complete the [repository setup](../README.md), then run from the repository root:

```bash
source .venv/bin/activate
JEV_VISUAL_MODEL_PATH=.models/Qwen3.5-0.8B-4bit \
  uvicorn jev_visual.server:app --host 127.0.0.1 --port 8788
```

Open <http://127.0.0.1:8788/demo/>. Use this server, not `file://` or a separate static server: pages call the same-origin `/v1/judge`. Demos are served from the source checkout. Use one server worker; inference runs on the existing dedicated MLX thread.

Factory and gesture animations run independently of inference. The factory buffers unclassified objects at the gate; the gesture console samples only after explicit camera permission and starting recognition. Each sidebar shows actual image inputs and candidate probabilities.

The cube supports manual moves, **Model step**, **Start model**, **Stop**, **Reset**, and exporting up to 80 recent records. Manual input is locked during inference or animation. Stopping discards pending actions, although computation already started on the server may finish. Automatic cube runs pause after 40 decisions; a budget stop is not a win.

## What reaches the model

```text
PNG screenshot + fixed questions and candidates
  → /v1/judge → candidate scoring → selected action → next screenshot
```

Only the screenshot changes between states. No state arrays, coordinates, scramble history, solver results or evaluation feedback are sent. Internal state is used for rendering, game rules and post-action evaluation. No solver or fallback replaces the model's action. Probabilities are normalized candidate scores, not calibrated accuracy estimates.

The cube remains a limitation experiment: in six one-turn trials, the current model read 99/144 cells correctly and solved only 1/6 in one action. These results apply to the current non-thinking, direct-scoring pipeline, not a Thinking-mode evaluation. See [cube results](rubik/README.md) and [historical observations](OBSERVATIONS.md).

## Tests

From the repository root:

```bash
npm --prefix demo test
python -m pytest -q
npm ci --prefix demo
cd demo
npx playwright install chromium
# Running local server required; inference is mocked:
npm run test:browser
node rubik/browser-check.mjs
npm run test:live
npm run test:breakout
# Actual local model, saves records to ../artifacts/:
npm run test:browser -- --real
npm run test:live -- --real
node rubik/diagnose.mjs
```

With Chrome installed, skip the Chromium download and prefix browser commands with `BROWSER_CHANNEL=chrome`. Mocked checks verify controls, payload boundaries, probability rendering, cancellation and mobile layout; they do not measure model quality. Real runs record model failures without correcting them. Automated camera checks always use a synthetic device, never your webcam.
