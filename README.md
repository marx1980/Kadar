# Kadar

Phone-first photo editor. Edit photos directly, or choose culling to group a series, review suggestions and keep the frames you want.

The home screen offers two workflows: **Edit photos** opens the editor without running culling analysis; **Cull a series** analyzes selected photos on the phone and opens the review workflow. Photos are never uploaded.

The editor supports before/after preview, centered crop presets (original, square, 4:5 portrait, 3:2 landscape), exposure, contrast, colour saturation, sharpening, focus blur and save-as-copy. From a culled series it also offers pick-the-sharpest, frame fusion and best-face recovery. **Fuse frames** aligns and median-blends up to five similarly framed shots for still scenes; moving subjects can ghost, so inspect the result before saving. **Best faces** can blend a sharper, open-eyed face from a similarly framed sibling photo; inspect the result before saving, as this experimental transplant can show seams. **Focus blur** uses an on-device person mask: tap a person or the background to choose the sharp area, adjust blur, and optionally inspect the mask. Use **Refine mask** to paint areas to keep sharp or blur, especially along missed edges. This is subject/background separation, not a full depth map, and fine edges may be imperfect. The original is unchanged. Editing is on-device; exported copies are JPEGs capped at 4096 px on the long edge.

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
- `js/editor.js`: crop, pixel adjustments, burst alignment/fusion and sibling face matching
- `js/focus.js`: on-device person segmentation for focus blur
- `libs/mediapipe/`: MediaPipe Tasks Vision 1.1.1 (Apache-2.0), vendored
- `sw.js`: offline cache; models are cached after the first run

Models are fetched from Google's MediaPipe model storage on first use and then cached.

## Tests

`npm test` runs the logic tests in Node.
