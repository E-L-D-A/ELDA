// ---------------------------------------------------------------------------
// The viewer's session state: the scanned graph, the pin, the drawer selection, the visibility sets, the view-mode toggles, and the prefs hook.
// State lives behind accessors so no live mutable binding crosses the module boundary (CHANNEL.4); the visibility sets are constants mutated through their own API, since nothing ever rebinds them.
// INLINE is the snapshot's inlined graph, left null on a served page and replaced by the graph in a --out file.

export const INLINE = /*__DATA__*/ null;

// The scanned graph, set once per load. Every module reads it through data(); only the composer's load writes it, through setData.
let graph = null;
export const data = () => graph;
export const setData = (d) => {
  graph = d;
};

// The pin takes one of two shapes: a file, or a whole reference cycle raised from the drawer.
// A cycle is named by the files it encloses, so the name survives a rescan that renumbers them, and a cycle an edit dissolved simply stops being found.
let pin = null;
export const pinnedPath = () => pin;
export const setPin = (p) => {
  pin = p;
};
let pinCycle = null;
export const pinnedCycle = () => pinCycle;
export const setPinCycle = (c) => {
  pinCycle = c;
};
// The drawer finding a pin came from. A pin taken anywhere else clears it, so the list never claims to be showing something the board is not.
let selected = null;
export const selectedKey = () => selected;
export const setSelected = (k) => {
  selected = k;
};

export const cycleId = (c) =>
  c.files
    .map((id) => data().files[id].path)
    .sort()
    .join("|");

// Block visibility and folded domains: both sets are mutated in place and never rebound, so the composer seeds them at load and the view code writes through the Set API.
export const hiddenBlocks = new Set();
// Domains drawn compact: the columns fold away, the rows stay, and one aggregate chip stands for every file of a rank. Click a domain's title to fold it, and again to open it.
export const collapsed = new Set();
export const setCollapsed = (s) => {
  collapsed.clear();
  for (const d of s) collapsed.add(d);
};
// Files banished to their domain's hidden shelf by middle-click; session-only on purpose, keyed by path so live rescans keep them hidden.
export const hiddenFiles = new Set();

// The view-mode toggles, mirrored from the header checkboxes by the composer, so every reader below the services row reads state instead of the DOM.
const toggles = {};
export const toggle = (id) => !!toggles[id];
export const setToggle = (id, on) => {
  toggles[id] = !!on;
};

// Prefs persistence is the composer's wiring: this module publishes the hook, the composer injects the storage effect, and a mutation site calls savePrefs without knowing the medium.
let persist = () => {};
export const setPersist = (fn) => {
  persist = fn;
};
export const savePrefs = () => persist();

// The path into the editor, shared by the drawer's finding links and the chip double-click.
export function getEditorLink(path) {
  return "vscode://file/" + data().cwd + "/" + path;
}
