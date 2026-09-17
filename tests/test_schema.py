import math
import pytest
from pydantic import ValidationError
from visual_jev.schema import Question, Request, answer


def test_typed_decisions_and_probability_semantics():
    choice = Question(type="choice", instructions="Which?", criteria={"move_left": "left", "move_right": "right"})
    result = answer(choice, [0, math.log(3)], 1)
    assert result["choice"] == "move_right"
    assert result["probabilities"]["move_right"] == pytest.approx(.75)
    noul = Question(type="noul", instructions="Present?")
    assert answer(noul, [0, 0], 1)["noul"] == .5
    score = Question(type="score", instructions="How many?", criteria=["none", "one", "two"])
    assert answer(score, [0, 0, 0], 1)["score"] == 1


@pytest.mark.parametrize("kwargs", [
    {"type": "choice", "criteria": {"a": "alone"}},
    {"type": "score", "criteria": {"a": "wrong shape", "b": "also"}},
    {"type": "noul", "criteria": {"yes": "yes", "no": "no"}},
    {"type": "choice", "criteria": {str(i): "option" for i in range(27)}},
])
def test_invalid_schema_rejected(kwargs):
    with pytest.raises(ValidationError):
        Question(instructions="test", **kwargs)


def test_extreme_logits_stable_and_not_confidence_clamped():
    q = Question(type="noul", instructions="yes?")
    assert answer(q, [-10000, 10000], 1)["noul"] == 0
    assert answer(q, [0, 0], 1)["noul"] < .75


def test_temperature_and_empty_request_rejected():
    for temp in [0, -1, float("nan"), float("inf")]:
        with pytest.raises(ValidationError):
            Request(image="x", questions={"q": {"type": "noul", "instructions": "x"}}, temperature=temp)
    with pytest.raises(ValidationError):
        Request(image="x", questions={})
