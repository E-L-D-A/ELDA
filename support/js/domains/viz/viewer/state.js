// The viewer, as ES modules the server assembles into one page.
// Each file under viewer/ is a real module: it imports its siblings by plain `./<name>.js` specifiers, which the browser and node resolve natively when the files are served or run in place; a --out snapshot inlines each module as a data: URL and carries an import map that re-points the same references at those URLs.
// A module may reassign its own exported bindings and every importer sees the new value (live bindings), but no module may reassign a binding it imported. So state a single module owns lives here as an exported `let`; state that two modules would both write is reassigned only through a setter this module exports.
// This module owns the session state and the smallest shared helpers; INLINE is the snapshot's inlined graph, left null on a served page and replaced by the graph in a --out file.

export const INLINE = /*__DATA__*/ null;
export const ROWS = ["surface", "services", "adapters", "use-cases", "entities"];
export const ROW_LABEL = {
  surface: "surfaces",
  services: "services",
  adapters: "adapters",
  "use-cases": "use-cases",
  entities: "entities",
};

// The scanned graph, set once per load. Every module reads it; only load() writes it, through setData.
export let data = null;
export const setData = (d) => {
  data = d;
};

// The pin takes one of two shapes: a file, or a whole reference cycle raised from the drawer.
// A cycle is named by the files it encloses, so the name survives a rescan that renumbers them, and a cycle an edit dissolved simply stops being found.
// Several modules pin and clear, so the two handles and the drawer selection are written only through their setters.
export let pinnedPath = null;
export const setPin = (p) => {
  pinnedPath = p;
};
export let pinnedCycle = null;
export const setPinCycle = (c) => {
  pinnedCycle = c;
};
// The drawer finding a pin came from. A pin taken anywhere else clears it, so the list never claims to be showing something the board is not.
export let selectedKey = null;
export const setSelected = (k) => {
  selectedKey = k;
};

export const markSelection = () => {
  for (const el of $("issues").querySelectorAll(".item"))
    el.classList.toggle("selected", selectedKey !== null && el.dataset.key === selectedKey);
};
export const cycleId = (c) =>
  c.files
    .map((id) => data.files[id].path)
    .sort()
    .join("|");
// The edges that close a cycle, keyed the way a drawn path carries its endpoints.
export const edgeKey = (e) => `${e.from}>${e.to}`;

// On a fresh session every composition root and the pure-core box start hidden; the domains carry the diagram, and a root is unhidden from the bottom bar when its wiring is what you want to read.
const defaultHidden = () =>
  new Set(["@core", ...(data ? data.options.roots.map((r) => "@root:" + r.key) : [])]);
export let hiddenBlocks = new Set();
// Domains drawn compact: the columns fold away, the rows stay, and one aggregate chip stands for every file of a rank. Click a domain's title to fold it, and again to open it.
// loadPrefs here reassigns it directly; the fold-all control in another module reassigns it through setCollapsed, and folding one domain only mutates the set in place.
export let collapsed = new Set();
export const setCollapsed = (s) => {
  collapsed = s;
};
// Files banished to their domain's hidden shelf by middle-click; session-only on purpose, keyed by path so live rescans keep them hidden.
export const hiddenFiles = new Set();

export const $ = (id) => document.getElementById(id);
export const wrap = $("wrap"),
  svg = $("edges"),
  tooltip = $("tooltip");
export const byPath = (a, b) => a.path.localeCompare(b.path);

// The view-mode toggles in the header, persisted alongside block visibility.
export const TOGGLES = ["t-ok", "t-type", "t-assets", "t-surfaces", "t-services", "t-reach"];

// Block visibility and the view-mode toggles persist per app for the browser session.
// Storage may be unavailable on a file:// snapshot, so every read falls back to the built-in defaults.
const storageKey = () => "elda-viz:" + (data ? data.app : "");
export function loadPrefs() {
  hiddenBlocks = defaultHidden();
  collapsed = new Set();
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey()) || "null");
    if (!stored) return;
    if (Array.isArray(stored.hidden)) hiddenBlocks = new Set(stored.hidden);
    if (Array.isArray(stored.collapsed)) collapsed = new Set(stored.collapsed);
    for (const id of TOGGLES)
      if (typeof stored.toggles?.[id] === "boolean") $(id).checked = stored.toggles[id];
  } catch {}
}
export function savePrefs() {
  try {
    const toggles = Object.fromEntries(TOGGLES.map((id) => [id, $(id).checked]));
    sessionStorage.setItem(
      storageKey(),
      JSON.stringify({
        hidden: [...hiddenBlocks],
        collapsed: [...collapsed],
        toggles,
      }),
    );
  } catch {}
}
