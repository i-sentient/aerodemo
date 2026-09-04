import { bedById } from './ontology.js';
import { onModeChange, onThemeChange, setTheme, state } from './state.js';

// one light/dark toggle in the top bar; the body class flips the CSS vars for
// all three splits, and subscribers (chat, 3D scene) restyle themselves.
const SUN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6z"/></svg>';
function initTheme() {
  const btn = document.getElementById('themeBtn');
  const render = (dark) => {
    document.body.classList.toggle('theme-dark', dark);
    if (btn) btn.innerHTML = dark ? SUN : MOON; // show what you'd switch TO
  };
  onThemeChange(render);
  render(state.dark); // light default
  if (btn) btn.onclick = () => setTheme(!state.dark);
}

// the three splits are user-resizable: each gutter drags the boundary between
// its two neighbouring panels (fractions live in --fA/--fB/--fC on #panels).
const MIN_FR = 16; // no split narrower than ~16% of the row
// chapters whose 3-split has been framed by hand (see initSplits)
const TUNED_SPLIT = new Set(['workup', 'continued']);
function initSplits() {
  const panels = document.getElementById('panels');
  if (!panels) return;
  // Pre-cath opens 37 / 35 / 27 — hand-tuned on the gutters rather than reasoned
  // to, which is why it is not a round ratio. The patient leads by a hair, the
  // agents sit just under it, and the record takes what is left: enough to watch
  // TARS move through it, not enough to compete with the two panels the scene is
  // actually about. (These are `fr` units, so they are RATIOS — they do not need
  // to total 100, and normalising them would only change the numbers, not the
  // layout.)
  // Post-cath is the same three-panel scene with the same job — a body on the
  // left, the agent reasoning in the middle, the record on the right — so it
  // takes the same framing. A set rather than a chapter comparison: the PODs
  // will want it too once they are looked at, and that should be one word.
  const fr = TUNED_SPLIT.has(state.chapter)
    ? { A: 37, B: 35, C: 27 }
    : { A: 100 / 3, B: 100 / 3, C: 100 / 3 };
  // during a drag only the CSS fractions move (the canvas stretches); the real
  // WebGL re-fit happens ONCE on release — per-frame composer resizes flash black
  const apply = () => {
    panels.style.setProperty('--fA', fr.A + 'fr');
    panels.style.setProperty('--fB', fr.B + 'fr');
    panels.style.setProperty('--fC', fr.C + 'fr');
  };
  // ...and apply it ONCE up front. `fr` used to be pure bookkeeping — nothing
  // called apply() until a drag or the Panel C fold, so the opening layout came
  // from styles.css's `var(--fA, 1fr)` fallback and was always equal thirds no
  // matter what this object said. Safe here: .anim is only added by the fold,
  // so the initial split lands rather than sliding in.
  apply();
  const wire = (id, left, right) => {
    const g = document.getElementById(id);
    if (!g) return;
    g.addEventListener('pointerdown', (e) => {
      if (id === 'gutBC' && document.body.classList.contains('pc-collapsed')) return; // nothing to drag
      e.preventDefault();
      g.classList.add('dragging');
      document.body.classList.add('resizing');
      const startX = e.clientX, startL = fr[left], startR = fr[right];
      const pair = startL + startR;
      const end = () => {
        g.classList.remove('dragging');
        document.body.classList.remove('resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        window.dispatchEvent(new Event('resize')); // settle the 3D canvas once
      };
      const onMove = (ev) => {
        if (!ev.buttons) return end(); // button no longer held → never resize on hover
        const dPct = ((ev.clientX - startX) / panels.clientWidth) * 100;
        fr[left] = Math.min(Math.max(startL + dPct, MIN_FR), pair - MIN_FR);
        fr[right] = pair - fr[left];
        apply();
      };
      // window-level listeners: the drag can't strand handlers on the gutter
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  };
  wire('gutAB', 'A', 'B');
  wire('gutBC', 'B', 'C');

  // Panel C folds away behind the chevron on the B|C gutter. The freed width
  // goes to A and B in whatever proportion the user has already dragged them
  // to, and comes back exactly as it was on re-open.
  const pcBtn = document.getElementById('pcToggle');
  let savedFr = null;                                   // non-null ⇒ collapsed
  const setCollapsed = (on) => {
    if (on === !!savedFr) return;
    panels.classList.add('anim');
    if (on) {
      savedFr = { ...fr };
      const tot = fr.A + fr.B;
      fr.A += fr.C * (fr.A / tot); fr.B += fr.C * (fr.B / tot); fr.C = 0;
    } else { Object.assign(fr, savedFr); savedFr = null; }
    document.body.classList.toggle('pc-collapsed', on);
    if (pcBtn) {
      pcBtn.setAttribute('aria-expanded', String(!on));
      const lbl = on ? 'Show clinical apps' : 'Hide clinical apps';
      pcBtn.setAttribute('aria-label', lbl); pcBtn.title = lbl;
    }
    apply();
    // one settle after the fold, same as the drag-release path
    setTimeout(() => { panels.classList.remove('anim'); window.dispatchEvent(new Event('resize')); }, 320);
  };
  if (pcBtn) {
    pcBtn.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't start a gutter drag
    pcBtn.addEventListener('click', (e) => { e.stopPropagation(); setCollapsed(!savedFr); });
  }
}

// the top-bar identity + ward-back live in apps.js now; this just drives the
// left panel's body-scan stage labels.
export function initUI() {
  initSplits();
  initTheme();
  const stageT = document.getElementById('stageT');
  const stageS = document.getElementById('stageS');

  onModeChange((mode, focusId) => {
    if (mode === 'patient') {
      const b = bedById(focusId);
      stageT.textContent = 'Body Scan · ' + focusId;
      stageS.textContent = b.patient.name + ' · ' + b.patient.dx;
    } else {
      stageT.textContent = state.chapter === 'er' ? 'Digital State · ER Floor' : 'Digital State · ICU Floor';
      stageS.textContent = state.chapter === 'er' ? 'Live spatial twin · 16 monitored bays' : 'Live spatial twin · 8 monitored beds';
    }
  });
}
