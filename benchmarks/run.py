"""Real-model systems benchmark. JSON baseline uses the actual mlx_vlm.generate()."""
import argparse
import hashlib
import json
import platform
import statistics
import time
from importlib.metadata import version
from pathlib import Path
from unittest.mock import patch

from visual_jev.engine import Engine
from visual_jev.preprocessing import read_image
from visual_jev.schema import Request


CRITERIA = [
    ("Which animal is the main subject?", {"dog": "A dog", "cat": "A cat", "other": "Another subject"}),
    ("What is the main animal's fur color?", {"white": "Mostly white", "black": "Mostly black", "other": "Another color"}),
    ("Where is the animal?", {"outdoors": "Outdoors", "indoors": "Indoors", "unknown": "Cannot tell"}),
    ("Is vegetation visible?", {"yes": "Yes", "no": "No"}),
    ("How many dogs are visible?", {"one": "One", "two": "Two", "other": "Another count"}),
    ("Is the dog's mouth open?", {"yes": "Yes", "no": "No"}),
    ("What surface is below the animal?", {"grass": "Grass", "floor": "Indoor floor", "other": "Another surface"}),
    ("Is a person visible in the image?", {"yes": "Yes", "no": "No"}),
]


def fixture(image, count):
    return Request(image=str(image), state={"task": "Describe visible evidence only. Do not infer hidden objects.", "source": "One still photograph; all questions refer to this same photograph."},
                   questions={f"q{i:02}": {"type": "choice", "instructions": CRITERIA[i % 8][0], "criteria": CRITERIA[i % 8][1]} for i in range(count)})


def generate_json(engine, request):
    from mlx_vlm import generate
    mx = engine.mx
    engine.adapter.reset()
    started = time.perf_counter()
    image = read_image(request.image)
    spec = {key: {"question": q.instructions, "options": dict(q.options())} for key, q in request.questions.items()}
    prompt = engine.processor.apply_chat_template([
        {"role": "system", "content": "Answer all questions about the image. Return only a compact JSON object mapping each question ID to its chosen option ID. No explanation or markdown."},
        {"role": "user", "content": [{"type": "image"}, {"type": "text", "text": json.dumps({"context": request.state, "questions": spec}, ensure_ascii=False)}]},
    ], tokenize=False, add_generation_prompt=True, enable_thinking=False)
    counters = {"vision_ms": 0., "prefill_ms": 0., "scoring_ms": 0., "language_forward_calls": 0, "vision_forward_calls": 0}
    lm_cls = type(engine.model.language_model)
    vision_cls = type(engine.model.vision_tower)
    lm_call, vision_call = lm_cls.__call__, vision_cls.__call__
    embedding_cls = type(engine.model)
    embedding_call = embedding_cls.get_input_embeddings

    def observe_language(model, inputs, *args, **kwargs):
        t = time.perf_counter()
        result = lm_call(model, inputs, *args, **kwargs)
        mx.eval(result.logits)
        phase = "prefill_ms" if inputs.shape[-1] > 1 or kwargs.get("inputs_embeds") is not None else "scoring_ms"
        counters[phase] += (time.perf_counter() - t) * 1000
        counters["language_forward_calls"] += 1
        return result

    def observe_vision(model, *args, **kwargs):
        counters["vision_forward_calls"] += 1
        return vision_call(model, *args, **kwargs)

    def observe_embeddings(model, *args, **kwargs):
        t = time.perf_counter()
        result = embedding_call(model, *args, **kwargs)
        mx.eval(result.inputs_embeds, result.position_ids)
        counters["vision_ms"] += (time.perf_counter() - t) * 1000
        return result

    # Timed/synchronized actual forwards, not inferred from token counts.
    # This is a single-thread benchmark; never patch classes in the HTTP server.
    cap = max(128, len(spec) * 24)
    with patch.object(lm_cls, "__call__", observe_language), patch.object(vision_cls, "__call__", observe_vision), patch.object(embedding_cls, "get_input_embeddings", observe_embeddings):
        output = generate(engine.model, engine.processor, prompt, image=[image],
                          max_tokens=cap, temperature=0.0, verbose=False, prefill_step_size=512)
    mx.synchronize()
    elapsed = (time.perf_counter() - started) * 1000
    parsed, error = None, None
    try:
        parsed = json.loads(output.text)
        valid = isinstance(parsed, dict) and set(parsed) == set(spec) and all(isinstance(parsed[k], str) and parsed[k] in spec[k]["options"] for k in spec)
    except (ValueError, TypeError) as exc:
        valid, error = False, str(exc)
    return {"raw_text": output.text, "parsed_json": parsed, "valid": valid, "parse_error": error,
            "prompt": prompt, "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
            "max_tokens": cap, "hit_token_limit": output.generation_tokens >= cap,
            "metrics": {**counters, "mode": "generate_json", "elapsed_ms": elapsed,
                        "generated_tokens": output.generation_tokens,
                        "input_tokens": output.prompt_tokens,
                        "peak_metal_memory_gb": mx.get_peak_memory() / 1e9,
                        "decisions_per_second": len(spec) * 1000 / elapsed,
                        "valid_decisions_per_second": len(spec) * 1000 / elapsed if valid else 0}}


