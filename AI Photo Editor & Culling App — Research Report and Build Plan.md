# Kadar — Photo Editor and Culling Build Plan

Oct 24, 2026 · @Marko

## Executive summary

Build Kadar as a phone-first photo editor with built-in recovery and cleanup workflows, not a culling app with an editor attached. Keep the existing static web app setup (GitHub Pages, installed to the Home Screen). Photo editing, culling, focus effects and current burst recovery run on the phone. AI-assisted repair is a future, optional cloud feature and is not currently implemented.

- **The product is a photo editor.** Lead with direct editing for one or more selected photos; make series review a separate, optional workflow for recovery and cleanup. Pro culling tools (Aftershoot, Narrative Select, Imagen) already flag blur, closed eyes and near-duplicates, but they are desktop apps for photographers. Realistic limit: "awkward expression" is the weakest signal, so it should flag, never decide.
- **"Sharpen a blurry photo" means two different things.** Real recovery: several frames of a still scene can be fused into a sharper image using detail that was actually captured (works for hand shake, not a moving subject). Invented recovery: generative models produce convincing detail that is a plausible guess. Feeding sharper frames of the same person from the series as references keeps faces closer to the real person.
- **Changing focus is half solved.** Adding background blur from an AI depth map is mature and runs on the phone, as in Lightroom's Lens Blur. Bringing a blurred area into focus is only possible generatively; research exists but there is no ready, affordable API.
- **Platform limits shape the design.** This web app cannot browse the full iPhone Photos library in the background or delete photos from it; the user chooses files and confirms deletion in Photos. iOS can also strip EXIF (including capture time) when Safari hands a photo to a page, so grouping cannot rely on timestamps alone. A recent editing session can be retained locally in browser storage, but that is not persistent library access or a backup.
- **Plan:** lead with the editor, retain a resumable local editing session, and integrate series recovery and user-controlled cleanup. Keep AI-assisted motion-blur repair and native photo-library access as future work requiring separate privacy, platform and product decisions.

## Market scan

No app found combines culling a series on the phone with repairing the keeper using the other shots. Consumer editors fix single photos; pro cullers work on desktops; Google's Best Take uses the series but only swaps faces on Pixel phones.

