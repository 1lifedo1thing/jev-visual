# Usage and tests

[English README](../README.md) · [中文 README](../README.zh-CN.md)

Run commands from the repository root after completing the README setup. CLI image paths are relative to the request file.

## Requests and answers

An example request file:

```json
{
  "image": "red-circle.png",
  "state": "Judge only what is visible.",
  "questions": {
    "color": {
      "type": "choice",
      "instructions": "What color is the shape?",
      "criteria": {"red": "Red", "blue": "Blue", "other": "Another color"}
    },
    "round": {"type": "noul", "instructions": "Is the shape round?"},
    "redness": {
      "type": "score",
      "instructions": "How much of the shape is red?",
      "criteria": ["None", "Some", "All"]
    }
  }
}
```

| Type | Result |
|---|---|
| `choice` | One declared option and its candidate probability distribution |
| `noul` | `noul`, the normalized probability of the “yes” option |
| `score` | Probability-weighted level index, from `0` to `number of levels - 1` |

The program assembles the result; the model does not generate JSON. Probabilities are **conditional on the supplied candidates, not calibrated correctness estimates**. `concentration` describes distribution concentration, not accuracy.

Use `POST /v1/judge` with the same schema, replacing `image` with a base64 data URL such as `data:image/png;base64,...`. HTTP does not accept local paths or remote image URLs. The browser handles image encoding for you. See [the HTTP example](../examples/http_smoke.py) for a complete client.

```python
from jev_visual import Request
from jev_visual.engine import Engine

engine = Engine(".models/Qwen3.5-0.8B-4bit")
result = engine.judge(Request(
    image="examples/dog.jpg",
    questions={"dog": {"type": "noul", "instructions": "Is a dog visible?"}},
))
print(result["answers"]["dog"]["noul"])
```

Create and use `Engine` on the same thread. The HTTP server uses a dedicated inference thread and queues requests.

## Tests and layout

```bash
python -m pytest -q                   # No model download or GPU inference
python -m examples.evaluate           # Real-model visual/cache checks
python -m examples.verify_scoring     # Full-forward oracle for candidate scoring
# With the local server running:
python -m examples.http_smoke
```

Test outputs go to ignored `artifacts/`. The committed benchmark and [scoring verification](../benchmarks/scoring-verification.json) preserve the published evidence.

```text
jev_visual/       inference engine, adapters, schema, CLI and local server
examples/         runnable requests, image fixtures and integration checks
tests/            unit and API contract tests
benchmarks/       runners, methodology and measured results
docs/             candidate scoring and implementation details
third_party/      upstream license notices
```
