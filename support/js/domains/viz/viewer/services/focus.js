// ---------------------------------------------------------------------------
// Focus application: hovering or pinning a chip raises its edges and its neighbors on the board; raising a cycle raises the set of files it encloses.
// The reach walk itself is flows/focus.js; this service paints its result onto the SVG paths and the chips.

import { $, svg } from "../harnesses/dom.js";
import { edgeKey } from "../axioms/index.js";
import { chips } from "../flows/board.js";
import { neighbourhood } from "../flows/focus.js";
import { cycleId, data, pinnedCycle, pinnedPath, selectedKey, setPin, setPinCycle, setSelected } from "../flows/state.js";

// The selection sweep is focus work like the chip and edge painting: it reads the selection and applies it as classes over the drawer's items.
// The drawer item carrying the current selection lights up, and every other one lets go; the drawer and the interactions take this through the composer's ports.
export const markSelection = () => {
  for (const el of $("issues").querySelectorAll(".item"))
    el.classList.toggle("selected", selectedKey() !== null && el.dataset.key === selectedKey());
};

export function focus(id) {
  svg.classList.add("focused");
  const { out, inc, deep } = neighbourhood(id);
  for (const p of svg.querySelectorAll("path.edge")) {
    const u = Number(p.dataset.from),
      v = Number(p.dataset.to);
    // An edge runs downstream when it lands on something the focus reaches and leaves either the focus itself or, once the walk runs deep, anything else the focus reaches; upstream mirrors it.
    const down = out.has(v) && (u === id || (deep && out.has(u)));
    const up = inc.has(u) && (v === id || (deep && inc.has(v)));
    p.classList.remove("hi-cycle");
    p.classList.toggle("hi-out", down);
    p.classList.toggle("hi-in", !down && up);
    // The hop the edge lands on is what the fade reads, so a long closure stays legible from its near end.
    if (down || up) p.style.setProperty("--hop", down ? out.get(v) : inc.get(u));
    else p.style.removeProperty("--hop");
    p.setAttribute(
      "marker-end",
      down
        ? "url(#m-hi-out)"
        : up
          ? "url(#m-hi-in)"
          : `url(#m-${[...p.classList].find((c) => c !== "edge" && !c.startsWith("hi-"))})`,
    );
  }
  for (const [cid, el] of chips()) {
    const down = out.has(cid),
      up = inc.has(cid);
    el.classList.remove("cycle-member");
    el.classList.toggle("rel-out", down);
    el.classList.toggle("rel-in", !down && up);
    el.classList.toggle("dim", cid !== id && !down && !up);
    if (down || up) el.style.setProperty("--hop", down ? out.get(cid) : inc.get(cid));
    else el.style.removeProperty("--hop");
  }
  return { out, inc, deep };
}

// A cycle has no direction to read - every file in it reaches every other - so its closing edges all light as the cycle, and the files it encloses raise together.
// A view that redraws the arrows through their conduits leaves those closing edges off the board; the raised files still carry the cycle.
function focusCycle(cycle) {
  svg.classList.add("focused");
  const members = new Set(cycle.files);
  const closers = new Set(cycle.edges.map(edgeKey));
  for (const p of svg.querySelectorAll("path.edge")) {
    const closes = closers.has(`${p.dataset.from}>${p.dataset.to}`);
    p.classList.remove("hi-out", "hi-in");
    p.classList.toggle("hi-cycle", closes);
    p.setAttribute(
      "marker-end",
      closes
        ? "url(#m-hi-cycle)"
        : `url(#m-${[...p.classList].find((c) => c !== "edge" && !c.startsWith("hi-"))})`,
    );
  }
  for (const [cid, el] of chips()) {
    el.classList.remove("rel-out", "rel-in", "pinned");
    el.classList.toggle("cycle-member", members.has(cid));
    el.classList.toggle("dim", !members.has(cid));
  }
}

// Leaving a chip while a pin is live restores the pin rather than clearing the board, and the pin knows which of its two shapes it is.
export function blur(pinned, pointerout) {
  if (!pinned && pointerout) {
    applyPin();
    return;
  }
  svg.classList.remove("focused");
  for (const p of svg.querySelectorAll("path.edge")) {
    p.classList.remove("hi-out", "hi-in", "hi-cycle");
    p.style.removeProperty("--hop");
    p.setAttribute("marker-end", `url(#m-${[...p.classList].find((c) => c !== "edge")})`);
  }
  for (const el of chips().values()) {
    el.classList.remove("dim", "rel-out", "rel-in", "pinned", "cycle-member");
    el.style.removeProperty("--hop");
  }
}

export function applyPin() {
  // A pin is exclusive, so the last one lets go before the next takes hold: the drawer re-aims the board without rebuilding it, and a focus pass alone would leave the old chip wearing its ring.
  for (const el of chips().values()) el.classList.remove("pinned");
  if (pinnedCycle() !== null) {
    const cycle = data().cycles.find((c) => cycleId(c) === pinnedCycle());
    if (cycle) {
      focusCycle(cycle);
      return;
    }
    setPinCycle(null);
  }
  if (pinnedPath() === null) {
    blur();
    return;
  }
  const f = data().files.find((f) => f.path === pinnedPath());
  // The file has no chip: its domain was hidden or folded away, so the pin drops and the drawer stops claiming to show it.
  if (!f || !chips().has(f.id)) {
    setPin(null);
    setSelected(null);
    blur();
    markSelection();
    return;
  }
  focus(f.id);
  chips().get(f.id).classList.add("pinned");
}
