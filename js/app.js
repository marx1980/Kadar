import { rankAll, rankSeries, decide, faceIssues, DEFAULTS } from './rank.js';
import { adjustPixels, bestFaceSources, colorizeDepth, cropRect, depthAt, depthFocusMask, estimateTranslation, isForegroundAt, medianFuse, paintMask, sharpestFrameIndex } from './editor.js';
import { loadRecentEdit, saveRecentEdit } from './recent.js';

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
  editItems: [],
  editorMode: 'cull',
  editIndex: 0,
  recentEdit: null,
  recentError: '',
  series: [],
  si: 0, fi: 0,
  busy: false, done: 0, total: 0, error: '',
  settings: loadSettings(),
  sheet: false,
  compare: 'after',
  editorSaving: false,
  editorFusing: false,
  editorFocusing: false,
  editorError: '',
  previewToken: 0,
  focusBrush: false,
  focusBrushTarget: 'sharp',
  focusBrushSize: 20,
  focusPointer: null,
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
const editorFileInput = `<input id="edit-pick" type="file" accept="image/*" multiple>`;
let recentSaveTimer;

// ---------- screens ----------

function home() {
  const p = S.total ? Math.round(100 * S.done / S.total) : 0;
  return `
  <div class="top"><h2>Kadar</h2><button class="icon" data-act="settings" aria-label="Settings">${ICON.gear}</button></div>
  <main class="home">
    ${S.busy ? `
      <div class="progress" role="status">
        <div class="bar"><i style="width:${p}%"></i></div>
        <span class="num">${S.done} / ${S.total}</span>
      </div>` : `
      <section class="home-intro">
        <div class="wordmark">Kadar${RING.replace('class="ring"', 'class="ring" style="position:absolute"')}</div>
        <h1>Edit and improve your photos</h1>
        <p>Make an edit, recover a better frame from a series, or review photos you may not need.</p>
      </section>
      <div class="home-actions">
        <label class="btn primary">${editorFileInput}Choose photos to edit</label>
        ${S.recentEdit ? `<button class="btn recent-action" data-act="resumeRecent">Resume recent edit <span>${S.recentEdit.count} photos</span></button>` : ''}
        <label class="btn secondary">${fileInput}Review a series</label>
      </div>
      <p class="library-note">Choose photos from your library when prompted. Kadar can’t browse or delete your library in the background.</p>`}
    ${S.error ? `<p class="err">${esc(S.error)}</p>` : ''}
    ${S.recentError ? `<p class="err" role="status">${esc(S.recentError)}</p>` : ''}
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
    <button class="btn" data-act="deletes" ${d ? '' : 'disabled'}>Review delete suggestions</button>
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
    <h2>Review series <span class="num">${s.id}</span> / <span class="num">${S.series.length}</span></h2>
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
  const items = editorItems();
  const it = editorItem();
  const index = editorIndex();
  const seriesFeatures = S.editorMode === 'cull';
  const sharpest = seriesFeatures ? sharpestFrameIndex(items) : -1;
  const faceMatches = seriesFeatures ? bestFaceSources(items, index) : [];
  const faceSources = it.adjustments?.faceSources || [];
  const fusion = it.adjustments?.fusion;
  const edits = it.adjustments || { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
  const crop = cropRect(it.w, it.h, edits.crop);
  const aspect = crop.width / crop.height;
  const controls = [
    ['exposure', 'Exposure', -2, 2, 0.1, `${Number(edits.exposure).toFixed(1)} EV`],
    ['contrast', 'Contrast', -50, 50, 1, `${edits.contrast}%`],
    ['saturation', 'Colour', 0, 200, 1, `${edits.saturation}%`],
    ['sharpness', 'Sharpen', 0, 2, 0.1, `${Number(edits.sharpness).toFixed(1)}`],
  ];
  const focusPerson = edits.focusPerson;
  const focusMask = edits.focusMask;
  const focusMode = edits.focusMode || 'subject';
  const depthMap = edits.focusDepthMap;
  return `
  <div class="top">
    <button class="icon" data-act="editorBack" aria-label="Back">${ICON.back}</button>
    <h2>${seriesFeatures ? `Edit / fix frame <span class="num">${it.frame}</span>` : `Edit photo${items.length > 1 ? ` <span class="num">${index + 1} / ${items.length}</span>` : ''}`}</h2>
    <div class="seg" role="group" aria-label="Before and after">
      <button data-act="compare" data-v="before" aria-pressed="${S.compare === 'before'}">Before</button>
      <button data-act="compare" data-v="after" aria-pressed="${S.compare === 'after'}">After</button>
    </div>
  </div>
  <div class="stage editor-stage">
    <div class="editor-photo ${S.focusBrush && focusMask ? 'brushing' : ''}" style="aspect-ratio:${crop.width}/${crop.height};width:min(100%,calc(52dvh * ${aspect}))">
      <img id="editorOriginal" src="${it.viewUrl}" alt="Original frame" ${S.compare === 'after' ? 'hidden' : ''}>
      <canvas id="editorCanvas" aria-label="Edited frame" ${S.compare === 'before' ? 'hidden' : ''}></canvas>
    </div>
  </div>
  ${!seriesFeatures && items.length > 1 ? `<div class="editor-nav">
    <button class="btn" data-act="editorPrev" ${index ? '' : 'disabled'}>${ICON.prev}Previous</button>
    <span class="num">${index + 1} / ${items.length}</span>
    <button class="btn" data-act="editorNext" ${index < items.length - 1 ? '' : 'disabled'}>Next${ICON.next}</button>
  </div>` : ''}
  <div class="focus-tools">
    <span>${S.focusBrush ? 'Paint the mask · ' : 'Tap photo to focus · '}${focusMode === 'depth'
      ? edits.focusDepth == null ? 'No focus plane selected' : 'Depth plane selected'
      : focusPerson == null ? 'None' : focusPerson ? 'Person' : 'Background'}</span>
    <div class="focus-actions">
      <div class="seg" role="group" aria-label="Focus method">
        <button data-act="focusMode" data-v="subject" aria-pressed="${focusMode === 'subject'}">Subject</button>
        <button data-act="focusMode" data-v="depth" aria-pressed="${focusMode === 'depth'}">Depth</button>
      </div>
      ${focusMode === 'depth' ? `
        <button class="btn" data-act="estimateDepth" ${S.editorFocusing ? 'disabled' : ''}>${S.editorFocusing ? 'Estimating…' : depthMap ? 'Re-estimate depth' : 'Estimate depth'}</button>
        <button class="btn" data-act="depthOverlay" aria-pressed="${Boolean(edits.depthOverlay)}" ${depthMap ? '' : 'disabled'}>Depth map</button>
      ` : `
        <button class="btn" data-act="focusOverlay" aria-pressed="${Boolean(edits.focusOverlay)}" ${focusMask ? '' : 'disabled'}>Mask</button>
        <button class="btn" data-act="focusBrush" aria-pressed="${S.focusBrush}" ${focusMask ? '' : 'disabled'}>Refine mask</button>
      `}
      <button class="btn" data-act="clearFocus" ${focusMode === 'depth' ? edits.focusDepth == null ? 'disabled' : '' : focusPerson == null ? 'disabled' : ''}>Reset focus</button>
      ${S.editorFocusing ? `<span role="status">${focusMode === 'depth' ? 'Estimating depth…' : 'Finding focus…'}</span>` : ''}
    </div>
    ${focusMode === 'depth' ? '<p class="depth-note">Depth estimation runs on this device. First use downloads the model; your photo is not uploaded.</p>' : ''}
    <label class="adjust"><span>Blur<output data-value="focusBlur">${Number(edits.focusBlur ?? 12)} px</output></span>
      <input type="range" data-focus-blur min="0" max="24" step="1" value="${edits.focusBlur ?? 12}" ${focusMode === 'depth'
        ? !depthMap || edits.focusDepth == null ? 'disabled' : ''
        : focusPerson == null ? 'disabled' : ''}>
    </label>
    <label class="adjust"><span>${focusMode === 'depth' ? 'Depth falloff' : 'Edge softness'}<output data-value="focusFeather">${Number(focusMode === 'depth' ? edits.focusDepthFalloff ?? 12 : edits.focusFeather ?? 0)}${focusMode === 'depth' ? '%' : ' px'}</output></span>
      <input type="range" data-focus-feather min="${focusMode === 'depth' ? 2 : 0}" max="${focusMode === 'depth' ? 40 : 24}" step="${focusMode === 'depth' ? 2 : 1}" value="${focusMode === 'depth' ? edits.focusDepthFalloff ?? 12 : edits.focusFeather ?? 0}" ${focusMode === 'depth'
        ? !depthMap || edits.focusDepth == null ? 'disabled' : ''
        : focusPerson == null ? 'disabled' : ''}>
    </label>
    ${focusMode === 'subject' && S.focusBrush && focusMask ? `<div class="focus-actions mask-brush">
      <div class="seg" role="group" aria-label="Brush effect">
        <button data-act="focusBrushTarget" data-v="sharp" aria-pressed="${S.focusBrushTarget === 'sharp'}">Keep sharp</button>
        <button data-act="focusBrushTarget" data-v="blur" aria-pressed="${S.focusBrushTarget === 'blur'}">Blur</button>
      </div>
      <label class="adjust"><span>Brush size <output data-value="focusBrushSize">${S.focusBrushSize} px</output></span>
        <input type="range" data-focus-brush-size min="4" max="48" step="2" value="${S.focusBrushSize}">
      </label>
    </div>` : ''}
  </div>
  <div class="crop-set"><span>Crop</span><div class="seg" role="group" aria-label="Crop aspect ratio">
  ${[['original', 'Original'], ['square', '1:1'], ['portrait', '4:5'], ['landscape', '3:2']].map(([value, label]) =>
  `<button data-act="crop" data-v="${value}" aria-pressed="${(edits.crop || 'original') === value}">${label}</button>`).join('')}
  </div></div>
  ${controls.map(([key, label, min, max, step, value]) => `
    <label class="adjust"><span>${label}<output data-value="${key}">${value}</output></span>
      <input type="range" data-adjust="${key}" min="${min}" max="${max}" step="${step}" value="${edits[key]}">
    </label>`).join('')}
  <p class="err editor-error" role="alert" ${S.editorError ? '' : 'hidden'}>${esc(S.editorError)}</p>
  <div class="editor-actions">
    ${seriesFeatures ? `
      <div class="recovery-tools">
        <strong>Fix with this series</strong>
        <span>Start with the sharpest frame. Fusion is for still scenes; moving subjects may ghost.</span>
        <button class="btn" data-act="pickSharpest" ${sharpest === index ? 'disabled' : ''}>Show sharpest frame</button>
        <button class="btn" data-act="${fusion ? 'undoFusion' : 'fuseSeries'}" ${!fusion && (items.length < 2 || S.editorFusing) ? 'disabled' : ''}>${S.editorFusing ? 'Fusing…' : fusion ? 'Undo fusion' : 'Fuse still-scene frames'}</button>
        ${faceSources.length
          ? `<button class="btn" data-act="clearFaces">Undo face repair</button>`
          : `<button class="btn" data-act="bestFaces" ${faceMatches.length ? '' : 'disabled'}>Try sibling-face repair${faceMatches.length ? ` (${faceMatches.length})` : ''}</button>`}
      </div>
    ` : ''}
    <button class="btn primary" data-act="saveEdited" ${S.editorSaving ? 'disabled' : ''}>${S.editorSaving ? 'Saving…' : 'Save copy'}</button>
  </div>`;
}

function deletesScreen() {
  const groups = S.series.map(s => ({ s, del: s.items.filter(i => decide(i) === 'delete') })).filter(g => g.del.length);
  return `
  <div class="top">
    <button class="icon" data-act="home" aria-label="Back">${ICON.back}</button>
    <h2>Delete suggestions <span class="num">${deletes().length}</span></h2>
  </div>
  <p class="delete-note">These are your review suggestions, not deleted files. Select and delete photos yourself in your Photos library; Kadar cannot remove them directly.</p>
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
  if (S.screen === 'editor' && S.editorMode === 'photos') scheduleRecentEditSave();
}

