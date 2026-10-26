// Grouping into series, per-frame flags, ranking and keep/delete proposals. Pure logic.
import { cosine, edgesTouched, boxCenter, boxArea } from './metrics.js';

export const DEFAULTS = {
  keep: 1,
  grouping: 'normal',
  blur: 'normal', eyes: 'normal', expression: 'normal',
  away: 'normal', cut: 'normal', exposure: 'normal',
};

export const LEVELS = ['off', 'low', 'normal', 'high'];

const T = {
  grouping: { loose: 0.72, normal: 0.82, strict: 0.9 },
  blurRatio: { low: 0.35, normal: 0.5, high: 0.65 },
  blurFloor: { low: 10, normal: 20, high: 40 },
  eyes: { low: 0.65, normal: 0.5, high: 0.38 },
  expression: { low: 0.8, normal: 0.65, high: 0.5 },
  away: { low: 65, normal: 50, high: 38 },
  cut: { low: 0.003, normal: 0.01, high: 0.025 },
  exposure: { low: 0.35, normal: 0.22, high: 0.12 },
};

export const MAX_GAP_SEC = 120;

// ---- grouping ----

export function orderItems(items) {
  const timed = items.every(i => i.time != null);
  const list = items.slice().sort((a, b) =>
    timed ? (a.time - b.time) || (a.order - b.order) : a.order - b.order);
  return { list, timed };
}

export function buildSeries(items, settings = DEFAULTS) {
  const ok = items.filter(i => !i.failed);
  const { list, timed } = orderItems(ok);
  const thr = T.grouping[settings.grouping] ?? T.grouping.normal;
  const series = [];
  let cur = null;
  for (const it of list) {
    let join = false;
    if (cur) {
      const recent = cur.items.slice(-2);
      const sim = Math.max(...recent.map(r => cosine(r.embedding, it.embedding)));
      const prev = cur.items[cur.items.length - 1];
      const gapOk = !timed || Math.abs(it.time - prev.time) <= MAX_GAP_SEC;
      join = sim >= thr && gapOk;
    }
    if (!join) { cur = { id: series.length + 1, items: [] }; series.push(cur); }
    cur.items.push(it);
  }
  for (const s of series) s.items.forEach((it, k) => { it.frame = k + 1; });
  return series;
}

// ---- per-frame analysis ----

function significantFaces(it) {
  const faces = it.faces || [];
  const maxA = Math.max(0, ...faces.map(f => boxArea(f.box)));
  return faces.filter(f => maxA > 0 && boxArea(f.box) / maxA >= 0.3 && f.box.h >= 0.04)
    .map(f => ({ ...f, weight: boxArea(f.box) / maxA }));
}

function sharpMetric(items) {
  if (items.every(i => i.faceSharp != null)) return 'faceSharp';
  if (items.every(i => i.subjectSharp != null)) return 'subjectSharp';
  return 'gridSharp';
}

function isCut(it, margin) {
  for (const f of significantFaces(it)) {
    const e = edgesTouched(f.box, margin);
    if (e.left || e.right || e.top || e.bottom) return true;
  }
  const s = it.subject;
  if (!s) return false;
  const e = edgesTouched(s.box, margin);
  if (s.kind === 'person') {
    const faceInside = (it.faces || []).some(f => {
      const c = boxCenter(f.box);
      return c.x >= s.box.x && c.x <= s.box.x + s.box.w && c.y >= s.box.y && c.y <= s.box.y + s.box.h;
    });
    if (e.top && !faceInside) return true;
    if (s.box.w < 0.6 && (e.left !== e.right)) return true;
    return false;
  }
  return boxArea(s.box) < 0.7 && (e.left || e.right || e.top || e.bottom);
}

export function frameFlags(it, ctx, st) {
  const flags = [];
  const lv = k => (st[k] && st[k] !== 'off') ? st[k] : null;
  const faces = significantFaces(it);

  if (lv('blur')) {
    if (ctx.size > 1 ? it.sharpRel < T.blurRatio[st.blur] : it.gridSharp < T.blurFloor[st.blur]) flags.push('Blur');
  }
  if (lv('eyes') && faces.some(f => f.closed >= T.eyes[st.eyes])) flags.push('Eyes');
  if (lv('expression') && faces.some(f => f.awkward >= T.expression[st.expression])) flags.push('Expression');
  if (lv('away')) {
    const turned = faces.some(f => Math.abs(f.yaw) >= T.away[st.away]);
    const backs = (it.persons || []).some(p => p.box.h >= 0.3 && !p.hasFace);
    if (turned || backs) flags.push('Away');
  }
  if (lv('cut') && isCut(it, T.cut[st.cut])) flags.push('Cut');
  if (lv('exposure') && it.exposure &&
      Math.max(it.exposure.clipHi, it.exposure.clipLo) >= T.exposure[st.exposure]) flags.push('Exposure');
  return flags;
}

