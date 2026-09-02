import { beds, bedById } from './ontology.js';
import { state, isPostopWorld, onModeChange, setMode } from './state.js';
import { lerp } from './utils.js';
import { HOOKUP, POD0, TRENDS, SCOPE_DETAIL, CONTROLS, MEASURED, WAVE_NUM, WATCH, PODS, podByDay, podsUpTo } from './postop.js';
import { makeMiniScope, makeTrend, WAVES } from './waveforms.js';
import { makeWatchCam } from './watchcam.js';
import { emrNavigate } from './apps.js';
import { ecgAt, ecgPatternForBed } from '../ontology/ecg';

let root, floorLayer, patientLayer, wipe, ecgCv, ecgX;
let lsamRevealAt = 0, lsamShown = 0;
let ecgBuf = [], beatPhase = 0;
const ECG_SPEED = 80, ECG_GAP = 1.4, DPR = Math.min(devicePixelRatio || 1, 2);

const rosterRows = beds.map((b) => `
  <button class="rrow" data-bed="${b.id}">
    <span class="rdot ${b.patient.acuity}"></span>
    <span class="rid">${b.id}</span>
    <span class="rnm">${b.patient.name}</span>
    <span class="rdx">${b.patient.dx}</span>
    <span class="rnews ${b.patient.acuity}">N2&nbsp;${b.traj.news2}</span>
  </button>`).join('');

const TPL = `
  <div class="hud-bracket tl"></div><div class="hud-bracket tr"></div>
  <div class="hud-bracket bl"></div><div class="hud-bracket br"></div>
  <div class="hud-scan"></div>
  <div class="hud-grid"></div>
  <div class="hud-vignette"></div>

  <div class="hud-floor">
    <!-- ward-tour layout: roster top-left · title centred (stage-hd) ·
         capacity bottom-right · foot bottom-left -->
    <div class="rise roster">
      <div class="tk">PATIENTS · select to scan ›</div>
      <div class="rlist">${rosterRows}</div>
    </div>
    <div class="rise readout">
      <div class="tk">CAPACITY</div><div class="num" id="wardCap">8 / 8</div><div class="u">beds occupied</div>
    </div>
    <div class="rise foot">REF 0xN-ICU · GRID 8x · <span id="h_clock">--:--:--</span></div>
  </div>

  <div class="hud-patient">
    <svg class="reticle" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">
      <circle cx="100" cy="100" r="86" class="r-faint"/>
      <circle cx="100" cy="100" r="70" class="r-ring"/>
      <g class="r-spin">
        <circle cx="100" cy="100" r="92" class="r-faint2"/>
        ${Array.from({ length: 36 }).map((_, i) => { const a = i * 10 * Math.PI / 180; const x1 = 100 + Math.cos(a) * 88, y1 = 100 + Math.sin(a) * 88, x2 = 100 + Math.cos(a) * (i % 3 ? 92 : 95), y2 = 100 + Math.sin(a) * (i % 3 ? 92 : 95); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="r-tick"/>`; }).join('')}
      </g>
      <line x1="100" y1="6" x2="100" y2="26" class="r-cross"/><line x1="100" y1="174" x2="100" y2="194" class="r-cross"/>
      <line x1="6" y1="100" x2="26" y2="100" class="r-cross"/><line x1="174" y1="100" x2="194" y2="100" class="r-cross"/>
    </svg>
    <div class="tele tl">
      <div class="tk">BODY SCAN · <span id="p_id">ICU-04</span></div>
      <div class="vit"><span>HR</span><b id="p_hr">--</b><i>bpm</i></div>
      <div class="vit"><span>BP</span><b id="p_bp">--</b><i>mmHg</i></div>
      <div class="vit"><span>SpO₂</span><b id="p_spo2">--</b><i>%</i></div>
      <div class="vit"><span>RR</span><b id="p_rr">--</b><i>/min</i></div>
      <div class="vit"><span>TEMP</span><b id="p_temp">--</b><i>°C</i></div>
    </div>
    <div class="tele tr" id="devRail"></div>
    <!-- the .lsam class is only a CSS hook and keeps its old name; the LABEL is
         iSAM's, because NEWS2 and deterioration are things a reasoner produces
         and PLEXUS does not speak. -->
    <div class="tele bl lsam">
      <div class="tk">i<b>SAM</b> TRAJECTORY · <span id="p_lstatus" class="st">ANALYZING</span></div>
      <div class="lrow"><div><span>NEWS2</span><b id="p_news">…</b></div><div><span>DETERIORATION</span><b id="p_prob">…</b></div></div>
      <div class="lbar"><i id="p_bar"></i></div>
      <div class="verdict" id="p_verdict">computing…</div>
    </div>
    <div class="tele bl blecg">
      <div class="tk">ECG · LEAD II</div>
      <canvas id="hudEcg"></canvas>
    </div>
    <div class="tele br small mono vision"><span class="vd"></span>VISION · LIVE</div>

    <div class="pa-tabs mono" id="paTabs">
      <button data-w="twin" class="on">TWIN</button><button data-w="scope">SCOPE</button><button data-w="watch">WATCH</button>
    </div>
    <div class="pa-win pa-scope">
      <div class="pw-tk">SCOPE · TELEMETRY + RECOVERY ANALYTICS</div>
      <div class="pw-empty">waveform bank · scores · trajectory — building</div>
    </div>
    <div class="pa-win pa-watch">
      <div class="pw-tk">WATCH · ACTIVITY MONITOR</div>
      <div class="pw-empty">pose reconstruction · mobility ledger · pain read — building</div>
    </div>
  </div>

  <div class="hud-wipe"></div>
