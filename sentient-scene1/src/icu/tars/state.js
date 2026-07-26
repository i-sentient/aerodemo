// minimal shared app state + a mode-change pub/sub so modules stay decoupled
export const state = { mode: 'floor', focusId: null, speaker: 'tars', chapter: 'workup' };

const subs = [];
export function onModeChange(fn) { subs.push(fn); }

export function setMode(mode, focusId = null) {
  state.mode = mode;
  state.focusId = focusId;
  for (const fn of subs) fn(mode, focusId);
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
