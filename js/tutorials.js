// Guided tutorials: pure data and logic (no DOM). The runner lives in js/app.js.
// A step: { target, text, screen?, group?, requires? }
//  target   CSS selector to spotlight (card is centred when it is missing or omitted)
//  screen   screen the step belongs to; the runner navigates there when it can
//  group    editor group to open (looks, light, colour, detail, focus, crop)
//  requires state keys that must hold (see meets) or the step is skipped
// start: 'home' | 'editor'. 'editor' tutorials open the bundled sample photo.

const h = id => `[data-help="${id}"]`;

export const TUTORIALS = [
  { id: 'first-edit', title: 'Pick a photo and start editing', start: 'home', steps: [
    { screen: 'home', target: h('home-choose'), text: 'Tap Choose photos to edit to pick one or more pictures from your library. Kadar edits a copy, so your original is never changed.' },
    { screen: 'home', target: h('home-resume'), requires: 'recent', text: 'Resume recent edit reopens your last session with all its adjustments. It is stored only on this device and can be cleared by the browser.' },
    { screen: 'home', target: h('sample-photo'), text: 'No photo handy? Try with sample photo opens a built-in picture so you can practise safely.' },
    { screen: 'home', target: h('home-review'), text: 'Review a series is different: it compares a burst of similar shots and suggests which to keep. Use it when you have many near-duplicates.' },
  ] },
  { id: 'looks', title: 'Quick fix with Looks', start: 'editor', steps: [
    { screen: 'editor', group: 'looks', target: h('group-looks'), text: 'Looks are one-tap styles. Open this section to see them.' },
    { screen: 'editor', group: 'looks', target: h('look'), text: 'Tap Warm, Vivid or Mono to apply a style. Natural changes nothing.' },
    { screen: 'editor', group: 'looks', target: h('slider-lookAmount'), text: 'Drag Look strength to blend the style in or out until it feels right.' },
    { screen: 'editor', target: h('compare-before'), text: 'Tap Before to see the original, then After to see your edit. Your edits are never lost by comparing.' },
  ] },
  { id: 'brightness', title: 'Fix brightness and contrast', start: 'editor', steps: [
    { screen: 'editor', group: 'light', target: h('slider-exposure'), text: 'Brightness lightens or darkens the whole photo. Small moves work best.' },
    { screen: 'editor', group: 'light', target: h('slider-highlights'), text: 'Highlights recovers bright areas like sky without changing the rest.' },
    { screen: 'editor', group: 'light', target: h('slider-shadows'), text: 'Shadows reveals detail in dark areas. Raise it gently to avoid a flat look.' },
    { screen: 'editor', group: 'light', target: `${h('slider-exposure')} ${h('reset-control')}`, text: 'Each slider has its own Reset button. Use it when one adjustment goes too far.' },
  ] },
  { id: 'colour', title: 'Fix colour', start: 'editor', steps: [
    { screen: 'editor', group: 'colour', target: h('slider-temperature'), text: 'Warmth moves between cool blue and warm orange. Use it to fix a colour cast.' },
    { screen: 'editor', group: 'colour', target: h('slider-tint'), text: 'Tint removes green or magenta casts left after adjusting warmth.' },
    { screen: 'editor', group: 'colour', target: h('slider-saturation'), text: 'Colour intensity makes colours bolder or calmer. 100% means no change.' },
    { screen: 'editor', group: 'colour', target: h('hsl-group'), advanced: true, text: 'In Advanced mode, Colour mix tunes one colour family, such as only the blues.' },
  ] },
  { id: 'crop', title: 'Crop, rotate and straighten', start: 'editor', steps: [
    { screen: 'editor', group: 'crop', target: h('crop-ratio'), text: 'Choose a crop shape: Original, square 1:1, portrait 4:5, landscape 3:2 or Free.' },
    { screen: 'editor', group: 'crop', target: h('rotate'), text: 'Rotate turns the photo 90 degrees each tap.' },
    { screen: 'editor', group: 'crop', target: h('slider-straighten'), text: 'Straighten levels a tilted horizon. Tilting leaves transparent corners.' },
    { screen: 'editor', group: 'crop', target: h('slider-cropScale'), text: 'Lower Crop size to trim those corners away.' },
  ] },
  { id: 'local', title: 'Edit only part of a photo', start: 'editor', steps: [
    { screen: 'editor', group: 'detail', advanced: true, target: h('local-brush'), text: 'Tap the brush, then paint over the area you want to change with your finger.' },
    { screen: 'editor', group: 'detail', advanced: true, target: h('local-gradient'), text: 'Or use a gradient: drag across the photo to place a soft band, such as over a sky.' },
    { screen: 'editor', group: 'detail', advanced: true, target: h('group-detail'), text: 'After painting or placing a gradient, sliders such as local brightness change only that area. Tap Done when finished.' },
  ] },
  { id: 'heal', title: 'Remove a small blemish', start: 'editor', steps: [
    { screen: 'editor', group: 'detail', advanced: true, target: h('heal'), text: 'Tap Heal small spot, then tap a dust speck or blemish on the photo.' },
    { screen: 'editor', group: 'detail', advanced: true, target: h('editor-photo'), text: 'Healing blends the spot with its surroundings. It works on tiny spots in smooth areas, not on large objects or busy textures.' },
    { screen: 'editor', target: h('undo'), text: 'If the result looks wrong, tap Undo.' },
  ] },
  { id: 'focus', title: 'Blur the background', start: 'editor', steps: [
    { screen: 'editor', group: 'focus', advanced: true, target: h('focus-subject'), text: 'Subject mode finds people. Tap a person on the photo to keep them sharp.' },
    { screen: 'editor', group: 'focus', advanced: true, target: h('focus-depth'), text: 'Depth mode estimates distance instead. Estimate it, then tap what should stay sharp.' },
    { screen: 'editor', group: 'focus', advanced: true, target: h('slider-focusBlur'), text: 'Blur sets how strong the background blur is. It unlocks after you choose what stays sharp.' },
    { screen: 'editor', group: 'focus', advanced: true, target: h('focus-overlay'), text: 'Mask and depth overlays let you check what Kadar detected. Refine mask lets you paint corrections.' },
  ] },
  { id: 'series', title: 'Review a series of similar photos', start: 'home', steps: [
    { screen: 'home', target: h('home-review'), text: 'Tap Review a series and choose a burst of similar photos. Analysis runs on your phone, and nothing is uploaded.' },
    { screen: 'series', requires: 'series', target: h('series-row'), text: 'Each row is a series of similar photos. Tap one to inspect its frames.' },
    { screen: 'review', requires: 'series', target: h('decide-keep'), text: 'Keep or Delete each frame. Coloured chips explain why Kadar suggests deleting; hold a chip to learn what it means.' },
    { screen: 'series', requires: 'series', target: h('save-keepers'), text: 'Save keepers opens the share sheet with your chosen photos.' },
    { screen: 'series', requires: 'series', target: h('review-deletes'), text: 'Review delete suggestions lists the rest. Kadar cannot delete from your library, so remove them yourself in Photos.' },
  ] },
  { id: 'rescue', title: 'Rescue a bad shot, undo and save', start: 'editor', steps: [
    { screen: 'editor', requires: 'cull', target: h('pick-sharpest'), text: 'Show sharpest frame switches to the best-focused shot in the series.' },
    { screen: 'editor', requires: 'cull', target: h('fuse'), text: 'Fuse still-scene frames blends similar shots to reduce noise. Moving subjects can ghost.' },
    { screen: 'editor', requires: 'cull', target: h('best-faces'), text: 'Sibling-face repair can swap in a sharper, open-eyed face from another frame. Inspect the seams.' },
    { screen: 'editor', target: h('undo'), text: 'Undo and Redo step through your changes, so you can experiment freely.' },
    { screen: 'editor', group: 'looks', target: h('save-look'), text: 'Happy with a style? Name it above and tap Save current look to reuse it on other photos.' },
    { screen: 'editor', target: h('save-copy'), text: 'Save copy exports your edited photo as a new JPEG. The original is unchanged.' },
  ] },
];

