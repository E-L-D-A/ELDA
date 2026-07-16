// The viewer's shared base: the session state and the smallest shared helpers, as an ES module the server assembles into the page.
// Each file under viewer/ is a real module: it imports its siblings by plain `./<name>.js` specifiers, which the browser and node resolve natively when the files are served or run in place; a --out snapshot inlines each module as a data: URL and carries an import map that re-points the same references at those URLs.
// State a single module owns lives behind an accessor: the owner reassigns a private binding and every reader calls the function, so no live mutable binding crosses the module boundary (CHANNEL.4); the two visibility sets are constants mutated through their own API instead, since nothing ever rebinds them.
// INLINE is the snapshot's inlined graph, left null on a served page and replaced by the graph in a --out file.

export const INLINE = /*__DATA__*/ null;
export const ROWS = ["surface", "services", "adapters", "use-cases", "entities"];
export const ROW_LABEL = {
  surface: "surfaces",
  services: "services",
  adapters: "adapters",
  "use-cases": "use-cases",
  entities: "entities",
};

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

export const markSelection = () => {
  for (const el of $("issues").querySelectorAll(".item"))
    el.classList.toggle("selected", selected !== null && el.dataset.key === selected);
};
export const cycleId = (c) =>
  c.files
    .map((id) => data().files[id].path)
    .sort()
    .join("|");
// The edges that close a cycle, keyed the way a drawn path carries its endpoints.
export const edgeKey = (e) => `${e.from}>${e.to}`;

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

export const $ = (id) => document.getElementById(id);
export const wrap = $("wrap"),
  svg = $("edges"),
  tooltip = $("tooltip");
export const byPath = (a, b) => a.path.localeCompare(b.path);

// Prefs persistence is the composer's wiring: the base publishes the hook, the composer injects the storage effect, and a mutation site calls savePrefs without knowing the medium.
let persist = () => {};
export const setPersist = (fn) => {
  persist = fn;
};
export const savePrefs = () => persist();

// The path into the editor, shared by the drawer's finding links and the chip double-click.
export function getEditorLink(path) {
  return "vscode://file/" + data().cwd + "/" + path;
}
