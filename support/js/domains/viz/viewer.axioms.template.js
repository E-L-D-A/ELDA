export const template = (entry) => /* html */`
  <header>
    <h1>
      <span id="live-btn" title="Static snapshot">
        <span id="live">
          <span class="status-dot"></span>
        </span>
        <span class="brand">ELDA</span>
      </span>
      <div class="sep"></div>
      <span id="app-name"></span>
    </h1>
    <span class="counts" id="counts"></span>
    <div style="flex-grow: 1"></div>
    <span class="toggles">
      <label title="Highlight every transitive dependency on selection instead of only the adjacent ones"><input type="checkbox" id="t-reach"> reach</label>
      <label><input type="checkbox" id="t-ok" checked> deps</label>
      <label><input type="checkbox" id="t-type"> type-only</label>
      <label><input type="checkbox" id="t-assets" checked>
        assets</label>
      <label><input type="checkbox" id="t-services" checked> domain services</label>
      <label><input type="checkbox" id="t-surfaces"> surfaces</label>
      <label><input type="checkbox" id="t-unsorted" checked> unsorted</label>
    </span>
    <button id="issues-btn">issues <span id="issue-count"></span></button>
    <div id="banner" hidden></div>
  </header>
  <div id="notice" class="loading">
    <div class="notice-card">
      <div class="spinner"></div>
      <p>Scanning the tree&hellip;</p>
    </div>
  </div>
  <div id="wrap">
    <div id="root-bar"></div>
    <div id="main">
      <div id="nondomains" hidden>
        <div id="other-box" hidden></div>
      </div>
      <div id="domains"></div>
    </div>
    <svg id="edges"></svg>
  </div>
  <aside id="issues"></aside>
  <div class="bottom">
    <div class="legend">
      <div class="col">
        <label><input type="checkbox" id="leg-ok" checked><i></i>dependency</label>
        <label><input type="checkbox" id="leg-ships" checked><i class="ships"></i>indirect</label>
        <label><input type="checkbox" id="leg-type" checked><i class="type"></i>type-only</label>
        <label><input type="checkbox" id="leg-in" checked><i class="in"></i>dependency of</label>
        <label><input type="checkbox" id="leg-out" checked><i class="out"></i>depends on</label>
      </div>
      <div class="col">
        <label><input type="checkbox" id="leg-violation" checked><i class="violation"></i>violation</label>
        <label><input type="checkbox" id="leg-laundered" checked><i class="laundered"></i>laundered</label>
        <label><input type="checkbox" id="leg-cycle" checked><i class="cycle"></i>reference cycle</label>
        <label><input type="checkbox" id="leg-smell" checked><i class="smell"></i>inadvisable</label>
        <label><input type="checkbox" id="leg-lean" checked><i class="lean"></i>slicing tension</label>
      </div>
    </div>
    <nav id="bottombar"></nav>
  </div>
  <div id="tooltip"></div>

  <script type="module">import '${entry}';</script>
`;