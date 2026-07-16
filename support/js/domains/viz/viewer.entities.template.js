// The entry specifier is the one name the page, the served module routes, and a snapshot's import map all share, so it is declared once here and referenced everywhere else.
export const ENTRY = './viewer/index.js';

export const template = /* html */`
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
      <label><input type="checkbox" id="t-ok" checked> deps</label>
      <label><input type="checkbox" id="t-type"> type-only</label>
      <label><input type="checkbox" id="t-assets" checked>
        styles+assets</label>
      <label><input type="checkbox" id="t-surfaces"> surfaces</label>
      <label><input type="checkbox" id="t-services" checked> domain services</label>
      <label title="Raise everything a focused file reaches, and everything that reaches it, instead of its first hop"><input type="checkbox" id="t-reach"> reach</label>
    </span>
    <button id="issues-btn">issues <span id="issue-count"></span></button>
  </header>
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
        <span><i></i>dependency</span>
        <span><i class="type"></i>type-only</span>
        <span><i class="in"></i>dependency of</span>
        <span><i class="out"></i>depends on</span>
      </div>
      <div class="col">
        <span><i class="violation"></i>violation</span>
        <span><i class="laundered"></i>laundered</span>
        <span><i class="cycle"></i>reference cycle</span>
        <span><i class="smell"></i>inadvisable</span>
      </div>
    </div>
    <nav id="bottombar"></nav>
  </div>
  <div id="tooltip"></div>

  <script type="module">import '${ENTRY}';</script>
`;