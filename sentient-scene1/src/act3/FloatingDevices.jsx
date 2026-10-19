import { useEffect, useState } from 'react';

import ventilator from '../sentient-icu/assets/devices/philips-v200-ventilator.jpg';
import monitor from '../sentient-icu/assets/devices/ge-patient-monitor.jpg';
import dialysisAdvin from '../sentient-icu/assets/devices/advin-dialysis-machine.jpg';
import dialysisNipro from '../sentient-icu/assets/devices/nipro-surdial-55plus.png';
import defibrillator from '../sentient-icu/assets/devices/defibrillator.jpg';
import syringePump from '../sentient-icu/assets/devices/mdk-ms51-syringe-pump.webp';

// ---------------------------------------------------------------------------
//  The instruments, adrift behind the SENSORY beat.
//
//  They belong to that beat and no other: perception is the one layer whose
//  subject is physical hardware, and the same machines floating behind the
//  INFERENCE panel would be arguing the opposite of what that panel says.
//
//  Vendor product shots are glossy colour objects on white. Each is BAKED ONCE
//  into a hologram in PLEXUS red:
//
//    · luminance becomes transparency, so the studio background disappears
//    · EDGES are lifted hot and the interior is held back, which is what makes
//      a projection read as a projection rather than as a photograph
//    · a blurred copy of the silhouette is composited underneath as a halo
//
//  The halo is baked rather than applied as a CSS drop-shadow on purpose. A
//  filter on a moving element re-rasterises it every frame, which is what
//  stalled this slide once already. Baked, the drift animates transform and
//  opacity only and stays on the compositor.
//
//  Scanlines and flicker are CSS on top. Motion is the bubble-screensaver
//  register: a slow rise with an independent sway, each on its own clock so
//  the field never visibly cycles.
// ---------------------------------------------------------------------------

// critical-care-overview.png is deliberately absent: it is the dark annotated
// infographic, not a product shot, and inverting it would produce a white slab.
const SOURCES = [ventilator, monitor, dialysisAdvin, dialysisNipro, defibrillator, syringePump];

const PLEXUS = [255, 93, 115]; // the perception layer's own red
const MAX_SIDE = 560;          // bake resolution ceiling
const HALO_R = 5;              // blur radius for the baked glow

// separable box blur over a single channel — cheap, and it only runs once
function blur(sr, w, h, r) {
  const tmp = new Float32Array(sr.length);
  const out = new Float32Array(sr.length);
  const span = r * 2 + 1;
  for (let y = 0; y < h; y += 1) {
    let sum = 0;
    for (let x = -r; x <= r; x += 1) sum += sr[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x += 1) {
      tmp[y * w + x] = sum / span;
      sum -= sr[y * w + Math.min(w - 1, Math.max(0, x - r))];
      sum += sr[y * w + Math.min(w - 1, Math.max(0, x + r + 1))];
    }
  }
  for (let x = 0; x < w; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = sum / span;
      sum -= tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x];
      sum += tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
    }
  }
  return out;
}

