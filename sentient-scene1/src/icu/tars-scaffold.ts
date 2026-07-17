// The TARS app's exact panel scaffold, lifted verbatim from tars-app/index.html
// (the <body> content minus its <script>). TarsMount injects this, then boots
// tars/main.js against it. Element IDs must match what tars' modules query.
export const TARS_HTML = `
  <div id="app">
    <!-- ===== top bar (light chrome) ===== -->
    <div id="topbar">
      <div id="topInfo"></div>
      <button class="theme-btn" id="themeBtn" title="Light / dark" aria-label="Toggle theme"></button>
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

      <div class="gutter" id="gutAB" title="Drag to resize"></div>

      <!-- PANEL B : SPLIT 2 — agent-swap surface (built by chat.js) -->
      <div class="panel" id="panelB"></div>

      <div class="gutter" id="gutBC" title="Drag to resize"></div>

      <!-- PANEL C : apps + dock (light) -->
      <div class="panel" id="panelC">
        <div id="appView"></div>
        <div class="dock" id="dock"></div>
      </div>
    </div>
  </div>

  <div id="loading"><div class="lg">T</div><div class="tx">Initialising TARS</div></div>
`
