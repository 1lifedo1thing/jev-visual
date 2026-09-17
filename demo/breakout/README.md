# Breakout

Open <http://127.0.0.1:8788/demo/breakout/> with the [local Jev Visual server](../README.md) running on your Apple Silicon Mac.

Clear 24 bricks before losing three balls. **Play / resume** starts manual play; **Start AI** lets the model select a target lane. Hold arrow keys, A/D or the direction buttons to move manually, or click **Lane 1–5** to move toward that fixed target. Space pauses or resumes. **Take manual control** cancels pending model actions. A new ball serves automatically after a miss. Changing speed starts a new game.

## Why target lanes?

The previous direction prompt could repeatedly choose Left. Actual browser inspection showed the paddle moving from the center to the left boundary, then remaining there despite fresh, executed Left responses. It was not an animation failure or a dropped-response problem. Changing the wording alone did not fix the visual decision.

The model now answers one simpler question: **which numbered column contains the white ball?** Its answer selects the matching paddle target. Five visible lane markings and matching human buttons make this control scheme explicit.

The actuator uses only the selected lane and the paddle's own position to move toward one of five fixed centers. It never reads the ball position, predicts an intercept or substitutes a better target. This is a simpler action space than raw direction control; it is not evidence that the model learned the original task. Internal ball state still exists for physics and rendering, as in any game.

## Input and execution

- Human and model see the same board: a 28-pixel white ball, a 144-pixel orange paddle and five numbered lanes. Easy mode uses 110 px/s ball speed; Fast uses 220 px/s.
- Each request includes one actual **640×480 canvas screenshot**, a fixed prompt and five candidates. No state arrays, coordinates, velocity or evaluation feedback are sent. The existing non-thinking, direct-label scoring pipeline is unchanged.
- Physics runs continuously at fixed 1/120-second steps. One inference request is in flight; the next starts at least 80 ms after the response. Inference never pauses the ball.
- A target stays active for at most 800 ms, or until the paddle reaches it or a new result arrives. Responses older than 800 ms are shown but not executed. Pause, reset, life loss, lost focus and manual takeover cancel pending actions.
- The status distinguishes moving toward a lane, reaching it and waiting for a new decision. There is no random movement or edge-triggered reversal to disguise a bad model choice.
- The sidebar shows actual inputs, all five normalized candidate probabilities, timing and execution status. It keeps 12 cards; **Export run** includes up to 200 decisions. A budget stop is not a win. Probabilities are not calibrated accuracy scores.

## Verification

```bash
# From the repository root:
node --test demo/breakout/physics.test.mjs
# Running server + browser-test dependencies from ../README.md:
BROWSER_CHANNEL=chrome npm --prefix demo run test:breakout
# Real model on ten new fixed lane scenes:
BROWSER_CHANNEL=chrome node demo/breakout/diagnose.mjs
# Live game, ending at game over or 80 completed decisions:
BROWSER_CHANNEL=chrome npm --prefix demo run test:breakout -- --real
```

Omit `BROWSER_CHANNEL=chrome` when using Playwright's installed Chromium. The probe uses the same renderer and prompt as the game. Known positions are used only to render scenes and evaluate responses, never passed to the model. Full records go to ignored `artifacts/breakout-lane-validation.json` and `artifacts/breakout-real.json`.

Rule tests cover collisions, lives, terminal states and moving gradually to lane targets without teleporting or oscillation. Browser tests mock inference and check manual controls, fixed screenshot-only payloads, probabilities, cancellation, stale responses, errors and mobile layout; passing them does not establish model accuracy.

## Observed lane-control results

The initial nine-image exploration identified the correct lane in 8/9 cases. A separate set of ten positions, heights and paddle locations gave **8/10** with the chosen prompt and label scoring. See [lane observations](lane-observations.json). These are small development checks.

One real Easy-mode run reached **9/24 bricks cleared, six paddle returns and two lives remaining** after **41.66 seconds**. It was deliberately paused at **80 decisions**, not solved. All five targets were selected during play. Median model latency was **406 ms**. See [gameplay observations](observations.json). This demonstrates an operating visual control loop in this run, not a reliable win rate or an isolated prompt improvement.

## Earlier experiments

These used different prompts, observations or controls and are not controlled comparisons with the current version.

- [Three candidates, two frames](observations-three-actions.json): all 38 decisions chose Hold; an always-Hold baseline had the same outcome.
- [Two candidates, two frames](observations-two-frames.json): all 36 decisions chose Right.
- [Single-frame direction classification](observations-single-frame-directions.json): 29 Left / 7 Right, three bricks cleared and zero paddle returns before losing.
- [Direction perception probe](perception-observations.json): 5/6 correct in the normal order and 3/6 after reversing candidates. This showed order sensitivity, not a universal preference for label B.