def summarize(rows):
    summaries = []
    for count in sorted({r["decisions"] for r in rows}):
        for mode in ("generate_json", "independent", "shared"):
            subset = [r for r in rows if r["decisions"] == count and r["mode"] == mode]
            if not subset:
                continue
            metrics = [r["result"]["metrics"] for r in subset]
            keys = ("elapsed_ms", "vision_ms", "prefill_ms", "scoring_ms", "language_forward_calls", "vision_forward_calls", "peak_metal_memory_gb", "decisions_per_second")
            summaries.append({"decisions": count, "mode": mode, "runs": len(subset),
                              **{key: statistics.median(m[key] for m in metrics) for key in keys},
                              "valid_runs": sum(r["result"].get("valid", True) for r in subset)})
    return summaries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", default=".models/Qwen3.5-0.8B-4bit")
    parser.add_argument("--image", type=Path, default=Path("examples/dog.jpg"))
    parser.add_argument("--counts", nargs="+", type=int, default=[1, 4, 16, 64])
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path, default=Path("artifacts/benchmark.json"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    engine = Engine(args.model_path)
    report = {"environment": {"platform": platform.platform(), "device": engine.mx.device_info(),
                               "packages": {p: version(p) for p in ("mlx", "mlx-vlm", "transformers")},
                               "model_source": engine.model_source,
                               "model_weights_sha256": hashlib.file_digest(open(Path(args.model_path) / "model.safetensors", "rb"), "sha256").hexdigest()},
              "method": "3 paths on identical image/context/questions, label candidate mode, float32 compute with 4-bit weights; synchronized forwards; load excluded; no JSON repair; order rotated per repeat. Repeated criteria measure scaling, not 64 independent semantic capabilities.",
              "image_sha256": hashlib.sha256(args.image.read_bytes()).hexdigest(),
              "batch_size": engine.batch_size, "fixtures": {}, "rows": []}
    print("Warm up all three paths (excluded)", flush=True)
    warm = fixture(args.image, 1)
    engine.judge(warm)
    engine.judge(warm.model_copy(update={"mode": "independent"}))
    generate_json(engine, warm)
    for count in args.counts:
        request = fixture(args.image, count)
        report["fixtures"][str(count)] = request.model_dump()
        for repeat in range(args.repeats):
            modes = ["generate_json", "independent", "shared"]
            modes = modes[repeat % 3:] + modes[:repeat % 3]
            for mode in modes:
                result = generate_json(engine, request) if mode == "generate_json" else engine.judge(request.model_copy(update={"mode": mode}))
                report["rows"].append({"decisions": count, "repeat": repeat, "mode": mode, "result": result})
                report["summary"] = summarize(report["rows"])
                args.output.write_text(json.dumps(report, indent=2) + "\n")
                print(count, repeat, mode, round(result["metrics"]["elapsed_ms"]), "ms", "valid", result.get("valid", True), flush=True)
    # Compare scored distributions by question ID, and generation agreement
    # separately; JSON validity alone is not semantic accuracy.
    comparisons = []
    for count in args.counts:
        subset = {r["mode"]: r["result"] for r in report["rows"] if r["decisions"] == count and r["repeat"] == 0}
        direct, shared = subset["independent"]["answers"], subset["shared"]["answers"]
        delta = max(abs(p - direct[k]["probabilities"][v]) for k, q in shared.items() for v, p in q["probabilities"].items())
        gen = subset["generate_json"]
        comparisons.append({"decisions": count, "max_probability_delta": delta,
                            "direct_shared_argmax_agreement": sum(q["choice"] == direct[k]["choice"] for k, q in shared.items()) / count,
                            "generate_shared_agreement": sum(gen["parsed_json"][k] == q["choice"] for k, q in shared.items()) / count if gen["valid"] else None})
    report["comparisons"] = comparisons
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    assert all(row["max_probability_delta"] < .001 for row in comparisons), "cache parity regression"


if __name__ == "__main__":
    main()
