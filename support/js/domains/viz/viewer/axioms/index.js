// The viewer's vocabulary: the row order, the labels, and the smallest pure helpers.
// Pure domain invariants only - the session state lives in flows/state.js, the DOM handles in harnesses/dom.js - so everything here holds anywhere without a host.

export const ROWS = ["surface", "services", "unsorted", "harnesses", "flows", "axioms"];
export const ROW_LABEL = {
  surface: "surfaces",
  services: "services",
  unsorted: "unsorted",
  harnesses: "harnesses",
  "flows": "flows",
  axioms: "axioms",
};

export const byPath = (a, b) => a.path.localeCompare(b.path);

// The edges that close a cycle, keyed the way a drawn path carries its endpoints.
export const edgeKey = (e) => `${e.from}>${e.to}`;
