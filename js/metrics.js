// Pure image and face metrics. No DOM access: works in the browser and in Node tests.

export function toGray(data, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return g;
}

// Variance of the 4-neighbour Laplacian over a rectangle (defaults to the whole image).
export function laplacianVar(g, w, h, x0 = 0, y0 = 0, x1 = w, y1 = h) {
  x0 = Math.max(1, x0); y0 = Math.max(1, y0);
  x1 = Math.min(w - 1, x1); y1 = Math.min(h - 1, y1);
  let n = 0, sum = 0, sq = 0;
  for (let y = y0; y < y1; y++) {
    const r = y * w;
    for (let x = x0; x < x1; x++) {
      const i = r + x;
      const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      sum += l; sq += l * l; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

// Sharpest cell of a 3x3 grid: focus may sit anywhere in a scene without people.
export function gridSharpness(g, w, h) {
  let best = 0;
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const v = laplacianVar(g, w, h,
        Math.floor(gx * w / 3), Math.floor(gy * h / 3),
        Math.floor((gx + 1) * w / 3), Math.floor((gy + 1) * h / 3));
      if (v > best) best = v;
    }
  }
  return best;
}

export function exposureStats(g) {
  let hi = 0, lo = 0, sum = 0;
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    sum += v;
    if (v >= 250) hi++;
    else if (v <= 5) lo++;
  }
  const n = g.length || 1;
  return { clipHi: hi / n, clipLo: lo / n, mean: sum / n };
}

export function blendMap(categories) {
  const m = {};
  for (const c of categories || []) m[c.categoryName] = c.score;
  return m;
}

export function eyesClosedScore(bs) {
  return ((bs.eyeBlinkLeft || 0) + (bs.eyeBlinkRight || 0)) / 2;
}

// 0..1: mouth caught mid-word, grimace, pucker or half-closed eyes.
export function awkwardScore(bs) {
  const smile = ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2;
  const jaw = bs.jawOpen || 0;
  const midWord = jaw > 0.25 && smile < 0.3 ? Math.min(1, (jaw - 0.25) / 0.35 + 0.4) : 0;
  const squint = ((bs.eyeSquintLeft || 0) + (bs.eyeSquintRight || 0)) / 2;
  const brow = ((bs.browDownLeft || 0) + (bs.browDownRight || 0)) / 2;
  const grimace = squint > 0.5 && brow > 0.35 ? Math.min(1, (squint + brow) / 1.4) : 0;
  const pucker = Math.max(bs.mouthPucker || 0, bs.mouthFunnel || 0);
  const lips = pucker > 0.5 ? pucker : 0;
  const blink = eyesClosedScore(bs);
  const half = blink > 0.25 && blink < 0.5 ? 0.5 + (blink - 0.25) : 0;
  return Math.max(midWord, grimace, lips, half);
}

// Head turn from face-mesh landmarks: nose tip (1) between the cheek edges (234, 454).
// Returns degrees, 0 = facing the camera, +/-90 = profile.
export function yawFromLandmarks(lm) {
  const n = lm[1], a = lm[234], b = lm[454];
  if (!n || !a || !b) return 0;
  const span = b.x - a.x;
  if (Math.abs(span) < 1e-6) return 90;
  const r = (n.x - a.x) / span;
  const t = Math.max(-1, Math.min(1, (r - 0.5) * 2));
  return Math.asin(t) * 180 / Math.PI;
}

export function landmarkBox(lm) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

// Which frame edges a normalised box touches within a margin.
export function edgesTouched(box, margin) {
  return {
    left: box.x <= margin,
    top: box.y <= margin,
    right: box.x + box.w >= 1 - margin,
    bottom: box.y + box.h >= 1 - margin,
  };
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export function boxCenter(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
export function boxArea(b) { return b.w * b.h; }
