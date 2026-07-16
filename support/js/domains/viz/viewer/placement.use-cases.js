// ---------------------------------------------------------------------------
// Placement: where a file renders, derived from the role the scanner assigned.

import { render } from "./render.use-cases.js";
import { ROWS, collapsed, data, savePrefs } from "./entities.js";

// The top-level block a file belongs to: the composition root, or its domain - a core area draws as a domain block like any other.
export function blockOf(f) {
  const p = place(f);
  if (p.area === "root") return "@root:" + p.root;
  if (p.area === "other") return "@other";
  if (p.area === "domain") return p.domain;
  return null;
}

// A whole domain in one file: a core file whose plain name lifted into its chain, so the file is the domain's own surface and the layer contents sit unextracted inside it.
export const isLonerCore = (r) =>
  r != null &&
  r.kind === "core" &&
  r.surface != null &&
  Array.isArray(r.chain) &&
  r.chain.length > 0 &&
  r.chain[r.chain.length - 1] === r.surface;

// A layer file belongs to the unit its own name declares; that name is its sub-column, so units line up as concerns the way the diagram draws UI / Network / Data - at the domain root and inside every subdomain alike.
// Bare reserved-name files (the layer aggregates, the composer) and surfaces are subdomain-wide and stay in the unnamed sub-column.
function unitCol(r) {
  if (r.name) return r.name;
  if (r.via === "unit-dir" && r.sub.length) return r.sub[0].replace(/\.[^.]+$/, "");
  if (r.via === "branch" && r.sub.length > 1) return r.sub[0];
  return "";
}

// Which cell a file renders into: the composition-root bar, or a domain's (subdomain group x unit sub-column x row) cell.
// A core role is a top-level shared domain; the declared area only GROUPS the shared blocks on the board, so the area name heads the block and the module's own chain draws inside it as a subdomain column.
// A graph-attributed core file with no declared area draws under '(shared)'.
export function place(f) {
  const r = f.role;
  if (r.kind === "composition-root") return { area: "root", root: r.root };
  if (r.kind === "surface" || r.kind === "domain" || r.kind === "core") {
    const core = r.kind === "core";
    const chain = core ? [r.area ?? "(shared)", ...(r.chain ?? [])] : r.chain;
    const isSurface = r.surface != null;
    const domain = chain[0];
    const row = isSurface ? "surface" : (r.layer ?? "surface");
    // A collapsed domain gives up its columns and keeps its rows: every file at one rank draws as that rank's aggregate, so an arrow into the domain still lands on the row it belongs to and a diagonal still reads as one.
    // Dropping the rows would collapse the one thing the diagram is for, since a reference's meaning is the rank it crosses.
    // The bands keep their own places above and below the cake: a composer is a composition surface and a bare entities file is the shared base, and each anchors its edges as a band rather than as a cell.
    if (collapsed.has(domain))
      return {
        area: "domain",
        core,
        domain,
        sub: "",
        unit: "",
        row,
        collapsed: true,
        band:
          !isSurface &&
          unitCol(r) === "" &&
          (r.layer === "services" || r.layer === "entities"),
      };
    return {
      area: "domain",
      core,
      domain,
      sub: chain.slice(1).join("/"),
      unit: isSurface ? "" : unitCol(r),
      row,
      loner: isLonerCore(r),
    };
  }
  return { area: "other" };
}

// The row a file draws in once its domain is folded: its own rank, or one of the two band keys, which keep the composer cap above the cake and the shared base below it.
export const compactRow = (p) => (p.band ? (p.row === "services" ? "@root" : "@base") : p.row);

// Folding a domain is a view change like any other: it persists for the session, and the board redraws around it.
export function toggleCollapse(name) {
  if (collapsed.has(name)) collapsed.delete(name);
  else collapsed.add(name);
  savePrefs();
  render();
}

// A domain-wide band: the bare composer (the sub-root cap) or the bare entities file (the shared base), lifted out of the cake and spanning its (sub)domain. Edges anchor these vertically only.
// A collapsed domain carries its bands in the same places, so it reads its own flag; every other file of it is cake, whatever its rank.
export function isBarFile(f) {
  const p = place(f);
  if (p.collapsed) return p.band;
  return p.area === "domain" && p.unit === "" && (p.row === "services" || p.row === "entities");
}

// A services composer (a sub-root band) threads away like a surface: an edge into it re-emerges as edges to the modules it re-exports, so arrows land on the real carriers behind the composition layer. `data().flows` already carries the composer's onward hop.
export function isComposerFile(f) {
  return isBarFile(f) && f.role.layer === "services";
}
export function threadComposers(list) {
  const composers = new Set(data().files.filter(isComposerFile).map((f) => f.id));
  if (!composers.size) return list;
  const outBy = new Map();
  for (const e of list)
    if (e.to != null && composers.has(e.from))
      (outBy.get(e.from) ?? outBy.set(e.from, []).get(e.from)).push(e);
  const rank = (t) => (t === "invariant" ? 2 : t === "smell" ? 1 : 0);
  const overlap = (a, b) =>
    a === "*" ||
    b === "*" ||
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.some((n) => b.includes(n));
  const out = [];
  const expand = (e, seen) => {
    for (const o of outBy.get(e.to) ?? []) {
      if (o.to == null || o.to === e.from || !overlap(e.names, o.names)) continue;
      const worse = rank(o.tier) >= rank(e.tier) ? o : e;
      // The threaded edge keeps the source flow's laundered standing: rerouting through a composer is a redraw, not a finding of its own, and a tier inherited from a real authored hop stays that hop's severity.
      const threaded = {
        ...e,
        to: o.to,
        via: [...(e.via ?? []), e.to, ...(o.via ?? [])],
        tier: worse.tier,
        verdict: worse.verdict,
      };
      if (composers.has(o.to)) {
        if (!seen.has(o.to)) expand(threaded, new Set([...seen, o.to]));
      } else out.push(threaded);
    }
  };
  for (const e of list) {
    if (e.to != null && composers.has(e.from)) continue;
    if (e.to != null && composers.has(e.to)) expand(e, new Set([e.to]));
    else out.push(e);
  }
  return out;
}

// A chip's label is the file's own name; everything the name carries beyond that (runtime markers, a style compound) becomes a small badge.
// The file's real extension strips generically rather than off a list: a list omits whatever it has not met, which then survives into the name and shows up as a badge beside the one the extension already earned.
export function chipParts(f) {
  const file = f.path.split("/").pop();
  const base = /\.d\.ts$/.test(file)
    ? file.replace(/\.d\.ts$/, ".dts")
    : file.replace(/\.[^.]+$/, "");
  const segs = base.split(".");
  const label = segs[0];
  const badges = segs.slice(1).filter((s) => !ROWS.includes(s));
  if (f.kind === "style") badges.push("css");
  if (f.kind === "asset") badges.push(file.split(".").pop().toLowerCase());
  return { label, badges };
}
