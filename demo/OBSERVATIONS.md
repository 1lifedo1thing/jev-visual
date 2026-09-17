# Historical cube observations

These development trials used earlier cube inputs and prompts, not the current labeled net. The controller executed the actual argmax action from local Qwen3.5-0.8B-4bit without substituting a solver. Records are preserved in [observations.json](observations.json).

| Trial | Model decisions | Result |
|---|---:|---|
| Initial cube | 40 | Repeated `U′`, paused at budget; not solved |
| Follow-up cube | 41 | One single step then a 40-step automatic run; not solved |

The episodes started from different random one-turn scrambles. Additional fixed-prompt probes on one recorded screenshot chose `U` or `U′` instead of the correcting `R′`. These observations are not a success-rate benchmark.

**The current model cannot reliably solve the cube in the default non-thinking, direct-scoring mode.** Candidate scoring restricts actions to valid moves; it does not ensure a correct move. The demo preserves actual failures and loops, and never treats an exhausted step budget as success.

See the [cube README](rubik/README.md) for current six-face input results, mechanics verification and reproduction commands. Browser tests mock inference; passing them verifies the interface, not model capability.
