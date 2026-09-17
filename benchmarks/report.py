"""Render recorded measurements; never replace failures with repaired answers."""
import argparse
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", nargs="?", type=Path, default=Path("artifacts/benchmark.json"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/benchmark.md"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    report = json.loads(args.input.read_text())
    lines = ["# Real-model benchmark", "", "Apple M4 / 16GB; Qwen3.5-0.8B 4-bit weights, float32 computation, batch size 4. One dog photo resized within 768×768, identical context and questions across paths. Model loading and warmup excluded. Three measured repetitions, order rotated. Values below are medians, not best runs.", "",
             "`generate_json` calls the actual MLX-VLM `generate()` with greedy decoding and a compact object prompt. No JSON repair, forced grammar, probability fields or verbose explanation. `independent` is direct label-logit scoring without prefix reuse; `shared` reuses one visual/context prefill. All generated raw outputs and candidate results are retained in [results.json](results.json).", "",
             "| Decisions | Path | Total ms | Vision ms | Prefill ms | Scoring/decode ms | LM forwards | Vision forwards | Peak Metal GB | Requested decisions/s | Valid runs |",
             "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"
    ]
    for row in report["summary"]:
        lines.append(f'| {row["decisions"]} | {row["mode"]} | {row["elapsed_ms"]:.1f} | {row["vision_ms"]:.1f} | {row["prefill_ms"]:.1f} | {row["scoring_ms"]:.1f} | {row["language_forward_calls"]:g} | {row["vision_forward_calls"]:g} | {row["peak_metal_memory_gb"]:.2f} | {row["decisions_per_second"]:.2f} | {row["valid_runs"]}/{row["runs"]} |')
    lines += ["", "Requested decisions/s is workload count divided by elapsed time, NOT completed throughput when generation fails. Each failed generated request has `valid_decisions_per_second=0` in raw data. Typed-score paths assemble all fields deterministically; schema validity is not semantic accuracy.", "",
              "Vision timing includes the encoder and multimodal embedding assembly; prefill is language-context forward work; scoring is suffix/projection/normalization, or decode forwards for generate. Cache fork, preprocessing, prompt assembly and output work are in total time; phase medians need not sum to the total median. Memory is peak live Metal allocation, not RSS, total system memory or discrete VRAM. Actual forwards are counted and synchronized. Generate prefill uses 512-token chunks to keep memory bounded.", "",
              "## Every latency sample (ms)", "", "| Decisions | Path | Samples |", "|---:|---|---|"]
    for row in report["summary"]:
        samples = [r["result"]["metrics"]["elapsed_ms"] for r in report["rows"] if r["decisions"] == row["decisions"] and r["mode"] == row["mode"]]
        lines.append(f'| {row["decisions"]} | {row["mode"]} | {", ".join(f"{x:.1f}" for x in samples)} |')
    lines += ["", "## Semantic agreement and failures", ""]
    for row in report.get("comparisons", []):
        lines.append(f'- {row["decisions"]} decisions: direct/shared maximum probability delta {row["max_probability_delta"]:.8f}; argmax agreement {row["direct_shared_argmax_agreement"]:.1%}; generated/shared agreement {row["generate_shared_agreement"]}. `None` means generated output did not meet the declared schema.')
    for count in sorted({r["decisions"] for r in report["rows"]}):
        row = next(r for r in report["rows"] if r["decisions"] == count and r["mode"] == "generate_json")
        if not row["result"]["valid"]:
            lines += ["", f"Example failed generate output ({count} decisions, repeat 0):", "", "```text", row["result"]["raw_text"], "```"]
    lines += ["", "The eight criteria are repeated to exercise 64-decision scaling; this is not a general accuracy benchmark or calibration experiment. Performance varies with image resolution, context, candidates, machine load and thermal state. Multi-token scoring correctness is independently checked against stock full-vocabulary model forwards in `benchmarks/scoring-verification.json`; this throughput table uses the default stable-label mode.", ""]
    rendered = "\n".join(lines).replace("[results.json](results.json)", f"[raw records]({os.path.relpath(args.input, args.output.parent)})")
    args.output.write_text(rendered)


if __name__ == "__main__":
    main()
