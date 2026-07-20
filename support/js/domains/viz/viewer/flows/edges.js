// ---------------------------------------------------------------------------
// Edge geometry and classification: which node an endpoint draws as, how references bundle under a fold, what paints an edge, which sides and ports it occupies, and the cubic through them.
// Pure over the board's derived state and a caller-supplied rect reader; the SVG painting that consumes this lives in edges.services.js.

import { edgeKey } from "../axioms/index.js";
import { chips, commit, compactRep, cycleClosers } from "./board.js";
import { compactRow, isBarFile, place, threadComposers } from "./placement.js";
import { collapsed, data, toggle } from "./state.js";

// The node an endpoint draws as: a file of a folded domain draws as its rank's aggregate, so every reference crossing into that rank lands on one chip, which is where the bundle forms.
const nodeOf = (id) => {
  const p = place(data().files[id]);
  if (!p.collapsed) return id;
  return compactRep().get(p.domain + "\0" + compactRow(p)) ?? id;
};

// How the paints rank when several references share one arrow: a bundle takes the worst of them, so folding a domain never swallows a finding.
const CLASS_RANK = { violation: 5, laundered: 4, cycle: 3, smell: 2, ships: 1, ok: 1, type: 0 };

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
export function edgeClass(e) {
  if (e.cls) return e.cls;
  if (e.laundered) return "laundered";
  if (e.tier === "invariant") return "violation";
  if (e.tier === "smell") return "smell";
  if (cycleClosers().has(edgeKey(e))) return "cycle";
  // A slicing lean is a legal downward read across a piece boundary, marked by the scan; its own paint is what makes the re-slice geometry visible on the board.
  if (e.lean) return "lean";
  // A declared embed ships its entry's subtree to another runtime as source; the handoff is real dataflow with no binding on it, so it takes its own paint rather than a dependency's.
  if (e.kind === "embeds") return "ships";
  if (e.typeOnly) return "type";
  return "ok";
}

export function edgeVisible(e) {
  if (e.to == null) return false;
  if (!chips().has(e.from) || !chips().has(e.to)) return false;
  const cls = edgeClass(e);
  if ((cls === "ok" || cls === "lean" || cls === "ships") && !toggle("t-ok")) return false;
  if (cls === "type" && !toggle("t-type")) return false;
  return true;
}