`;

// ---- Scene 4 · beat 0: the CONNECTED-devices rail (postop only) ------------
// The interactive checklist (loading → tick → recon) lives in Panel B now; the
// rail here is the persistent CONNECTED status board — it fills a row as each
// device connects (event from chat.js), wakes that device's FEED (vitals '--'
// → live, ECG flat → drawing), and fires its glow marker on the twin. Readings
// quoted from POD0 (postop.js) — same numbers as the checklist + orders.
// Beat 0 connects a PREFIX of the list, but recovery removes devices from the
// middle (extubated on POD 1, drains out on POD 2…), so what's live is a SET,
// not a count. The rail, the twin's markers and SCOPE all read from it.
const feedOn = new Set();
const live = new Set();     // device keys currently attached to the patient
let hkActive = false;       // postop hookup mode on
let podDay = 0;             // which post-op day the bedside is showing
function railRender(ping) {
  if (!isPostopWorld() || !root) return;
  feedOn.clear(); const marks = [];
  const on = HOOKUP.filter((d) => live.has(d.key));
  for (const d of on) { (d.feeds || []).forEach((f) => feedOn.add(f)); if (d.marker) marks.push(d.marker); }
  const rail = root.querySelector('#devRail'); if (!rail) return;
  const settingUp = podDay === 0 && live.size < HOOKUP.length;
  const established = podDay === 0 && live.size === HOOKUP.length;
  const head = settingUp ? 'CONNECTED DEVICES · POD 0' : established ? 'CONNECTED · BEDSIDE ESTABLISHED' : `BEDSIDE · POD ${podDay}`;
  const count = podDay === 0 ? `${live.size} / ${HOOKUP.length}` : `${live.size} live`;
  rail.innerHTML = `<div class="tk">${head}<span class="hk-count">${count}</span></div>`
    // an empty rail means two opposite things: on POD 0 nothing is connected YET,
    // on POD 6 nothing is connected any more — and the second one is the payoff,
    // so it must not read as a system still waiting to come up.
    + (on.length ? on.map((d) => `<div class="kv hk-row${d.marker === ping ? ' hk-new' : ''}" data-dev="${d.key}"><span><i class="hk-led"></i>${d.label}</span><b>${d.short}</b></div>`).join('')
      : podDay > 0 ? '<div class="kv hk-empty">nothing attached · unmonitored</div>' : '<div class="kv hk-empty">establishing…</div>');
  window.dispatchEvent(new CustomEvent('hud:markers', { detail: { keys: marks, ping: ping || null } }));
}
function hookupRail(n) {  // beat 0 path: the first n devices are on
  const k = Math.max(0, Math.min(HOOKUP.length, n | 0));
  hkActive = true; live.clear();
  for (let i = 0; i < k; i++) live.add(HOOKUP[i].key);
  railRender(k ? HOOKUP[k - 1].marker : null);
}
function hookupReset() { hkActive = true; podDay = 0; live.clear(); railRender(null); }
// recovery: a device comes OFF — its rail row leaves, its marker goes dark,
// its SCOPE tile disappears, and any vital it fed goes back to '--'
function hookupRemove(keys) {
  (keys || []).forEach((k) => live.delete(k));
  railRender(null);
  if (root && root.classList.contains('win-scope') && scopeView === 'overview') renderScope();
}
// Advance the bedside to a post-op day: everything that was still attached on
// the previous day stays, that day's devices come off, the vitals land where
// the weaning left them, and WATCH switches to that day's record.
function setPod(day) {
  // podDay is a DAY, not an index. It used to be clamped to PODS.length - 1,
  // which was the same number back when the days were 0,1,2,3,4 — with 0,3,6 that
  // clamp silently turned POD 3 into POD 2 and lost the day entirely. Snap to a
  // day that exists instead.
  podDay = podByDay(day).pod;
  live.clear();
  const gone = new Set();
  podsUpTo(podDay).forEach((p) => (p.off || []).forEach((k) => gone.add(k)));
  HOOKUP.forEach((d) => { if (!gone.has(d.key)) live.add(d.key); });
  // move the BASELINE too, not just the reading — ontology's random walk clamps
  // to b.base (the admission OMI numbers), so assigning vitals alone gets
  // dragged straight back to HR 118.
  const v = podByDay(podDay).vitals;
  const b = bedById(state.focusId);
  if (b && v) { Object.assign(b.vitals, v); Object.assign(b.base, v); }
  railRender(null);
  watchDay = podDay;
  if (root && root.classList.contains('win-watch')) renderWatch();
  if (root && root.classList.contains('win-scope')) { scopeView = 'overview'; scopeDev = null; renderScope(); }
  window.dispatchEvent(new CustomEvent('hud:pod:changed', { detail: { day: podDay } })); // Panel C notes
  /* ...and out to the host. POD 0 and POD 3 are the SAME view from outside this
   * iframe — the day turns in here, on a beat — so without this the navigation
   * bar could only ever know the day you JUMPED to, never the one you walked to. */
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'icu:pod', day: podDay, chapter: state.chapter }, '*'); } catch { /* not framed */ }
}
export function currentPod() { return podDay; }

// The day-break card. It isn't decoration: the POD switch happens while the
// cover is opaque, so five devices leaving is a REVEAL when it lifts rather
// than things popping out of existence in front of you.
let dbEl = null, dbTimers = [];
function dayBreak(day) {
  const p = podByDay(day);
  dbTimers.forEach(clearTimeout); dbTimers = [];
  if (!dbEl) {
    dbEl = document.createElement('div'); dbEl.className = 'daybreak';
    dbEl.innerHTML = '<div class="db-lg">T</div><div class="db-d"></div><div class="db-t"></div><div class="db-s"></div>';
    (document.getElementById('app') || document.body).appendChild(dbEl);
  }
  dbEl.querySelector('.db-d').textContent = `POST-OP DAY ${p.pod}`;
  dbEl.querySelector('.db-t').textContent = p.title;
  dbEl.querySelector('.db-s').textContent = p.sub;
  void dbEl.offsetHeight;                 // reflow, not rAF — rAF stalls in a backgrounded tab
  dbEl.classList.add('on');
  dbTimers.push(setTimeout(() => setPod(p.pod), 480));          // mutate behind the cover
  dbTimers.push(setTimeout(() => dbEl.classList.remove('on'), 1750));
}
window.addEventListener('hud:daybreak', (e) => dayBreak((e.detail || {}).day));
// Beats drive the Panel A window directly: a beat that removes a device wants
// SCOPE up so the tile goes dark ON SCREEN; a camera beat wants WATCH. Same
// setWindow the tabs use, so the tab row highlights stay honest.
window.addEventListener('hud:window', (e) => setWindow(((e.detail || {}).w) || 'twin'));

// ---- Scene 4 · SCOPE — the monitor wall (Panel A window) -------------------
// Two levels. OVERVIEW: every bedside machine as a live tile — waveform units
// (telemetry / ventilator / IABP) via the shared engine, numeric machines as
// trend cells. DETAIL: one machine in full (big waves or 6-h trend + all its
// info). Entry: the SCOPE tab (→ overview) or clicking a glow marker on the
// twin (→ that device's detail). Everything quotes POD0 — the same numbers as
// the checklist, the rail and the note.
let scopeView = 'overview', scopeDev = null, scopeScopes = [], scopeTimer = 0;
function stopScope() { scopeScopes.forEach((s) => s.stop()); scopeScopes = []; if (scopeTimer) { clearInterval(scopeTimer); scopeTimer = 0; } }
function setWindow(w) {
  if (!root) return;
  root.classList.remove('win-scope', 'win-watch');
  if (w !== 'twin') root.classList.add('win-' + w);
  const tabs = root.querySelector('#paTabs');
  if (tabs) tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.w === w));
  if (w === 'scope') renderScope(); else stopScope();
  if (w === 'watch') renderWatch(); else stopWatch();
}

// ---- Scene 4 · WATCH — the surveillance record -----------------------------
// The bed camera watches continuously and pose estimation turns what it sees
// into a timestamped movement log. THE LOG IS THE PANEL; the stick figure in
// the corner viewport is only the live vision read (a keypoint skeleton is
// literally what a pose model emits). Each day's log is what TARS quotes into
// that POD's progress note — which the clinician then assesses, examines
// against, and turns into recovery orders.
// watchDay is a POD NUMBER, not an index into WATCH.days — the days are 0, 3, 6.
let watchDay = 0, watchCam = null, watchClock = 0;
const wDay = () => WATCH.days.find((x) => x.pod === watchDay) || WATCH.days[0];
// 24 h movement density, derived from the log's own timestamps — a logged event
// makes its hour tall, the hours either side lift a little. The point of the
// strip is that the record is CONTINUOUS: quiet hours are still observed hours.
function actBars(d) {
  const b = new Array(24).fill(d.pod === 0 ? 0.06 : 0.1);
  for (const [t] of d.log) {
    const h = parseInt(t.slice(0, 2), 10); if (isNaN(h)) continue;
    b[h] = Math.max(b[h], 1);
    if (h > 0) b[h - 1] = Math.max(b[h - 1], 0.42);
    if (h < 23) b[h + 1] = Math.max(b[h + 1], 0.42);
  }
  return b.map((v, h) => `<i style="height:${Math.round(v * 100)}%" class="${v >= 1 ? 'hi' : ''}" title="${String(h).padStart(2, '0')}:00"></i>`).join('');
}
function stopWatch() { if (watchCam) { watchCam.stop(); watchCam = null; } if (watchClock) { clearInterval(watchClock); watchClock = 0; } }
function renderWatch() {
  const el = root && root.querySelector('.pa-watch'); if (!el) return;
  stopWatch();
  const d = wDay();
  el.innerHTML = `
    <div class="sc-hd"><span class="sc-t">WATCH</span><span class="sc-sub">continuous observation</span><span class="sc-live"><i></i>iSAM</span></div>
    <div class="wt-top">
      <div class="wt-now">
        <div class="wt-nowh"><b>${d.state}</b><span>${d.sub}</span></div>
        <div class="wt-nowf">
          <div class="wt-pain"><div class="wt-bar"><i style="width:${Math.round(d.cpot / 8 * 100)}%"></i></div>
            <div class="wt-pl"><span>CPOT ${d.cpot}/8</span><span>${d.cl}</span></div></div>
          <div class="wt-srcs"><span class="wt-tag cam">CAM</span><span class="wt-tag pat">PATCH</span></div>
        </div>
      </div>
      <div class="wt-cam">
        <canvas id="wtCanvas"></canvas>
        <i class="wt-grid"></i>
        <i class="wt-bk tl"></i><i class="wt-bk tr"></i><i class="wt-bk bl"></i><i class="wt-bk br"></i>
        <span class="wt-cid">${WATCH.cam.id}</span>
        <span class="wt-rec"><i></i><b id="wtClock">--:--:--</b></span>
      </div>
    </div>
    <div class="wt-card"><div class="wt-h">24 H ACTIVITY<span class="wt-src">continuous</span></div>
      <div class="wt-strip">${actBars(d)}</div>
      <div class="wt-sx"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>
    <div class="wt-logwrap">
      <div class="wt-h">MOVEMENT LOG · POD ${d.pod}<span class="wt-src">${d.log.length} events</span></div>
      <div class="wt-log">${d.log.map(([t, ev, det, src]) => `<div class="wt-ev"><i>${t}</i><div class="wt-evb"><b>${ev}</b>${det ? `<em>${det}</em>` : ''}</div><span class="wt-tag ${src}">${src.toUpperCase()}</span></div>`).join('')}</div>
    </div>
    <div class="wt-card"><div class="wt-h">DAY TOTALS</div>
      <div class="wt-led">${d.ledger.map(([l, vv]) => `<div class="wt-li"><span>${l}</span><em>${vv}</em></div>`).join('')}</div></div>
    <div class="wt-card wt-gest"><div class="wt-h">GESTALT<span class="wt-src">camera-scored</span></div><div class="wt-g">${d.g}</div></div>
    <button class="wt-note" id="wtNote">→ feeds the POD ${d.pod} progress note</button>
    <div class="wt-days">${WATCH.days.map((x) => `<button data-day="${x.pod}"${x.pod === watchDay ? ' class="on"' : ''}>POD ${x.pod}</button>`).join('')}</div>`;

  const cv = el.querySelector('#wtCanvas');
  watchCam = makeWatchCam(cv); watchCam.setPose(d.pose); watchCam.start();
  const clock = el.querySelector('#wtClock');
  const tick = () => { const t = new Date(); clock.textContent = [t.getHours(), t.getMinutes(), t.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':'); };
  tick(); watchClock = window.setInterval(tick, 1000);
  el.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { watchDay = +b.dataset.day; renderWatch(); }));
  el.querySelector('#wtNote').onclick = () => emrNavigate('notes'); // the record it writes into
}
window.addEventListener('hud:watch:day', (e) => { const n = e.detail && e.detail.day; if (n == null) return; watchDay = (WATCH.days.find((x) => x.pod === (n | 0)) || WATCH.days[0]).pod; if (root && root.classList.contains('win-watch')) renderWatch(); });
const scOn = (k) => live.has(k); // still attached to the patient?

// A LANE is the monitor grammar: the trace runs the full width with its own
// primary number docked right, both in the trace's colour. Far denser than a
// labelled card — and it's what a real bedside monitor actually looks like.
function scLane(k, h) {
  const n = WAVE_NUM[k] || { l: WAVES[k].label, v: '', u: '' };
  const live = n.live ? ` data-scv="${n.live}"` : '';
  return `<div class="sc-lane" style="--wc:var(--w-${k})">
    <canvas class="sc-wave" data-wave="${k}" style="height:${h}px"></canvas>
    <div class="sc-lv${n.wide ? ' wide' : ''}"><span>${n.l}</span><b${live}>${n.v}</b><i>${n.u}</i></div>
  </div>`;
}
// a dense stat grid — the machine's measured block (3-up)
const scStats = (rows) => `<div class="sc-stats">${rows.map((r) => `<div class="sc-stat"${r.w ? ` style="--wc:var(--w-${r.w})"` : ''}><span>${r.l}</span><b${r.live ? ` data-scv="${r.live}"` : ''}${r.w ? ' class="tint"' : ''}>${r.v}</b>${r.u ? `<i>${r.u}</i>` : ''}</div>`).join('')}</div>`;
// small setting chips (what the device is SET to, beside what it measures)
const scChips = (pairs) => `<div class="sc-setchips">${pairs.map(([l, v]) => `<span class="sc-sch"><i>${l}</i>${v}</span>`).join('')}</div>`;

// live, mutable device settings — seeded from the orders (POD0 via CONTROLS),
// then written by the on-device control panels. Kept separate from POD0 so the
// note/orders stay the record of what was ORDERED while these track what's SET.
const deviceSettings = {};
Object.keys(CONTROLS).forEach((k) => (deviceSettings[k] = { ...CONTROLS[k].seed }));
const dset = (k) => deviceSettings[k];
const fmt = (v, dp = 0) => (typeof v === 'number' ? v.toFixed(dp) : v);
const ventLine = () => { const v = dset('vent'); return `${v.mode} · FiO₂ ${v.fio2} · PEEP ${v.peep} · f ${v.rate}`; };
const pumpShort = () => { const p = dset('pumps'); return `norad ${fmt(p.norad, 2)} · dob ${fmt(p.dobut, 1)}`; };
const bandLabel = (v) => (CONTROLS.warm.bands.find((b) => b.v === v) || {}).label || '—';

/* What is NOT attached is not drawn.
 *
 * These tiles used to render greyed (.sc-off) for every device in HOOKUP whether
 * or not it was on the patient, so POD 3 showed a ventilator, a balloon pump and
 * four infusions that had all come out days earlier — a dimmed machine still
 * reads as a machine that is there. Recovery is things LEAVING, and the panel
 * should empty as they go.
 *
 * Tiles drop whole when their device is gone; the infusions grid and the chip
 * row drop when nothing in them is left; and TELEMETRY's arterial and CVP lanes
 * drop individually, because the monitor outlives both of them. */
function scopeOverviewHTML() {
  const v = dset('vent'), ib = dset('iabp');
  const t = [];

  if (scOn('monitor')) t.push(`
      <div class="sc-tile">
        <div class="sc-th">TELEMETRY<span class="sc-set">5-lead · sinus, paced backup</span></div>
        <div class="sc-click" data-open="monitor">${scLane('ecg', 40)}${scLane('pleth', 30)}</div>
        ${scOn('art') ? `<div class="sc-click" data-open="art">${scLane('abp', 30)}</div>` : ''}
        ${scOn('cvc') ? `<div class="sc-click" data-open="cvc">${scLane('cvp', 26)}</div>` : ''}
      </div>`);

  if (scOn('vent')) t.push(`
      <div class="sc-tile">
        <div class="sc-th">VENTILATOR<span class="sc-set">${v.mode}</span></div>
        <div class="sc-click" data-open="vent">${scLane('vent', 30)}${scLane('capno', 26)}</div>
        ${scChips([['FiO₂', v.fio2 + '%'], ['PEEP', v.peep], ['Vt', v.tv], ['f', v.rate]])}
        ${scOn('ett') ? `<button class="sc-chip" data-open="ett">ET tube · ${POD0.ett.size} at ${POD0.ett.depth} cm · cuff ${POD0.ett.cuff}</button>` : ''}
      </div>`);

  if (scOn('iabp')) t.push(`
      <div class="sc-tile">
        <div class="sc-th">IABP<span class="sc-set">${ib.ratio} · ${ib.trigger} trigger</span></div>
        <div class="sc-click" data-open="iabp">${scLane('iabp', 30)}</div>
        ${scChips([['Aug', ib.aug + '%'], ['Unassist', '96'], ['Assist EDP', '48']])}
      </div>`);

  const io = ['pumps', 'drains', 'ucath', 'warm'].filter(scOn);
  if (io.length) t.push(`
      <div class="sc-tile">
        <div class="sc-th">INFUSIONS &amp; OUTPUTS<span class="sc-set">last 6 h</span></div>
        <div class="sc-grid">
          ${io.map((k) => { const d = HOOKUP.find((x) => x.key === k); const cv = k === 'pumps' ? pumpShort() : d.short; return `<button class="sc-cell" data-open="${k}"><span class="sc-cl">${d.label}</span><b class="sc-cv">${cv}</b><canvas class="sc-trend" data-trend="${k}"></canvas></button>`; }).join('')}
        </div>
      </div>`);

  const chips = [['flowtron', 'Flowtron · cycling'], ['suction', 'Suction · standby']].filter(([k]) => scOn(k));
  if (chips.length) t.push(`
      <div class="sc-chips">
        ${chips.map(([k, lb]) => `<button class="sc-chip" data-open="${k}">${lb}</button>`).join('')}
      </div>`);

  // the header said "POD 0 · h1" on every day, including the ones where nothing
  // in the panel below it was from POD 0
  const sub = podDay === 0 ? 'POD 0 · h1' : `POD ${podDay}`;
  const body = t.length ? t.join('') : '<div class="pw-empty">nothing attached · unmonitored</div>';
  return `
    <div class="sc-hd"><span class="sc-t">SCOPE</span><span class="sc-sub">${sub}</span><span class="sc-ok">IN LIMITS</span></div>
    <div class="sc-scroll">${body}</div>`;
}
function scopeDetailHTML(key) {
  const d = HOOKUP.find((x) => x.key === key); if (!d) return scopeOverviewHTML();
  const waves = (d.waves || []).map((k) => scLane(k, 46)).join('');
  const t = TRENDS[key];
  const trend = t ? `<div class="sc-tile"><div class="sc-th">TREND<span class="sc-set">${t.label} · ${t.unit} · 6 h</span></div><canvas class="sc-trend big" data-trend="${key}"></canvas></div>` : '';
  const meas = MEASURED[key];
  const ctrl = CONTROLS[key];
  // for controllable devices the live setpoint lives in the CONTROL panel, so
  // drop the duplicate settings line (d.full) and keep the orders/alarm context.
  const lines = ctrl ? [d.site, ...(SCOPE_DETAIL[key] || [])] : [d.full, d.site, ...(SCOPE_DETAIL[key] || [])];
  const tag = ctrl ? '<span class="sc-live"><i></i>CONTROL</span>' : '<span class="sc-ro">READ-ONLY</span>';
  return `
    <div class="sc-hd"><button id="scBack">‹</button><span class="sc-t">${d.label}</span>${tag}</div>
    <div class="sc-scroll">
      ${waves ? `<div class="sc-tile">${waves}</div>` : ''}
      ${meas ? `<div class="sc-tile"><div class="sc-th">MEASURED<span class="sc-set">reported by device</span></div>${scStats(meas)}</div>` : ''}
      ${trend}
      ${ctrl ? controlsHTML(key) : ''}
      <div class="sc-tile sc-info">${lines.map((l) => `<div class="sc-il">${l}</div>`).join('')}</div>
    </div>`;
}

// --- the on-device control panels (one markup per CONTROLS.kind) -------------
function controlsHTML(key) {
  const c = CONTROLS[key], s = dset(key);
  const head = (sub) => `<div class="sc-th">CONTROL<span class="sc-set">${sub}</span></div><div class="sc-setmsg" data-msg></div>`;
  if (c.kind === 'knob') {
    const modes = c.modes.map((m) => `<button class="vk-mode${m === s.mode ? ' on' : ''}" data-mode="${m}">${m}</button>`).join('');
    const tiles = c.params.map((p, i) => `<button class="vk-param${i === 0 ? ' sel' : ''}" data-param="${p.key}"><span class="vk-pl">${p.label}</span><b class="vk-pv" data-pv="${p.key}">${s[p.key]}</b><i class="vk-pu">${p.unit}</i></button>`).join('');
    return `<div class="sc-tile sc-ctrl" data-ctrl="vent">${head('select · turn · push to confirm')}
      <div class="vk-modes">${modes}</div>
      <div class="vk-body">
        <div class="vk-params">${tiles}</div>
        <div class="vk-knobwrap">
          <div class="vk-knob" tabindex="0"><span class="vk-tick"></span><button class="vk-hub" data-hub>PUSH</button></div>
          <div class="vk-read" data-read>—</div>
        </div>
      </div></div>`;
  }
  if (c.kind === 'pumps') {
    const rows = c.channels.map((ch) => `<div class="pm-row" data-ch="${ch.key}"><span class="pm-name">${ch.label}<i>${ch.unit}</i></span><button class="pm-step" data-d="-1">−</button><b class="pm-val" data-pv="${ch.key}">${fmt(s[ch.key], ch.dp)}</b><button class="pm-step" data-d="1">＋</button><button class="pm-set" data-set="${ch.key}" disabled>SET</button></div>`).join('');
    return `<div class="sc-tile sc-ctrl" data-ctrl="pumps">${head('titrate · confirm each change')}${rows}</div>`;
  }
  if (c.kind === 'iabp') {
    const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map((o) => `<button class="${o === cur ? 'on' : ''}" data-v="${o}">${o}</button>`).join('')}</div>`;
    return `<div class="sc-tile sc-ctrl" data-ctrl="iabp">${head('augmentation · confirm')}
      <div class="ib-line"><span class="ib-lbl">Ratio</span>${seg('ratio', c.ratios, s.ratio)}</div>
      <div class="ib-line"><span class="ib-lbl">Trigger</span>${seg('trigger', c.triggers, s.trigger)}</div>
      <div class="ib-line"><span class="ib-lbl">Augment</span><input class="ib-slider" type="range" min="${c.aug.min}" max="${c.aug.max}" step="${c.aug.step}" value="${s.aug}" data-aug><b class="ib-augv" data-augv>${s.aug}%</b></div>
      <div class="ib-line"><button class="ib-run${s.running ? ' on' : ''}" data-run>${s.running ? 'RUNNING' : 'STANDBY'}</button><button class="sc-confirm" data-confirm disabled>CONFIRM</button></div></div>`;
  }
  if (c.kind === 'bands') {
    const bands = c.bands.map((b) => `<button class="${b.v === s.band ? 'on' : ''}" data-v="${b.v}">${b.label}</button>`).join('');
    return `<div class="sc-tile sc-ctrl" data-ctrl="warm">${head(c.context)}
      <div class="seg wide" data-seg="band">${bands}</div>
      <button class="sc-confirm" data-confirm disabled>CONFIRM</button></div>`;
  }
  if (c.kind === 'toggle') {
    return `<div class="sc-tile sc-ctrl" data-ctrl="flowtron">${head(c.context)}
      <div class="ib-line"><button class="ib-run${s.on ? ' on' : ''}" data-run>${s.on ? 'RUNNING' : 'STANDBY'}</button><button class="sc-confirm" data-confirm disabled>CONFIRM</button></div></div>`;
  }
  return '';
}
// --- control wiring: every change stages as PENDING, applied only on confirm -
function flashSet(tile, txt) {
  const m = tile.querySelector('[data-msg]'); if (!m) return;
  m.textContent = txt; m.classList.add('on');
  clearTimeout(m._t); m._t = window.setTimeout(() => m.classList.remove('on'), 1500);
}
function pulseMarker(key) {
  const d = HOOKUP.find((x) => x.key === key);
  if (d && d.marker) window.dispatchEvent(new CustomEvent('hud:marker:pulse', { detail: { marker: d.marker } }));
}
function wireControls(el, key) {
  const tile = el.querySelector('.sc-ctrl'); if (!tile) return;
  const c = CONTROLS[key], s = dset(key);
  if (c.kind === 'knob') wireKnob(tile, c, s, key);
  else if (c.kind === 'pumps') wirePumps(tile, c, s, key);
  else if (c.kind === 'iabp') wireIabp(tile, c, s, key);
  else if (c.kind === 'bands') wireBands(tile, c, s, key);
  else if (c.kind === 'toggle') wireToggle(tile, c, s, key);
}
function wireKnob(tile, c, s, key) {
  const pmap = {}; c.params.forEach((p) => (pmap[p.key] = p));
  const knob = tile.querySelector('.vk-knob'), tick = tile.querySelector('.vk-tick'), read = tile.querySelector('[data-read]');
  const st = { kind: 'param', key: c.params[0].key, pending: s[c.params[0].key], rot: 0 };
  const pvEl = (k) => tile.querySelector(`.vk-pv[data-pv="${k}"]`);
  const paramEl = (k) => tile.querySelector(`.vk-param[data-param="${k}"]`);
  const refresh = () => {
    c.params.forEach((pp) => { const sel = st.kind === 'param' && pp.key === st.key; paramEl(pp.key).classList.toggle('sel', sel); pvEl(pp.key).textContent = sel ? st.pending : s[pp.key]; paramEl(pp.key).classList.toggle('pending', sel && st.pending !== s[pp.key]); });
    tile.querySelectorAll('.vk-mode').forEach((b) => { b.classList.toggle('on', b.dataset.mode === s.mode); b.classList.toggle('pending', st.kind === 'mode' && b.dataset.mode === st.pending && st.pending !== s.mode); });
    let changed, txt;
    if (st.kind === 'param') { const p = pmap[st.key]; changed = st.pending !== s[st.key]; txt = changed ? `${p.label} ${s[st.key]} → ${st.pending} ${p.unit}` : `${p.label} · ${s[st.key]} ${p.unit}`; }
    else { changed = st.pending !== s.mode; txt = changed ? `MODE ${s.mode} → ${st.pending}` : `MODE · ${s.mode}`; }
    read.textContent = txt; read.classList.toggle('live', changed); tick.style.transform = `rotate(${st.rot}deg)`;
  };
  const selectParam = (k) => { st.kind = 'param'; st.key = k; st.pending = s[k]; st.rot = 0; refresh(); };
  const stageMode = (m) => { st.kind = 'mode'; st.pending = m; refresh(); };
  const bump = (dir) => { if (st.kind !== 'param') return; const p = pmap[st.key]; st.pending = Math.min(p.max, Math.max(p.min, +(st.pending + dir * p.step).toFixed(4))); st.rot += dir * 15; };
  const confirm = () => {
    if (st.kind === 'param') { if (st.pending === s[st.key]) return; s[st.key] = st.pending; const p = pmap[st.key]; flashSet(tile, `${p.label} SET ${s[st.key]} ${p.unit} ✓`); }
    else { if (st.pending === s.mode) return; s.mode = st.pending; flashSet(tile, `MODE SET ${s.mode} ✓`); }
    pulseMarker(key); refresh();
  };
  tile.querySelectorAll('.vk-param').forEach((elp) => (elp.onclick = () => selectParam(elp.dataset.param)));
  tile.querySelectorAll('.vk-mode').forEach((b) => (b.onclick = () => stageMode(b.dataset.mode)));
  tile.querySelector('[data-hub]').onclick = (e) => { e.stopPropagation(); confirm(); };
  let drag = false, lastA = 0, acc = 0;
  const ang = (e) => { const r = knob.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  knob.addEventListener('pointerdown', (e) => { if (e.target.closest('[data-hub]')) return; drag = true; lastA = ang(e); acc = 0; try { knob.setPointerCapture(e.pointerId); } catch (_) {} });
  knob.addEventListener('pointermove', (e) => { if (!drag) return; const a = ang(e); let d = a - lastA; if (d > 180) d -= 360; if (d < -180) d += 360; lastA = a; st.rot += d; acc += d; while (acc >= 15) { acc -= 15; bump(1); } while (acc <= -15) { acc += 15; bump(-1); } refresh(); });
  knob.addEventListener('pointerup', () => { drag = false; });
  knob.addEventListener('wheel', (e) => { e.preventDefault(); bump(e.deltaY < 0 ? 1 : -1); refresh(); }, { passive: false });
  knob.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { bump(1); refresh(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { bump(-1); refresh(); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { confirm(); e.preventDefault(); }
  });
  refresh();
}
function wirePumps(tile, c, s, key) {
  const cmap = {}; c.channels.forEach((ch) => (cmap[ch.key] = ch));
  const pend = {}; c.channels.forEach((ch) => (pend[ch.key] = s[ch.key]));
  const row = (k) => tile.querySelector(`.pm-row[data-ch="${k}"]`);
  const refresh = (k) => { const ch = cmap[k], r = row(k), changed = pend[k] !== s[k]; const v = r.querySelector('.pm-val'); v.textContent = fmt(pend[k], ch.dp); v.classList.toggle('pending', changed); r.querySelector('.pm-set').disabled = !changed; };
  c.channels.forEach((ch) => {
    const r = row(ch.key);
    r.querySelectorAll('.pm-step').forEach((b) => (b.onclick = () => { const dir = +b.dataset.d; pend[ch.key] = Math.min(ch.max, Math.max(ch.min, +(pend[ch.key] + dir * ch.step).toFixed(4))); refresh(ch.key); }));
    r.querySelector('.pm-set').onclick = () => { if (pend[ch.key] === s[ch.key]) return; s[ch.key] = pend[ch.key]; refresh(ch.key); flashSet(tile, `${ch.label} SET ${fmt(s[ch.key], ch.dp)} ${ch.unit} ✓`); pulseMarker(key); };
  });
}
function wireIabp(tile, c, s, key) {
  const pend = { ...s }, confirmBtn = tile.querySelector('[data-confirm]');
  const dirty = () => (confirmBtn.disabled = pend.ratio === s.ratio && pend.trigger === s.trigger && pend.aug === s.aug && pend.running === s.running);
  tile.querySelectorAll('.seg[data-seg]').forEach((seg) => {
    const name = seg.dataset.seg;
    seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { pend[name] = b.dataset.v; seg.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x.dataset.v === s[name]); x.classList.toggle('pending', x === b && x.dataset.v !== s[name]); }); dirty(); }));
  });
  const slider = tile.querySelector('[data-aug]'), augv = tile.querySelector('[data-augv]');
  if (slider) slider.oninput = () => { pend.aug = +slider.value; augv.textContent = slider.value + '%'; augv.classList.toggle('pending', pend.aug !== s.aug); dirty(); };
  const run = tile.querySelector('[data-run]');
  if (run) run.onclick = () => { pend.running = !pend.running; run.textContent = pend.running ? 'RUNNING' : 'STANDBY'; run.classList.toggle('on', pend.running); run.classList.toggle('pending', pend.running !== s.running); dirty(); };
  confirmBtn.onclick = () => {
    Object.assign(s, pend);
    tile.querySelectorAll('.pending').forEach((x) => x.classList.remove('pending'));
    tile.querySelectorAll('.seg[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === s[seg.dataset.seg])));
    confirmBtn.disabled = true; flashSet(tile, `IABP SET ${s.ratio} · aug ${s.aug}% · ${s.trigger} ✓`); pulseMarker(key);
  };
}
function wireBands(tile, c, s, key) {
  const seg = tile.querySelector('.seg[data-seg="band"]'), confirmBtn = tile.querySelector('[data-confirm]');
  let pend = s.band;
  seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { pend = +b.dataset.v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('pending', +x.dataset.v === pend && pend !== s.band)); confirmBtn.disabled = pend === s.band; }));
  confirmBtn.onclick = () => { s.band = pend; seg.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', +x.dataset.v === s.band); x.classList.remove('pending'); }); confirmBtn.disabled = true; flashSet(tile, `WARMER SET ${bandLabel(s.band)} ✓`); };
}
function wireToggle(tile, c, s, key) {
  const run = tile.querySelector('[data-run]'), confirmBtn = tile.querySelector('[data-confirm]');
  let pend = s.on;
  run.onclick = () => { pend = !pend; run.textContent = pend ? 'RUNNING' : 'STANDBY'; run.classList.toggle('on', pend); run.classList.toggle('pending', pend !== s.on); confirmBtn.disabled = pend === s.on; };
  confirmBtn.onclick = () => { s.on = pend; run.classList.remove('pending'); run.classList.toggle('on', s.on); confirmBtn.disabled = true; flashSet(tile, `FLOWTRON ${s.on ? 'RUNNING' : 'STANDBY'} ✓`); pulseMarker(key); };
}
function renderScope() {
  const el = root && root.querySelector('.pa-scope'); if (!el) return;
  stopScope();
  el.innerHTML = scopeView === 'detail' ? scopeDetailHTML(scopeDev) : scopeOverviewHTML();
  el.querySelectorAll('.sc-wave').forEach((cv) => { const s = makeMiniScope(cv, cv.dataset.wave); s.start(); scopeScopes.push(s); });
  el.querySelectorAll('.sc-trend').forEach((cv) => { const t = TRENDS[cv.dataset.trend]; if (t) makeTrend(cv, t.series, { target: t.target }); });
  el.querySelectorAll('[data-open]').forEach((n) => (n.onclick = (e) => { e.stopPropagation(); scopeView = 'detail'; scopeDev = n.dataset.open; renderScope(); }));
  if (scopeView === 'detail' && CONTROLS[scopeDev]) wireControls(el, scopeDev);
  const back = el.querySelector('#scBack'); if (back) back.onclick = () => { scopeView = 'overview'; scopeDev = null; renderScope(); };
  // live numbers (HR / SpO₂ track the bed like the twin's vitals block)
  scopeTimer = window.setInterval(() => {
    const b = bedById(state.focusId); if (!b) return;
    el.querySelectorAll('[data-scv]').forEach((n) => { const k = n.dataset.scv; n.textContent = k === 'bp' ? b.vitals.sys + '/' + b.vitals.dia : k === 'temp' ? b.vitals.temp.toFixed(1) : b.vitals[k]; });
  }, 1000);
}