// ctx: { screen, mode, hasSeries, recent, advanced }
export function meets(requires, ctx) {
  if (!requires) return true;
  return [].concat(requires).every(key => {
    if (key === 'series') return Boolean(ctx.hasSeries);
    if (key === 'recent') return Boolean(ctx.recent);
    if (key === 'cull') return ctx.screen === 'editor' && ctx.mode === 'cull';
    if (key === 'editor') return ctx.screen === 'editor';
    return false;
  });
}

// Index of the next step from `from` in direction `dir` (+1/-1) whose requirements hold, or -1.
export function stepIndex(tutorial, from, dir, ctx) {
  for (let i = from + dir; i >= 0 && i < tutorial.steps.length; i += dir) {
    if (meets(tutorial.steps[i].requires, ctx)) return i;
  }
  return -1;
}

export const firstStep = (tutorial, ctx) =>
  meets(tutorial.steps[0]?.requires, ctx) ? 0 : stepIndex(tutorial, 0, 1, ctx);

export const STORAGE_KEY = 'kadar.tutorials';

export function loadProgress(storage) {
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    const known = new Set(TUTORIALS.map(t => t.id));
    return {
      done: Array.isArray(data.done) ? data.done.filter(id => known.has(id)) : [],
      dismissed: Boolean(data.dismissed),
    };
  } catch { return { done: [], dismissed: false }; }
}

export function saveProgress(storage, progress) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* private mode */ }
}

export const markDone = (progress, id) =>
  progress.done.includes(id) ? progress : { ...progress, done: [...progress.done, id] };

export const resetProgress = () => ({ done: [], dismissed: false });
