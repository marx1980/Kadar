import { rankAll, rankSeries, decide, faceIssues, DEFAULTS } from './rank.js';
import { adjustPixels } from './editor.js';

const $app = document.getElementById('app');
const RING = '<svg class="ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path vector-effect="non-scaling-stroke" d="M52 4C81 3 97 21 96 50C95 80 77 97 48 96C19 95 3 77 4 48C5 23 23 7 58 8"/></svg>';
const XMARK = '<svg class="x" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line vector-effect="non-scaling-stroke" x1="14" y1="86" x2="86" y2="14"/></svg>';
const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

const S = {
  screen: 'home',
  items: [],
  series: [],
  si: 0, fi: 0,
  busy: false, done: 0, total: 0, error: '',
  settings: loadSettings(),
  sheet: false,
  compare: 'after',
  editorSaving: false,
  editorError: '',
  previewToken: 0,
};

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('kadar-settings') || '{}') }; }
  catch (e) { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem('kadar-settings', JSON.stringify(S.settings)); } catch (e) { /* private mode */ }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const keepers = () => S.series.flatMap(s => s.items.filter(i => decide(i) === 'keep'));
const deletes = () => S.series.flatMap(s => s.items.filter(i => decide(i) === 'delete'));

function frame(it, extra = '') {
  const del = decide(it) === 'delete';
  return `<span class="fr ${del ? 'del' : ''} ${extra}"><img src="${it.thumbUrl}" alt="">${del ? XMARK : RING}<span class="fn">${it.frame}</span></span>`;
}

const fileInput = `<input id="pick" type="file" accept="image/*" multiple>`;

// ---------- screens ----------

function home() {
  const p = S.total ? Math.round(100 * S.done / S.total) : 0;
  return `
  <div class="top"><h2></h2><button class="icon" data-act="settings" aria-label="Settings">${ICON.gear}</button></div>
  <main class="home">
    <div class="wordmark">Kadar${RING.replace('class="ring"', 'class="ring" style="position:absolute"')}</div>
    ${S.busy ? `
      <div class="progress" role="status">
        <div class="bar"><i style="width:${p}%"></i></div>
        <span class="num">${S.done} / ${S.total}</span>
      </div>` : `
      <label class="btn primary">${fileInput}Select photos</label>`}
    ${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}
  </main>`;
}

function seriesScreen() {
  const all = S.series.reduce((a, s) => a + s.items.length, 0);
  const k = keepers().length, d = deletes().length;
  return `
  <div class="top"><h2>Kadar</h2>
    <label class="icon" aria-label="Select photos">${fileInput}${ICON.plus}</label>
    <button class="icon" data-act="settings" aria-label="Settings">${ICON.gear}</button></div>
  <div class="summary">
    <div class="stat"><b class="num">${all}</b><span>Photos</span></div>
    <div class="stat"><b class="num">${S.series.length}</b><span>Series</span></div>
    <div class="stat k"><b class="num">${k}</b><span>Keep</span></div>
    <div class="stat d"><b class="num">${d}</b><span>Delete</span></div>
    ${S.skipped ? `<div class="stat"><b class="num">${S.skipped}</b><span>Skipped</span></div>` : ''}
  </div>
  <div class="actions">
    <button class="btn primary" data-act="save" ${k ? '' : 'disabled'}>Save keepers</button>
    <button class="btn" data-act="deletes" ${d ? '' : 'disabled'}>Delete list</button>
  </div>
  <div class="list">
    ${S.series.map((s, i) => {
      const sk = s.items.filter(x => decide(x) === 'keep').length;
      return `<button class="row" data-act="open" data-s="${i}">
        <span class="sn num">${s.id}</span>
        <span class="strip">${s.items.slice(0, 3).map(it => frame(it)).join('')}${s.items.length > 3 ? `<span class="more num">+${s.items.length - 3}</span>` : ''}</span>
        <span class="counts"><span class="k">Keep ${sk}</span><span class="d">Delete ${s.items.length - sk}</span></span>
      </button>`;
    }).join('')}
  </div>`;
}

