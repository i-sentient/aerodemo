# Handoff — Revanth

Two asset-heavy jobs on the ICU app. Everything below lives in `sentient-scene1/`
(one app, port 5210, branch `peela`). Run it with:

```bash
npm --prefix sentient-scene1 run dev        # http://localhost:5210
```

Direct test URLs for the ICU panel (skip the tower ride):

- `http://localhost:5210/icu.html?chapter=workup` → Scene 2 (ward tour → press `→` through it → TARS patient hub, **skeleton** body)
- `http://localhost:5210/icu.html?chapter=continued` → Scene 3 (opens straight on the patient, **vascular** body)
- Theme toggle = sun/moon button, top-right of the top bar. Light is default; the X-ray look mainly targets **dark**.
- HMR is flaky in this app — hard-reload (Cmd+Shift+R) before trusting what you see.
- When done: `npm --prefix sentient-scene1 run typecheck` and keep the browser console clean.

---

## Job 1 — X-ray body for the rotating patient figure (Panel A)

**Goal:** the axial-rotate figure should read like a backlit X-ray of a *person* —
a translucent flesh silhouette (bright at the edges, nearly invisible face-on)
with the glowing skeleton/vessels inside, cold blue-violet on the dark stage.
Reference image is with Yeshwanth (black background, blue-violet skeleton inside
a ghosted body envelope).

### What's missing: the body envelope mesh

We only ship three system meshes — there is **no skin/body mesh**:

```
src/icu/tars/assets/skeleton/overview-skeleton.glb   (3.3 MB)
src/icu/tars/assets/systems/vascular.glb             (1.1 MB)
src/icu/tars/assets/systems/nervous.glb              (3.2 MB)
```

**Export from the Blender scene** (the same scene the skeleton came from):

- Outer **skin surface only** — no organs, eyes, teeth
- Same pose/origin/scale as the skeleton export — don't move anything, just export the skin
- Decimate hard: ~30–80k tris is plenty for a smooth surface; target ≤ 2 MB
- Draco is fine (decoder ships at `public/draco/`)
- No materials needed — the app shaders it
- Save to: `src/icu/tars/assets/systems/body.glb`

### Integration points (`src/icu/tars/`)

- **`scene.js`**
  - `SYSTEM_URLS` / `ensureLayer(name, cb)` — how layers stream in. The envelope
    should be an **always-on wrap around whichever system layer is active**, not a
    fourth toggle layer (the toggle UI was removed; defaults are per chapter:
    `workup` = skeletal, `continued` = vascular, chosen off `state.chapter`).
  - `robustPlace(root, 1.72)` height-normalizes every GLB, and there's per-layer
    calibration for cross-source drift — registration should land close; nudge if
    it's a hair off.
  - `makeFigureFromGLTF(...)` assigns materials per-mesh. Vascular meshes matching
    `/atrium|ventricl|heart|cardi|aort/i` get `userData.isHeart` + go into
    `fig.heartMeshes` — **clicking the heart is the zoom control** (`heartHit()`
    raycasts only `heartMeshes`, so the envelope won't interfere as long as you
    don't add it to that array).
- **`xray.js`** — the fresnel materials live here (`makeClinicalXrayMaterial` is
  the closest starting point: alpha rises at grazing angles). The envelope wants a
  new "skin" variant: near-zero alpha face-on, bright rim at the silhouette,
  additive on dark.
- **Theme:** `applySceneTheme(dark)` in `scene.js` swaps scene backgrounds/fog/
  grounds off the global toggle (`body.theme-dark`). Give the envelope a light-mode
  tuning too (see how the existing clinical material handles the light stage) so it
  doesn't wash out in the default theme.

---

## Job 2 — Real angiogram in PACS (Panel C)

**Goal:** the PACS app should show actual angiography imagery instead of the
current inline-SVG placeholders.

- **The one function:** `renderPACS()` in `src/icu/tars/apps.js`. It returns an
  HTML string per chapter:
  - `workup` → currently a fake 12-lead ECG polyline
  - `continued` → currently a sketched coronary-tree SVG
- **Story note (important):** for `continued`, the imagery must show the
  **diagnostic angiogram with the blockages** — multi-vessel disease (think
  proximal LAD ~90%, LCx ~75%, RCA ~60%). **Not** a stented/TIMI-3 result: the
  story beat is "blocks found → PTCA vs CABG decision pending." A short cine loop
  (muted, autoplaying `.mp4`/`.webm`) looks best in the viewer.
- **Assets:** drop files under `sentient-scene1/public/pacs/` and reference them as
  `/pacs/…`. Videos need `muted autoplay loop playsinline`.
- The app re-renders on every `openApp('pacs')` call (the story auto-navigates to
  PACS via `emrNavigate('imaging', …)`), so the markup must be stateless — it can
  be torn down and rebuilt at any time.
- Keep the `shell('pacs', …)` wrapper and the `.pacs` frame styling
  (`src/icu/tars/styles.css`) or restyle within it. PACS is deliberately dark in
  both themes — imaging viewers are dark IRL; keep it that way.

---

## Don't touch

- `src/icu/tars/chat.js` (the story scripts/beats) — Yeshwanth iterates these.
- Camera rigs/shots in `scene.js` and the host transitions in `src/App.tsx` —
  ping Yeshwanth first if something seems to need a change.
