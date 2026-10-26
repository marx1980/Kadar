# Kadar

Phone-first photo editor. Edit photos directly, recover better results from related frames, or review a series for photos you may want to remove.

The home screen leads with **Choose photos to edit**. **Resume recent edit** reopens the most recent editing session saved on this device; the browser stores the selected images and edit settings locally in IndexedDB. Browser storage can be cleared or restricted, so this is a convenience rather than a backup. **Review a series** analyzes selected photos on the phone and opens the recovery and review workflow. Photos are not uploaded.

The editor supports before/after preview, undo/redo, per-control and full reset, adjustable Natural/Warm/Vivid/Mono looks, and saving custom looks on this device. Light and colour controls include exposure, contrast, highlights, shadows, a tone-curve adjustment, temperature, tint, saturation and per-colour HSL. Crop includes aspect presets, free crop sizing and positioning, rotate and flip. A local brush applies exposure, contrast and saturation to painted areas; small-spot healing blends nearby pixels and is best for minor distractions. These edits are approximate; inspect the preview and undo if a result looks wrong. From a reviewed series the editor also offers the sharpest frame, frame fusion and best-face recovery. **Fuse frames** aligns and median-blends up to five similarly framed shots for still scenes; moving subjects can ghost, so inspect the result before saving. **Best faces** can blend a sharper, open-eyed face from a similarly framed sibling photo; inspect the result before saving, as this experimental transplant can show seams. These are on-device recovery tools, not AI motion-blur reconstruction; optional AI repair is not currently available. **Subject focus** uses an on-device person mask: tap a person or the background to choose the sharp area, adjust blur and edge softness, inspect the mask, and refine it with a brush. **Depth focus** estimates a relative depth map on-device, lets you tap a focal plane, and applies progressively stronger blur farther from it; the colour overlay lets you inspect the estimate. Depth is approximate, not a measured Portrait depth map, and fine boundaries may be imperfect. First use downloads a pinned inference runtime and model; the photo itself stays on the device. The original is unchanged. Exported copies are JPEGs capped at 4096 px on the long edge.

## How it works

- **Grouping:** image embeddings (MediaPipe MobileNet-V3) compared frame to frame, plus EXIF capture time when Safari keeps it. Grouping setting: Loose / Normal / Strict.
- **Checks per frame:**
  - Blur: variance of the Laplacian on faces, the main subject or the sharpest grid cell, compared within the series.
  - Eyes, Expression: MediaPipe Face Landmarker blendshapes.
  - Away: head turn from the face mesh, or a person with no visible face.
  - Cut: a face, or the main subject, touching the frame edge.
  - Exposure: clipped highlights or shadows.
- **Proposals:** keep the best N per series. A frame with the only good shot of a person is kept, and a one-off photo is never proposed for deletion.
- **Output:** Save keepers (share sheet) and review delete suggestions in Photos. A web app cannot delete from or browse the full Photos library in the background; choose photos when prompted, and delete suggestions yourself in Photos.

## Files

- `index.html`: markup and styles
- `js/app.js`: screens and actions
- `js/engine.js`: MediaPipe analysis
- `js/rank.js`: grouping, flags, ranking
- `js/metrics.js`: image metrics
- `js/exif.js`: capture time
- `js/editor.js`: crop, pixel adjustments, burst alignment/fusion and sibling face matching
- `js/focus.js`: on-device person segmentation for focus blur
- `js/depth.js`: on-device depth estimation for depth-aware focus
- `js/recent.js`: local IndexedDB storage for the resumable editing session
- `libs/mediapipe/`: MediaPipe Tasks Vision 1.1.1 (Apache-2.0), vendored
- `sw.js`: offline cache; models are cached after the first run

Models are fetched from Google's MediaPipe model storage on first use and then cached. Persistent access to the complete photo library or direct deletion would require a native app with Photos permissions.

## Tests

`npm test` runs the logic tests in Node.
