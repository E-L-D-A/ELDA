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

// The page-condition prose: everything the notice panel and the banner can say, phrased here so the services assemble states and never author wording.
// The scan's own diagnoses are not here - they arrive in the graph payload as `options.notices` and `scanError`, phrased once at their derivation.
export const NOTICE = {
  fatalTitle: "The viewer hit a fault",
  fatalBody: "Drawing this graph failed, so the board below may be incomplete. This is a bug in the viewer itself, worth reporting.",
  fatalDetail: "What it said",
  unreachableTitle: "The graph did not load",
  unreachableBody: "The server is not answering. The page keeps retrying on its own - the dot in the header shows the link - and a reload asks again right now.",
  emptyTitle: "Nothing to draw",
  emptyHint: "Point elda-viz at an app workspace - the directory carrying the app's .oxlintrc.json - or run it from inside one.",
  reload: "Reload",
};
export const emptyBody = (app) => `The scan of '${app}' found no code files.`;
export const rescanFailed = (detail) => `The last rescan failed (${detail}); this board is the previous graph.`;

// The edges that close a cycle, keyed the way a drawn path carries its endpoints.
export const edgeKey = (e) => `${e.from}>${e.to}`;
