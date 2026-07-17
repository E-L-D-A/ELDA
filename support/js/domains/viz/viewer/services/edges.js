// ---------------------------------------------------------------------------
// Edge painting: the SVG layer, the on-scroll geometry updates, and the edge tooltips.
// The geometry and classification live in flows/edges.js; this service measures the chips, paints the paths, and builds the tip elements.

import { h, svg, wrap } from "../harnesses/dom.js";
import { ROW_LABEL } from "../axioms/index.js";
import { chips, drawn } from "../flows/board.js";
import { assignPorts, edgeClass, edgePath, edgeSides, edgeVisible } from "../flows/edges.js";
import { place } from "../flows/placement.js";
import { data } from "../flows/state.js";

// The paths whose geometry follows the viewport-sticky root chips on scroll, remembered each draw so the scroll pass rewrites only them. Only the edge layer touches it.
let stickyPaths = [];

const isRootFile = (id) => place(data().files[id]).area === "root";
const rectFor = (wrapRect) => (id) => {
  const r = chips().get(id).getBoundingClientRect();
  return {
    x: r.left - wrapRect.left,
    y: r.top - wrapRect.top,
    w: r.width,
    h: r.height,
  };
};

export function drawEdges() {
  const wrapRect = wrap.getBoundingClientRect();
  svg.setAttribute("width", wrap.scrollWidth);
  svg.setAttribute("height", wrap.scrollHeight);
  svg.replaceChildren();
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = [
    "ok",
    "lean",
    "ships",
    "type",
    "smell",
    "violation",
    "laundered",
    "cycle",
    "hi-in",
    "hi-out",
    "hi-cycle",
  ]
    .map((c) => {
      const color = {
        ok: "var(--ok)",
        lean: "var(--lean)",
        ships: "var(--ships)",
        type: "var(--type)",
        smell: "var(--smell)",
        violation: "var(--bad)",
        laundered: "var(--laundered)",
        cycle: "var(--cycle)",
        "hi-in": "var(--hi-in)",
        "hi-out": "var(--hi-out)",
        "hi-cycle": "var(--cycle)",
      }[c];
      return `<marker id="m-${c}" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0.8 L9.5 5 L0 9.2 L2.6 5 z" fill="${color}"/></marker>`;
    })
    .join("");
  svg.append(defs);

  const rectOf = rectFor(wrapRect);
  const entries = [];
  drawn().forEach((e, i) => {
    if (!edgeVisible(e) || e.from === e.to) return;
    entries.push({ e, i, sides: edgeSides(e, rectOf) });
  });
  assignPorts(entries, rectOf);
  stickyPaths = [];
  for (const en of entries) {
    const d = edgePath(en, rectOf);
    const cls = edgeClass(en.e);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute(
      "class",
      "edge " +
        cls +
        (en.e.entry ? " entry" : "") +
        (en.sides.kind === "diag" ? " diagonal" : "") +
        (en.e.bundle ? " bundled" : ""),
    );
    // A bundled arrow stands for many references, so its weight reads the count while its colour keeps the worst verdict among them.
    if (en.e.bundle) path.style.setProperty("--n", en.e.bundle.length);
    path.setAttribute("marker-end", `url(#m-${cls})`);
    path.dataset.from = en.e.from;
    path.dataset.to = en.e.to;
    svg.append(path);
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", d);
    // The hit path carries the same paint class as its edge so a legend toggle that hides one kind stops that kind's tooltips too.
    hit.setAttribute("class", "hit " + cls);
    hit.dataset.i = en.i;
    svg.append(hit);
    // Only edges touching the viewport-sticky root chips move on scroll; remember them so scrolling rewrites their geometry in place.
    if (isRootFile(en.e.from) || isRootFile(en.e.to)) stickyPaths.push({ en, path, hit });
  }
}

// The scroll-time pass: rewrite the sticky-connected paths' geometry in place through their frozen ports, touching no other DOM.
export function updateStickyEdges() {
  if (!stickyPaths.length) return;
  const rectOf = rectFor(wrap.getBoundingClientRect());
  for (const s of stickyPaths) {
    const d = edgePath(s.en, rectOf);
    s.path.setAttribute("d", d);
    s.hit.setAttribute("d", d);
  }
}

// The verdict as a separated prose block, with the rule id in its tier colour.
function verdictBlock(e) {
  if (!e.verdict) return null;
  const m = e.verdict.match(/^(ELDA [A-Z]+\.\d+(?: \([^)]+\))?):\s*([\s\S]*)$/);
  const cls = e.tier === "invariant" ? "violation" : "smell";
  return m
    ? h("div", { class: "t-verdict" }, h("b", { class: "t-rule " + cls }, m[1]), ` ${m[2]}`)
    : h("div", { class: "t-verdict" }, e.verdict);
}

// How an endpoint reads once its domain is folded: the domain and the rank it landed on, since the file behind the aggregate is one of many.
export const endLabel = (id) => {
  const f = data().files[id];
  const p = place(f);
  if (!p.collapsed) return f.path;
  const rank = p.band
    ? p.row === "services"
      ? "composer"
      : "shared base"
    : (ROW_LABEL[p.row] ?? p.row);
  return `${p.domain} · ${rank}`;
};

// A bundled arrow stands for many references at once, so its tip names the two ends, counts what crosses, and lists the references behind it.
function bundleTip(e) {
  const shown = e.bundle.slice(0, 8);
  return h(
    "div",
    {},
    h("div", { class: "t-src" }, endLabel(e.from)),
    h(
      "div",
      { class: "t-row t-spec" },
      `→ ${endLabel(e.to)}`,
      h(
        "span",
        { class: "t-kind" },
        `${e.bundle.length} reference${e.bundle.length > 1 ? "s" : ""}`,
      ),
    ),
    h(
      "div",
      { class: "t-row t-via" },
      shown.map((m) => h("div", {}, `${data().files[m.from].path} → ${data().files[m.to].path}`)),
    ),
    e.bundle.length > shown.length
      ? h("div", { class: "t-row t-names" }, `+ ${e.bundle.length - shown.length} more`)
      : null,
    verdictBlock(e),
  );
}

// The edge tooltip, each fact in its own register: the source module, the authored specifier with its kind badges, the bindings taken, the re-export chain ridden, the module landed on, and the verdict as a separated prose block with the rule id in its tier color.
export function edgeTip(e) {
  if (e.bundle) return bundleTip(e);
  const kinds = [];
  if (e.typeOnly) kinds.push("type-only");
  if (e.kind === "dynamic") kinds.push("dynamic");
  if (e.kind === "reexport") kinds.push("re-export");
  if (e.kind === "side-effect") kinds.push("side-effect");
  if (e.kind === "embeds") kinds.push(e.entry ? "ships · entry" : "ships");
  const tip = h(
    "div",
    {},
    h("div", { class: "t-src" }, data().files[e.from].path),
    h(
      "div",
      { class: "t-row t-spec" },
      `→ ${e.spec}`,
      kinds.map((k) => h("span", { class: "t-kind" }, k)),
    ),
    Array.isArray(e.names) && e.names.length
      ? h("div", { class: "t-row t-names" }, `{ ${e.names.join(", ")} }`)
      : null,
    e.via && e.via.length
      ? h(
          "div",
          { class: "t-row t-via" },
          e.via.map((id) => h("div", {}, `via ${data().files[id].path}`)),
        )
      : null,
    e.to != null ? h("div", { class: "t-row t-land" }, `= ${data().files[e.to].path}`) : null,
  );
  const verdict = verdictBlock(e);
  if (verdict) tip.append(verdict);
  return tip;
}
