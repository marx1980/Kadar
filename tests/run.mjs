// Node tests for the pure modules: node tests/run.mjs
import assert from 'node:assert/strict';
import { parseExifTime, toSeconds } from '../js/exif.js';
import { laplacianVar, gridSharpness, exposureStats, yawFromLandmarks, awkwardScore, eyesClosedScore, edgesTouched, cosine } from '../js/metrics.js';
import { buildSeries, rankSeries, rankAll, decide, DEFAULTS, faceIssues } from '../js/rank.js';
import { adjustPixels, bestFaceSources, cropRect, sharpestFrameIndex } from '../js/editor.js';

let pass = 0;
const test = (name, fn) => { fn(); pass++; console.log('ok  ', name); };

// ---------- EXIF ----------
function jpegWithExif(date, sub, le = true) {
  const entries0 = [[0x8769, 4, 1, 26]];               // IFD0: ExifIFD pointer at offset 26
  const dateStr = date + '\0';                          // 20 bytes
  const subStr = sub + '\0';
  // TIFF layout: header(8) | IFD0 (2+12+4=18) -> ends at 26 | ExifIFD (2 + 2*12 + 4 = 30) -> ends at 56 | date(20) | sub
  const tiff = new DataView(new ArrayBuffer(56 + dateStr.length + Math.max(subStr.length, 4)));
  const u16 = (o, v) => tiff.setUint16(o, v, le), u32 = (o, v) => tiff.setUint32(o, v, le);
  tiff.setUint16(0, le ? 0x4949 : 0x4D4D); u16(2, 42); u32(4, 8);
  u16(8, 1); u16(10, entries0[0][0]); u16(12, 4); u32(14, 1); u32(18, 26); u32(22, 0);
  u16(26, 2);
  u16(28, 0x9003); u16(30, 2); u32(32, dateStr.length); u32(36, 56);
  u16(40, 0x9291); u16(42, 2); u32(44, subStr.length);
  if (subStr.length <= 4) { for (let i = 0; i < subStr.length; i++) tiff.setUint8(48 + i, subStr.charCodeAt(i)); }
  else u32(48, 56 + dateStr.length);
  u32(52, 0);
  for (let i = 0; i < dateStr.length; i++) tiff.setUint8(56 + i, dateStr.charCodeAt(i));
  if (subStr.length > 4) for (let i = 0; i < subStr.length; i++) tiff.setUint8(56 + dateStr.length + i, subStr.charCodeAt(i));
  const app1Len = 2 + 6 + tiff.byteLength;
  const out = new Uint8Array(2 + 2 + app1Len + 2);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0xFFD8); v.setUint16(2, 0xFFE1); v.setUint16(4, app1Len);
  v.setUint32(6, 0x45786966); v.setUint16(10, 0);
  out.set(new Uint8Array(tiff.buffer), 12);
  v.setUint16(12 + tiff.byteLength, 0xFFDA);
  return out.buffer;
}

test('exif: DateTimeOriginal + SubSec, little endian', () => {
  const t = parseExifTime(jpegWithExif('2026:10:24 13:05:07', '42'));
  assert.equal(t, Date.UTC(2026, 9, 24, 13, 5, 7) / 1000 + 0.42);
});
test('exif: big endian', () => {
  const t = parseExifTime(jpegWithExif('2025:01:02 03:04:05', '7', false));
  assert.equal(t, Date.UTC(2025, 0, 2, 3, 4, 5) / 1000 + 0.7);
});
test('exif: burst frames in the same second keep their order', () => {
  const a = parseExifTime(jpegWithExif('2026:10:24 13:05:07', '10'));
  const b = parseExifTime(jpegWithExif('2026:10:24 13:05:07', '55'));
  assert.ok(b > a);
});
test('exif: not a JPEG / no EXIF -> null', () => {
  assert.equal(parseExifTime(new Uint8Array([1, 2, 3, 4]).buffer), null);
  assert.equal(toSeconds('0000:00:00 00:00:00'), null);
});

