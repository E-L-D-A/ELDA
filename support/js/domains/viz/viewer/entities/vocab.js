// The viewer's vocabulary: the row order, the labels, and the smallest pure helpers.
// Pure domain invariants only - the session state lives in state.use-cases.js, the DOM handles in dom.adapters.js - so everything here holds anywhere without a host.

export const ROWS = ["surface", "services", "adapters", "use-cases", "entities"];
export const ROW_LABEL = {
  surface: "surfaces",
  services: "services",
  adapters: "adapters",
  "use-cases": "use-cases",
  entities: "entities",
};

export const byPath = (a, b) => a.path.localeCompare(b.path);

// The edges that close a cycle, keyed the way a drawn path carries its endpoints.
export const edgeKey = (e) => `${e.from}>${e.to}`;
