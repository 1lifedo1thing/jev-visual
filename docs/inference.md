# Inference details

This documents this repository's implementation, not TypeSafe Jev's architecture.

## Candidate modes

Set `scoring` on each question; modes can be mixed in one request.

| Mode | Readout |
|---|---|
| `label` (default) | Stable A–Z single-token logits; arbitrary option descriptions |
| `single_token` | Native single-token answer text; invalid tokenization is rejected |
| `sequence` | Sum of full-vocabulary token log-probabilities for the complete answer plus EOS |

```json
{
  "type": "choice",
  "instructions": "Which description fits the animal?",
  "criteria": {"dog": "A white dog", "cat": "A white cat"},
  "scoring": "sequence",
  "candidates": {"dog": "white dog", "cat": "white cat"}
}
```

`candidates` keys must match option IDs exactly. Without this mapping, native and
sequence modes use the option IDs as answer text. Each candidate may contain up
to 64 ordinary tokens; sequence mode adds EOS. Duplicate encodings, special
control tokens, failed round trips and contextual BPE boundary merges are rejected.

Sequence scoring uses teacher forcing, not sampled generation:

`score(c) = Σ log P(c_t | image, context, question, c_<t)`

Each step normalizes over the **whole vocabulary**, before summing. Final scores
are normalized across supplied candidates, with request temperature applied at
this final stage. EOS distinguishes overlapping answers such as `white` and
`white dog`. No length normalization is applied: the model's length preference
remains. Scores from different modes should not be directly compared.

Outputs include `candidate_scores`, `score_kind`, `candidate_token_ids` and a
prompt SHA-256. `concentration = 1 - H(P)/log(K)` is only a distribution statistic.
Neither it nor normalized candidate probabilities establishes correctness.

## Shared computation

`preprocessing.py` handles bounded image decoding, the official chat template
with thinking disabled, the common prefix and each question's suffix.
`adapters.py` owns multimodal positions, visual/context prefill, cache branching
and selective LM-head projection. `scoring.py` compiles and batches scoring tasks;
`schema.py` assembles typed answers; `engine.py` coordinates them.

Qwen3.5 combines attention with Gated DeltaNet. Forking only attention KV is
incorrect: both `KVCache` and the convolution/recurrent `ArraysCache` are copied.
Suffixes use explicit multimodal positions and right padding. Only valid output
positions are scored; padded branch states are discarded, never continued.

The shared prefix skips the unused LM head. Only actual scoring positions are
projected. By default up to four tasks run per batch. A label/single-token
question is one task; each complete sequence candidate is one task. Sequence
candidates reuse visual/context prefill but repeat their question suffix. This
is not zero-copy sharing or token-tree scoring; no cross-request cache is used.

`mode=independent` is the reference path: full image/prompt computation per task.
The adapter registry currently contains only the verified Qwen3.5 implementation.
New families need their own cache/position logic and stock-full-forward parity tests.

## Runtime and reproducibility

- Default model: `mlx-community/Qwen3.5-0.8B-4bit`.
- Pinned revision: `da28692b5f139cb0ec58a356b437486b7dac7462`.
- Integer weights stay 4-bit; floating parameters/computation use float32 for
  numerical parity across full and batched forwards.
- Idle Metal buffers are bounded to 256 MiB. Scoring and MLX-VLM generation use
  the same temporary wired-memory policy on Apple Silicon.
- Explicit local model paths produce `revision: null`; `model_source` records
  the path. Benchmark records include a weights SHA-256.
- MLX streams are thread-local. Create and call Engine on one thread; the local
  HTTP service does this through one dedicated worker.

`python -m examples.verify_scoring` checks native, label, shared-prefix,
prefix-overlap multi-token and Chinese candidates against the stock model's
full-vocabulary forward output. The published record is
[scoring-verification.json](../benchmarks/scoring-verification.json); new runs
write `artifacts/scoring-verification.json`.
