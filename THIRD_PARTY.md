# Reviewed sources and licenses

Source review date: 2026-09-17. Changes extend the existing Visual Jev implementation;
the upstream serving engines were not copied wholesale.

| Source | Reviewed revision | License evidence |
|---|---|---|
| [OpenJev](https://github.com/TheoLeeCJ/openjev) | `b4782a6c953f05c6255706d7a219f4e032af5b58` | Repository `LICENSE`: MIT, copyright 2026 TheoLeeCJ. Notice preserved in `third_party/OPENJEV-LICENSE.txt`. |
| [harshatheg/Qwen-2.5-1B-RLCD](https://huggingface.co/harshatheg/Qwen-2.5-1B-RLCD) | `2af86848be75847ccb3553b0941cc51d6ef7e4e9` | Model-card YAML declares `license: apache-2.0`; the reviewed tree has no separate LICENSE or NOTICE file. We reference its ideas, not copy its scoring implementation. |
| [Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B) / [MLX conversion](https://huggingface.co/mlx-community/Qwen3.5-0.8B-4bit) | MLX `da28692b5f139cb0ec58a356b437486b7dac7462` | Model cards declare Apache-2.0. Weights are downloaded separately and excluded by `.gitignore`. |

OpenJev's `direct.py` validates round-trip single-letter answer tokens and their
contextual token boundaries. `shared.py` validates an exact common token prefix,
replicates the native cache, and evaluates right-padded suffixes in parallel.
Its selective-position LM-head computation informed the new adapter optimization.

The RLCD community engine explores prefix caching, candidate-logit slicing,
parallel suffixes and multi-token ambiguity. Its inspected MLX collision branch
generates a few tokens, matches heuristically and clamps probability to at least
0.75; we deliberately do not use that algorithm. This implementation scores
complete candidate sequences, including EOS, using full-vocabulary log-softmax
at each position. Neither repository is evidence of TypeSafe's proprietary
training or serving architecture.

## Credits

- Credit OpenJev for direct typed logit scoring, stable answer-token classification, shared-prefix reuse and parallel suffix evaluation.
- Credit `harshatheg/Qwen-2.5-1B-RLCD` for the community exploration of KV-cache reuse, parallel constrained decision scoring, candidate-logit slicing and multi-token candidate handling.

The existing dog photo is the [PyTorch Hub example image](https://github.com/pytorch/hub/blob/master/images/dog.jpg); geometric fixtures are locally generated. Package licenses remain with their respective authors.

The root MIT license covers this project's original code. The upstream notice in
`third_party/OPENJEV-LICENSE.txt` is retained separately. That license does not
relicense third-party model weights, dependencies or the referenced example photo.
