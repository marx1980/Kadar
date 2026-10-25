# Kadar

Phone web app that groups photos into series, checks each frame and proposes which to keep and which to delete.

Phase 1 of the plan: culling. Runs entirely on the phone; photos are never uploaded.

The first Phase 2 editor tools are available from a reviewed frame: before/after preview, centered crop presets (original, square, 4:5 portrait, 3:2 landscape), exposure, contrast, colour saturation, sharpening, pick the sharpest frame in a series, and save-as-copy. Editing is on-device; exported copies are JPEGs capped at 4096 px on the long edge.

## How it works

- **Grouping:** image embeddings (MediaPipe MobileNet-V3) compared frame to frame, plus EXIF capture time when Safari keeps it. Grouping setting: Loose / Normal / Strict.
- **Checks per frame:**
  - Blur: variance of the Laplacian on faces, the main subject or the sharpest grid cell, compared within the series.
  - Eyes, Expression: MediaPipe Face Landmarker blendshapes.
  - Away: head turn from the face mesh, or a person with no visible face.
  - Cut: a face, or the main subject, touching the frame edge.
  - Exposure: clipped highlights or shadows.
- **Proposals:** keep the best N per series. A frame with the only good shot of a person is kept, and a one-off photo is never proposed for deletion.
- **Output:** Save keepers (share sheet) and Delete list (to find the rejects in Photos). A web app cannot delete from the Photos library.

## Files

- `index.html`: markup and styles
- `js/app.js`: screens and actions
- `js/engine.js`: MediaPipe analysis
- `js/rank.js`: grouping, flags, ranking
- `js/metrics.js`: image metrics
- `js/exif.js`: capture time
- `libs/mediapipe/`: MediaPipe Tasks Vision 1.1.1 (Apache-2.0), vendored
- `sw.js`: offline cache; models are cached after the first run

Models are fetched from Google's MediaPipe model storage on first use and then cached.

## Tests

`npm test` runs the logic tests in Node.