// ---- connected-devices rail (top-right): every machine wired to this patient.
// Chapter-aware: pre-cath is a quiet room; post-cath the pumps + site checks
// light up. Timers tick live (see devTick).
// Heparin is an ORDER, not a fixture. It was drawn in the ER and TARS said
// there it needed a clinician — so it is absent from the rail until one signs,
// and the list visibly GAINS a device the moment somebody presses APPROVE.
// That is the ER's promise being collected on, in the only place it can be.
let heparinOn = false;
function startHeparin() {
  heparinOn = true;
  const rail = root && root.querySelector('#devRail');
  if (rail) rail.innerHTML = devRailHTML();
  pushAcuteMarkers('lac'); // the infusion starts: ping the cannula it runs through
}
/* ── the acute bedside, as DATA ──────────────────────────────────────────────
   What is actually on him before the lab. Each entry knows where it sits on the
   body, so the device rail and the twin's glow markers are one list read twice
   rather than two lists maintained in parallel — which is exactly how the ECG
   ended up drawn three different ways earlier in this act.

   `markers` empty means the thing is in the bay, not on the patient: defib pads
   on standby and a bed alarm are real devices with no anatomy. */
const ACUTE_DEVICES = [
  { label: 'MONITOR · 5-LEAD', value: 'continuous · ST-seg on', markers: ['chestR', 'chestL'] },
  { label: 'O₂ · NASAL', value: '4 L/min · FiO₂ 28%', markers: ['face'] },
  { label: 'IV · NS 0.9%', value: '80 mL/hr · 18G L-AC', markers: ['lac'] },
  // the heparin runs through the SAME cannula — it pings that site rather than
  // lighting a new one, because no new hole was made in him
  { label: 'PUMP · HEPARIN', value: '1000 u/hr', markers: ['lac'], onlyWhenHeparin: true },
  { label: 'NIBP', value: null, id: 'd_nibp', markers: ['rarm'] }, // value is a live timer
  { label: 'DEFIB PADS', value: 'STANDBY', markers: [] },
  { label: 'BED', value: 'EXIT-ALARM ON', markers: [] },
];
const acuteLive = () => ACUTE_DEVICES.filter((d) => !d.onlyWhenHeparin || heparinOn);
function acuteRailRows() {
  return acuteLive().map((d) => `<div class="kv"><span>${d.label}</span><b${d.id ? ` id="${d.id}"` : ''}>${d.value === null ? `q5m · next ${mmss(dev.nibp)}` : d.value}</b></div>`).join('');
}
/** Light the acute markers on the twin. Same event the postop hookup uses, so
 *  Scene 4's twelve read as an escalation of something already established
 *  rather than a mechanism appearing out of nowhere. */