// ---------- metrics ----------
function pattern(w, h) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = ((x >> 2) + (y >> 2)) % 2 ? 230 : 25;
  return g;
}
function boxBlur(g, w, h, r) {
  const o = new Float32Array(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
      s += g[yy * w + xx]; n++;
    }
    o[y * w + x] = s / n;
  }
  return o;
}
function motionBlur(g, w, h, len) {
  const o = new Float32Array(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let k = 0; k < len; k++) s += g[y * w + Math.min(w - 1, x + k)];
    o[y * w + x] = s / len;
  }
  return o;
}

test('sharpness: sharp > motion blur > heavy blur', () => {
  const w = 128, h = 128, g = pattern(w, h);
  const sharp = laplacianVar(g, w, h);
  const motion = laplacianVar(motionBlur(g, w, h, 6), w, h);
  const heavy = laplacianVar(boxBlur(g, w, h, 3), w, h);
  assert.ok(sharp > motion && motion > heavy, `${sharp} ${motion} ${heavy}`);
});
test('sharpness: grid finds a sharp patch in an otherwise blurred frame', () => {
  const w = 120, h = 120, g = boxBlur(pattern(w, h), w, h, 3), p = pattern(w, h);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) g[y * w + x] = p[y * w + x];
  assert.ok(gridSharpness(g, w, h) > 2 * laplacianVar(g, w, h));
});
test('exposure: clipped highlights measured', () => {
  const g = new Float32Array(100).fill(255); g.fill(100, 0, 50);
  assert.equal(exposureStats(g).clipHi, 0.5);
});
test('yaw: frontal ~0, turned face large', () => {
  const lm = []; lm[234] = { x: 0.4 }; lm[454] = { x: 0.6 };
  lm[1] = { x: 0.5 }; assert.ok(Math.abs(yawFromLandmarks(lm)) < 1);
  lm[1] = { x: 0.59 }; assert.ok(yawFromLandmarks(lm) > 50);
  lm[1] = { x: 0.41 }; assert.ok(yawFromLandmarks(lm) < -50);
});
test('expression: mid-word mouth scores high, smile scores low', () => {
  assert.ok(awkwardScore({ jawOpen: 0.6, mouthSmileLeft: 0.05, mouthSmileRight: 0.05 }) > 0.65);
  assert.ok(awkwardScore({ jawOpen: 0.3, mouthSmileLeft: 0.8, mouthSmileRight: 0.8 }) < 0.2);
  assert.equal(eyesClosedScore({ eyeBlinkLeft: 0.9, eyeBlinkRight: 0.7 }), 0.8);
});
test('edges and cosine', () => {
  assert.deepEqual(edgesTouched({ x: 0, y: 0.2, w: 0.3, h: 0.3 }, 0.01), { left: true, top: false, right: false, bottom: false });
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
});
test('editor: exposure, contrast and saturation adjust RGB values', () => {
  const pixels = new Uint8ClampedArray([100, 100, 100, 255, 100, 50, 0, 255]);
  adjustPixels(pixels, 2, 1, { exposure: 1, saturation: 0 });
  assert.deepEqual([...pixels], [200, 200, 200, 255, 118, 118, 118, 255]);
});
test('editor: default adjustments preserve source pixels', () => {
  const pixels = new Uint8ClampedArray([25, 100, 220, 255]);
  adjustPixels(pixels, 1, 1);
  assert.deepEqual([...pixels], [25, 100, 220, 255]);
});
test('editor: unsharp mask increases local edge contrast and preserves alpha', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([100, 100, 100, 255], i);
  pixels.set([150, 150, 150, 255], (2 * 5 + 2) * 4);
  adjustPixels(pixels, 5, 5, { sharpness: 1 });
  assert.ok(pixels[(2 * 5 + 2) * 4] > 150);
  assert.equal(pixels[(2 * 5 + 2) * 4 + 3], 255);
});
test('editor: malformed pixel dimensions are rejected', () => {
  assert.throws(() => adjustPixels(new Uint8ClampedArray(3), 1, 1), RangeError);
});
test('editor: pick sharpest selects highest relative sharpness and keeps first on ties', () => {
  assert.equal(sharpestFrameIndex([{ sharpRel: 0.8 }, { sharpRel: 1 }, { sharpRel: 1 }]), 1);
  assert.equal(sharpestFrameIndex([]), -1);
});