// ---------- actions ----------

function editorItems() {
  return S.editorMode === 'photos' ? S.editItems : S.series[S.si]?.items || [];
}

function editorIndex() {
  return S.editorMode === 'photos' ? S.editIndex : S.fi;
}

function editorItem() {
  return editorItems()[editorIndex()];
}

function setEditorError(message) {
  S.editorError = message;
  const error = document.querySelector('.editor-error');
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function rerank(regroup) {
  if (regroup) {
    S.series = rankAll(S.items, S.settings);
    S.si = Math.min(S.si, Math.max(0, S.series.length - 1));
    S.fi = 0;
  } else {
    for (const s of S.series) rankSeries(s, S.settings);
  }
}

async function openPhotosForEditing(files) {
  for (const it of S.editItems) URL.revokeObjectURL(it.viewUrl);
  S.editItems = [];
  let skipped = 0;
  for (const file of files) {
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      S.editItems.push({
        file, name: file.name, w: width, h: height, sourceW: width, sourceH: height,
        viewUrl: URL.createObjectURL(file),
        adjustments: { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' },
      });
    } catch (e) {
      skipped++;
      console.warn('photo could not be opened for editing', file.name, e);
    }
  }
  if (!S.editItems.length) {
    S.error = `Could not open any of the ${files.length} selected photos.`;
    render();
    loadRecentEdit().then(session => {
      if (session?.photos?.length) S.recentEdit = { count: session.photos.length, updatedAt: session.updatedAt };
      if (S.screen === 'home') render();
    }).catch(() => {});
    return;
  }
  S.error = '';
  S.recentError = '';
  S.editorMode = 'photos';
  S.editIndex = 0;
  S.focusBrush = false;
  S.focusPointer = null;
  S.screen = 'editor';
  S.compare = 'after';
  S.editorError = skipped
    ? `${skipped} of ${files.length} selected photos could not be opened and were skipped.`
    : '';
  render();
}

function scheduleRecentEditSave() {
  clearTimeout(recentSaveTimer);
  recentSaveTimer = setTimeout(async () => {
    if (!S.editItems.length) return;
    try {
      await saveRecentEdit(S.editItems, S.editIndex);
      S.recentEdit = { count: S.editItems.length, updatedAt: Date.now() };
      S.recentError = '';
    } catch (e) {
      S.recentError = 'Could not save this session on this device. Your current editing session is still open.';
    }
  }, 500);
}

async function resumeRecentEdit() {
  try {
    const session = await loadRecentEdit();
    if (!session?.photos?.length) {
      S.recentEdit = null;
      S.error = 'There is no saved editing session on this device.';
      render();
      return;
    }
    for (const it of S.editItems) URL.revokeObjectURL(it.viewUrl);
    S.editItems = session.photos.map(photo => {
      const file = new File([photo.blob], photo.name, {
        type: photo.type || photo.blob.type,
        lastModified: photo.lastModified || Date.now(),
      });
      return {
        file, name: photo.name, w: photo.width, h: photo.height,
        sourceW: photo.width, sourceH: photo.height,
        viewUrl: URL.createObjectURL(file), adjustments: photo.adjustments || {},
      };
    });
    S.editIndex = Math.max(0, Math.min(session.index || 0, S.editItems.length - 1));
    S.editorMode = 'photos';
    S.focusBrush = false;
    S.focusPointer = null;
    S.error = '';
    S.editorError = '';
    S.compare = 'after';
    S.screen = 'editor';
    render();
  } catch (e) {
    S.error = 'Could not reopen the saved session. Choose the photos again to continue.';
    render();
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

async function renderFaceRepairs(ctx, target, crop, imageWidth, imageHeight, canvasWidth, canvasHeight) {
  const matches = target.adjustments?.faceSources || [];
  const opened = new Map();
  const scaleX = canvasWidth / crop.width, scaleY = canvasHeight / crop.height;
  const padded = box => {
    const x = Math.max(0, box.x - box.w * 0.18), y = Math.max(0, box.y - box.h * 0.18);
    return { x, y, w: Math.min(1, box.x + box.w * 1.18) - x, h: Math.min(1, box.y + box.h * 1.18) - y };
  };
  try {
    for (const match of matches) {
      const targetFace = target.faces?.[match.faceIndex];
      const source = S.series[S.si].items[match.frameIndex];
      const sourceFace = source?.faces?.[match.sourceFaceIndex];
      if (!targetFace || !source || !sourceFace) continue;
      let donor = opened.get(match.frameIndex);
      if (!donor) {
        donor = await createImageBitmap(source.file, {
          resizeWidth: source.w, resizeHeight: source.h, resizeQuality: 'high',
        });
        opened.set(match.frameIndex, donor);
      }
      const dst = padded(targetFace.box), src = padded(sourceFace.box);
      const dx = (dst.x * imageWidth - crop.x) * scaleX;
      const dy = (dst.y * imageHeight - crop.y) * scaleY;
      const dw = dst.w * imageWidth * scaleX, dh = dst.h * imageHeight * scaleY;
      const patch = document.createElement('canvas');
      patch.width = Math.max(1, Math.round(dw));
      patch.height = Math.max(1, Math.round(dh));
      const patchCtx = patch.getContext('2d');
      patchCtx.drawImage(donor,
        src.x * donor.width, src.y * donor.height, src.w * donor.width, src.h * donor.height,
        0, 0, patch.width, patch.height);
      patchCtx.globalCompositeOperation = 'destination-in';
      patchCtx.save();
      patchCtx.translate(patch.width / 2, patch.height / 2);
      patchCtx.scale(patch.width / 2, patch.height / 2);
      const mask = patchCtx.createRadialGradient(0, 0, 0.72, 0, 0, 1);
      mask.addColorStop(0, 'rgba(0,0,0,1)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      patchCtx.fillStyle = mask;
      patchCtx.fillRect(-1, -1, 2, 2);
      patchCtx.restore();
      ctx.drawImage(patch, dx, dy);
    }
  } finally {
    for (const donor of opened.values()) donor.close();
  }
}

function grayThumbnail(pixels, width, height, thumbWidth, thumbHeight) {
  const gray = new Float32Array(thumbWidth * thumbHeight);
  for (let y = 0; y < thumbHeight; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) * height / thumbHeight));
    for (let x = 0; x < thumbWidth; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) * width / thumbWidth));
      const p = (sy * width + sx) * 4;
      gray[y * thumbWidth + x] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
    }
  }
  return gray;
}

