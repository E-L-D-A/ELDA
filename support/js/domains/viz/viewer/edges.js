// ---------------------------------------------------------------------------
// Edges.

import { compactRow, isBarFile, place } from "./placement.js";
import { chips, compactRep, cycleClosers, drawn, h } from "./render.js";
import { $, ROW_LABEL, collapsed, data, edgeKey, svg, wrap } from "./state.js";

// The paths whose geometry follows the viewport-sticky root chips on scroll, remembered each draw so the scroll pass rewrites only them. Only the edge layer touches it.
let stickyPaths = [];

// The node an endpoint draws as: a file of a folded domain draws as its rank's aggregate, so every reference crossing into that rank lands on one chip, which is where the bundle forms.
const nodeOf = (id) => {
  const p = place(data.files[id]);
  if (!p.collapsed) return id;
  return compactRep.get(p.domain + "\0" + compactRow(p)) ?? id;
};

// How the paints rank when several references share one arrow: a bundle takes the worst of them, so folding a domain never swallows a finding.
const CLASS_RANK = { violation: 5, laundered: 4, cycle: 3, smell: 2, ok: 1, type: 0 };

// Every reference crossing a folded domain's boundary bundles into one arrow: it carries the count, paints as its worst member, and lists what it stands for on hover.
// A reference between two files of one folded rank is internal to that rank, and the aggregate's own tip is where those files stay visible.
export function bundleEdges(list) {
  const out = [];
  const acc = new Map();
  for (const e of list) {
    if (e.to == null) continue;
    const from = nodeOf(e.from),
      to = nodeOf(e.to);
    if (from === e.from && to === e.to) {
      out.push(e);
      continue;
    }
    if (from === to) continue;
    const key = `${from}>${to}`;
    let b = acc.get(key);
    if (!b) {
      b = { ...e, from, to, bundle: [] };
      acc.set(key, b);
      out.push(b);
    }
    b.bundle.push(e);
  }
  for (const b of acc.values()) {
    let worst = b.bundle[0];
    for (const e of b.bundle)
      if (CLASS_RANK[edgeClass(e)] > CLASS_RANK[edgeClass(worst)]) worst = e;
    b.cls = edgeClass(worst);
    b.verdict = worst.verdict;
    b.tier = worst.tier;
  }
  return out;
}

// A laundered finding carries a tier, yet it is a graph-only landing rather than an authored breach, so it paints as its own severity ahead of the tier colors.
// A cycle closer paints as the cycle once nothing else has named it: where a verdict already sits on the edge, that verdict is the one carrying a remedy at the site, and the cycle is what remains when every edge closing it is legal.
// A bundle settled its own paint when it formed, out of the worst reference it carries.
function edgeClass(e) {
  if (e.cls) return e.cls;
  if (e.laundered) return "laundered";
  if (e.tier === "invariant") return "violation";
  if (e.tier === "smell") return "smell";
  if (cycleClosers.has(edgeKey(e))) return "cycle";
  if (e.typeOnly) return "type";
  return "ok";
}

export function edgeVisible(e) {
  if (e.to == null) return false;
  if (!chips.has(e.from) || !chips.has(e.to)) return false;
  const cls = edgeClass(e);
  if (cls === "ok" && !$("t-ok").checked) return false;
  if (cls === "type" && !$("t-type").checked) return false;
  return true;
}

// The logical orientation of an edge from its grid placement, not its pixels: a reference within one unit column is vertical, an equal-rank reference across columns is horizontal, a reference crossing both a column and a rank is a diagonal (the shape no ELDA row draws), and two files sharing one cell arc beside it.
// The composition root drops vertically into the column it wires; a core block is reached laterally from the feature blocks; a domain-wide band spans its own subdomain's stack, so within that subdomain its edges are vertical, and two bands of the same kind on one shelf read horizontally across subdomains.
function edgeMode(e) {
  const pf = place(data.files[e.from]),
    pt = place(data.files[e.to]);
  if (pf.area === "root" || pt.area === "root") return "v";
  // A reach into a core block is legal from any rank - the diagram's dashed laterals into Shared - so a cross-block core edge reads horizontally; inside the block the normal geometry holds.
  if ((pf.core || pt.core) && pf.domain !== pt.domain) return "h";
  const fromBar = isBarFile(data.files[e.from]),
    toBar = isBarFile(data.files[e.to]);
  if (fromBar || toBar) {
    const bar = fromBar ? pf : pt,
      other = fromBar ? pt : pf;
    // A band spans its own subdomain's whole subtree, since a composer composes its nested children too, and a domain-wide band (empty subdomain) spans the whole domain; an edge into that span drops vertically.
    const under = (bar, other) =>
      bar.sub === "" || other.sub === bar.sub || other.sub.startsWith(bar.sub + "/");
    if (other.area === "domain" && bar.domain === other.domain && under(bar, other)) return "v";
    // Outside its span, an equal-rank reference reads horizontally and anything else is a true diagonal.
    if (other.area === "domain" && pf.row === pt.row) return "h";
    return "diag";
  }
  const sameCol = pf.domain === pt.domain && pf.sub === pt.sub && pf.unit === pt.unit;
  const sameRow = pf.row === pt.row;
  if (sameCol && sameRow) return "arc";
  if (sameCol) return "v";
  if (sameRow) return "h";
  return "diag";
}

