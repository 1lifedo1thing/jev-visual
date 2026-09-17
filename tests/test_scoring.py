import math
import numpy as np
import pytest
from pydantic import ValidationError

from visual_jev.schema import Question, Request
from visual_jev.scoring import Plan, candidate_tokens, sequence_logprob, tasks_for


class Tokenizer:
    all_special_ids = [0]
    eos_token_id = 0

    def encode(self, text, add_special_tokens=False):
        return [ord(c) for c in text]

    def decode(self, ids):
        return "".join(chr(c) for c in ids)


def test_sequence_scores_use_every_token_and_full_vocab():
    logits = np.log([[.2, .3, .5], [.8, .1, .1]])
    assert sequence_logprob(logits, [1, 0]) == pytest.approx(math.log(.3 * .8))
    assert sequence_logprob(logits, [1, 1]) == pytest.approx(math.log(.3 * .1))
    # Same first token, different second token MUST produce different scores.
    assert sequence_logprob(logits, [1, 0]) > sequence_logprob(logits, [1, 1])


def test_prefix_overlap_includes_termination():
    targets = candidate_tokens(Tokenizer(), "Q:\n", ["a", "ab"], "sequence")
    assert targets == [[97, 0], [97, 98, 0]]
    plan = Plan("Q:\n", [81, 58, 10], targets, "sequence", "hash")
    tasks = tasks_for([plan])
    assert tasks[0][2:4] == ([81, 58, 10, 97], [2, 3])
    assert tasks[1][2:4] == ([81, 58, 10, 97, 98], [2, 3, 4])


def test_candidate_rejections():
    with pytest.raises(ValueError, match="not one token"):
        candidate_tokens(Tokenizer(), "Q:\n", ["ab", "cd"], "single_token")
    with pytest.raises(ValueError, match="collide"):
        candidate_tokens(Tokenizer(), "Q:\n", ["a", "a"], "label")
    class MergingTokenizer(Tokenizer):
        def encode(self, text, add_special_tokens=False):
            return [1] if text == "Q:a" else super().encode(text)
    with pytest.raises(ValueError, match="boundary"):
        candidate_tokens(MergingTokenizer(), "Q:", ["a", "b"], "label")


def test_schema_supports_64_and_validates_candidate_keys():
    q = {"type": "choice", "instructions": "Which?", "criteria": {"a": "first", "b": "second"}}
    assert len(Request(image="x", questions={str(i): q for i in range(64)}).questions) == 64
    with pytest.raises(ValidationError):
        Request(image="x", questions={str(i): q for i in range(65)})
    with pytest.raises(ValidationError, match="exactly match"):
        Question(**q, scoring="sequence", candidates={"a": "red", "c": "blue"})
