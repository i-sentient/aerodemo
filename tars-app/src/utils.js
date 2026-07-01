// tiny shared helpers
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b) => a + Math.random() * (b - a);
export const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
// frame-rate independent lerp factor
export const damp = (dt, rate) => 1 - Math.exp(-rate * dt);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const elem = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