async function makeBurstFusion(series, target) {
  const targetIndex = series.items.indexOf(target);
  const aspect = (target.sourceW || target.w) / (target.sourceH || target.h);
  const selected = [target, ...series.items
    .filter(item => item !== target &&
      Math.abs(((item.sourceW || item.w) / (item.sourceH || item.h)) / aspect - 1) < 0.03)
    .sort((a, b) => Math.abs(series.items.indexOf(a) - targetIndex) - Math.abs(series.items.indexOf(b) - targetIndex))
    .slice(0, 4)];
  if (selected.length < 2) throw new Error('No matching sibling frames');

  const sourceW = target.sourceW || target.w, sourceH = target.sourceH || target.h;
  const scale = Math.min(1, 1600 / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  const thumbWidth = Math.max(16, Math.round(width * 128 / Math.max(width, height)));
  const thumbHeight = Math.max(16, Math.round(height * 128 / Math.max(width, height)));
  const loadPixels = async item => {
    const bitmap = await createImageBitmap(item.file, {
      resizeWidth: width, resizeHeight: height, resizeQuality: 'high',
    });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    } finally {
      bitmap.close();
    }
  };

  const frames = [];
  let referenceGray;
  for (const item of selected) {
    const pixels = await loadPixels(item);
    const gray = grayThumbnail(pixels, width, height, thumbWidth, thumbHeight);
    if (!frames.length) {
      frames.push(pixels);
      referenceGray = gray;
      continue;
    }
    const shift = estimateTranslation(referenceGray, gray, thumbWidth, thumbHeight, 3);
    const shiftX = Math.round(shift.x * width / thumbWidth);
    const shiftY = Math.round(shift.y * height / thumbHeight);
    const aligned = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sourceX = x + shiftX, sourceY = y + shiftY;
        const destination = (y * width + x) * 4;
        const inside = sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height;
        const source = inside ? pixels : frames[0];
        const sourceOffset = inside ? (sourceY * width + sourceX) * 4 : destination;
        aligned[destination] = source[sourceOffset];
        aligned[destination + 1] = source[sourceOffset + 1];
        aligned[destination + 2] = source[sourceOffset + 2];
        aligned[destination + 3] = 255;
      }
    }
    frames.push(aligned);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const fused = ctx.createImageData(width, height);
  fused.data.set(medianFuse(frames, width, height));
  ctx.putImageData(fused, 0, 0);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Fusion export failed');
  return { blob, width, height };
}

