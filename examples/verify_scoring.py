"""Real-model test against full-vocabulary teacher forcing, not our adapter math."""
import json
from pathlib import Path

from jev_visual.engine import Engine
from jev_visual.preprocessing import build_prompts, read_image
from jev_visual.schema import Request
from jev_visual.scoring import sequence_logprob


def main():
    engine = Engine(".models/Qwen3.5-0.8B-4bit")
    request = Request(image="examples/dog.jpg", questions={
        "native": {"type": "choice", "instructions": "Which animal?", "criteria": {"dog": "A dog", "cat": "A cat"}, "scoring": "single_token"},
        "phrase": {"type": "choice", "instructions": "Select a description of the main subject.",
                   "criteria": {"short": "White", "dog": "A white dog", "cat": "A white cat"},
                   "scoring": "sequence", "candidates": {"short": "white", "dog": "white dog", "cat": "white cat"}},
        "chinese": {"type": "choice", "instructions": "图片里的动物在哪里？", "criteria": {"out": "室外草地", "in": "室内地板"},
                    "scoring": "sequence", "candidates": {"out": "室外草地", "in": "室内地板"}},
        "label": {"type": "noul", "instructions": "Is a dog visible?"},
    })
    shared = engine.judge(request)
    direct = engine.judge(request.model_copy(update={"mode": "independent"}))
    prefix, plans = build_prompts(engine.processor, request)
    image = read_image(request.image)
    oracle, errors = {}, []
    mx = engine.mx
    for (key, question), plan in zip(request.questions.items(), plans):
        oracle[key] = []
        for target in plan.targets:
            inputs = engine.adapter.prepare(prefix + plan.suffix, image)
            length = inputs["input_ids"].shape[-1]
            if plan.scoring == "sequence":
                inputs["input_ids"] = mx.concatenate([inputs["input_ids"], mx.array([target[:-1]])], axis=1)
            # Independent oracle: stock model __call__, full logits, no shared
            # cache, no selected-position projection and no adapter prefill.
            output = engine.model(inputs["input_ids"], pixel_values=inputs.get("pixel_values"),
                                  image_grid_thw=inputs.get("image_grid_thw"))
            mx.eval(output.logits)
            if plan.scoring == "sequence":
                full = output.logits[0, length - 1:length - 1 + len(target)].astype(mx.float32)
                value = sequence_logprob(full, target)
            else:
                value = float(output.logits[0, -1, target[0]].item())
            oracle[key].append(value)
        errors.extend(abs(a - b) for a, b in zip(oracle[key], shared["answers"][key]["candidate_scores"]))
    delta = max(abs(p - direct["answers"][key]["probabilities"][v]) for key, q in shared["answers"].items() for v, p in q["probabilities"].items())
    report = {"shared": shared, "direct": direct, "full_forward_oracle_scores": oracle,
              "max_oracle_score_error": max(errors), "max_probability_delta": delta}
    Path("artifacts").mkdir(exist_ok=True)
    Path("artifacts/scoring-verification.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    assert max(errors) < .002, report["max_oracle_score_error"]
    assert delta < .001, delta
    assert shared["answers"]["native"]["choice"] == "dog"
    print("Native/labels/multi-token/shared-prefix/Chinese scoring: PASS", max(errors), delta)


if __name__ == "__main__":
    main()