// The logical orientation of an edge from its grid placement, not its pixels: a reference within one unit column is vertical, an equal-rank reference across columns is horizontal, a reference crossing both a column and a rank is a diagonal (the shape no ELDA row draws), and two files sharing one cell arc along it.
// The composition root drops vertically into the column it wires; a core block is reached laterally from the feature blocks; a domain-wide band spans its own subdomain's stack, so within that subdomain its edges are vertical, and two bands of the same kind on one shelf read horizontally across subdomains.
function edgeMode(e) {
  const pf = place(data().files[e.from]),
    pt = place(data().files[e.to]);
  if (pf.area === "root" || pt.area === "root") return "v";
  // A reach into a core block is legal at or below the consumer's rank - the diagram's dashed laterals into Shared - so a cross-block core edge reads horizontally; inside the block the normal geometry holds.
  if ((pf.core || pt.core) && pf.domain !== pt.domain) return "h";
  const fromBar = isBarFile(data().files[e.from]),
    toBar = isBarFile(data().files[e.to]);
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

// The concrete sides an edge occupies: an exit and an entry must face each other across a real gap, so the pair sits on an axis the two rects are actually apart on, and the logical mode picks between the axes only when both hold a gap, falling back to its own preferred axis when neither does.
// Two files sharing one cell face each other along their own line the same way, and the one pair with no gap on either axis loops through the two right sides beside the cell.
export function edgeSides(e, rectOf) {
  const S = rectOf(e.from),
    T = rectOf(e.to);
  const dx = T.x + T.w / 2 - (S.x + S.w / 2),
    dy = T.y + T.h / 2 - (S.y + S.h / 2);
  const mode = edgeMode(e);
  const hGap = T.x >= S.x + S.w || S.x >= T.x + T.w;
  const vGap = T.y >= S.y + S.h || S.y >= T.y + T.h;
  const lateral = { from: dx > 0 ? "r" : "l", to: dx > 0 ? "l" : "r" };
  const vertical = { from: dy > 0 ? "b" : "t", to: dy > 0 ? "t" : "b" };
  if (mode === "arc") {
    if (hGap) return { kind: "arc", ...lateral };
    if (vGap) return { kind: "arc", ...vertical };
    return { kind: "arc", from: "r", to: "r" };
  }
  const useLateral = mode === "h" ? hGap || !vGap : hGap && !vGap;
  return { kind: mode, ...(useLateral ? lateral : vertical) };
}

// Every endpoint sharing a chip side gets its own evenly spaced port, ordered by where the opposite endpoint sits, so a fan of edges spreads cleanly along the side.
export function assignPorts(entries, rectOf) {
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

// One edge's cubic through its assigned ports, shared by the full rebuild and the on-scroll geometry updates: the side pair sets the run's axis, and the curvature scales with the distance covered plus a share of the cross-axis distance so long fans stay rounded.
// A same-cell run bows perpendicular to its axis by port index to clear the sibling chips between its ends: beneath a run along the cell's line, rightward down a unit stack. The bow's reach and depth follow the gap it spans, so an adjacent pair reads as a short sagging link and the controls never cross into a self-loop; a same-cell pair with no facing sides keeps its loop beside the cell.
export function edgePath(en, rectOf) {
  const { sides } = en;
  const S = rectOf(en.e.from),
    T = rectOf(en.e.to);
  const [x1, y1] = port(S, sides.from, en.fromFrac);
  const [x2, y2] = port(T, sides.to, en.toFrac);
  const lateral = sides.from === "l" || sides.from === "r";
  if (sides.kind === "arc") {
    if (sides.from === sides.to) {
      const off = 26 + 8 * en.fromIdx;
      return `M${x1} ${y1} C${x1 + off} ${y1}, ${x2 + off} ${y2}, ${x2 + 2} ${y2}`;
    }
    const gap = lateral ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
    const reach =
      Math.min(14, gap * 0.35) * (sides.from === "r" || sides.from === "b" ? 1 : -1);
    const bow = Math.min(16, 2 + gap * 0.4) + 8 * en.fromIdx;
    if (lateral)
      return `M${x1} ${y1} C${x1 + reach} ${y1 + bow}, ${x2 - reach} ${y2 + bow}, ${x2} ${y2}`;
    return `M${x1} ${y1} C${x1 + bow} ${y1 + reach}, ${x2 + bow} ${y2 - reach}, ${x2} ${y2}`;
  }
  if (lateral) {
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

// The drawn reading, derived after a board pass has committed its chips: the closers, the flow list under the current view, and the adjacency the reach walk rides.
// The adjacency counts only what the board is drawing: an edge a filter dropped or a hidden block took away is out of the walk exactly as it is out of the picture, so the reach you read is the reach of the graph in front of you.
export function deriveDrawn() {
  const expunge = !toggle("t-surfaces");
  const threadC = !toggle("t-services");
  // A cycle closes over the landed flows, so its closing edges are on the board in the expunged view, which is the view the cycles were found in; a view that redraws the arrows through their conduits routes them around the cycle, and the files it encloses still raise together.
  const closers = new Set(data().cycles.flatMap((c) => c.edges.map(edgeKey)));
  // With surfaces expunged, every edge is expanded through the conduits to the real carriers and judged by the geometry verdicts; with surfaces shown, the raw authored edges draw as-is.
  let list = expunge ? data().landings : data().edges;
  if (threadC) list = threadComposers(list);
  if (collapsed.size) list = bundleEdges(list);
  const adjOut = new Map();
  const adjIn = new Map();
  commit({ drawn: list, cycleClosers: closers });
  for (const e of list) {
    if (e.from === e.to || !edgeVisible(e)) continue;
    (adjOut.get(e.from) ?? adjOut.set(e.from, []).get(e.from)).push(e.to);
    (adjIn.get(e.to) ?? adjIn.set(e.to, []).get(e.to)).push(e.from);
  }
  commit({ adjOut, adjIn });
}