function frameScore(it, st) {
  let s = 60 * (it.sharpRel ?? 1);
  const faces = significantFaces(it);
  const eyeT = T.eyes[st.eyes] ?? T.eyes.normal;
  const awayT = T.away[st.away] ?? T.away.normal;
  for (const f of faces) {
    if (f.closed >= eyeT) s -= 30 * f.weight;
    s -= 10 * f.weight * f.awkward;
    if (Math.abs(f.yaw) >= awayT) s -= 15 * f.weight;
    else s += 4 * f.weight;
  }
  for (const p of it.persons || []) if (p.box.h >= 0.3 && !p.hasFace) s -= 15;
  if (it.flags.includes('Cut')) s -= 20;
  if (it.flags.includes('Exposure')) s -= 10;
  return s;
}

function goodFaces(it, st) {
  if (it.flags.includes('Blur')) return [];
  const eyeT = T.eyes[st.eyes] ?? T.eyes.normal;
  const awayT = T.away[st.away] ?? T.away.normal;
  const exT = T.expression[st.expression] ?? T.expression.normal;
  return significantFaces(it).filter(f => f.closed < eyeT && Math.abs(f.yaw) < awayT && f.awkward < exT);
}

function sameFace(a, b) {
  const ca = boxCenter(a.box), cb = boxCenter(b.box);
  const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  const r = boxArea(a.box) / (boxArea(b.box) || 1e-9);
  return d < 0.12 && r > 0.6 && r < 1.67;
}

export function rankSeries(series, st = DEFAULTS) {
  const items = series.items;
  const metric = sharpMetric(items);
  const max = Math.max(1e-9, ...items.map(i => i[metric] ?? 0));
  const ctx = { size: items.length };
  for (const it of items) {
    it.sharpRel = (it[metric] ?? 0) / max;
    it.flags = frameFlags(it, ctx, st);
    it.score = frameScore(it, st);
    it.protected = false;
  }
  if (items.length === 1) {
    items[0].proposal = 'keep';
    items[0].reasons = items[0].flags.slice();
    return series;
  }
  const byScore = items.slice().sort((a, b) => b.score - a.score || a.frame - b.frame);
  const keepN = Math.min(st.keep || 1, items.length);
  byScore.forEach((it, k) => { it.rank = k + 1; it.proposal = k < keepN ? 'keep' : 'delete'; });

  // Never propose deleting the only frame where a given person looks good.
  for (const it of byScore) {
    if (it.proposal !== 'delete') continue;
    const kept = items.filter(x => x.proposal === 'keep');
    const orphan = goodFaces(it, st).some(f => !kept.some(k => goodFaces(k, st).some(g => sameFace(f, g))));
    if (orphan) { it.proposal = 'keep'; it.protected = true; }
  }
  for (const it of items) {
    it.reasons = it.proposal === 'delete' && !it.flags.length ? ['Duplicate'] : it.flags.slice();
    if (it.protected) it.reasons.unshift('Face');
  }
  return series;
}

export function decide(it) { return it.override || it.proposal; }

// Which issues a single face has under the current settings (for the face boxes and close-ups).
export function faceIssues(f, st = DEFAULTS) {
  const out = [];
  if (st.eyes !== 'off' && f.closed >= T.eyes[st.eyes]) out.push('Eyes');
  if (st.expression !== 'off' && f.awkward >= T.expression[st.expression]) out.push('Expression');
  if (st.away !== 'off' && Math.abs(f.yaw) >= T.away[st.away]) out.push('Away');
  return out;
}

// Regions of the frame behind each non-face flag, for overlays on the review photo.
// `box` is null when the issue applies to the whole frame.
export function frameOverlays(it, st = DEFAULTS) {
  const out = [];
  const flags = it.flags || [];
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  const subjectBox = it.subject?.box || null;
  if (flags.includes('Blur')) out.push({ kind: 'Blur', box: subjectBox, label: 'Soft focus' });
  if (flags.includes('Cut') && st.cut !== 'off') {
    const m = T.cut[st.cut] ?? T.cut.normal;
    const touching = significantFaces(it).map(f => f.box).filter(b => { const e = edgesTouched(b, m); return e.left || e.right || e.top || e.bottom; });
    if (subjectBox) touching.push(subjectBox);
    touching.forEach(box => out.push({ kind: 'Cut', box, label: 'Cut off' }));
    if (!touching.length) out.push({ kind: 'Cut', box: null, label: 'Cut off' });
  }
  if (flags.includes('Away')) {
    for (const p of it.persons || []) if (p.box.h >= 0.3 && !p.hasFace) out.push({ kind: 'Away', box: p.box, label: 'Facing away' });
  }
  if (flags.includes('Exposure')) {
    const e = it.exposure || {};
    out.push({ kind: 'Exposure', box: null, label: (e.clipHi || 0) >= (e.clipLo || 0) ? 'Highlights clipped' : 'Shadows clipped' });
  }
  return out.map(o => ({ ...o, whole: !o.box, box: o.box || whole }));
}

export function rankAll(items, st = DEFAULTS) {
  const series = buildSeries(items, st);
  for (const s of series) rankSeries(s, st);
  return series;
}
