// The TARS app's exact panel scaffold, lifted verbatim from tars-app/index.html
// (the <body> content minus its <script>). TarsMount injects this, then boots
// tars/main.js against it. Element IDs must match what tars' modules query.
export const TARS_HTML = `
  <div id="app">
    <!-- ===== top bar (light chrome) ===== -->
    <div id="topbar">
      <div class="brand"><span class="mk">T</span>TARS<span class="live"><span class="d"></span>LIVE</span></div>
      <div class="mode-chip"><span class="accent" id="modeDot"></span><span id="modeName">Command Hub</span><span class="sub" id="modeSub">· nurse bay · macro</span></div>
      <button class="back-btn" id="backBtn">‹ Back to floor</button>
      <span class="ward" id="wardName">ICU — North · 8 beds</span>
      <div class="spacer"></div>
      <div class="legend">
        <div class="it"><span class="sw auto"></span>Autonomous · operational</div>
        <div class="it"><span class="sw gate"></span>Gated · clinical sign-off</div>
      </div>
    </div>

    <!-- ===== three panels ===== -->
    <div id="panels">
      <!-- PANEL A : dark X-ray scanner viewport -->
      <div class="panel" id="panelA">
        <div id="stage">
          <canvas id="c"></canvas>
          <div id="hud"></div>
          <div class="stage-hd"><div class="t" id="stageT">Digital State · ICU Floor</div><div class="s" id="stageS">Live spatial twin · 8 monitored beds</div></div>
        </div>
      </div>

      <!-- PANEL B : SPLIT 2 — agent-swap surface (built by chat.js) -->
      <div class="panel" id="panelB"></div>

      <!-- PANEL C : apps + dock (light) -->
      <div class="panel" id="panelC">
        <div class="panel-hd"><span class="accent" style="background:var(--ink-3)"></span><span class="t" id="appsTitle">Workspace</span></div>
        <div id="appView"></div>
        <div class="dock" id="dock"></div>
      </div>
    </div>
  </div>

  <div id="loading"><div class="lg">T</div><div class="tx">Initialising TARS</div></div>
`