test('editor: best face source matches position and angle, preferring sharp open eyes', () => {
  const faceAt = (x, sharp, closed = 0, yaw = 0) => ({
    box: { x, y: 0.2, w: 0.12, h: 0.16 }, sharp, closed, yaw,
  });
  const items = [
    { faces: [faceAt(0.2, 40, 0.9)] },
    { faces: [faceAt(0.21, 100, 0.05)] },
    { faces: [faceAt(0.2, 300, 0, 40)] },
  ];
  assert.deepEqual(bestFaceSources(items, 0), [{ faceIndex: 0, frameIndex: 1, sourceFaceIndex: 0 }]);
  assert.deepEqual(bestFaceSources(items, 1), []);
  const group = [
    { faces: [faceAt(0.2, 40, 0.9), faceAt(0.7, 40, 0.9)] },
    { faces: [faceAt(0.7, 200), faceAt(0.21, 180)] },
  ];
  assert.deepEqual(bestFaceSources(group, 0), [
    { faceIndex: 0, frameIndex: 1, sourceFaceIndex: 1 },
    { faceIndex: 1, frameIndex: 1, sourceFaceIndex: 0 },
  ]);
  assert.deepEqual(bestFaceSources(group, 2), []);
});

test('editor: crop presets return centered rectangles at the requested ratio', () => {
  assert.deepEqual(cropRect(400, 300, 'original'), { x: 0, y: 0, width: 400, height: 300 });
  assert.deepEqual(cropRect(400, 300, 'square'), { x: 50, y: 0, width: 300, height: 300 });
  assert.deepEqual(cropRect(400, 300, 'portrait'), { x: 80, y: 0, width: 240, height: 300 });
  const landscape = cropRect(400, 300, 'landscape');
  assert.equal(landscape.width, 400);
  assert.ok(Math.abs(landscape.height - 400 / 1.5) < 1e-9);
  assert.ok(Math.abs(landscape.y - (300 - landscape.height) / 2) < 1e-9);
  assert.throws(() => cropRect(0, 300), RangeError);
});

// ---------- grouping and ranking ----------
const emb = (base, noise, seed) => base.map((v, i) => v + noise * Math.sin(seed * 13 + i * 7));
const E1 = Array.from({ length: 32 }, (_, i) => Math.sin(i));
const E2 = Array.from({ length: 32 }, (_, i) => Math.cos(i * 3));
const face = (x, opts = {}) => ({ box: { x, y: 0.2, w: 0.12, h: 0.16 }, closed: 0.05, awkward: 0.1, yaw: 3, sharp: 100, ...opts });
const item = (order, e, o = {}) => ({
  id: String(order), order, time: null, embedding: e, faces: [], persons: [], subject: null,
  faceSharp: null, subjectSharp: null, gridSharp: 100, exposure: { clipHi: 0, clipLo: 0 }, ...o,
});

test('grouping: two scenes become two series; strict splits less similar frames', () => {
  const items = [0, 1, 2, 3].map(k => item(k, emb(E1, 0.05, k))).concat([4, 5].map(k => item(k, emb(E2, 0.05, k))));
  assert.equal(buildSeries(items, DEFAULTS).length, 2);
  const s = buildSeries(items, DEFAULTS);
  assert.deepEqual(s.map(x => x.items.length), [4, 2]);
  assert.deepEqual(s[0].items.map(i => i.frame), [1, 2, 3, 4]);
});
test('grouping: a long time gap splits even near-identical frames', () => {
  const items = [item(0, E1, { time: 1000 }), item(1, E1, { time: 1001 }), item(2, E1, { time: 2000 })];
  assert.deepEqual(buildSeries(items, DEFAULTS).map(x => x.items.length), [2, 1]);
});

