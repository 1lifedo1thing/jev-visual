# Visual Jev

**Credit to [OpenJev](https://github.com/TheoLeeCJ/openjev) and [harshatheg/Qwen-2.5-1B-RLCD](https://huggingface.co/harshatheg/Qwen-2.5-1B-RLCD).**

- Credit OpenJev for direct typed logit scoring, stable answer-token classification, shared-prefix reuse and parallel suffix evaluation.
- Credit `harshatheg/Qwen-2.5-1B-RLCD` for the community exploration of KV-cache reuse, parallel constrained decision scoring, candidate-logit slicing and multi-token candidate handling.

**This is an inference experiment on open models, not an explanation or reproduction of how TypeSafe Jev works.**

> This project explores a Jev-like inference pattern for open multimodal language models. It avoids autoregressive structured generation by reusing shared multimodal context and directly scoring candidate outputs from model logits.
>
> This is an independent community implementation and does not claim to reproduce TypeSafe Jev's proprietary model architecture, RLCD training, calibration, or serving system.

[English](#english) · [中文](#中文)

## English

Run visual decisions locally on an **Apple Silicon Mac**, using Qwen3.5-0.8B and MLX. Give it one image, optional context and several questions; get typed answers and normalized candidate probabilities. Includes a browser UI, HTTP API, CLI and Python interface.

### Requirements

- **macOS with Apple Silicon (M-series) and Metal GPU access.** Tested on an Apple M4 with 16GB unified memory, macOS 15.1 and Python 3.13.1. This implementation is not a CUDA, Windows or Intel Mac backend.
- Python 3.13 for the locked environment below; `uv` can install it automatically.
- Internet for the first dependency/model download. The model weights are approximately 596 MiB; allow a few GB for the environment and caches. After downloading, inference runs locally.

### Quick start

Clone or download this repository, open a terminal in its root, then run:

```bash
# Install uv first if needed (requires Homebrew): brew install uv
uv venv --python 3.13
source .venv/bin/activate
uv pip install -r requirements-lock.txt
uv pip install --no-deps -e .

# Download the pinned model into .models/Qwen3.5-0.8B-4bit
visual-jev-download

# Start the browser UI and HTTP API
VISUAL_JEV_MODEL_PATH=.models/Qwen3.5-0.8B-4bit \
  uvicorn visual_jev.server:app --host 127.0.0.1 --port 8788
```

Open **http://127.0.0.1:8788**, upload a picture and click **Analyze image**. API documentation is at `/docs`. First inference may take longer while Metal compiles kernels. Stop the server with `Ctrl+C`. Use one worker; each extra worker would load another model. The server is intended for local use and has no public-service authentication.

Prefer a terminal? After installation and download:

```bash
visual-jev examples/photo-request.json \
  --model-path .models/Qwen3.5-0.8B-4bit
```

The included photo example asks about the animal, its fur and the setting. CLI image paths are relative to the request JSON file. Model weights and virtual environments are excluded from Git.

### Requests and answers

An example request file:

```json
{
  "image": "red-circle.png",
  "state": "Judge only what is visible.",
  "questions": {
    "color": {
      "type": "choice",
      "instructions": "What color is the shape?",
      "criteria": {"red": "Red", "blue": "Blue", "other": "Another color"}
    },
    "round": {"type": "noul", "instructions": "Is the shape round?"},
    "redness": {
      "type": "score",
      "instructions": "How much of the shape is red?",
      "criteria": ["None", "Some", "All"]
    }
  }
}
```

| Type | Result |
|---|---|
| `choice` | One declared option and its candidate probability distribution |
| `noul` | `noul`, the normalized probability of the “yes” option |
| `score` | Probability-weighted level index, from `0` to `number of levels - 1` |

The program assembles the result; the model does not generate JSON. Probabilities are **conditional on the supplied candidates, not calibrated correctness estimates**. `concentration` describes distribution concentration, not accuracy.

Use `POST /v1/judge` with the same schema, replacing `image` with a base64 data URL such as `data:image/png;base64,...`. HTTP does not accept local paths or remote image URLs. The browser handles image encoding for you. See [the HTTP example](examples/http_smoke.py) for a complete client.

```python
from visual_jev import Request
from visual_jev.engine import Engine

engine = Engine(".models/Qwen3.5-0.8B-4bit")
result = engine.judge(Request(
    image="examples/dog.jpg",
    questions={"dog": {"type": "noul", "instructions": "Is a dog visible?"}},
))
print(result["answers"]["dog"]["noul"])
```

Create and use `Engine` on the same thread. The HTTP server uses a dedicated inference thread and queues requests.

### How it works and limits

```text
image + context → one visual/context prefill → fork KV + recurrent state
                 → batched question suffixes → candidate scores → typed results
```

Each question supports `scoring: "label"` (default A/B/C tokens), `"single_token"` (native candidate tokens), or `"sequence"` (complete multi-token answers). Sequence mode sums full-vocabulary token log-probabilities, including EOS, and then normalizes across candidates. It never compares just the first token. See [candidate examples and implementation details](docs/inference.md).

- One image, 1–64 questions, 2–26 options per question. Images are resized to a maximum side of 768 pixels; input limit is 6,000 tokens.
- Only the Qwen3.5 adapter is verified. The engine separates preprocessing, cache handling, scoring and schema assembly so other adapters can be added and tested.
- Uses existing 4-bit weights with float32 computation. No training, distillation or calibration was performed. Small models can misjudge images; Score quality, fine text and spatial reasoning need task-specific evaluation.
- Sharing is within a request. No cross-request image cache or token trie; multi-token candidates reuse image/context but repeat their question suffix.

### Benchmark

Stop the server and other model inference first. From the repository root, with the environment activated and model downloaded:

```bash
python -m benchmarks.run
python -m benchmarks.report
```

New runs write `artifacts/benchmark.json` and `artifacts/benchmark.md`, leaving the committed measurements intact.

We compare **ordinary `mlx_vlm.generate()` JSON**, **direct candidate scoring** without context reuse, and **shared-prefix + batched suffix scoring**. All use the same image, context, questions, model and precision. The workload has **1 / 4 / 16 / 64 decisions**, three repetitions, rotated execution order and excluded warmup/model loading. Eight questions are repeated to measure scaling, not 64 independent capabilities.

Measured on M4 / 16GB; median seconds:

| Decisions | Generate JSON | Direct scoring | Shared scoring |
|---:|---:|---:|---:|
| 1 | 0.81 | 0.60 | 0.63 |
| 4 | 1.12* | 2.35 | 0.68 |
| 16 | 1.28* | 9.31 | 1.05 |
| 64 | 2.73* | 37.30 | **2.40** |

\* Generated output failed the complete schema in all three repetitions; these are **not successful-completion times**. No output repair was applied. At 64 decisions, shared scoring used one vision forward, 17 language forwards and about 2.36GB peak live Metal allocation. Direct/shared choices agreed; maximum probability difference was approximately `2.74e-6`.

[Full results](benchmarks/RESULTS.md) include vision/prefill/scoring latency, forward counts, memory, throughput, every latency sample and failed JSON outputs. [Raw records](benchmarks/results.json) contain requests, outputs, environment and hashes. [Reproduction details](benchmarks/README.md) define timing boundaries and limitations. Memory is Metal allocation, not total process/system memory; these are local workstation measurements, not a Jev comparison or general accuracy benchmark.

### Tests and layout

```bash
python -m pytest -q                   # No model download or GPU inference
python -m examples.evaluate           # Real-model visual/cache checks
python -m examples.verify_scoring     # Full-forward oracle for candidate scoring
# With the local server running:
python -m examples.http_smoke
```

Test outputs go to ignored `artifacts/`. The committed benchmark and [scoring verification](benchmarks/scoring-verification.json) preserve the published evidence.

```text
visual_jev/       inference engine, adapters, schema, CLI and local server
examples/         runnable requests, image fixtures and integration checks
tests/            unit and API contract tests
benchmarks/       runners, methodology and measured results
docs/             candidate scoring and implementation details
third_party/      upstream license notices
```

Original project code is MIT licensed. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md) for upstream credits, source revisions and license boundaries.

## 中文

首先致谢 [OpenJev](https://github.com/TheoLeeCJ/openjev) 和 [Qwen-2.5-1B-RLCD 社区实现](https://huggingface.co/harshatheg/Qwen-2.5-1B-RLCD)。本项目借鉴它们的直接 logits 打分、稳定答案 token、共享前缀及并行后缀思路。

**这只是基于开放模型的 inference 实验，不代表 Jev 的真实原理，也不复现 TypeSafe Jev 的私有架构、RLCD 训练、概率校准或服务系统。** 没有训练新模型。

### 在 Mac 上快速启动

面向 **Apple Silicon（M 系列）Mac**，需要能访问 Metal GPU。已在 M4 / 16GB、macOS 15.1、Python 3.13.1 验证；当前没有 CUDA、Windows 或 Intel Mac 后端。首次安装需要网络，权重约 596 MiB，环境和缓存另需若干 GB。

下载仓库后，在项目根目录执行：

```bash
# 尚未安装 uv 时可先运行（需要 Homebrew）：brew install uv
uv venv --python 3.13
source .venv/bin/activate
uv pip install -r requirements-lock.txt
uv pip install --no-deps -e .
visual-jev-download

VISUAL_JEV_MODEL_PATH=.models/Qwen3.5-0.8B-4bit \
  uvicorn visual_jev.server:app --host 127.0.0.1 --port 8788
```

打开 **http://127.0.0.1:8788**，上传图片并点击 **Analyze image**。API 文档在 `/docs`；首次推理可能因 Metal 编译稍慢。用 `Ctrl+C` 停止服务，只运行一个 worker。服务供本机使用，没有公网鉴权。下载完成后，推理在本地执行。

命令行体验：

```bash
visual-jev examples/photo-request.json \
  --model-path .models/Qwen3.5-0.8B-4bit
```

### 能做什么

输入一张图片、可选 context 和多个问题，返回由代码确定性组装的结构化答案：

- **Choice**：从给定选项中选择，返回候选概率分布。
- **Noul**：返回条件成立的归一化概率。
- **Score**：返回描述等级的概率加权位置，范围为 `0..等级数-1`。

请求 JSON、Python 用法和 HTTP 字段与上方英文示例相同。CLI 图片路径相对于请求文件；HTTP `POST /v1/judge` 必须使用 base64 图片 data URL，网页会自动编码。Python 中应在同一线程创建和使用 Engine，HTTP 服务通过专用线程串行处理请求。

默认使用稳定的 A/B/C 答案 token，也支持原生单 token 和多 token 序列打分。多个问题共用一次图片/context prefill，再复制注意力 KV 与循环状态，批量计算后缀。多 token 对完整序列逐 token 计算 log-probability，包含 EOS，不只取第一个 token。详见 [实现说明](docs/inference.md)。

每次支持 1–64 题、每题 2–26 个选项；图片最长边缩至 768，输入上限 6,000 token。目前只验证了 Qwen3.5 adapter。使用现成 4-bit 权重及 float32 计算，未做训练或校准。**候选概率不等于答案正确率**；Score、小字识别和空间推理能力仍有限。只在单次请求内共享，不做跨请求图片缓存。

### Benchmark 如何复现

先停止服务和其他模型推理，在已激活环境、已下载模型的项目根目录执行：

```bash
python -m benchmarks.run
python -m benchmarks.report
```

新结果写到 `artifacts/benchmark.json` 和 `artifacts/benchmark.md`，不会覆盖仓库内的正式记录。

比较普通 `generate()` JSON、逐题 direct candidate scoring、共享前缀批量 scoring。三条路径使用相同图片、context、问题、权重和精度；测 **1／4／16／64 题**，每组 3 次、轮换执行顺序，排除模型加载和预热。8 个问题循环扩展，用于测计算规模，不是 64 种独立能力。

耗时见上方表格：64 题 direct 中位数 **37.30 秒**，共享模式 **2.40 秒**，峰值 Metal 分配约 **2.36GB**。单题共享没有优势。普通 JSON 在 4／16／64 题下均未满足完整 schema，已如实保留失败输出，不能将提前结束的耗时当作成功吞吐。

[完整报告](benchmarks/RESULTS.md)列出 latency、vision/prefill/scoring 分阶段耗时、前向次数、内存、吞吐及每轮数据；[原始记录](benchmarks/results.json)保留输入、输出、环境和哈希；[复现说明](benchmarks/README.md)解释计时边界。Metal 分配量不等于进程总内存；这不是与 Jev 的直接对比，也不是通用准确率评测。

测试命令与目录结构见英文部分。普通测试无需模型推理，视觉和序列打分检查需要真实模型；新测试输出写到 Git 忽略的 `artifacts/`。原始项目代码使用 MIT 许可证，上游模型、依赖和素材的许可单独保留，详见 [第三方说明](THIRD_PARTY.md)。
