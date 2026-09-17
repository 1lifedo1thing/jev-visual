# Real-model benchmark

Apple M4 / 16GB; Qwen3.5-0.8B 4-bit weights, float32 computation, batch size 4. One dog photo resized within 768×768, identical context and questions across paths. Model loading and warmup excluded. Three measured repetitions, order rotated. Values below are medians, not best runs.

`generate_json` calls the actual MLX-VLM `generate()` with greedy decoding and a compact object prompt. No JSON repair, forced grammar, probability fields or verbose explanation. `independent` is direct label-logit scoring without prefix reuse; `shared` reuses one visual/context prefill. All generated raw outputs and candidate results are retained in [results.json](results.json).

| Decisions | Path | Total ms | Vision ms | Prefill ms | Scoring/decode ms | LM forwards | Vision forwards | Peak Metal GB | Requested decisions/s | Valid runs |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | generate_json | 810.6 | 235.7 | 443.6 | 83.0 | 12 | 1 | 2.60 | 1.23 | 3/3 |
| 1 | independent | 598.5 | 235.7 | 324.1 | 4.8 | 1 | 1 | 2.37 | 1.67 | 3/3 |
| 1 | shared | 630.0 | 240.0 | 294.7 | 37.6 | 2 | 1 | 2.37 | 1.59 | 3/3 |
| 4 | generate_json | 1123.0 | 237.6 | 508.5 | 328.4 | 38 | 1 | 2.60 | 3.56 | 0/3 |
| 4 | independent | 2351.5 | 967.6 | 1278.5 | 14.9 | 4 | 4 | 2.37 | 1.70 | 3/3 |
| 4 | shared | 678.6 | 239.7 | 289.4 | 108.4 | 2 | 1 | 2.37 | 5.89 | 3/3 |
| 16 | generate_json | 1276.9 | 242.9 | 880.5 | 97.1 | 14 | 1 | 2.68 | 12.53 | 0/3 |
| 16 | independent | 9313.5 | 3877.9 | 5085.7 | 70.3 | 16 | 16 | 2.37 | 1.72 | 3/3 |
| 16 | shared | 1051.5 | 246.9 | 300.1 | 438.1 | 5 | 1 | 2.37 | 15.22 | 3/3 |
| 64 | generate_json | 2732.2 | 236.7 | 2340.4 | 79.6 | 15 | 1 | 2.85 | 23.42 | 0/3 |
| 64 | independent | 37298.1 | 15538.7 | 20489.8 | 291.1 | 64 | 64 | 2.37 | 1.72 | 3/3 |
| 64 | shared | 2399.1 | 240.1 | 292.6 | 1777.2 | 17 | 1 | 2.36 | 26.68 | 3/3 |

Requested decisions/s is workload count divided by elapsed time, NOT completed throughput when generation fails. Each failed generated request has `valid_decisions_per_second=0` in raw data. Typed-score paths assemble all fields deterministically; schema validity is not semantic accuracy.

Vision timing includes the encoder and multimodal embedding assembly; prefill is language-context forward work; scoring is suffix/projection/normalization, or decode forwards for generate. Cache fork, preprocessing, prompt assembly and output work are in total time; phase medians need not sum to the total median. Memory is peak live Metal allocation, not RSS, total system memory or discrete VRAM. Actual forwards are counted and synchronized. Generate prefill uses 512-token chunks to keep memory bounded.

## Every latency sample (ms)

| Decisions | Path | Samples |
|---:|---|---|
| 1 | generate_json | 813.5, 805.1, 810.6 |
| 1 | independent | 630.0, 598.5, 585.5 |
| 1 | shared | 630.0, 599.5, 635.5 |
| 4 | generate_json | 1099.1, 1134.8, 1123.0 |
| 4 | independent | 2351.5, 2324.1, 2370.9 |
| 4 | shared | 692.1, 678.6, 674.6 |
| 16 | generate_json | 1276.9, 1243.1, 1283.8 |
| 16 | independent | 10001.9, 9313.5, 9212.6 |
| 16 | shared | 1052.8, 1051.5, 1021.3 |
| 64 | generate_json | 2757.3, 2732.2, 2590.7 |
| 64 | independent | 37298.1, 37828.3, 36035.7 |
| 64 | shared | 2399.1, 2390.8, 2409.4 |

## Semantic agreement and failures

- 1 decisions: direct/shared maximum probability delta 0.00000009; argmax agreement 100.0%; generated/shared agreement 1.0. `None` means generated output did not meet the declared schema.
- 4 decisions: direct/shared maximum probability delta 0.00000050; argmax agreement 100.0%; generated/shared agreement None. `None` means generated output did not meet the declared schema.
- 16 decisions: direct/shared maximum probability delta 0.00000274; argmax agreement 100.0%; generated/shared agreement None. `None` means generated output did not meet the declared schema.
- 64 decisions: direct/shared maximum probability delta 0.00000274; argmax agreement 100.0%; generated/shared agreement None. `None` means generated output did not meet the declared schema.

Example failed generate output (4 decisions, repeat 0):

```text
{"q00": "A dog", "q01": "White", "q02": "Outdoors", "q03": "Yes"}
```

Example failed generate output (16 decisions, repeat 0):

```text
{"q00": "A dog"}
```

Example failed generate output (64 decisions, repeat 0):

```text
{"other": "Another surface"}
```

The eight criteria are repeated to exercise 64-decision scaling; this is not a general accuracy benchmark or calibration experiment. Performance varies with image resolution, context, candidates, machine load and thermal state. Multi-token scoring correctness is independently checked against stock full-vocabulary model forwards in `benchmarks/scoring-verification.json`; this throughput table uses the default stable-label mode.
