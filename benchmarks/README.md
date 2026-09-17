# Benchmark reproduction

Requires an Apple Silicon Mac with Metal access. From the repository root, follow
the [main quick start](../README.md) to install the locked environment and run
`visual-jev-download`. This places the pinned model in `.models/Qwen3.5-0.8B-4bit`.
Stop the local server and other inference jobs before measuring.

```bash
source .venv/bin/activate
python -m benchmarks.run
python -m benchmarks.report
```

New results go to ignored `artifacts/benchmark.json` and `artifacts/benchmark.md`.
The published [results.json](results.json), [RESULTS.md](RESULTS.md) and
[scoring-verification.json](scoring-verification.json) are kept as reference evidence.

For a short check:

```bash
python -m benchmarks.run --counts 1 4 --repeats 1 --output artifacts/quick.json
python -m benchmarks.report artifacts/quick.json --output artifacts/quick.md
```

To regenerate the published table from its raw records without running a model:

```bash
python -m benchmarks.report benchmarks/results.json --output artifacts/published-report.md
```

## Workload and three paths

- Model: Qwen3.5-0.8B, 4-bit weights, float32 computation. Exact weights/image hashes,
  library versions and device details are recorded in the raw results.
- Input: the included dog photograph, resized within 768×768, and one fixed context.
- Decisions: 1, 4, 16 and 64. Eight visible-fact questions repeat to exercise scaling.
- `generate_json`: actual `mlx_vlm.generate()`, greedy decoding, a compact JSON
  object mapping IDs to option IDs, 512-token prefill chunks, maximum output
  `max(128, 24 × decisions)` tokens. No grammar constraints, output repair or retries.
- `independent`: one full multimodal forward per decision, direct stable-letter
  candidate logits; no image/context sharing between decisions.
- `shared`: one visual/context prefill and batches of up to four suffixes. Both
  attention KV and recurrent state are forked. Results are assembled in code.

These throughput measurements use label scoring. Complete multi-token scoring is
verified separately against a stock full-vocabulary forward, including candidates
with shared beginnings, prefix overlap and Chinese text.

## Timing, memory and validity

Each path is warmed once on one decision. Every size/path then runs three times,
rotating path order across repetitions. Medians and every sample are published.
Model loading, warmup, allocator reset and file writes are outside measured request
time. Image loading, prompt assembly, preprocessing, forwards and answer assembly
are inside it. The workstation is not an isolated hardware lab.

- `vision_ms`: encoder plus multimodal embedding assembly.
- `prefill_ms`: language context work; direct scoring includes its whole question
  prompt, while shared scoring moves question suffix computation to `scoring_ms`.
- `scoring_ms`: suffix, LM-head projection and candidate normalization; for JSON
  generation it measures decode forwards. Total time also includes other overhead.
- Actual language and vision forwards are counted and synchronized, not inferred
  from output tokens or asynchronous submission time.
- Memory is peak live Metal allocation, not process RSS or total unified memory.
  Idle Metal buffers are bounded to 256 MiB; scoring and generation use the same
  temporary MLX-VLM wired-memory policy.
- JSON is checked for exact question IDs and allowed option IDs. Failed output is
  retained. Requested decisions/s does not mean completed throughput when the
  schema fails; failed generated requests have zero valid-request throughput.
- Direct/shared distributions and argmaxes are compared separately from generated
  output agreement. Typed output validity does not establish semantic correctness.

The published 36 measurements exclude earlier interrupted diagnostic runs. No
best-run selection was used. This measures local inference behavior, not Jev's
implementation, broad model accuracy or probability calibration.
