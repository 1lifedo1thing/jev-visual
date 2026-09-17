# 2×2 cube: a model limitation demo

**The current model cannot reliably solve this cube.** Qwen3.5-0.8B-4bit runs in non-thinking, direct candidate-scoring mode. In six one-turn trials, it solved only 1/6 in one action and never read all 24 cells correctly. This demo is retained for manual play and inspecting perception and decision failures, not as a working AI cube solver. Thinking mode has not been evaluated.

Open <http://127.0.0.1:8788/demo/rubik/> on the local Jev Visual server.

People see two synchronized 3D views of the same cube, with 320 ms turn animations. The model receives a separately rendered **768×660 flat six-face net** rather than these perspective views:

```text
       U
   L   F   R   B
       D
```

Each cell has a fixed ID (U1–U4, etc.) and a large color letter W/Y/R/O/G/B. Positions 1/2/3/4 mean top-left, top-right, bottom-left and bottom-right on that face. Layout is fixed, without shadows or perspective. Expand **View actual AI input** to inspect it; each step in the sidebar also shows the exact input.

The net is rendered from the same cube state. Requests contain only a PNG, fixed questions and candidates: no color arrays, scramble steps, solver answers or evaluation feedback. Capture is locked until the turn animation finishes.

## Check perception before actions

**Check 24 cells (no moves)** submits 24 color questions sharing one image prefill. After the response, the program compares predictions with internal state and displays **prediction / actual** colors and candidate probabilities. It makes no moves and never feeds evaluation results back to the model. A move marks the report stale; Stop or Reset cancels a pending check.

Controls include 12 face turns, single or continuous model steps, Stop, Reset and 1/3/8-turn scrambles. Clockwise is judged looking directly at the selected face, following [WCA face-turn notation](https://www.worldcubeassociation.org/regulations/#12a1). The model chooses moves directly; there is no hidden solver or automatic correction.

## Actual diagnosis

[net-observations.json](net-observations.json) records all six one-turn cases:

| Scramble | Correctly read cells | Original-order action | Solved in that action |
|---|---:|---|---|
| U | 13/24 | U′ | Yes |
| U′ | 13/24 | U′ | No |
| R | 16/24 | U′ | No |
| R′ | 19/24 | U′ | No |
| F | 19/24 | U′ | No |
| F′ | 19/24 | U′ | No |

Across the six inputs, **99/144 cells (68.75%)** were correct; none had all 24 cells correct. With the original candidate order, **1/6** cases were solved in one action.

On the *same* images, reversing or rotating the candidate order changed the selected moves: original order always chose U′ (answer label B); reversed order chose L in five cases and B′ in one; rotated order chose F′ in four cases and D′ in two. This is evidence of order sensitivity, not proof of one universal label bias. Because perception was not fully correct, these trials cannot isolate planning ability independently of perception.

A clearer picture is a testable input design, not a guarantee that this 0.8B model can solve cubes. These six fixed examples are development diagnostics, not a broad benchmark. The historical [single-view](3d-observations.json) and [dual-view](multiview-observations.json) records used different inputs; do not treat them as this version's measurements.

## Verify and reproduce

The existing cube mechanics matched an independent cubejs reference for twelve single moves and 2,000 mixed moves. Tests also cover inverse-image parity, animation cancellation, pixel visibility, all 24 net cells, static question schemas, read-only scoring and the model receiving the net rather than the 3D canvas. No solver runs in the game.

```bash
# Rule and renderer tests, no model or npm dependencies needed:
node --test demo/rubik/cube.test.mjs demo/rubik/audit.test.mjs demo/rubik/observation.test.mjs
# Running server + Playwright required; uses mocked inference:
BROWSER_CHANNEL=chrome node demo/rubik/browser-check.mjs
# Actual local model: 24-cell recognition, one-step action, three option orders:
BROWSER_CHANNEL=chrome node demo/rubik/diagnose.mjs
```

The diagnosis writes full screenshot inputs and outputs to ignored `artifacts/rubik-net-diagnosis.json` and leaves the committed summary intact. Color truth and test scramble are used for evaluation only, never included in inference requests. See [demo setup](../README.md) for environment installation.
