# Gesture particle console

Open <http://127.0.0.1:8788/demo/gestures/> with the local Jev Visual server running.

1. Click **Enable camera** and grant browser permission. This starts preview only, without inference.
2. Place one hand inside the center frame and click **Start recognition**. Use good lighting and a simple background.
3. Open palm → starburst; fist → gravity core; V sign → spiral ring; no gesture → idle nebula.
4. **Pause recognition** keeps the preview open. **Close camera & recognition** stops the video tracks and clears frame history.

The preview is mirrored for comfortable interaction. A **256×256 unmirrored center-square crop** is sent to the local `/v1/judge` endpoint with fixed gesture candidates. No coordinates, landmarks or hidden hand detector are supplied. The default Qwen3.5-0.8B adapter classifies screenshots; this is not a high-rate hand-tracking library.

The 1,000-particle animation runs independently through `requestAnimationFrame`. Only one inference may be in flight. After a response, the next latest frame is sampled after 50 ms; old camera frames are never queued. This is a 50 ms pause between requests, not a guaranteed 20 FPS inference rate. Every fresh model choice is applied immediately, without probability smoothing, confirmation counts or particle-position easing. Responses older than 2.5 seconds do not control the particles.

Camera access requires localhost or HTTPS and may also require macOS browser-camera permission. Audio is never requested. Frames are sent only after starting recognition, to this local server; the app does not persist them to disk or upload them to cloud services. Up to 12 frames exist in the live page history until closing the camera. Do not expose the unauthenticated local server publicly.

## Validation boundary

Browser tests use Chromium's synthetic video device and mocked model responses to check opt-in acquisition, no inference during preview, immediate prediction-driven effects, animation continuing, mobile layout, permission denial, cancellation, track shutdown and history cleanup. They **do not validate the recognition accuracy of your real hand**. Real-camera behavior depends on lighting, framing and the small model's recognition capability.

```bash
BROWSER_CHANNEL=chrome npm --prefix demo run test:live
```