function pushAcuteMarkers(ping) {
  if (isPostopWorld() || state.chapter === 'continued') return; // postop drives its own; post-cath shows the vascular layer
  const keys = acuteLive().flatMap((d) => d.markers);
  window.dispatchEvent(new CustomEvent('hud:markers', { detail: { keys, ping: ping || null } }));
}

const dev = { nibpEvery: 300, nibp: 300, hep: 3 * 3600 + 40 * 60, gtn: 5 * 3600 + 5 * 60, tr: 32 * 60, urine: 45, uAcc: 0 };
const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const hm = (t) => Math.floor(t / 3600) + 'h ' + String(Math.floor((t % 3600) / 60)).padStart(2, '0') + 'm';
function devRailHTML() {
  dev.nibpEvery = dev.nibp = state.chapter === 'continued' ? 900 : 300; // q15m post-cath · q5m acute
  if (isPostopWorld()) {
    // boot empty — the rail fills as Panel B connects each device. The stepdown
    // chapter reuses this shell for one frame only: its opening beat fires the
    // POD-6 day-break, whose setPod rebuilds the rail at "nothing attached".
    podDay = 0; live.clear(); hkActive = true; feedOn.clear();
    return `<div class="tk">CONNECTED DEVICES · POD 0<span class="hk-count">0 / ${HOOKUP.length}</span></div><div class="kv hk-empty">establishing…</div>`;
  }
  if (state.chapter === 'continued') return `
      <div class="tk">CONNECTED DEVICES · LIVE</div>
      <div class="kv"><span>MONITOR · 5-LEAD</span><b>continuous · ST-seg on</b></div>
      <div class="kv"><span>O₂ · NASAL</span><b>2 L/min · weaning</b></div>
      <div class="kv"><span>PUMP · HEPARIN</span><b id="d_hep">1000 u/hr · ${hm(dev.hep)}</b></div>
      <div class="kv"><span>PUMP · GTN</span><b id="d_gtn">25 µg/min · ${hm(dev.gtn)}</b></div>
      <div class="kv"><span>IV · MAINT</span><b>60 mL/hr</b></div>
      <div class="kv"><span>RADIAL · TR BAND</span><b id="d_tr">check ${mmss(dev.tr)}</b></div>
      <div class="kv"><span>URINE</span><b id="d_urine">${dev.urine} mL/hr</b></div>
      <div class="kv"><span>NIBP</span><b id="d_nibp">q15m · next ${mmss(dev.nibp)}</b></div>
      <div class="kv"><span>DEFIB PADS</span><b>STANDBY</b></div>
      <div class="kv"><span>BED</span><b>EXIT-ALARM ON</b></div>`;
  // MONITOR leads: it is the most important thing attached to him, and
  // ST-segment monitoring is what you run on an ACS patient waiting for a lab —
  // the system is still watching the thing iSAM found.
  return `
      <div class="tk">CONNECTED DEVICES · LIVE</div>
      ${acuteRailRows()}`;
}
let devAcc = 0;
function devTick(dt) {
  if (isPostopWorld()) return; // postop rail is the hookup checklist — no q-timers
  devAcc += dt; if (devAcc < 1) return; const step = Math.floor(devAcc); devAcc -= step;
  const q = (s2) => root.querySelector(s2);
  dev.nibp -= step; if (dev.nibp <= 0) dev.nibp = dev.nibpEvery; // cuff cycles, timer restarts
  const nb = q('#d_nibp'); if (nb) nb.textContent = (state.chapter === 'continued' ? 'q15m' : 'q5m') + ' · next ' + mmss(dev.nibp);
  if (state.chapter === 'continued') {
    dev.hep = Math.max(0, dev.hep - step); dev.gtn = Math.max(0, dev.gtn - step); dev.tr = Math.max(0, dev.tr - step);
    const h = q('#d_hep'); if (h) h.textContent = '1000 u/hr · ' + hm(dev.hep);
    const g = q('#d_gtn'); if (g) g.textContent = '25 µg/min · ' + hm(dev.gtn);
    const t = q('#d_tr'); if (t) t.textContent = dev.tr > 0 ? 'check ' + mmss(dev.tr) : 'CHECK NOW';
    dev.uAcc += step; if (dev.uAcc >= 20) { dev.uAcc = 0; dev.urine = Math.max(38, Math.min(52, dev.urine + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2)))); const u = q('#d_urine'); if (u) u.textContent = dev.urine + ' mL/hr'; }
  }
}

