"""Real-model smoke/equivalence/visual-sensitivity checks. Run from project root."""
import argparse
import json
import statistics
from pathlib import Path

from PIL import Image, ImageDraw

from jev_visual.engine import Engine
from jev_visual.schema import Request


def fixtures():
    root = Path(__file__).resolve().parent
    cases = []
    for color in ("red", "blue", "green"):
        for shape in ("circle", "square"):
            image = Image.new("RGB", (320, 320), "white")
            draw = ImageDraw.Draw(image)
            getattr(draw, "ellipse" if shape == "circle" else "rectangle")((65, 65, 255, 255), fill=color)
            path = root / f"{color}-{shape}.png"
            image.save(path)
            cases.append((path, color, shape))
    return cases


QUESTIONS = {
    "color": {"type": "choice", "instructions": "What color is the large shape?", "criteria": {"red": "Red", "blue": "Blue", "green": "Green"}},
    "shape": {"type": "choice", "instructions": "What shape is shown?", "criteria": {"circle": "A circle", "square": "A square"}},
    "is_red": {"type": "noul", "instructions": "Is the large shape red?"},
    "redness": {"type": "score", "instructions": "How much of the large shape is red?", "criteria": ["None of it is red", "Some of it is red", "All of it is red"]},
    "long_question": {"type": "choice", "instructions": "Inspect the outer boundary of the single large colored object in the center of the white image. Is the boundary round, or does it consist of four straight sides and four corners?", "criteria": {"round": "Round boundary", "corners": "Four straight sides and four corners"}},
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", default=".models/Qwen3.5-0.8B-4bit")
    args = parser.parse_args()
    engine = Engine(args.model_path, batch_size=4)
    cases = fixtures()
    request = Request(image=str(cases[0][0]), questions=QUESTIONS)
    print("Warmup", flush=True)
    engine.judge(request)
    rows, differences, correct, checked = [], [], 0, 0
    for path, color, shape in cases:
        request = Request(image=str(path), questions=QUESTIONS)
        shared = engine.judge(request)
        independent = engine.judge(request.model_copy(update={"mode": "independent"}))
        diff = max(abs(p - independent["answers"][key]["probabilities"][label]) for key, value in shared["answers"].items() for label, p in value["probabilities"].items())
        differences.append(diff)
        a = shared["answers"]
        flags = [a["color"]["choice"] == color, a["shape"]["choice"] == shape, (a["is_red"]["noul"] > .5) == (color == "red"), a["long_question"]["choice"] == ("round" if shape == "circle" else "corners")]
        correct += sum(flags)
        checked += len(flags)
        rows.append({"image": path.name, "expected": {"color": color, "shape": shape}, "shared": shared, "independent": independent, "max_probability_delta": diff})
        print(path.name, "correct", sum(flags), "/", len(flags), "delta", round(diff, 6), "ms", round(shared["metrics"]["elapsed_ms"]), flush=True)
    # Repeat after several other images to detect cross-request state leakage.
    repeat = engine.judge(Request(image=str(cases[0][0]), questions=QUESTIONS))
    repeat_delta = max(abs(p - repeat["answers"][key]["probabilities"][label]) for key, value in rows[0]["shared"]["answers"].items() for label, p in value["probabilities"].items())
    report = {
        "scope": "six synthetic images; functional smoke checks, not a general accuracy benchmark or calibration",
        "accuracy": correct / checked, "correct": correct, "checked": checked,
        "max_shared_independent_probability_delta": max(differences),
        "repeat_probability_delta": repeat_delta,
        "shared_median_ms": statistics.median(r["shared"]["metrics"]["elapsed_ms"] for r in rows),
        "independent_median_ms": statistics.median(r["independent"]["metrics"]["elapsed_ms"] for r in rows),
        "rows": rows,
    }
    Path("artifacts").mkdir(exist_ok=True)
    Path("artifacts/evaluation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "rows"}, indent=2), flush=True)
    assert max(differences) < .001, "shared cache changes candidate probabilities materially"
    assert repeat_delta < 1e-5, "cross-request state leakage"
    assert all(r["shared"]["answers"]["color"]["choice"] == r["expected"]["color"] for r in rows), "visual color sensitivity failed"


if __name__ == "__main__":
    main()