function reviewScreen() {
  const s = S.series[S.si];
  const it = s.items[S.fi];
  const st = S.settings;
  const d = decide(it);
  const faces = it.faces.filter(f => f.box.h >= 0.04);
  const ar = it.w / it.h;
  return `
  <div class="top">
    <button class="icon" data-act="home" aria-label="Back">${ICON.back}</button>
    <h2>Series <span class="num">${s.id}</span> / <span class="num">${S.series.length}</span></h2>
    <button class="icon" data-act="ps" aria-label="Previous series" ${S.si ? '' : 'disabled'}>${ICON.prev}</button>
    <button class="icon" data-act="ns" aria-label="Next series" ${S.si < S.series.length - 1 ? '' : 'disabled'}>${ICON.next}</button>
  </div>
  <div class="stage">
    <div class="photo" id="photo" style="aspect-ratio:${ar};width:min(100%, calc(58dvh * ${ar}))">
      <img src="${it.viewUrl}" alt="Frame ${it.frame}">
      ${faces.map(f => `<span class="fb ${faceIssues(f, st).length ? 'bad' : ''}" style="left:${f.box.x * 100}%;top:${f.box.y * 100}%;width:${f.box.w * 100}%;height:${f.box.h * 100}%"></span>`).join('')}
      <span class="badge num">${it.frame}${d === 'keep' ? RING : ''}</span>
    </div>
  </div>
  <div class="bar2">
    <div class="chips">${(it.reasons || []).map(r => `<span class="chip ${r === 'Face' ? 'face' : r === 'Duplicate' ? '' : 'bad'}">${r}</span>`).join('')}</div>
    <div class="seg decide" role="group" aria-label="Decision">
      <button data-act="decide" data-v="keep" aria-pressed="${d === 'keep'}">Keep</button>
      <button data-act="decide" data-v="delete" aria-pressed="${d === 'delete'}">Delete</button>
    </div>
    <button class="btn" data-act="edit">Edit</button>
  </div>
  ${faces.length ? `<div class="faces">${faces.map(f => {
    const iss = faceIssues(f, st);
    return `<span class="face ${iss.length ? 'bad' : ''}"><img src="${f.thumb}" alt="">${iss[0] || ''}</span>`;
  }).join('')}</div>` : ''}
  <div class="film" id="film">${s.items.map((x, k) => `<button data-act="frame" data-f="${k}" aria-label="Frame ${x.frame}">${frame(x, k === S.fi ? 'cur' : '')}</button>`).join('')}</div>`;
}

function editorScreen() {
  const it = S.series[S.si].items[S.fi];
  const edits = it.adjustments || { exposure: 0, contrast: 0, saturation: 100, sharpness: 0 };
  const controls = [
    ['exposure', 'Exposure', -2, 2, 0.1, `${Number(edits.exposure).toFixed(1)} EV`],
    ['contrast', 'Contrast', -50, 50, 1, `${edits.contrast}%`],
    ['saturation', 'Colour', 0, 200, 1, `${edits.saturation}%`],
    ['sharpness', 'Sharpen', 0, 2, 0.1, `${Number(edits.sharpness).toFixed(1)}`],
  ];
  return `
  <div class="top">
    <button class="icon" data-act="editorBack" aria-label="Back">${ICON.back}</button>
    <h2>Edit frame <span class="num">${it.frame}</span></h2>
    <div class="seg" role="group" aria-label="Before and after">
      <button data-act="compare" data-v="before" aria-pressed="${S.compare === 'before'}">Before</button>
      <button data-act="compare" data-v="after" aria-pressed="${S.compare === 'after'}">After</button>
    </div>
  </div>
  <div class="stage editor-stage">
    <div class="editor-photo" style="aspect-ratio:${it.w}/${it.h}">
      <img id="editorOriginal" src="${it.viewUrl}" alt="Original frame" ${S.compare === 'after' ? 'hidden' : ''}>
      <canvas id="editorCanvas" aria-label="Edited frame" ${S.compare === 'before' ? 'hidden' : ''}></canvas>
    </div>
  </div>
  ${controls.map(([key, label, min, max, step, value]) => `
    <label class="adjust"><span>${label}<output data-value="${key}">${value}</output></span>
      <input type="range" data-adjust="${key}" min="${min}" max="${max}" step="${step}" value="${edits[key]}">
    </label>`).join('')}
  ${S.editorError ? `<p class="err editor-error" role="alert">${esc(S.editorError)}</p>` : ''}
  <div class="editor-actions">
    <button class="btn primary" data-act="saveEdited" ${S.editorSaving ? 'disabled' : ''}>${S.editorSaving ? 'Saving…' : 'Save copy'}</button>
  </div>`;
}