async function createEditorBitmap(it, maxSide) {
  const fusion = it.adjustments?.fusion;
  const source = fusion?.blob || it.file;
  const width = fusion?.width || it.sourceW || it.w;
  const height = fusion?.height || it.sourceH || it.h;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const options = scale < 1 ? {
    resizeWidth: Math.max(1, Math.round(width * scale)),
    resizeHeight: Math.max(1, Math.round(height * scale)),
    resizeQuality: 'high',
  } : undefined;
  return createImageBitmap(source, options);
}

async function renderEditorPreview() {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;
  const it = editorItem();
  const token = ++S.previewToken;
  try {
    const bitmap = await createEditorBitmap(it, 1200);
    if (token !== S.previewToken || S.screen !== 'editor') { bitmap.close(); return; }
    let crop, imageWidth, imageHeight, ctx;
    try {
      crop = cropRect(bitmap.width, bitmap.height, it.adjustments?.crop);
      imageWidth = bitmap.width; imageHeight = bitmap.height;
      canvas.width = Math.max(1, Math.round(crop.width));
      canvas.height = Math.max(1, Math.round(crop.height));
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
    await renderFaceRepairs(ctx, it, crop, imageWidth, imageHeight, canvas.width, canvas.height);
    if (token !== S.previewToken || S.screen !== 'editor') return;
    applyFocusEffect(ctx, it.adjustments, crop, imageWidth, imageHeight, false);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    adjustPixels(pixels.data, canvas.width, canvas.height, it.adjustments);
    ctx.putImageData(pixels, 0, 0);
  } catch (e) {
    if (token === S.previewToken) setEditorError('Could not preview this photo. Try a smaller image.');
  }
}

function makeMaskCanvas(mask, softness = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    const alpha = Math.round(Math.max(0, Math.min(1, mask.data[i])) * 255);
    const p = i * 4;
    pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = 255;
    pixels.data[p + 3] = alpha;
  }
  ctx.putImageData(pixels, 0, 0);
  if (softness > 0) {
    const softened = document.createElement('canvas');
    softened.width = mask.width;
    softened.height = mask.height;
    const softenedCtx = softened.getContext('2d');
    softenedCtx.filter = `blur(${softness}px)`;
    softenedCtx.drawImage(canvas, 0, 0);
    return softened;
  }
  return canvas;
}

