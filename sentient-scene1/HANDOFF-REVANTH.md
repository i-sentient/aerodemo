# Scene 1 — handoff

Referenced from `src/icu/tars/apps.js`. Everything you need to run the demo and
do the imaging work is here.

---

## 1 · Running it

The presentation is **two repos, two dev servers**. You need both — Scene 1 is
embedded in the deck by iframe, and it is roughly a third of the runtime.

```bash
# terminal 1 — the deck
git clone git@github.com:i-sentient/presentationAlpha.git
cd presentationAlpha && git checkout demo1-new && npm install && npm run dev   # → :5500

# terminal 2 — Scene 1 (this repo)
git clone git@github.com:i-sentient/aerodemo.git
cd aerodemo/sentient-scene1 && git checkout peela && npm install && npm run dev -- --port 5210 --strictPort
```

Then open **`http://localhost:5500/presentationAlpha/`**.

> **The trailing path is not optional.** The deck sets `base: '/presentationAlpha/'`,
> so bare `localhost:5500` returns a 302 with an empty body. It looks like the
> server is down. It isn't.

Scene 1 also runs standalone at `http://localhost:5210/` if you only want to work
on it. It behaves identically; it just isn't wrapped in the deck.

### Driving it

| key | what it does |
|---|---|
| `→` `←` | next / previous beat |
| `` ` `` | open the **navigation bar** — every stop in the deck *and* every stop inside Scene 1, one strip |
| `Esc` | close the bar |

The bar is how you get anywhere without walking the whole deck. Click `PRE-CATH`,
`POST-CATH`, `POD 3` and so on. It works from inside Scene 1 too — the scene takes
the keyboard by itself, and forwards those two keys back out.

`?s=N` on the deck URL also jumps straight to section N.

---

## 2 · Your job — the PACS viewer

`renderPACS()` in **`src/icu/tars/apps.js`**. It has four branches. Two want real
imagery. **Two do not — read this before you touch them.**

### Replace these two — they are placeholder SVG sketches

| branch | reached from | what it must show |
|---|---|---|
| `state.chapter === 'continued'` | nav bar → **POST-CATH** | Coronary angiogram, **post-POBA**. Culprit proximal LAD reperfused by balloon, TIMI 3, **no stent deployed**. Residual: LCx 75% at a large OM, RCA 60% mid-vessel. Cine or a still is fine. |
| `pacsView === 'echo'` | nav bar → **POD 3**, beat 6 | TTE, subcostal. Small **circumferential pericardial effusion, 8 mm**. No RV collapse, no respiratory variation — i.e. visibly *not* tamponade. |

The angiogram is the one that matters most: it is on screen while iSAM assembles
the CABG decision, and it is the most-looked-at frame in the deck.

If you have the CT angio as DICOM, convert to JPEG/PNG and drop it in
`src/icu/tars/assets/` — Vite fingerprints anything imported from there.

### Do NOT replace these two — they are generated, on purpose

| branch | why |
|---|---|
| default (pre-cath 12-lead) | Drawn by `ecgPolyline()` from `src/icu/ontology/ecg.ts` — **the same generator that draws the live monitor strips**. Swapping in a picture makes the PACS tracing and the bedside monitor disagree, on the one patient whose entire diagnosis is a subtle ECG morphology. |
| `pacsView === 'ecg2up'` (POD 3 two-up) | Same generator, day-0 vs today. The whole POD 3 argument is that the inferior Q waves are on **both** tracings. A hand-drawn or photographed pair breaks that proof. |

If an ECG looks wrong, fix the **morphology** in `ontology/ecg.ts` and every
surface that draws it — PACS, both live monitors, the ER card — updates together.

---

## 3 · The bits worth knowing before you edit

**`public/scenes.json` is a contract.** It lists Scene 1's fourteen stops and is
read by *two* consumers: this app imports it, and the deck fetches it over HTTP
from `:5210`. Add or rename a stop there and both sides pick it up — the deck
re-reads it every time the nav bar opens. Do not keep a second copy anywhere.

**Don't touch the cross-frame messages** unless you mean to. Deck ⇄ Scene 1 ⇄ the
ICU app talk over `postMessage`: `deck:jump`, `scene1:scenes`, `icu:mode`,
`icu:pod`, `er:play`, `scenebar:toggle` / `scenebar:close`, `icu:ready`. They are
what make the nav bar track where you are. Breaking one fails quietly — the bar
just stops following.

**The ICU app is nested twice** in some chapters: deck → Scene 1 → `icu.html`.
That is why bar keys post to `window.top` rather than `window.parent`.

**Dead clicks and frozen state** usually mean a failed Vite hot update, not a bug.
Hard-reload before you debug.

---

## 4 · The story, so the imagery matches it

One patient. 58, diabetic, smoker. Chest pain forty minutes.

1. It is an **OMI, not a STEMI** — ST segments *depressed*, a de Winter pattern.
2. iSAM **holds the ticagrelor** because he may need surgery.
3. The lab opens the LAD with a **balloon, no stent** — so no DAPT is committed.
4. No stent + no P2Y12 = **no washout** → CABG ×3 the *same day*.
5. POD 3 he spikes a fever that looks like graft failure. The **day-0 twelve-lead**
   proves the Q waves are old → Dressler's, not a graft. He never goes back.
6. **Six days**, door to staircase.

The angiogram you supply is the evidence for step 3, and the echo is the evidence
for step 5. Both should read as *unremarkable findings that rule something out* —
that is the point of them.
