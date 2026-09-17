"""Exercise the real running HTTP server (no mocked model)."""
import base64
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

root = Path(__file__).resolve().parent
artifacts = root.parent / "artifacts"
artifacts.mkdir(exist_ok=True)
request = json.loads((root / "request.json").read_text())
request["image"] = "data:image/png;base64," + base64.b64encode((root / request["image"]).read_bytes()).decode()
with httpx.Client(base_url="http://127.0.0.1:8788", timeout=120, trust_env=False) as client:
    assert client.get("/health").json()["ready"]
    assert "Visual Jev" in client.get("/").text
    response = client.post("/v1/judge", json=request)
    response.raise_for_status()
    result = response.json()
    assert result["answers"]["color"]["choice"] == "red"
    assert result["answers"]["shape"]["choice"] == "circle"
    assert result["answers"]["is_red"]["noul"] > .5
    assert 0 <= result["answers"]["redness"]["score"] <= 2
    def submit_color(color):
        payload = dict(request)
        payload["image"] = "data:image/png;base64," + base64.b64encode((root / f"{color}-circle.png").read_bytes()).decode()
        response = client.post("/v1/judge", json=payload)
        response.raise_for_status()
        return response.json()["answers"]["color"]["choice"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(submit_color, ["red", "blue"])) == ["red", "blue"]
    many = dict(request)
    many["questions"] = {f"color{i}": request["questions"]["color"] for i in range(64)}
    response = client.post("/v1/judge", json=many)
    response.raise_for_status()
    batch_result = response.json()
    assert len(batch_result["answers"]) == 64
    assert all(q["choice"] == "red" for q in batch_result["answers"].values())
    assert batch_result["metrics"]["vision_forward_calls"] == 1
    assert batch_result["metrics"]["language_forward_calls"] == 17
    mixed = dict(request)
    mixed["questions"] = {
        "native": {"type": "choice", "instructions": "What color is the shape?", "criteria": {"red": "Red", "blue": "Blue"}, "scoring": "single_token"},
        "phrase": {"type": "choice", "instructions": "Which color describes the shape?", "criteria": {"red": "Red", "blue": "Blue"}, "scoring": "sequence", "candidates": {"red": "bright red", "blue": "bright blue"}}
    }
    response = client.post("/v1/judge", json=mixed)
    response.raise_for_status()
    mixed_result = response.json()
    assert mixed_result["answers"]["native"]["choice"] == "red"
    assert mixed_result["answers"]["phrase"]["score_kind"] == "sequence_log_probability_including_eos"
    (artifacts / "http-extended-result.json").write_text(json.dumps({"64_decisions": batch_result, "mixed_candidates": mixed_result}, indent=2) + "\n")
    request["image"] = "/etc/passwd"
    assert client.post("/v1/judge", json=request).status_code == 422
    (artifacts / "http-result.json").write_text(json.dumps(result, indent=2) + "\n")
    print("Real HTTP inference, concurrent image isolation, 64 decisions, mixed scoring, typed responses, UI route and image policy: PASS")
