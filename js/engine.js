// On-device analysis with MediaPipe (CPU / WASM). One photo at a time to stay inside phone memory.
import { FilesetResolver, FaceLandmarker, ObjectDetector, ImageEmbedder } from '../libs/mediapipe/vision_bundle.mjs';
import { readExifTime } from './exif.js';
import {
  toGray, laplacianVar, gridSharpness, exposureStats, blendMap, eyesClosedScore,
  awkwardScore, yawFromLandmarks, landmarkBox, boxArea, boxCenter,
} from './metrics.js';

const MODELS = 'https://storage.googleapis.com/mediapipe-models/';
const FACE = MODELS + 'face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const OBJECTS = MODELS + 'object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite';
const EMBED = MODELS + 'image_embedder/mobilenet_v3_small/float32/latest/mobilenet_v3_small.tflite';

const VIEW_MAX = 1600;   // analysis + review image size
const THUMB_MAX = 360;
const FACE_PX = 256;
const SUBJECT_PX = 256;
const GRID_PX = 512;

let tasks = null;

export async function initEngine() {
  if (tasks) return tasks;
  const fs = await FilesetResolver.forVisionTasks(new URL('../libs/mediapipe/wasm', import.meta.url).href);
  const base = path => ({ modelAssetPath: path, delegate: 'CPU' });
  const [face, objects, embed] = await Promise.all([
    FaceLandmarker.createFromOptions(fs, {
      baseOptions: base(FACE), runningMode: 'IMAGE', numFaces: 10,
      minFaceDetectionConfidence: 0.45, minFacePresenceConfidence: 0.45,
      outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
    }),
    ObjectDetector.createFromOptions(fs, {
      baseOptions: base(OBJECTS), runningMode: 'IMAGE', scoreThreshold: 0.4, maxResults: 12,
    }),
    ImageEmbedder.createFromOptions(fs, {
      baseOptions: base(EMBED), runningMode: 'IMAGE', l2Normalize: true, quantize: false,
    }),
  ]);
  tasks = { face, objects, embed };
  return tasks;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function cropTo(src, box, maxSide, square = false) {
  // box in normalised coords of src
  const sx = box.x * src.width, sy = box.y * src.height, sw = box.w * src.width, sh = box.h * src.height;
  const s = maxSide / Math.max(sw, sh, 1);
  const c = square ? canvas(maxSide, maxSide) : canvas(sw * s, sh * s);
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

function grayOf(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  return toGray(d.data, c.width, c.height);
}

function sharpOf(c) {
  return laplacianVar(grayOf(c), c.width, c.height);
}

function pad(box, p) {
  const x = Math.max(0, box.x - box.w * p), y = Math.max(0, box.y - box.h * p);
  const x1 = Math.min(1, box.x + box.w * (1 + p)), y1 = Math.min(1, box.y + box.h * (1 + p));
  return { x, y, w: x1 - x, h: y1 - y };
}

function toBlob(c, q = 0.85) {
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', q));
}

function faceFrom(lm, cats, view) {
  const box = landmarkBox(lm);
  const bs = blendMap(cats);
  const crop = cropTo(view, pad(box, 0.1), FACE_PX, true);
  return {
    box,
    closed: eyesClosedScore(bs),
    awkward: awkwardScore(bs),
    yaw: yawFromLandmarks(lm),
    sharp: sharpOf(crop),
    thumb: crop.toDataURL('image/jpeg', 0.8),
  };
}

function inside(pt, b) {
  return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
}

export async function analyzeFile(file, order) {
  const { face, objects, embed } = await initEngine();
  const time = await readExifTime(file);
  const bmp = await createImageBitmap(file);
  const sourceW = bmp.width, sourceH = bmp.height;
  const s = Math.min(1, VIEW_MAX / Math.max(sourceW, sourceH));
  const view = canvas(bmp.width * s, bmp.height * s);
  view.getContext('2d').drawImage(bmp, 0, 0, view.width, view.height);
  const W = view.width, H = view.height;
  bmp.close && bmp.close();

  const ts = THUMB_MAX / Math.max(W, H);
  const thumbC = canvas(W * ts, H * ts);
  thumbC.getContext('2d').drawImage(view, 0, 0, thumbC.width, thumbC.height);
  const [viewBlob, thumbBlob] = await Promise.all([toBlob(view, 0.88), toBlob(thumbC, 0.8)]);

  const embedding = Float32Array.from(embed.embed(view).embeddings[0].floatEmbedding);

  const dets = objects.detect(view).detections || [];
  const boxes = dets.map(d => ({
    kind: d.categories[0].categoryName,
    score: d.categories[0].score,
    box: { x: d.boundingBox.originX / W, y: d.boundingBox.originY / H, w: d.boundingBox.width / W, h: d.boundingBox.height / H },
  }));

  const fr = face.detect(view);
  const faces = (fr.faceLandmarks || []).map((lm, k) => faceFrom(lm, fr.faceBlendshapes?.[k]?.categories, view));

  // Second look for faces inside larger people (group shots, faces too small for the first pass).
  const persons = boxes.filter(b => b.kind === 'person').map(p => ({ box: p.box, hasFace: false }));
  for (const p of persons) {
    p.hasFace = faces.some(f => inside(boxCenter(f.box), p.box));
    if (p.hasFace || p.box.h < 0.25) continue;
    const head = pad({ x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h * 0.5 }, 0.1);
    const crop = cropTo(view, head, 512);
    const r2 = face.detect(crop);
    (r2.faceLandmarks || []).forEach((lm, k) => {
      const mapped = lm.map(q => ({ x: head.x + q.x * head.w, y: head.y + q.y * head.h, z: q.z }));
      const f = faceFrom(mapped, r2.faceBlendshapes?.[k]?.categories, view);
      if (!faces.some(g => inside(boxCenter(f.box), g.box))) faces.push(f);
    });
    p.hasFace = faces.some(f => inside(boxCenter(f.box), p.box));
  }

  // Main subject: the largest sizeable person, otherwise the largest object.
  const big = boxes.filter(b => (b.kind === 'person' ? b.box.h >= 0.25 : boxArea(b.box) >= 0.05));
  const pick = arr => arr.sort((a, b) => boxArea(b.box) - boxArea(a.box))[0];
  const subject = pick(big.filter(b => b.kind === 'person')) || pick(big.filter(b => b.kind !== 'person')) || null;

  const grid = cropTo(view, { x: 0, y: 0, w: 1, h: 1 }, GRID_PX);
  const g = grayOf(grid);
  const sig = faces.filter(f => f.box.h >= 0.04);
  return {
    id: `${order}-${file.name}-${file.size}`,
    file, name: file.name, order, time, w: W, h: H, sourceW, sourceH,
    viewUrl: URL.createObjectURL(viewBlob),
    thumbUrl: URL.createObjectURL(thumbBlob),
    embedding,
    faces,
    persons,
    subject: subject ? { kind: subject.kind === 'person' ? 'person' : 'object', label: subject.kind, box: subject.box } : null,
    faceSharp: sig.length ? sig.reduce((a, f) => a + f.sharp, 0) / sig.length : null,
    subjectSharp: subject ? sharpOf(cropTo(view, subject.box, SUBJECT_PX)) : null,
    gridSharp: gridSharpness(g, grid.width, grid.height),
    exposure: exposureStats(g),
  };
}
