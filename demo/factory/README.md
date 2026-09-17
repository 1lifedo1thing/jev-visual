# AI sorting factory

Start the repository's local server and open <http://127.0.0.1:8788/demo/factory/>.

Choose a box, ball, bottle or pyramid and a red, blue or yellow color. Click **Add object** or **Add 6 mixed objects**, then **Start AI sorting**. The belt keeps moving. Stopping AI prevents new requests; classified objects continue to their bins and unclassified objects wait at the gate. **Clear factory** cancels pending results.

- `requestAnimationFrame` renders the moving belt, objects and routing particles independently of inference. Physical arrival at the gate is separate from model response latency.
- A 192×192 crop is taken **from the rendered canvas**, centered on the object reaching the scanner. It is the actual input shown in the sidebar, not a redraw or structured description.
- Only this PNG and fixed color-classification rules/candidates reach `/v1/judge`. Object color metadata is used only for drawing and post-action correctness checks, never to select/correct the model's route.
- One request at a time, at most 12 queued objects, early scanning before the routing gate. If inference is late, objects buffer at the gate while the belt keeps moving. There is no unbounded request backlog.
- The sidebar retains the last 12 completed inferences. Model errors pause further inference; retry explicitly with the start button.

## Observed local run

One actual-model run tested four shapes × three colors: **12/12 correctly sorted**. Qwen3.5-0.8B-4bit model-reported inference latency was **175.6–250.9 ms**, median **188.6 ms**. This excludes browser/network overhead and conveyor travel. It is a fixed sample run, not a broad accuracy or frame-rate benchmark. See [validation.json](validation.json); full screenshot inputs and outputs are in ignored `artifacts/factory-real.json`.

From the repository root (server running, browser-test dependencies installed per [demo README](../README.md)):

```bash
BROWSER_CHANNEL=chrome npm --prefix demo run test:live
BROWSER_CHANNEL=chrome npm --prefix demo run test:live -- --real
```

Normal checks mock inference, including deliberately wrong predictions to verify that game metadata cannot override the model. `--real` sends twelve real rendered object crops to the local model. Both modes use only a synthetic camera for gesture UI tests; no real webcam access occurs in automation.
