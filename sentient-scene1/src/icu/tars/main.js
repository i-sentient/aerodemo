import './styles.css';
import { startVitals } from './ontology.js';
import { setMode, state } from './state.js';
import { initUI } from './ui.js';
import { initApps } from './apps.js';
import { initChat } from './chat.js';
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

  // continued chapter opens straight on the patient; workup opens on the floor
  if (state.chapter === 'continued') setMode('patient', 'ICU-08');
  else setMode('floor'); // fires all listeners → initial render
  if (import.meta.env && import.meta.env.DEV) window.__tars = { setMode }; // dev-only test hook

  const loading = document.getElementById('loading');
  loading.classList.add('hide');
  setTimeout(() => loading.remove(), 800);
}

// let the grid layout settle so the canvas gets real dimensions
requestAnimationFrame(() => requestAnimationFrame(boot));
