// minimal shared app state + a mode-change pub/sub so modules stay decoupled
export const state = { mode: 'floor', focusId: null, speaker: 'tars' };

const subs = [];
export function onModeChange(fn) { subs.push(fn); }

export function setMode(mode, focusId = null) {
  state.mode = mode;
  state.focusId = focusId;
  for (const fn of subs) fn(mode, focusId);
}