function fitCanvas(cv, ctx) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
  const pw = Math.round(w * DPR); if (cv.width !== pw) { cv.width = pw; cv.height = Math.round(h * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  return { w, h };
}
function drawEcg(dt) {
  const b = bedById(state.focusId); if (!b || !ecgCv) return;
  const dim = fitCanvas(ecgCv, ecgX); if (!dim) return;
  // hookup gate: before the monitor connects, the strip is just noisy flatline
  const flat = hkActive && !feedOn.has('ecg');
  // acuity still picks the COLOUR — red for critical is right either way — but
  // the morphology comes off the bed, not the alarm level. Except in the
  // post-op world, where the DAY can override it. POD 3 is the whole reason:
  // its argument is a waveform shape, so the strip has to be drawing pericarditis
  // while iSAM is describing pericarditis.
  const type = b.patient.acuity, hr = b.vitals.hr;
  const pat = (isPostopWorld() && podByDay(podDay).ecg) || ecgPatternForBed(b);
  const n = Math.max(1, Math.round(dt * ECG_SPEED));
  for (let i = 0; i < n; i++) { beatPhase = (beatPhase + (hr / 60) / ECG_SPEED) % 1; ecgBuf.push(flat ? (Math.random() - 0.5) * 0.03 : ecgAt(beatPhase, pat) + (Math.random() - 0.5) * 0.015); }
  const maxN = Math.ceil(dim.w / ECG_GAP) + 2; while (ecgBuf.length > maxN) ecgBuf.shift();
  ecgX.clearRect(0, 0, dim.w, dim.h); const mid = dim.h * 0.55, amp = dim.h * 0.4;
  ecgX.strokeStyle = flat ? 'rgba(130,160,170,0.55)' : type === 'critical' ? '#ff6a64' : type === 'watch' ? '#ffc14a' : '#5fe6c4';
  ecgX.shadowColor = ecgX.strokeStyle; ecgX.shadowBlur = 6; ecgX.lineWidth = 1.5; ecgX.lineJoin = 'round'; ecgX.beginPath();
  for (let i = 0; i < ecgBuf.length; i++) { const x = i * ECG_GAP, y = mid - ecgBuf[i] * amp; i ? ecgX.lineTo(x, y) : ecgX.moveTo(x, y); }
  ecgX.stroke(); ecgX.shadowBlur = 0;
}
let clockAcc = 0;
export function updateHud(dt) {
  if (state.mode === 'floor') {
    clockAcc += dt; if (clockAcc > 0.25) { clockAcc = 0; const el = root.querySelector('#h_clock'); if (el) el.textContent = new Date().toTimeString().slice(0, 8); }
    return;
  }
  const b = bedById(state.focusId); if (!b) return;
  const q = (s) => root.querySelector(s);
  // hookup gate (postop): a vital only goes live once its source device connects
  const gated = hkActive;
  const on = (k) => !gated || feedOn.has(k);
  q('#p_id').textContent = b.id;
  q('#p_hr').textContent = on('hr') ? b.vitals.hr : '--';
  q('#p_bp').textContent = on('bp') ? b.vitals.sys + '/' + b.vitals.dia : '--';
  q('#p_spo2').textContent = on('spo2') ? b.vitals.spo2 : '--';
  q('#p_rr').textContent = on('rr') ? b.vitals.rr : '--';
  q('#p_temp').textContent = on('temp') ? b.vitals.temp.toFixed(1) : '--';
  devTick(dt);
  const reveal = performance.now() >= lsamRevealAt, st = q('#p_lstatus'), t = b.traj, flagged = t.lsam === 'flagged';
  st.textContent = !reveal ? 'ANALYZING…' : flagged ? 'FLAGGED' : 'STABLE';
  st.className = 'st ' + (!reveal ? 'an' : flagged ? 'fl' : 'ok');
  lsamShown = lerp(lsamShown, reveal ? t.news2 : 0, 0.15);
  q('#p_news').textContent = reveal ? Math.round(lsamShown) : '…';
  q('#p_prob').textContent = reveal ? (t.detProb * 100).toFixed(0) + '%' : '…';
  const bar = q('#p_bar'); bar.style.width = (reveal ? t.detProb * 100 : 0) + '%';
  bar.style.background = t.detProb > 0.6 ? '#ff5a52' : t.detProb > 0.25 ? '#ffc14a' : '#5fe6c4';
  const vd = q('#p_verdict'); vd.textContent = reveal ? t.verdict : 'computing trajectory…';
  vd.className = 'verdict ' + (reveal ? b.patient.acuity : 'an');
  drawEcg(dt);
}

export function playTransition() { if (!wipe) return; wipe.classList.remove('run'); void wipe.offsetWidth; wipe.classList.add('run'); }

export function initHud(hostSel) {
  root = document.querySelector(hostSel);
  root.innerHTML = TPL;
  floorLayer = root.querySelector('.hud-floor'); patientLayer = root.querySelector('.hud-patient'); wipe = root.querySelector('.hud-wipe');
  ecgCv = root.querySelector('#hudEcg'); ecgX = ecgCv.getContext('2d');

  root.querySelectorAll('.rrow').forEach((el) => (el.onclick = () => setMode('patient', el.dataset.bed)));
  heparinOn = false; // a fresh mount starts before anyone has signed
  const rail = root.querySelector('#devRail'); if (rail) rail.innerHTML = devRailHTML();
  /* Cutting STRAIGHT into Step-Down (the bar's POD 6 pill) has to look like POD 6
   * on the first frame. The rail's post-op shell always boots at POD 0 —
   * "CONNECTED DEVICES · POD 0 · establishing…" — because normally you arrive
   * here having walked the hookup, and the chapter's opening beat fires the
   * day-break that corrects it. Jumped into cold, that beat has not run yet, so
   * you land on a POD-0 bedside for a patient who is going home. Seed it. */
  if (state.chapter === 'stepdown') setPod(6);
  pushAcuteMarkers();

  // Scene 4 · hookup wiring: chat beats drive connects (hud:hookup); hovering
  // a rail row or a glowing body marker surfaces the compact device card.
  window.addEventListener('hud:hookup:connected', (e) => {
    hookupRail(e.detail ? e.detail.n : live.size + 1);
    if (root.classList.contains('win-scope') && scopeView === 'overview') renderScope(); // undim the new tile
  });
  window.addEventListener('hud:hookup:remove', (e) => hookupRemove((e.detail || {}).keys));
  window.addEventListener('hud:pod', (e) => setPod((e.detail || {}).day));
  window.addEventListener('hud:heparin', () => startHeparin());
  window.addEventListener('hud:hookup:reset', () => {
    hookupReset();
    if (root.classList.contains('win-scope')) { scopeView = 'overview'; scopeDev = null; renderScope(); }
  });
  // clicking a glow marker (scene.js raycast) opens that machine's feed in SCOPE
  window.addEventListener('hud:scope:open', (e) => {
    const mk = e.detail && e.detail.marker;
    const dev = HOOKUP.find((d) => live.has(d.key) && d.marker === mk);
    if (!dev) return;
    // The hover card has to go with the twin it belonged to. Opening SCOPE
    // replaces the canvas the markers live on, so no further pointermove ever
    // reaches it and the null-hover that dismisses the card never fires — it
    // sat pinned over the feed until you went back and hovered a marker again.
    // (hideCard is declared below; this runs on an event, long after.)
    hideCard();
    scopeView = 'detail'; scopeDev = dev.key; setWindow('scope');
  });
  // card lives on #hud (root) — a positioned, full-size layer — so it sits
  // BESIDE the cursor/marker (patientLayer collapses to ~0 height, which was
  // pinning the card to the top).
  const card = document.createElement('div'); card.className = 'hk-card'; root.appendChild(card);
  let cardScopes = [];
  const stopScopes = () => { cardScopes.forEach((s) => s.stop()); cardScopes = []; };
  const placeCard = (cx, cy) => {
    const pr = root.getBoundingClientRect();
    const x = cx - pr.left, y = cy - pr.top;
    const cw = card.offsetWidth || 220, chh = card.offsetHeight || 120;
    // prefer to the right of the cursor; flip left if it would overflow
    const lx = x + 18 + cw > pr.width ? x - 18 - cw : x + 18;
    card.style.left = Math.max(8, Math.min(pr.width - cw - 8, lx)) + 'px';
    card.style.top = Math.max(8, Math.min(pr.height - chh - 8, y - 10)) + 'px';
    card.classList.add('on');
  };
  const showDevices = (list, cx, cy) => {
    if (!list.length) return;
    stopScopes();
    card.innerHTML = list.map((d) => {
      const waves = (d.waves || []).map((wk) => `<canvas class="hkc-wave" data-wave="${wk}"></canvas>`).join('');
      return `<div class="hkc-t"><i class="hk-led"></i>${d.label}</div><div class="hkc-v">${d.full}</div>${waves || `<div class="hkc-s">${d.site}</div>`}`;
    }).join('<div class="hkc-hr"></div>');
    placeCard(cx, cy);
    card.querySelectorAll('.hkc-wave').forEach((cv) => { const s = makeMiniScope(cv, cv.dataset.wave); s.start(); cardScopes.push(s); });
    placeCard(cx, cy); // re-place now that wave canvases set the real height
  };
  const hideCard = () => { card.classList.remove('on'); stopScopes(); };
  const railEl = root.querySelector('#devRail');
  railEl.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.hk-row');
    if (!row) { hideCard(); return; }
    showDevices(HOOKUP.filter((d) => d.key === row.dataset.dev), e.clientX, e.clientY);
  });
  railEl.addEventListener('mouseleave', hideCard);
  window.addEventListener('hud:marker:hover', (e) => {
    const d = e.detail || {};
    if (!d.key) { hideCard(); return; }
    showDevices(HOOKUP.filter((v) => live.has(v.key) && v.marker === d.key), d.x, d.y);
  });

  // Scene 4: the Panel A window toggle (TWIN · SCOPE · WATCH) — postop only;
  // earlier chapters never see the tabs and always render the twin.
  const tabs = root.querySelector('#paTabs');
  if (tabs) {
    if (!isPostopWorld()) tabs.style.display = 'none';
    // the tab always lands on the overview — markers are the detail entry
    tabs.querySelectorAll('button').forEach((b) => (b.onclick = () => { hideCard(); scopeView = 'overview'; scopeDev = null; setWindow(b.dataset.w); }));
  }

  // the trajectory block (iSAM's) only appears when the story summons it
  window.addEventListener('hud:trajectory', () => patientLayer.querySelector('.lsam')?.classList.add('on'));

  onModeChange((mode, focusId) => {
    const patient = mode === 'patient';
    root.classList.toggle('patient', patient); root.classList.toggle('floor', !patient);
    if (root.parentElement) root.parentElement.classList.toggle('floor-mode', !patient);
    floorLayer.style.display = patient ? 'none' : 'block';
    patientLayer.style.display = patient ? 'block' : 'none';
    if (patient) { lsamShown = 0; lsamRevealAt = performance.now() + (bedById(focusId).cardiac ? 2600 : 1800); patientLayer.querySelector('.lsam')?.classList.remove('on'); }
  });
  root.classList.add('floor');
  if (root.parentElement) root.parentElement.classList.add('floor-mode');
  floorLayer.style.display = 'block'; patientLayer.style.display = 'none';
}