function deletesScreen() {
  const groups = S.series.map(s => ({ s, del: s.items.filter(i => decide(i) === 'delete') })).filter(g => g.del.length);
  return `
  <div class="top">
    <button class="icon" data-act="home" aria-label="Back">${ICON.back}</button>
    <h2>Delete <span class="num">${deletes().length}</span></h2>
  </div>
  ${groups.map(g => `<div class="sec">Series <span class="num">${g.s.id}</span></div>
    <div class="grid">${g.del.map(it => `<span class="fr"><img src="${it.thumbUrl}" alt=""><span class="fn">${it.frame}</span></span>`).join('')}</div>`).join('')}
  <div style="height:32px"></div>`;
}

function seg(key, opts, labels = opts) {
  return `<div class="seg" role="group">${opts.map((o, i) =>
    `<button data-act="set" data-k="${key}" data-v="${o}" aria-pressed="${String(S.settings[key]) === String(o)}">${labels[i]}</button>`).join('')}</div>`;
}

function sheet() {
  const lv = ['off', 'low', 'normal', 'high'], lvL = ['Off', 'Low', 'Normal', 'High'];
  const rows = [['blur', 'Blur'], ['eyes', 'Eyes'], ['expression', 'Expression'], ['away', 'Away'], ['cut', 'Cut'], ['exposure', 'Exposure']];
  return `<div class="sheet" data-act="close"><div data-stop="1" role="dialog" aria-label="Settings">
    <div class="set"><span>Keep per series</span>${seg('keep', [1, 2, 3], ['1', '2', '3'])}</div>
    <div class="set"><span>Grouping</span>${seg('grouping', ['loose', 'normal', 'strict'], ['Loose', 'Normal', 'Strict'])}</div>
    ${rows.map(([k, l]) => `<div class="set"><span>${l}</span>${seg(k, lv, lvL)}</div>`).join('')}
    <div class="done"><button class="btn primary" data-act="close">Done</button></div>
  </div></div>`;
}

function render() {
  const body = S.screen === 'series' ? seriesScreen()
    : S.screen === 'review' ? reviewScreen()
    : S.screen === 'editor' ? editorScreen()
    : S.screen === 'deletes' ? deletesScreen()
    : home();
  $app.innerHTML = body + (S.sheet ? sheet() : '');
  if (S.screen === 'review') {
    const cur = document.querySelector('#film .cur');
    cur && cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    bindSwipe();
  }
  if (S.screen === 'editor') renderEditorPreview();
}

// ---------- actions ----------

function rerank(regroup) {
  if (regroup) {
    S.series = rankAll(S.items, S.settings);
    S.si = Math.min(S.si, Math.max(0, S.series.length - 1));
    S.fi = 0;
  } else {
    for (const s of S.series) rankSeries(s, S.settings);
  }
}

async function analyze(files) {
  for (const it of S.items) { URL.revokeObjectURL(it.viewUrl); URL.revokeObjectURL(it.thumbUrl); }
  Object.assign(S, { screen: 'home', items: [], series: [], busy: true, done: 0, total: files.length, error: '' });
  render();
  let engine;
  try {
    engine = await import('./engine.js');
    await engine.initEngine();
  } catch (e) {
    S.busy = false;
    S.error = 'Models did not load. Connect to the internet once, then add the photos again.';
    render();
    return;
  }
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    try { S.items.push(await engine.analyzeFile(files[i], i)); }
    catch (e) { failed++; console.warn('analysis failed', files[i].name, e); }
    S.done = i + 1;
    const bar = document.querySelector('.bar i'), n = document.querySelector('.progress .num');
    if (bar) bar.style.width = `${Math.round(100 * S.done / S.total)}%`;
    if (n) n.textContent = `${S.done} / ${S.total}`;
    await new Promise(r => setTimeout(r, 0));
  }
  S.busy = false;
  S.skipped = failed;
  if (!S.items.length) { S.error = `None of the ${files.length} photos could be read.`; render(); return; }
  S.series = rankAll(S.items, S.settings);
  S.screen = 'series';
  S.si = 0; S.fi = 0;
  render();
}

async function saveKeepers() {
  const files = keepers().map(i => i.file);
  if (!files.length) return;
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
}