function burst() {
  // Two people. Frame 1 sharp, both fine. Frame 2: person B blinks. Frame 3: blurry. Frame 4: B turned away.
  return [
    item(0, E1, { faces: [face(0.2), face(0.6)], faceSharp: 100 }),
    item(1, E1, { faces: [face(0.2), face(0.6, { closed: 0.9 })], faceSharp: 98 }),
    item(2, E1, { faces: [face(0.2), face(0.6)], faceSharp: 30 }),
    item(3, E1, { faces: [face(0.2), face(0.6, { yaw: 70 })], faceSharp: 95 }),
  ];
}

test('ranking: best frame kept, others proposed for deletion with reasons', () => {
  const [s] = rankAll(burst(), DEFAULTS);
  assert.deepEqual(s.items.map(decide), ['keep', 'delete', 'delete', 'delete']);
  assert.deepEqual(s.items[1].reasons, ['Eyes']);
  assert.deepEqual(s.items[2].reasons, ['Blur']);
  assert.deepEqual(s.items[3].reasons, ['Away']);
});
test('ranking: keep 2 keeps the two best', () => {
  const [s] = rankAll(burst(), { ...DEFAULTS, keep: 2 });
  assert.equal(s.items.filter(i => decide(i) === 'keep').length, 2);
  assert.equal(decide(s.items[0]), 'keep');
});
test('protection: a frame with the only good shot of a person is kept', () => {
  const items = [
    item(0, E1, { faces: [face(0.2), face(0.6, { closed: 0.9 })], faceSharp: 100 }),
    item(1, E1, { faces: [face(0.2, { closed: 0.9 }), face(0.6)], faceSharp: 97 }),
  ];
  const [s] = rankAll(items, DEFAULTS);
  assert.deepEqual(s.items.map(decide), ['keep', 'keep']);
  assert.ok(s.items[1].reasons.includes('Face'));
});
test('one-off photo is never proposed for deletion, but its flags show', () => {
  const [s] = rankAll([item(0, E1, { gridSharp: 3 })], DEFAULTS);
  assert.equal(decide(s.items[0]), 'keep');
  assert.deepEqual(s.items[0].reasons, ['Blur']);
});
test('a person with their back to the camera is flagged Away', () => {
  const items = [item(0, E1, { persons: [{ box: { x: 0.3, y: 0.1, w: 0.3, h: 0.8 }, hasFace: false }] }), item(1, E1)];
  const [s] = rankAll(items, DEFAULTS);
  assert.ok(s.items[0].flags.includes('Away'));
  assert.deepEqual(s.items.map(decide), ['delete', 'keep']);
});
test('cut: head at the frame edge is flagged; tight portrait filling the frame is not', () => {
  const cut = item(0, E1, { faces: [face(0.0)] });
  const portrait = item(1, E1, { subject: { kind: 'person', box: { x: 0, y: 0.05, w: 1, h: 0.95 } }, faces: [face(0.4)] });
  const [s] = rankAll([cut, portrait], DEFAULTS);
  assert.ok(s.items[0].flags.includes('Cut'));
  assert.ok(!s.items[1].flags.includes('Cut'));
});
test('settings: turning a criterion off removes its flag; overrides survive re-ranking', () => {
  const [s] = rankAll(burst(), { ...DEFAULTS, eyes: 'off' });
  assert.ok(!s.items[1].flags.includes('Eyes'));
  s.items[2].override = 'keep';
  rankSeries(s, DEFAULTS);
  assert.equal(decide(s.items[2]), 'keep');
  assert.deepEqual(faceIssues(face(0.6, { closed: 0.9 }), DEFAULTS), ['Eyes']);
});
test('expression alone never removes a one-off photo', () => {
  const [s] = rankAll([item(0, E1, { faces: [face(0.3, { awkward: 0.95 })] })], DEFAULTS);
  assert.equal(decide(s.items[0]), 'keep');
  assert.deepEqual(s.items[0].reasons, ['Expression']);
});

console.log(`\n${pass} tests passed`);