function applyFocusEffect(ctx, edits, crop, imageWidth, imageHeight, showDepthOverlay = true) {
  const depthMap = edits?.focusDepthMap;
  const depthFocus = edits?.focusMode === 'depth' && depthMap && Number.isFinite(edits.focusDepth);
  const mask = edits?.focusMode === 'depth'
    ? depthFocus ? depthFocusMask(depthMap, edits.focusDepth, Number(edits.focusDepthFalloff ?? 12) / 100) : null
    : edits?.focusMask;
  const focusPerson = edits?.focusMode === 'depth' ? depthFocus : edits?.focusPerson;
  const width = ctx.canvas.width, height = ctx.canvas.height;
  const maskSx = crop.x * (mask?.width || 1) / imageWidth;
  const maskSy = crop.y * (mask?.height || 1) / imageHeight;
  const maskSw = crop.width * (mask?.width || 1) / imageWidth;
  const maskSh = crop.height * (mask?.height || 1) / imageHeight;
  const depthSx = crop.x * (depthMap?.width || 1) / imageWidth;
  const depthSy = crop.y * (depthMap?.height || 1) / imageHeight;
  const depthSw = crop.width * (depthMap?.width || 1) / imageWidth;
  const depthSh = crop.height * (depthMap?.height || 1) / imageHeight;

  if (mask && focusPerson != null &&
      (Number(edits.focusBlur) > 0 || (edits.focusOverlay && !depthFocus))) {
    const blur = Math.max(0, Math.min(24, Number(edits.focusBlur) || 0)) *
      Math.max(imageWidth, imageHeight) / 1200;
    const margin = Math.ceil(blur * 2);
    const blurred = document.createElement('canvas');
    blurred.width = width + margin * 2;
    blurred.height = height + margin * 2;
    const blurCtx = blurred.getContext('2d');
    blurCtx.filter = `blur(${blur}px)`;
    blurCtx.drawImage(ctx.canvas, margin, margin);
    blurCtx.filter = 'none';

    const softness = depthFocus ? 0 :
      Math.max(0, Math.min(24, Number(edits.focusFeather) || 0)) * mask.width / imageWidth;
    const maskCanvas = makeMaskCanvas(mask, softness);
    ctx.globalCompositeOperation = focusPerson ? 'destination-in' : 'destination-out';
    ctx.drawImage(maskCanvas, maskSx, maskSy, maskSw, maskSh, 0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(blurred, margin, margin, width, height, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    if (edits.focusOverlay && !depthFocus) {
      const overlay = document.createElement('canvas');
      overlay.width = mask.width;
      overlay.height = mask.height;
      const overlayCtx = overlay.getContext('2d');
      overlayCtx.fillStyle = '#F2C230';
      overlayCtx.fillRect(0, 0, overlay.width, overlay.height);
      overlayCtx.globalCompositeOperation = focusPerson ? 'destination-in' : 'destination-out';
      overlayCtx.drawImage(maskCanvas, 0, 0);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(overlay, maskSx, maskSy, maskSw, maskSh, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }

  if (showDepthOverlay && edits?.focusMode === 'depth' && edits.depthOverlay && depthMap) {
    const overlay = document.createElement('canvas');
    overlay.width = depthMap.width;
    overlay.height = depthMap.height;
    const overlayCtx = overlay.getContext('2d');
    const pixels = overlayCtx.createImageData(depthMap.width, depthMap.height);
    pixels.data.set(colorizeDepth(depthMap));
    overlayCtx.putImageData(pixels, 0, 0);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(overlay, depthSx, depthSy, depthSw, depthSh, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}

async function getFocusMask(it) {
  if (it.adjustments?.focusMask) return it.adjustments.focusMask;
  const { segmentForeground } = await import('./focus.js');
  const bitmap = await createEditorBitmap(it, 1200);
  try {
    const mask = await segmentForeground(bitmap);
    it.adjustments.focusMask = mask;
    return mask;
  } finally {
    bitmap.close();
  }
}

async function getDepthMap(it) {
  if (it.adjustments?.focusDepthMap) return it.adjustments.focusDepthMap;
  const { estimateDepth } = await import('./depth.js');
  const bitmap = await createEditorBitmap(it, 512);
  try {
    const input = document.createElement('canvas');
    input.width = bitmap.width;
    input.height = bitmap.height;
    input.getContext('2d').drawImage(bitmap, 0, 0);
    const depth = await estimateDepth(input);
    it.adjustments.focusDepthMap = depth;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
    return depth;
  } finally {
    bitmap.close();
  }
}

async function estimateDepthForCurrent() {
  if (S.editorFocusing) return;
  const it = editorItem();
  it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
  S.editorFocusing = true;
  S.editorError = '';
  render();
  try {
    await getDepthMap(it);
    it.adjustments.depthOverlay = true;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
  } catch (e) {
    S.editorError = 'Could not estimate depth. Check your connection for the first model download, then try a smaller photo.';
  } finally {
    S.editorFocusing = false;
    render();
  }
}

async function selectFocus(event, photo) {
  if (S.editorFocusing) return;
  const it = editorItem();
  const rect = photo.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  S.editorFocusing = true;
  S.editorError = '';
  render();
  try {
    it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
    const sourceWidth = it.adjustments?.fusion?.width || it.sourceW || it.w;
    const sourceHeight = it.adjustments?.fusion?.height || it.sourceH || it.h;
    const crop = cropRect(sourceWidth, sourceHeight, it.adjustments?.crop);
    const sourceX = (crop.x + x * crop.width) / sourceWidth;
    const sourceY = (crop.y + y * crop.height) / sourceHeight;
    if (it.adjustments.focusMode === 'depth') {
      const depth = await getDepthMap(it);
      it.adjustments.focusDepth = depthAt(depth, sourceX, sourceY);
      it.adjustments.focusBlur ??= 12;
      it.adjustments.focusDepthFalloff ??= 12;
    } else {
      const mask = await getFocusMask(it);
      const focusPerson = isForegroundAt(mask, sourceX, sourceY);
      it.adjustments.focusPerson = focusPerson;
      it.adjustments.focusBlur ??= 12;
    }
    if (S.editorMode === 'photos') scheduleRecentEditSave();
  } catch (e) {
    S.editorError = it.adjustments?.focusMode === 'depth'
      ? 'Could not estimate depth. Check your connection for the first model download, then try a smaller photo.'
      : 'Could not find the subject mask. Connect to the internet once, then try again.';
  } finally {
    S.editorFocusing = false;
    render();
  }
}

function paintFocusMask(event, photo) {
  const it = editorItem();
  const mask = it.adjustments?.focusMask;
  const rect = photo.getBoundingClientRect();
  if (!mask || !rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) return;

  const crop = cropRect(it.adjustments?.fusion?.width || it.sourceW || it.w,
    it.adjustments?.fusion?.height || it.sourceH || it.h, it.adjustments?.crop);
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const sourceX = (crop.x + x * crop.width) / (it.adjustments?.fusion?.width || it.sourceW || it.w);
  const sourceY = (crop.y + y * crop.height) / (it.adjustments?.fusion?.height || it.sourceH || it.h);
  const keepSharp = S.focusBrushTarget === 'sharp';
  const maskValue = keepSharp === Boolean(it.adjustments.focusPerson) ? 1 : 0;
  paintMask(mask, sourceX, sourceY, S.focusBrushSize, maskValue);
  if (S.editorMode === 'photos') scheduleRecentEditSave();
  requestAnimationFrame(renderEditorPreview);
}

async function saveEdited() {
  const it = editorItem();
  S.editorSaving = true;
  S.editorError = '';
  render();
  try {
    const bitmap = await createEditorBitmap(it, 4096);
    let crop, imageWidth, imageHeight, canvas, ctx;
    try {
      crop = cropRect(bitmap.width, bitmap.height, it.adjustments?.crop);
      imageWidth = bitmap.width; imageHeight = bitmap.height;
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(crop.width));
      canvas.height = Math.max(1, Math.round(crop.height));
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
    await renderFaceRepairs(ctx, it, crop, imageWidth, imageHeight, canvas.width, canvas.height);
    if (it.adjustments?.focusPerson != null && !it.adjustments.focusMask) await getFocusMask(it);
    applyFocusEffect(ctx, it.adjustments, crop, imageWidth, imageHeight);
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
    S.screen = S.editorMode === 'cull' ? 'review' : 'editor';
  } catch (e) {
    if (!e || e.name !== 'AbortError') setEditorError('Could not save the edited photo. Try a smaller image.');
  } finally {
    S.editorSaving = false;
    render();
  }
}

async function fuseSeries() {
  const series = S.series[S.si];
  const target = editorItem();
  S.editorFusing = true;
  S.focusBrush = false;
  S.focusPointer = null;
  S.editorError = '';
  render();
  try {
    const fusion = await makeBurstFusion(series, target);
    target.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
    target.adjustments.fusion = fusion;
    delete target.adjustments.focusMask;
    target.adjustments.focusPerson = null;
    target.adjustments.focusOverlay = false;
    S.compare = 'after';
  } catch (e) {
    S.editorError = 'Could not fuse these frames. Try a shorter series with a still scene.';
  } finally {
    S.editorFusing = false;
    render();
  }
}

function step(df) {
  const s = S.series[S.si];
  const n = S.fi + df;
  if (n >= 0 && n < s.items.length) { S.fi = n; render(); }
}

function stepEditor(df) {
  const n = S.editIndex + df;
  if (n < 0 || n >= S.editItems.length) return;
  S.editIndex = n;
  S.focusBrush = false;
  S.focusPointer = null;
  S.editorError = '';
  render();
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
  if (e.target.id === 'pick' && e.target.files.length) {
    const files = [...e.target.files];
    e.target.value = '';
    analyze(files);
  }
  if (e.target.id === 'edit-pick' && e.target.files.length) {
    const files = [...e.target.files];
    e.target.value = '';
    openPhotosForEditing(files);
  }
});

$app.addEventListener('input', e => {
  const brushSize = e.target.closest('[data-focus-brush-size]');
  if (brushSize && S.screen === 'editor') {
    S.focusBrushSize = Number(brushSize.value);
    const output = $app.querySelector('[data-value="focusBrushSize"]');
    if (output) output.textContent = `${brushSize.value} px`;
    return;
  }
  const focusBlur = e.target.closest('[data-focus-blur]');
  if (focusBlur && S.screen === 'editor') {
    const it = editorItem();
    it.adjustments.focusBlur = Number(focusBlur.value);
    const output = $app.querySelector('[data-value="focusBlur"]');
    if (output) output.textContent = `${focusBlur.value} px`;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
    requestAnimationFrame(renderEditorPreview);
    return;
  }
  const focusFeather = e.target.closest('[data-focus-feather]');
  if (focusFeather && S.screen === 'editor') {
    const it = editorItem();
    const depthMode = it.adjustments?.focusMode === 'depth';
    it.adjustments[depthMode ? 'focusDepthFalloff' : 'focusFeather'] = Number(focusFeather.value);
    const output = $app.querySelector('[data-value="focusFeather"]');
    if (output) output.textContent = `${focusFeather.value}${depthMode ? '%' : ' px'}`;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
    requestAnimationFrame(renderEditorPreview);
    return;
  }
  const input = e.target.closest('[data-adjust]');
  if (!input || S.screen !== 'editor') return;
  const it = editorItem();
  it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
  it.adjustments[input.dataset.adjust] = Number(input.value);
  const output = $app.querySelector(`[data-value="${input.dataset.adjust}"]`);
  if (output) {
    const { exposure, contrast, saturation, sharpness } = it.adjustments;
    output.textContent = input.dataset.adjust === 'exposure' ? `${exposure.toFixed(1)} EV`
      : input.dataset.adjust === 'sharpness' ? sharpness.toFixed(1)
      : `${input.value}%`;
  }
  if (S.editorMode === 'photos') scheduleRecentEditSave();
  requestAnimationFrame(renderEditorPreview);
});

$app.addEventListener('pointerdown', e => {
  const photo = e.target.closest('.editor-photo');
  if (!photo || S.screen !== 'editor' || !S.focusBrush || !editorItem().adjustments?.focusMask) return;
  e.preventDefault();
  S.focusPointer = e.pointerId;
  photo.setPointerCapture(e.pointerId);
  paintFocusMask(e, photo);
});

$app.addEventListener('pointermove', e => {
  if (S.focusPointer !== e.pointerId) return;
  const photo = e.target.closest('.editor-photo') || $app.querySelector('.editor-photo');
  if (photo) paintFocusMask(e, photo);
});

$app.addEventListener('pointerup', e => {
  if (S.focusPointer === e.pointerId) S.focusPointer = null;
});
$app.addEventListener('pointercancel', e => {
  if (S.focusPointer === e.pointerId) S.focusPointer = null;
});

$app.addEventListener('click', e => {
  const photo = e.target.closest('.editor-photo');
  if (photo && S.screen === 'editor') {
    if (S.focusBrush && editorItem().adjustments?.focusMask) return;
    selectFocus(e, photo);
    return;
  }
  const t = e.target.closest('[data-act]');
  if (!t) return;
  if (t.dataset.act === 'close' && e.target.closest('[data-stop]') && !e.target.closest('button[data-act=close]')) return;
  const a = t.dataset.act;
  if (a === 'settings') { S.sheet = true; render(); }
  else if (a === 'close') { S.sheet = false; render(); }
  else if (a === 'resumeRecent') resumeRecentEdit();
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
    it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
    S.editorMode = 'cull';
    S.focusBrush = false;
    S.focusPointer = null;
    S.compare = 'after'; S.editorError = ''; S.screen = 'editor'; render();
  }
  else if (a === 'editorBack') { S.focusBrush = false; S.focusPointer = null; S.screen = S.editorMode === 'cull' ? 'review' : 'home'; render(); }
  else if (a === 'editorPrev' && S.editorMode === 'photos') stepEditor(-1);
  else if (a === 'editorNext' && S.editorMode === 'photos') stepEditor(1);
  else if (a === 'compare') { S.compare = t.dataset.v; render(); }
  else if (a === 'fuseSeries') fuseSeries();
  else if (a === 'undoFusion') {
    const it = editorItem();
    S.focusBrush = false;
    S.focusPointer = null;
    delete it.adjustments.fusion;
    delete it.adjustments.focusMask;
    it.adjustments.focusPerson = null;
    it.adjustments.focusOverlay = false;
    render();
  }
  else if (a === 'focusOverlay') {
    const it = editorItem();
    it.adjustments.focusOverlay = !it.adjustments.focusOverlay;
    render();
  }
  else if (a === 'focusMode') {
    const it = editorItem();
    it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
    it.adjustments.focusMode = t.dataset.v;
    S.editorError = '';
    S.focusBrush = false;
    S.focusPointer = null;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
    render();
  }
  else if (a === 'estimateDepth') estimateDepthForCurrent();
  else if (a === 'depthOverlay') {
    const it = editorItem();
    it.adjustments.depthOverlay = !it.adjustments.depthOverlay;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
    render();
  }
  else if (a === 'focusBrush') {
    S.focusBrush = !S.focusBrush;
    if (S.focusBrush) editorItem().adjustments.focusOverlay = true;
    S.focusPointer = null;
    render();
  }
  else if (a === 'focusBrushTarget') {
    S.focusBrushTarget = t.dataset.v;
    render();
  }
  else if (a === 'clearFocus') {
    const it = editorItem();
    if (it.adjustments.focusMode === 'depth') {
      it.adjustments.focusDepth = null;
    } else {
      it.adjustments.focusPerson = null;
      it.adjustments.focusOverlay = false;
    }
    S.focusBrush = false;
    S.focusPointer = null;
    if (S.editorMode === 'photos') scheduleRecentEditSave();
    render();
  }
  else if (a === 'crop') {
    const it = editorItem();
    it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
    it.adjustments.crop = t.dataset.v;
    render();
  }
  else if (a === 'bestFaces') {
    const items = editorItems();
    const index = editorIndex();
    const it = editorItem();
    const matches = bestFaceSources(items, index);
    if (matches.length) {
      it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
      it.adjustments.faceSources = matches;
      S.editorError = '';
      render();
    }
  }
  else if (a === 'clearFaces') {
    delete editorItem().adjustments.faceSources;
    render();
  }
  else if (a === 'pickSharpest') {
    const items = editorItems();
    const sharpest = sharpestFrameIndex(items);
    if (sharpest >= 0) {
      S.fi = sharpest;
      S.compare = 'after';
      S.editorError = '';
      const it = editorItem();
      it.adjustments ||= { exposure: 0, contrast: 0, saturation: 100, sharpness: 0, crop: 'original' };
      render();
    }
  }
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
  if (S.sheet || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (S.screen === 'review') {
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
    return;
  }
  if (S.screen !== 'editor' || S.editorMode !== 'photos') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stepEditor(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepEditor(-1); }
});

render();