async function renderEditorPreview() {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;
  const it = S.series[S.si].items[S.fi];
  const token = ++S.previewToken;
  try {
    const bitmap = await createImageBitmap(it.file, { resizeWidth: Math.min(1200, it.w), resizeHeight: Math.min(1200, it.h), resizeQuality: 'high' });
    if (token !== S.previewToken || S.screen !== 'editor') { bitmap.close(); return; }
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    adjustPixels(pixels.data, canvas.width, canvas.height, it.adjustments);
    ctx.putImageData(pixels, 0, 0);
  } catch (e) {
    if (token === S.previewToken) S.editorError = 'Could not preview these adjustments.';
  }
}

async function saveEdited() {
  const it = S.series[S.si].items[S.fi];
  S.editorSaving = true;
  S.editorError = '';
  render();
  try {
    const bitmap = await createImageBitmap(it.file);
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    adjustPixels(pixels.data, canvas.width, canvas.height, it.adjustments);
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error('Image export failed');
    const name = `${it.name.replace(/\.[^.]+$/, '') || 'photo'}-edited.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    S.screen = 'review';
  } catch (e) {
    if (!e || e.name !== 'AbortError') S.editorError = 'Could not save the edited photo. Try a smaller image.';
  } finally {
    S.editorSaving = false;
    render();
  }
}

function step(df) {
  const s = S.series[S.si];
  const n = S.fi + df;
  if (n >= 0 && n < s.items.length) { S.fi = n; render(); }
}

function bindSwipe() {
  const el = document.getElementById('photo');
  if (!el) return;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
}

$app.addEventListener('change', e => {
  if (e.target.id === 'pick' && e.target.files.length) analyze([...e.target.files]);
});

$app.addEventListener('input', e => {
  const input = e.target.closest('[data-adjust]');
  if (!input || S.screen !== 'editor') return;
  const it = S.series[S.si].items[S.fi];
  it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0 };
  it.adjustments[input.dataset.adjust] = Number(input.value);
  const output = $app.querySelector(`[data-value="${input.dataset.adjust}"]`);
  if (output) {
    const { exposure, contrast, saturation, sharpness } = it.adjustments;
    output.textContent = input.dataset.adjust === 'exposure' ? `${exposure.toFixed(1)} EV`
      : input.dataset.adjust === 'sharpness' ? sharpness.toFixed(1)
      : `${input.value}%`;
  }
  requestAnimationFrame(renderEditorPreview);
});

$app.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'close' && e.target.closest('[data-stop]') && !e.target.closest('button[data-act=close]')) return;
  const a = t.dataset.act;
  if (a === 'settings') { S.sheet = true; render(); }
  else if (a === 'close') { S.sheet = false; render(); }
  else if (a === 'set') {
    const k = t.dataset.k;
    S.settings[k] = k === 'keep' ? Number(t.dataset.v) : t.dataset.v;
    saveSettings();
    if (S.items.length) rerank(k === 'grouping');
    render();
  }
  else if (a === 'open') { S.si = Number(t.dataset.s); S.fi = 0; S.screen = 'review'; render(); }
  else if (a === 'home') { S.screen = S.items.length ? 'series' : 'home'; render(); }
  else if (a === 'ps' && S.si > 0) { S.si--; S.fi = 0; render(); }
  else if (a === 'ns' && S.si < S.series.length - 1) { S.si++; S.fi = 0; render(); }
  else if (a === 'frame') { S.fi = Number(t.dataset.f); render(); }
  else if (a === 'edit') {
    const it = S.series[S.si].items[S.fi];
    it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0 };
    S.compare = 'after'; S.editorError = ''; S.screen = 'editor'; render();
  }
  else if (a === 'editorBack') { S.screen = 'review'; render(); }
  else if (a === 'compare') { S.compare = t.dataset.v; render(); }
  else if (a === 'saveEdited') saveEdited();
  else if (a === 'decide') {
    const it = S.series[S.si].items[S.fi];
    it.override = t.dataset.v === it.proposal ? null : t.dataset.v;
    render();
  }
  else if (a === 'save') saveKeepers();
  else if (a === 'deletes') { S.screen = 'deletes'; render(); }
});

document.addEventListener('keydown', e => {
  if (S.screen !== 'review' || S.sheet) return;
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
});

render();