| App | Platform | What matters for this app |
| --- | --- | --- |
| [Google Photos](https://www.androidcentral.com/apps-software/ai/how-use-google-photos-ai-editing-tools) | Android, iOS | Photo Unblur with a strength slider, best on motion blur in older photos. [Best Take](https://tomsguide.com/how-to/how-to-use-best-take-on-pixel-8) swaps in each person's best expression from a burst; the user picks faces. |
| [Lightroom mobile](https://helpx.adobe.com/lt/lightroom/mobile/adjust-light-and-color/apply-lens-blur.html) | iOS, Android, desktop | Lens Blur: AI depth map, focus on the detected subject or a tapped point, bokeh styles, depth overlay. Needs 4 GB RAM on iOS. |
| [Remini](https://www.stork.ai/en/remini) | iOS, Android | One-tap Enhance: unblur and sharpen, face enhance, old-photo restore. Freemium with ads. |
| [Topaz Photo](https://photoworkout.com/best-ai-photo-editor) | Desktop | Enhancement specialist known for noise reduction and sharpening, not a full editor. |
| [Aftershoot](https://aftershoot.com/?p=92900) | Desktop, runs locally | Groups duplicates, flags blur and closed eyes, scores expressions. [Adjustable](https://support.aftershoot.com/en/articles/6508163-setting-your-culling-preferences-in-aftershoot) blur sensitivity and group size; keeps one image per group. |
| [Narrative Select](https://narrative.so/lifetime-deal) | macOS, Windows | Groups shots into scenes. Close-ups panel shows every face with focus and eye-state warnings. |
| [Imagen](https://imagen-ai.com/valuable-tips/best-photo-culling-guide/) | Desktop | Groups bursts, flags blinks but recognises intentional closed eyes (a kiss), weighs aesthetics. |

**Why it matters:** the gap is real but narrow. Practical use: shoot a burst of the kids, let the app pick the keeper, then repair it using the rejects. Realistically, Google Photos already covers part of this on Pixel, and pro cullers handle thousands of RAW files better than a phone web app will.

Design lessons to copy:

- Keep one image per group by default, with a slider for how strict grouping is (Aftershoot).
- Never auto-reject a one-off shot; flag it and keep it visible (Aftershoot).
- Show face close-ups so eyes and focus are checked at a glance (Narrative).
- Allow exceptions such as intentionally closed eyes (Imagen).
- Give every AI fix a strength slider and a before/after view (Google Photos, Lightroom).

## AI sharpening and deblurring

Use the series first and generate last: picking, fusing or transplanting from sibling frames recovers detail that was really captured; generative models only guess it. The app should label every result as either "from your photos" or "AI-generated".

| Method | What it fixes | Detail is | Runs on | Cost |
| --- | --- | --- | --- | --- |
| Pick the sharpest frame | Any blur, if one frame came out fine | Real | Phone | Free |
| Burst fusion ([Fourier Burst Accumulation](https://arxiv.org/abs/1505.02731v2)) | Hand shake on a still scene; frames must be aligned first | Real, combined from all frames | Phone (FFT + alignment) | Free |
| Face transplant from the series (Best Take style) | One blurred or blinking face in an otherwise good shot | Real, but from another moment | Phone (face landmarks + blending) | Free |
| Learned single-image deblur ([NAFNet](https://arxiv.org/pdf/2204.04676v2), [Restormer](https://mmagic.readthedocs.io/en/stable/model_zoo/deblurring.html)) | Motion blur, mild defocus | Mostly real, sharpened by a trained network | Cloud GPU; on a phone only small crops | Low; needs self-hosting |
| Generative restore ([Real-ESRGAN](https://replicate.com/nightmareai/real-esrgan) + face fix, [SUPIR](https://alphaxiv.org/overview/2401.13627v2)) | Heavy blur, low resolution, damaged faces | Invented, plausible | Cloud | Real-ESRGAN about $0.002 per run on Replicate; SUPIR heavier |
| Reference-guided edit ([Gemini image models](https://www.developersdigest.tech/models/image-generation/google-gemini-api)) with sharp frames from the series | Blurry face or subject when another frame shows it clearly | Invented, but anchored to your references | Cloud | $0.034 (1K) to $0.05 (2K) per image on Nano Banana 2.1; $0.134 on 3 Pro Image |

### Using other images from the same series

Three levels, from most to least faithful:

1. **Fuse.** Burst fusion averages aligned frames in the Fourier domain, taking from each frame the frequencies its shake blurred least. The authors report state-of-the-art results an order of magnitude faster, simple enough for phones. It fails on moving subjects, so it is a "still scene" tool.
2. **Transplant.** Detect the same face in every frame, take the sharpest open-eyed version, align it with landmarks and blend it in. This is what Google's Best Take does from a burst.
3. **Guide.** Send the blurry photo plus 2 to 5 sharp frames to a generative editor with an instruction such as "restore the faces using the reference photos". Gemini 3 Pro Image accepts up to 14 input images, 5 at high fidelity, at $0.0011 per extra input image.

Research backs level 3: multi-reference face restoration ([ReF-LDM](https://arxiv.org/html/2412.05043v1), [Dual-Pivot Tuning](https://arxiv.org/pdf/2312.17234)) shows that reference photos of the same person improve identity. A learned burst network ([Aittala and Durand](https://people.csail.mit.edu/miika/eccv18_deblur)) recovers detail not visible in any single frame, but there is no ready product or API for it.

**Why it matters:** this is the feature that turns a near-miss into a keeper. Practical uses: a blinking child in the best group shot, a shaky low-light burst of a still scene, a soft face where the next frame is sharp. Realistic limits: fusion needs a steady scene; transplants can look odd if heads turned; generated detail can drift from the real person, so the original is always kept.

## Changing focus and depth of field

Moving the focus means blurring what is sharp and sharpening what is blurred. The first half is mature and runs on the phone; the second half needs a generative model and is still mostly research.

| Capability | How | Runs on | Status |
| --- | --- | --- | --- |
| Shallow depth of field: tap a subject, blur the rest | AI depth map ([Depth Anything V2 Small](https://github.com/DepthAnything/Depth-Anything-V2)) + depth-weighted blur with a bokeh shape | Phone (WebGPU) | Mature; same idea as Lightroom Lens Blur |
| Cleaner edges on hair and fur | [Depth Pro](https://arxiv.org/pdf/2410.02073): 2.25 MP depth map in 0.3 s on a standard GPU, best-in-class boundaries | Cloud | Optional upgrade |
| Bring a soft background into focus | Defocus deblurring ([Restormer](https://mmagic.readthedocs.io/en/stable/model_zoo/deblurring.html) has a defocus model) or a generative edit instruction | Cloud | Partial; generated detail |
| Full refocus: choose a new focal plane | [Generative Refocusing](https://arxiv.org/abs/2512.16923v2) (Dec 2025: recover all-in-focus, then re-render bokeh); [video-diffusion focal stacks](https://arxiv.org/html/2512.19823v1) (SIGGRAPH Asia 2025) | Research code only | Not production-ready |
| Focus stacking from the series | Merge the sharpest region of each frame, if frames were focused at different distances | Phone | Works only for still scenes; rare in phone bursts |

On-device facts that make this practical: the Small depth model has 24.8M parameters and is [Apache-2.0](https://github.com/DepthAnything/Depth-Anything-V2); its quantised web build is about 19 MB on mobile, and Safari 26 enables WebGPU by default on iOS ([depth-realtime](https://github.com/en970/depth-realtime)). The Base and Large models are non-commercial licence only.

Controls to copy from Lightroom: tap to set focus, an aperture (blur amount) slider, a depth overlay, and a brush to correct the mask.

**Why it matters:** portrait-style blur is the most-used depth effect and costs nothing to run. Practical uses: isolate a child from a busy playground, fake a fast lens on a phone wide shot. Realistic limits: the depth map is relative and can miss fine edges, and "un-blurring" a background is guesswork. iPhone Portrait photos carry their own depth map, but it is probably lost when Safari converts HEIC to JPEG; worth a quick test in phase 3.

## Series culling

You pick a set of photos; the app splits it into series, scores every frame on your five criteria, ranks frames within each series and proposes which to delete, with the reason on each. Scores are compared inside a series, because a sharpness number has no absolute meaning on its own ([VentaVid](https://www.ventavid.com/glossary/blur-detection)).

**Selecting and grouping.** You multi-select photos in the picker (one burst or a whole afternoon). The app groups them by visual similarity (image embeddings) plus file order, and uses capture time when EXIF survives. A strictness slider sets how alike frames must be to count as one series.

| Criterion | Signal | Tool (all on the phone) | Reliability |
| --- | --- | --- | --- |
| Motion blur, missed focus | Sharpness of the face and main-subject crops: variance of the Laplacian plus high-frequency energy from an [FFT](https://www.pyimagesearch.com/2020/06/15/opencv-fast-fourier-transform-fft-for-blur-detection-in-images-and-video-streams/) | Plain JS / OpenCV.js | High when comparing frames of one series |
| Closed or half-closed eyes | Eye-blink scores per face (52 expression scores per face) | [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) | High |
| Awkward expression | Mouth caught mid-word, squint, grimace; compared with the same person in sibling frames | MediaPipe expression scores | Low to medium: flag only |
| Facing away from the camera | Person found but no face, or head turned past a set angle (from the face transformation matrix) | MediaPipe person detection + Face Landmarker | Medium to high |
| Main subject cut by the frame | The main person's or object's box, or face points, touching the image edge | MediaPipe object detector | Medium: some crops are intentional |
| Also: exposure, near-duplicates | Clipped highlights or shadows; near-identical embeddings | Histogram, embeddings | High |

**Proposal rules:**

1. Keep the best frame of each series by default (or the best N, set by you).
2. Propose deleting the rest, each with its reasons shown as short labels (Blur, Eyes, Away, Cut, Expression).
3. Never propose deleting the only frame in which a given person looks good, and never auto-reject a one-off photo.
4. Expression flags lower the rank but never cause a deletion proposal on their own.
5. You confirm everything: swipe through proposals, override any of them, and see face close-ups side by side.

**Deleting.** A web app cannot delete from the iPhone Photos library. The cleanest flow: the app saves the keepers (repaired if you want) back to Photos through the share sheet, and you delete the original series in Photos with one multi-select. Trade-off: re-saved keepers may lose original metadata. A native iOS app could delete directly; see open decisions.

**Why it matters:** this saves time on every burst you shoot. Practical uses: family events, kids, sports, travel series. Realistic limits: expect to override some proposals, especially expressions and intentional crops; the tuning sliders matter more than the models.

## Recommended architecture

Use the same stack as Kodeks and NightGlass: a static web app on GitHub Pages, added to the Home Screen, with models running in the browser and one small proxy for cloud calls.

&#91;embedded content: app architecture · phone vs cloud\]

Only AI repair leaves the phone; the proxy keeps the API key out of the public page code, since GitHub Pages serves everything it hosts openly.

- **On-device ML:** [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) for faces, eye blinks, head pose, objects and embeddings; Transformers.js or ONNX Runtime Web for Depth Anything V2 Small on WebGPU; OpenCV.js for alignment, FFT and blending.
- **Cloud:** Gemini image editing through the proxy; Replicate as a second option for Real-ESRGAN or Depth Pro.
- **Cost:** on-device work is free. AI repair costs $0.034 to $0.05 per image on Nano Banana 2.1 or $0.134 on 3 Pro Image, so 30 repairs a month is about $1 to $4.
- **Performance:** analyse at about 1024 px to stay inside phone memory; use full resolution only for the final export.
- **Offline:** everything except AI repair works offline once models are cached, as with Kodeks.

## Product structure and screens

Editing is the front door, with series review as a secondary workflow. **Choose photos to edit** opens selected images directly in the editor without running culling models; **Resume recent edit** restores the most recent standalone session stored locally in IndexedDB. **Review a series** analyzes chosen photos and opens the series recovery/review workflow. Series-only recovery tools are shown only when related frames are available. The browser still requires the user to choose photos and cannot browse or delete the library directly.

| Screen | What's on it |
| --- | --- |
| Home | Choose photos to edit (primary); Resume recent edit; Review a series (secondary); clear photo-library limitation; settings |
| Photo editor | Selected photo, before/after, crop, exposure, contrast, colour, sharpen, focus blur, save copy; navigate selected photos |
| Series | One card per detected series: thumbnail, frame count, Keep / Delete suggestion counts; strictness slider |
| Review | Ranked filmstrip, large current frame, reason labels (Blur, Eyes, Away, Cut, Expression), user-overridable keep/delete suggestions, face close-up strip, recovery actions, Save keepers, Edit |
| Settings | Culling keep count, grouping strictness and sensitivity per criterion; cloud settings when available |

| Feature | Phase | Runs on |
| --- | --- | --- |
| Editor-first navigation, separate editing/culling state, resumable local edit session | 0 | Phone |
| Direct photo import, basic adjustments, crop, before/after, save copies | 1 | Phone |
| Optional series grouping, culling checks, recovery suggestions and review | 2 | Phone |
| Pick sharpest, still-scene burst fusion and sibling-face recovery | 3 | Phone |
| Depth map, tap-to-focus blur, bokeh and depth overlay | 3 | Phone |
| Optional AI-assisted motion-blur repair with explicit consent and generated-result labeling | Future decision | Cloud |
| Full photo-library access and direct deletion | Future platform decision; likely native iOS app | Device |

Currently, photos stay on the phone; optional cloud AI repair is not implemented. If added, it should send only the photo and reference frames the user selects after explicit confirmation.

## Updated build plan

Build the photo editor as the main product, with recovery and cleanup integrated as optional series workflows. The app now has an editor-led home screen, direct editing that bypasses culling analysis, a locally resumable standalone edit session, series recovery actions, and explicit user control over delete suggestions. The static web app still requires users to pick photos each time they start a new selection; recent-session storage is only a convenience. AI-assisted motion-blur repair and full-library access are not implemented. Continue with the phases below, validating each on real photos rather than treating a feature checklist as completion.

### Phase 0 — Re-architect the interface and app state (implemented)

- Lead with "Choose photos to edit"; keep "Review a series" secondary and explain that the browser cannot browse the library in the background.
- Make direct editing independent of culling models and preserve the standalone editor's separate photo collection and navigation.
- Save and restore the latest standalone edit session locally, while making clear that browser storage may be cleared or restricted and is not a backup.
- Reuse editor rendering across both paths; show sharpest-frame, fusion and face-recovery tools only when sibling frames are available.
- Keep originals unchanged; label cleanup as suggestions and require the user to delete selected photos in Photos.
- **Implemented:** a person can choose photos, edit and save a copy or resume a recent session without entering culling; the series review and recovery workflow remains available separately.

### Phase 1 — Complete the everyday photo editor

- Polish the direct import and navigation experience for single and multiple photos.
- Validate crop, exposure, contrast, colour, sharpening, before/after, focus blur and save-copy on real photos and supported mobile browsers.
- Improve editing state and error handling so switching photos does not lose adjustments.
- **Done when:** the editor is useful independently of culling, handles common phone photos reliably and never alters the original.

### Phase 2 — Make culling a well-integrated feature

- Keep series review as an explicit secondary workflow, independent from normal editing.
- Preserve grouping, culling checks, ranking and reasons; make every keep/delete suggestion overridable and protect one-off photos.
- Present recovery as a guided sequence: compare frames and choose the sharpest, then offer still-scene fusion or sibling-face repair with clear limitations and preview.
- State plainly that the web app prepares a delete list but cannot delete from Photos; the user confirms deletion in the Photos app.
- **Done when:** real series can be reviewed, repaired, edited and exported; suggestions remain under user control and one-off photos remain safe.

### Phase 3 — Improve on-device recovery and focus tools

- Keep sharpest-frame choice, burst fusion and best-face recovery available only when a series supplies reference frames; explain that moving subjects may ghost during fusion.
- Improve mask-based focus blur and evaluate Depth Anything V2 Small for actual depth-aware focus, bokeh, overlay and mask correction.
- Clearly communicate limitations and let users inspect every result.
- **Done when:** real-photo tests establish where each effect works, where it fails and what safeguards or fallbacks are needed.

### Phase 4 — Add optional cloud AI repair

- Treat AI-assisted motion-blur reduction as optional future work, not a current capability or a prerequisite for on-device recovery.
- If pursued, select a provider and spending cap; add a proxy that keeps provider credentials out of the static client.
- Send only the photo and references selected by the user, after explicit action and confirmation; label generated detail and preserve the original.
- **Done when:** privacy, cost, error handling, identity drift and output quality have been tested before general use.

### Risks

| Risk | Effect | Fallback |
| --- | --- | --- |
| iOS strips EXIF when Safari hands over a photo ([WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=207088)) | No capture times for grouping | Group by visual similarity and file order; test in week one |
| No delete access to the Photos library | One extra manual step | Save keepers via share sheet, delete the series in Photos; native app later |
| Phone memory with WebGPU models | Crashes on large photos | Analyse at about 1024 px; WASM fallback |
| Generated faces drift from the real person | A keeper that looks "off" | Series references, strength slider, original always kept, AI results labelled |
| Visible seams after face swap | Unnatural composite | Offer only when head angle matches across frames |
| Model or price changes | Cost jumps, broken calls | Proxy hides the provider; avoid Gemini 2.5 Flash Image, retiring 15 March 2027 |

### Open decisions

- [ ] Whether to remain a web app (no direct delete, EXIF may be lost) or build a native iOS app (direct delete, full metadata, Portrait depth maps, persistent photo-library access)
- [ ] Cloud provider and a monthly spending cap
- [ ] Whether to build optional AI-assisted motion-blur reduction, and how to distinguish generated detail from recovered detail
- [ ] Save repaired keepers as copies or replace originals
- [ ] App name

## Sources

- [Google Photos AI editing tools (Android Central)](https://www.androidcentral.com/apps-software/ai/how-use-google-photos-ai-editing-tools)
- [How Best Take works (Tom's Guide)](https://tomsguide.com/how-to/how-to-use-best-take-on-pixel-8)
- [Lightroom mobile Lens Blur (Adobe Help)](https://helpx.adobe.com/lt/lightroom/mobile/adjust-light-and-color/apply-lens-blur.html)
- [Remini review (Stork)](https://www.stork.ai/en/remini)
- [Best AI photo editors 2026 (PhotoWorkout)](https://photoworkout.com/best-ai-photo-editor)
- [Aftershoot culling features](https://aftershoot.com/?p=92900) and [culling preferences](https://support.aftershoot.com/en/articles/6508163-setting-your-culling-preferences-in-aftershoot)
- [Narrative Select close-ups and scenes](https://narrative.so/lifetime-deal)
- [Imagen photo culling guide](https://imagen-ai.com/valuable-tips/best-photo-culling-guide/)
- [Fourier Burst Accumulation (Delbracio and Sapiro)](https://arxiv.org/abs/1505.02731v2)
- [Burst deblurring with permutation-invariant CNNs (Aittala and Durand)](https://people.csail.mit.edu/miika/eccv18_deblur)
- [NAFNet paper](https://arxiv.org/pdf/2204.04676v2) and [Restormer model zoo](https://mmagic.readthedocs.io/en/stable/model_zoo/deblurring.html)
- [SUPIR overview](https://alphaxiv.org/overview/2401.13627v2)
- [ReF-LDM reference-based face restoration](https://arxiv.org/html/2412.05043v1) and [Personalized Restoration via Dual-Pivot Tuning](https://arxiv.org/pdf/2312.17234)
- [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) and [in-browser depth-realtime](https://github.com/en970/depth-realtime)
- [Depth Pro (Apple)](https://arxiv.org/pdf/2410.02073)
- [Generative Refocusing](https://arxiv.org/abs/2512.16923v2) and [Learning to Refocus with Video Diffusion Models](https://arxiv.org/html/2512.19823v1)
- [MediaPipe Face Landmarker for Web](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [FFT blur detection (PyImageSearch)](https://www.pyimagesearch.com/2020/06/15/opencv-fast-fourier-transform-fft-for-blur-detection-in-images-and-video-streams/) and [blur score limits (VentaVid)](https://www.ventavid.com/glossary/blur-detection)
- [Replicate Real-ESRGAN pricing](https://replicate.com/nightmareai/real-esrgan)
- [Gemini image API pricing, verified 18 Oct 2026 (Developers Digest)](https://www.developersdigest.tech/models/image-generation/google-gemini-api)
- [WebKit bug: EXIF stripped on iOS upload](https://bugs.webkit.org/show_bug.cgi?id=207088)