// The concrete sides an edge occupies, drawn straight between them: a vertical run leaves a horizontal side and lands on the facing one, a horizontal run uses the facing vertical sides, a diagonal leaves and enters on the vertical sides so its slant is unmistakable, and a same-cell arc pairs the two right sides.
function edgeSides(e, rectOf) {
  const S = rectOf(e.from),
    T = rectOf(e.to);
  const dx = T.x + T.w / 2 - (S.x + S.w / 2),
    dy = T.y + T.h / 2 - (S.y + S.h / 2);
  const mode = edgeMode(e);
  if (mode === "arc") return { kind: "arc", from: "r", to: "r" };
  if (mode === "h") return { kind: "h", from: dx > 0 ? "r" : "l", to: dx > 0 ? "l" : "r" };
  return {
    kind: mode,
    from: dy > 0 ? "b" : "t",
    to: dy > 0 ? "t" : "b",
  };
}

// Every endpoint sharing a chip side gets its own evenly spaced port, ordered by where the opposite endpoint sits, so a fan of edges spreads cleanly along the side.
function assignPorts(entries, rectOf) {
  const groups = new Map();
  for (const en of entries) {
    for (const end of ["from", "to"]) {
      const side = en.sides[end];
      const other = rectOf(end === "from" ? en.e.to : en.e.from);
      const pos = side === "t" || side === "b" ? other.x + other.w / 2 : other.y + other.h / 2;
      const key = (end === "from" ? en.e.from : en.e.to) + ":" + side;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ en, end, pos });
    }
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.pos - b.pos);
    arr.forEach((s, i) => {
      s.en[s.end + "Frac"] = (i + 1) / (arr.length + 1);
      s.en[s.end + "Idx"] = i;
    });
  }
}

// The pixel position of a port: a fraction along its side, inset so the outermost ports keep clear of the chip's corners.
function port(rect, side, frac) {
  const padX = Math.min(7, rect.w / 4),
    padY = Math.min(5, rect.h / 4);
  if (side === "t") return [rect.x + padX + (rect.w - 2 * padX) * frac, rect.y];
  if (side === "b") return [rect.x + padX + (rect.w - 2 * padX) * frac, rect.y + rect.h];
  if (side === "l") return [rect.x, rect.y + padY + (rect.h - 2 * padY) * frac];
  return [rect.x + rect.w, rect.y + padY + (rect.h - 2 * padY) * frac];
}

export function drawEdges() {
  const wrapRect = wrap.getBoundingClientRect();
  svg.setAttribute("width", wrap.scrollWidth);
  svg.setAttribute("height", wrap.scrollHeight);
  svg.replaceChildren();
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = [
    "ok",
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
  drawn.forEach((e, i) => {
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
    hit.setAttribute("class", "hit");
    hit.dataset.i = en.i;
    svg.append(hit);
    // Only edges touching the viewport-sticky root chips move on scroll; remember them so scrolling rewrites their geometry in place.
    if (isRootFile(en.e.from) || isRootFile(en.e.to)) stickyPaths.push({ en, path, hit });
  }
}

const isRootFile = (id) => place(data.files[id]).area === "root";
const rectFor = (wrapRect) => (id) => {
  const r = chips.get(id).getBoundingClientRect();
  return {
    x: r.left - wrapRect.left,
    y: r.top - wrapRect.top,
    w: r.width,
    h: r.height,
  };
};

// One edge's cubic through its assigned ports: a same-cell arc nests beside the cell by port index, a horizontal run curves through the facing vertical sides, and a vertical or diagonal run curves through the horizontal sides, its curvature scaled by the distance covered plus a share of the cross-axis distance so long fans stay rounded; shared by the full rebuild and the on-scroll geometry updates.
function edgePath(en, rectOf) {
  const { sides } = en;
  const S = rectOf(en.e.from),
    T = rectOf(en.e.to);
  const [x1, y1] = port(S, sides.from, en.fromFrac);
  const [x2, y2] = port(T, sides.to, en.toFrac);
  if (sides.kind === "arc") {
    const off = 26 + 8 * en.fromIdx;
    return `M${x1} ${y1} C${x1 + off} ${y1}, ${x2 + off} ${y2}, ${x2 + 2} ${y2}`;
  }
  if (sides.kind === "h") {
    const off =
      Math.min(Math.abs(x2 - x1) * 0.5, 130) + Math.min(Math.abs(y2 - y1) * 0.12, 60) + 14;
    const c1 = x1 + (sides.from === "r" ? off : -off);
    const c2 = x2 + (sides.to === "l" ? -off : off);
    return `M${x1} ${y1} C${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
  }
  const off = Math.min(Math.abs(y2 - y1) * 0.5, 130) + Math.min(Math.abs(x2 - x1) * 0.12, 60) + 14;
  const c1 = y1 + (sides.from === "b" ? off : -off);
  const c2 = y2 + (sides.to === "t" ? -off : off);
  return `M${x1} ${y1} C${x1} ${c1}, ${x2} ${c2}, ${x2} ${y2}`;
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
  const f = data.files[id];
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
      shown.map((m) => h("div", {}, `${data.files[m.from].path} → ${data.files[m.to].path}`)),
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
  const tip = h(
    "div",
    {},
    h("div", { class: "t-src" }, data.files[e.from].path),
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
          e.via.map((id) => h("div", {}, `via ${data.files[id].path}`)),
        )
      : null,
    e.to != null ? h("div", { class: "t-row t-land" }, `= ${data.files[e.to].path}`) : null,
  );
  const verdict = verdictBlock(e);
  if (verdict) tip.append(verdict);
  return tip;
}
