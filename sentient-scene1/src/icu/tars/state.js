// minimal shared app state + a mode-change pub/sub so modules stay decoupled
export const state = { mode: 'floor', focusId: null, speaker: 'tars', chapter: 'workup' };

// Scene 4 spans TWO chapters on the same bedside machinery: 'postop' (PODs 0-3,
// in the ICU) and 'stepdown' (POD 6, after the transfer — the same patient in
// the Step-Down ward). Every "is this the post-op world?" check goes through
// here so the rail, the twin markers, SCOPE/WATCH tabs and the progress-note
// record all carry over the transfer instead of falling back to the acute UI.
export const isPostopWorld = () => state.chapter === 'postop' || state.chapter === 'stepdown';

const subs = [];
export function onModeChange(fn) { subs.push(fn); }

export function setMode(mode, focusId = null) {
  state.mode = mode;
  state.focusId = focusId;
  for (const fn of subs) fn(mode, focusId);
  // Tell the host which half of the chapter we are in. The pre-cath scene is two
  // distinct places — the ICU floor twin (triage) and the patient in bed 08 —
  // and from outside this iframe they are one view, so the deck's navigation bar
  // could not tell them apart. Goes to the PARENT (scene1's App), which owns the
  // one place that resolves where the ride is.
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'icu:mode', mode, chapter: state.chapter }, '*'); } catch { /* not framed */ }
}

// global light/dark theme — ONE toggle flips all three splits (light default).
state.dark = false;
const tsubs = [];
export function onThemeChange(fn) {
  tsubs.push(fn);
  return () => { const i = tsubs.indexOf(fn); if (i >= 0) tsubs.splice(i, 1); }; // unsubscribe
}
export function setTheme(dark) {
  state.dark = dark;
  for (const fn of tsubs) fn(dark);
}