function bake(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        const w = Math.round(img.naturalWidth * k);
        const h = Math.round(img.naturalHeight * k);
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        const p = data.data;

        // darkness: the machine against its white studio ground
        const dark = new Float32Array(w * h);
        for (let i = 0, q = 0; i < p.length; i += 4, q += 1) {
          const lum = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
          const a = p[i + 3] / 255;
          dark[q] = (1 - lum) * a;
        }

        const halo = blur(dark, w, h, HALO_R);

        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const q = y * w + x;
            const i = q * 4;
            const xl = dark[y * w + Math.max(0, x - 1)];
            const xr = dark[y * w + Math.min(w - 1, x + 1)];
            const yu = dark[Math.max(0, y - 1) * w + x];
            const yd = dark[Math.min(h - 1, y + 1) * w + x];
            // gradient magnitude: the outline and every internal seam
            const edge = Math.min(1, (Math.abs(xr - xl) + Math.abs(yd - yu)) * 4.5);

            const body = Math.pow(dark[q], 1.5) * 0.34;   // held back
            const rim = Math.pow(edge, 0.75) * 0.95;       // lifted hot
            const glow = Math.pow(halo[q], 1.2) * 0.3;     // the projection's spill

            const alpha = Math.min(1, body + rim + glow);
            // edges tend to white, the body stays in the layer's red
            const heat = Math.min(1, rim * 1.15);
            p[i] = PLEXUS[0] * (0.6 + 0.4 * heat) + 255 * heat * 0.35;
            p[i + 1] = PLEXUS[1] * (0.5 + 0.5 * heat) + 255 * heat * 0.42;
            p[i + 2] = PLEXUS[2] * (0.5 + 0.5 * heat) + 255 * heat * 0.4;
            p[i + 3] = alpha * 255;
          }
        }
        ctx.putImageData(data, 0, 0);
        resolve(cv.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

// Six machines, one each, converging on a column in the corridor between the
// layer stack and the layer's own text.
//
// Layout is a flex column, not absolute slots: the gap is genuinely equal and
// nothing can overlap, however tall or short the machine happens to be. Every
// row is capped to the same height and the image is right-aligned in a fixed
// box, so the names line up on one axis down the right.
//
// MOTION is one continuous curve, not a chain of waypoints. Three keyframed
// stops with a single easing across them meant a visible change of direction at
// each stop — that is what read as glitching. One long, slow, gently
// decelerating glide from each machine's own starting offset does the same job
// and stays smooth. Once landed, a slow orbital float and an eased brightness
// breathe keep it alive; both are sine-like rather than stepped.
const COLUMN_X = 54;   // % across — mid-corridor once the intro panel is open
const ROW_H = 56;      // px, the cap that keeps rows even
const IMG_BOX = 74;    // px, the fixed image column
const ROW_GAP = 17;    // px between rows

// x0/y0 in vw/vh: where the machine drifts in from. s0: the scale it starts at,
// kept modest — a big scale change over a long glide is what makes the edges
// crawl.
const ITEMS = [
  { s: 0, name: 'V200 · VENTILATOR', o: 0.52, x0: -46, y0: -14, s0: 1.55, dur: 8.5, delay: 0.0 },
  { s: 1, name: 'PATIENT MONITOR', o: 0.5, x0: 12, y0: -56, s0: 1.6, dur: 9.2, delay: 0.5 },
  { s: 2, name: 'DIALYSIS', o: 0.46, x0: 44, y0: 16, s0: 1.5, dur: 8.0, delay: 1.0 },
  { s: 3, name: 'SURDIAL 55+', o: 0.46, x0: -10, y0: 58, s0: 1.58, dur: 9.6, delay: 1.5 },
  { s: 4, name: 'DEFIBRILLATOR', o: 0.5, x0: 40, y0: -44, s0: 1.45, dur: 8.8, delay: 2.0 },
  { s: 5, name: 'MS-51 · SYRINGE PUMP', o: 0.48, x0: -38, y0: 48, s0: 1.52, dur: 9.0, delay: 2.5 },
];

const SCANLINES =
  'repeating-linear-gradient(to bottom,' +
  ' rgba(0,0,0,1) 0px, rgba(0,0,0,1) 1.7px,' +
  ' rgba(0,0,0,0.34) 1.7px, rgba(0,0,0,0.34) 3.6px)';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function FloatingDevices({ show = false }) {
  const [urls, setUrls] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all(SOURCES.map(bake)).then((out) => {
      if (live) setUrls(out);
    });
    return () => { live = false; };
  }, []);

  if (!urls) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <style>{`
        /* one stop to one stop — no mid-course corners to catch the eye */
        @keyframes fd-arrive {
          from { transform: translate3d(var(--x0), var(--y0), 0) scale(var(--s0)); opacity: 0; }
          22%  { opacity: 1; }
          to   { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
        }
        /* a slow orbit rather than a bob: a bubble does not move on one axis */
        @keyframes fd-float {
          0%   { transform: translate3d(0, -5px, 0); }
          25%  { transform: translate3d(4px, 0, 0); }
          50%  { transform: translate3d(0, 5px, 0); }
          75%  { transform: translate3d(-4px, 0, 0); }
          100% { transform: translate3d(0, -5px, 0); }
        }
        /* eased, not stepped — the old steps() flicker was the other half of
           what looked like glitching */
        @keyframes fd-breathe {
          0%, 100% { opacity: var(--o); }
          50%      { opacity: calc(var(--o) * 0.8); }
        }
      `}</style>

      <div
        style={{
          position: 'absolute',
          left: COLUMN_X + '%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: ROW_GAP,
        }}
      >
        {show && ITEMS.map((it, i) => (
          <div
            key={it.name}
            style={{
              '--x0': it.x0 + 'vw',
              '--y0': it.y0 + 'vh',
              '--s0': it.s0,
              willChange: 'transform, opacity',
              animation: `fd-arrive ${it.dur}s cubic-bezier(0.22, 0.55, 0.2, 1) ${it.delay}s both`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: ROW_H,
                willChange: 'transform',
                animation: `fd-float ${(15 + i * 2.3).toFixed(1)}s ease-in-out ${(it.delay + it.dur).toFixed(1)}s infinite`,
              }}
            >
              {/* fixed box, image right-aligned inside it — that is what puts
                  every name on one axis regardless of the machine's shape */}
              <div
                style={{
                  width: IMG_BOX,
                  height: ROW_H,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  flex: '0 0 auto',
                }}
              >
                <img
                  src={urls[it.s]}
                  alt=""
                  draggable={false}
                  style={{
                    '--o': it.o,
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    opacity: it.o,
                    maskImage: SCANLINES,
                    WebkitMaskImage: SCANLINES,
                    willChange: 'opacity',
                    animation: `fd-breathe ${(9 + i * 1.1).toFixed(1)}s ease-in-out ${(i * 0.9).toFixed(1)}s infinite`,
                  }}
                />
              </div>

              {/* model name only, on the right, on its own leader */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                <span style={{ width: 7, height: 1, background: 'rgba(255,93,115,0.4)' }} />
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 8,
                    letterSpacing: '0.18em',
                    color: 'rgba(255,140,155,0.68)',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                  }}
                >
                  {it.name}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
