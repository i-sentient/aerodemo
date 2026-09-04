// ===========================================================================
//  WATCH · the bed camera's pose read.
//  A pose-estimation model emits a keypoint skeleton — that IS its native
//  output, not a stand-in for something better — so the corner viewport draws
//  exactly that: joints, bones, and a scan sweep, on a dark feed. Small on
//  purpose; the movement LOG is the panel, this is just the eye.
// ===========================================================================

// joint layout authored in a 300×330 box, then fitted to whatever the viewport
// is. Suffix B = far side of the body (drawn dimmer for depth).
const POSES = {
  standing: { head: [150, 70], neck: [150, 96], shoulder: [150, 108], hip: [150, 198], eB: [142, 142], wB: [138, 182], eF: [158, 142], wF: [162, 184], kB: [142, 252], aB: [140, 312], tB: [158, 316], kF: [158, 252], aF: [160, 312], tF: [178, 316] },
  walking:  { head: [158, 72], neck: [154, 98], shoulder: [152, 110], hip: [148, 198], eF: [136, 144], wF: [122, 178], eB: [168, 144], wB: [184, 174], kF: [176, 244], aF: [194, 300], tF: [214, 302], kB: [122, 248], aB: [106, 302], tB: [90, 306] },
  sitting:  { head: [150, 116], neck: [150, 142], shoulder: [150, 152], hip: [150, 244], eF: [159, 196], wF: [180, 242], eB: [157, 200], wB: [180, 246], kF: [200, 244], aF: [200, 300], tF: [220, 304], kB: [200, 250], aB: [200, 304], tB: [220, 308] },
  supine:   { head: [78, 232], neck: [98, 240], shoulder: [112, 242], hip: [186, 240], eF: [142, 246], wF: [168, 248], eB: [142, 250], wB: [168, 252], kF: [222, 238], aF: [256, 236], tF: [266, 226], kB: [222, 244], aB: [256, 242], tB: [266, 232] },
};
const BONES = [['head', 'neck'], ['neck', 'shoulder'], ['shoulder', 'hip'], ['shoulder', 'eB'], ['eB', 'wB'], ['shoulder', 'eF'], ['eF', 'wF'], ['hip', 'kB'], ['kB', 'aB'], ['aB', 'tB'], ['hip', 'kF'], ['kF', 'aF'], ['aF', 'tF']];
const FAR = { eB: 1, wB: 1, kB: 1, aB: 1, tB: 1 };
const JOINTS = Object.keys(POSES.standing);
const LYING = { supine: 1, sitting: 1 };

export function makeWatchCam(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const clone = (p) => { const o = {}; for (const k in p) o[k] = [p[k][0], p[k][1]]; return o; };
  let key = 'standing', cur = clone(POSES.standing), tgt = POSES.standing;
  let bedAmt = 0, bedTgt = 0, raf = 0, last = 0;

  function frame(t) {
    if (!last) last = t; const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) { raf = requestAnimationFrame(frame); return; }
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

    const s = Math.min(cw / 300, ch / 330);              // fit the authored box
    const ox = (cw - 300 * s) / 2, oy = (ch - 330 * s) / 2;
    const X = (x) => ox + x * s, Y = (y) => oy + y * s;
    const k = 1 - Math.exp(-dt * 9);
    for (const J of JOINTS) { cur[J][0] += (tgt[J][0] - cur[J][0]) * k; cur[J][1] += (tgt[J][1] - cur[J][1]) * k; }
    bedAmt += (bedTgt - bedAmt) * k;
    const bob = Math.sin(t / 900) * 0.9 * s;

    ctx.clearRect(0, 0, cw, ch);
    // bed slab (lying / sitting) and floor line (upright)
    ctx.fillStyle = `rgba(60,120,140,${0.12 * bedAmt})`;
    ctx.fillRect(X(40), Y(246), 232 * s, 30 * s);
    ctx.strokeStyle = `rgba(95,208,230,${0.42 * bedAmt})`; ctx.lineWidth = 1;
    ctx.strokeRect(X(40), Y(246), 232 * s, 30 * s);
    ctx.strokeStyle = `rgba(95,208,230,${0.22 * (1 - bedAmt)})`;
    ctx.beginPath(); ctx.moveTo(X(24), Y(318)); ctx.lineTo(X(276), Y(318)); ctx.stroke();
    // scan sweep — the "it is looking" tell
    const sy = Y(((t % 2600) / 2600) * 330);
    ctx.strokeStyle = 'rgba(120,224,255,.07)'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(cw, sy); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,224,255,.20)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(cw, sy); ctx.stroke();

    ctx.save(); ctx.translate(0, bob);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [a, b] of BONES) {
      const far = FAR[a] || FAR[b];
      ctx.strokeStyle = far ? 'rgba(58,122,136,.9)' : 'rgba(95,208,230,.95)';
      ctx.lineWidth = (far ? 5.5 : 7.5) * s;
      ctx.beginPath(); ctx.moveTo(X(cur[a][0]), Y(cur[a][1])); ctx.lineTo(X(cur[b][0]), Y(cur[b][1])); ctx.stroke();
    }
    // head: ring + facing ellipse
    const hx = X(cur.head[0]), hy = Y(cur.head[1]), hr = 13 * s;
    ctx.strokeStyle = 'rgba(120,224,255,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,224,255,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(hx, hy, hr * 0.38, hr, 0, 0, Math.PI * 2); ctx.stroke();
    // keypoint markers — the model's actual output
    const q = 2.2 * s;
    for (const J of JOINTS) {
      if (J === 'head') continue;
      const px = X(cur[J][0]), py = Y(cur[J][1]);
      ctx.fillStyle = 'rgba(143,232,255,.9)'; ctx.fillRect(px - q, py - q, q * 2, q * 2);
      ctx.strokeStyle = 'rgba(143,232,255,.32)'; ctx.lineWidth = 1;
      ctx.strokeRect(px - q * 1.9, py - q * 1.9, q * 3.8, q * 3.8);
    }
    ctx.restore();
    raf = requestAnimationFrame(frame);
  }

  return {
    setPose(k) { if (!POSES[k]) return; key = k; tgt = POSES[k]; bedTgt = LYING[k] ? 1 : 0; },
    get pose() { return key; },
    start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
