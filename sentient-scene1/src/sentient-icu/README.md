# sentient-icu

Self-contained **Sentient ICU** experience — a device showcase that flows into a
3D ICU-bay guided tour. Drop this folder into any Vite + React-Three-Fiber app
and wire one line.

## What's inside (nothing reaches outside this folder)

| File | Role |
|------|------|
| `SentientICU.tsx` | **Entry point.** Composes the showcase → crossfade → 3D tour. |
| `DeviceHistory.tsx` | Full-screen product-shot showcase of the ICU hardware (act ①). |
| `ICUScene.tsx` | The 3D ICU bay + 10-beat guided tour (act ②). |
| `Postprocessing.tsx` | Local bloom/vignette/ACES grade (no `../scene` dependency). |
| `useShotCapture.ts` | Dev helper — press **P** to copy the current camera as a SHOT line. |
| `assets/devices/*` | The 7 device photos, imported (bundled by Vite — not `/public`). |

## Wiring (the only thing outside this folder)

Add one route in your entry file (e.g. `main.tsx`):

```tsx
import { SentientICU } from './sentient-icu/SentientICU'
// ...
{view === 'icu' ? <SentientICU /> : <App />}
```

Open `?view=icu`. That's it.

- The showcase plays first; advancing past the last device (or the **Enter the
  ward** button) crossfades into the 3D tour.
- `?view=icu&shot=N` (N = 0-9) **skips the intro** and lands directly on a tour
  beat — handy for deep-links / screenshots.
- `DeviceHistory` also works standalone if you want it: `<DeviceHistory />`.

## Requirements (already present in any R3F project)

peer deps: `react`, `react-dom`, `three`, `@react-three/fiber`,
`@react-three/drei`, `@react-three/postprocessing`, `postprocessing`,
`three-stdlib`. TypeScript needs `vite/client` types for the image imports
(standard `vite-env.d.ts` — `/// <reference types="vite/client" />`).

> Note: a `public/devices/` copy of these images may exist from an earlier
> version — it is no longer referenced and can be deleted; the images now live
> in `./assets/devices/`.
