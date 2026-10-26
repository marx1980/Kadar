// Long-press help: hold any [data-help] control to see a short explanation.
import { HELP } from './help.js';

const HOLD_MS = 500;
const HOVER_MS = 700;
const MOVE_PX = 6;
const AUTO_HIDE_MS = 8000;

export function initHelp(root, { enabled = () => true } = {}) {
  const tip = document.createElement('div');
  tip.id = 'help-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  const text = document.createElement('p');
  const gotIt = document.createElement('button');
  gotIt.type = 'button';
  gotIt.textContent = 'Got it';
  tip.append(text, gotIt);
  document.body.appendChild(tip);

  let timer = 0, hideTimer = 0, start = null, suppressClick = false, described = null;

  const find = el => el?.closest?.('[data-help]');
  function hide() {
    clearTimeout(hideTimer);
    tip.classList.remove('show');
    tip.hidden = true;
    described?.removeAttribute('aria-describedby');
    described = null;
  }
  function show(el) {
    const message = HELP[el.dataset.help];
    if (!message || !enabled()) return false;
    hide();
    text.textContent = message;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    let top = r.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    el.setAttribute('aria-describedby', 'help-tip');
    described = el;
    requestAnimationFrame(() => tip.classList.add('show'));
    hideTimer = setTimeout(hide, AUTO_HIDE_MS);
    return true;
  }
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };

  root.addEventListener('pointerdown', e => {
    if (tip.contains(e.target)) return;
    hide();
    const el = find(e.target);
    if (!el || !enabled() || e.pointerType === 'mouse') return;
    const input = e.target.matches?.('input[type=range]') ? e.target : null;
    start = { x: e.clientX, y: e.clientY, el, input, value: input ? input.value : null };
    timer = setTimeout(() => {
      const s = start;
      timer = 0;
      if (!s || !show(s.el)) return;
      suppressClick = true;
      if (s.input && s.value !== null && s.input.value !== s.value) {
        s.input.value = s.value;
        s.input.dispatchEvent(new Event('input', { bubbles: true }));
        s.input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, HOLD_MS);
  }, true);
  root.addEventListener('pointermove', e => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) cancel();
  }, true);
  for (const type of ['pointerup', 'pointercancel']) {
    root.addEventListener(type, () => { cancel(); setTimeout(() => { suppressClick = false; }, 350); }, true);
  }
  root.addEventListener('click', e => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  root.addEventListener('contextmenu', e => { if (find(e.target) && enabled()) e.preventDefault(); });

  // Mouse: hover for a moment. Keyboard: press ? while a control is focused.
  let hoverTimer = 0;
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = find(e.target);
    clearTimeout(hoverTimer);
    if (el && enabled()) hoverTimer = setTimeout(() => show(el), HOVER_MS);
  });
  root.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer);
    if (described && !described.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hide();
    if ((e.key === '?' || e.key === 'F1') && !e.target.closest?.('input[type=text], textarea')) {
      const el = find(document.activeElement);
      if (el && show(el)) e.preventDefault();
    }
  });
  document.addEventListener('pointerdown', e => { if (!tip.hidden && !tip.contains(e.target) && !find(e.target)) hide(); }, true);
  gotIt.addEventListener('click', hide);
  return { hide, show };
}
