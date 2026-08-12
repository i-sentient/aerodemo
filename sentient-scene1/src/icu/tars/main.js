import './styles.css';
import { startVitals } from './ontology.js';
import { setMode, state } from './state.js';
import { initUI } from './ui.js';
import { initApps } from './apps.js';
import { initChat, seekEstablished, seekErBrief } from './chat.js';
import { openApp } from './apps.js';
import { initHud } from './hud.js';
import { initScene } from './scene.js';

function boot() {
  // chapter chosen by the host (iframe ?chapter=): 'workup' (STEMI, opens on the
  // floor → ward → TARS) or 'continued' (post-CT-angio, opens straight on the patient)
  state.chapter = (typeof window !== 'undefined' && window.__tarsChapter) || 'workup';

  initUI();
  initApps();
  initChat();
  initHud('#hud');
  initScene(document.getElementById('c'));
  startVitals(750);

  // the ER chapter lives on the FLOOR — the inbound is a ward event, not a
  // patient view; every other chapter opens straight on the patient
  if (state.chapter === 'er') setMode('floor')
  else setMode('patient', 'ICU-08'); // fires all listeners → initial render
  if (import.meta.env && import.meta.env.DEV) window.__tars = { setMode }; // dev-only test hook

  // ER embed: the whole brief plays at boot — clock pinned, protocols open —
  // and the arrows belong to the host (same forwarding as the panela demo)
  if (state.chapter === 'er') {
    seekErBrief();
    if (document.body.classList.contains('embed-keys')) {
      window.addEventListener('keydown', (e) => {
        const fwd = e.code === 'Space' || e.code === 'ArrowRight';
        const back = e.code === 'ArrowLeft' || e.code === 'Backspace';
        if (!fwd && !back) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: fwd ? 'plexus:next' : 'plexus:prev' }, '*'); } catch { /* not framed */ }
      });
    }
  }

  // deck demo (?panela=1): open POD 0 already established — see seekEstablished
  if (document.body.classList.contains('panela-only') && state.chapter === 'postop') {
    seekEstablished();
    const q = new URLSearchParams(location.search);
    // &win=watch: the second PLEXUS beat opens on the WATCH page, not the twin
    const win = q.get('win');
    if (win) window.dispatchEvent(new CustomEvent('hud:window', { detail: { w: win } }));
    // &app=lis: land Panel C on a named clinical app (LIS for the record beat;
    // PACS is one dock click away)
    const app = q.get('app');
    if (app) openApp(app);
    // The iframe owns keyboard focus while he mouse-drives the interface, so
    // the arrows are FORWARDED to the deck as beat navigation rather than
    // consumed here — chat.js's story handler stands down in this mode.
    window.addEventListener('keydown', (e) => {
      const fwd = e.code === 'Space' || e.code === 'ArrowRight';
      const back = e.code === 'ArrowLeft' || e.code === 'Backspace';
      if (!fwd && !back) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: fwd ? 'plexus:next' : 'plexus:prev' }, '*'); } catch { /* not framed */ }
    });
  }

  const loading = document.getElementById('loading');
  loading.classList.add('hide');
  setTimeout(() => loading.remove(), 800);

  // tell the host shell we're up so it can drop its "Initialising TARS" cover
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'icu:ready' }, '*'); } catch (e) { /* not framed */ }
}

// let the grid layout settle so the canvas gets real dimensions
requestAnimationFrame(() => requestAnimationFrame(boot));
