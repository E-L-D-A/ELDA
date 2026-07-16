// ---------------------------------------------------------------------------
// DOM building.

import { bundleEdges, drawEdges, edgeVisible } from "./edges.use-cases.js";
import { applyPin } from "./focus.use-cases.js";
import { renderIssues } from "./issues.use-cases.js";
import {
  blockOf,
  chipParts,
  compactRow,
  isComposerFile,
  isLonerCore,
  place,
  threadComposers,
  toggleCollapse,
} from "./placement.use-cases.js";
import {
  $,
  ROWS,
  ROW_LABEL,
  byPath,
  collapsed,
  data,
  edgeKey,
  hiddenBlocks,
  hiddenFiles,
  savePrefs,
  setCollapsed,
  wrap,
} from "./entities.js";

// Render owns the derived state it rebuilds every pass: the chip map keyed by file id, the drawn edge list, the cycle-closing edge set, the reach adjacency both ways, and the folded-domain aggregates.
// Every module reads these through the accessors; only render reassigns the private bindings, so no live mutable binding crosses the module boundary (CHANNEL.4).
let _chips = new Map();
let _drawn = [];
let _cycleClosers = new Set();
let _adjOut = new Map();
let _adjIn = new Map();
let _compactRep = new Map();
let _compactFiles = new Map();
export const chips = () => _chips;
export const drawn = () => _drawn;
export const cycleClosers = () => _cycleClosers;
export const adjOut = () => _adjOut;
export const adjIn = () => _adjIn;
export const compactRep = () => _compactRep;
export const compactFiles = () => _compactFiles;
// A file's dependency count is its distinct outgoing references; stacks float the highest-dependency file to the top and columns bubble it left, so arrows run down and to the right. Only render sorts by it.
let outDeg = new Map();
const deg = (f) => outDeg.get(f.id) ?? 0;
const byDeg = (a, b) => deg(b) - deg(a) || byPath(a, b);

// Element builder: `class` and `style` arrive as strings, any other key assigns an element property when one exists (checked, hidden, on* handlers) and an attribute otherwise.
// Child arrays flatten one level and nullish children drop, so callers can pass map results directly.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}

// The corner button that hides a block without reaching for the bottom bar.
function hideBtn(key) {
  return h(
    "button",
    {
      class: "hide-btn",
      title: "hide (restore from the bottom bar)",
      onclick: (e) => {
        e.stopPropagation();
        hiddenBlocks.add(key);
        savePrefs();
        render();
      },
    },
    "✕",
  );
}

// A chip carries its file id, which the delegated pointer handlers and the edge layer's rect lookups both key on.
// A ghost chip (a hidden file on its domain's shelf) keeps the id for the restore click yet stays out of the chips map, so edges and focus passes never see it.
function makeChip(f, ghost) {
  const p = place(f);
  const { label, badges } = chipParts(f);
  const el = h(
    "span",
    {
      class:
        "chip " +
        (p.row && p.row !== "surface" ? p.row : p.area === "root" ? "services" : "") +
        (ghost ? " ghost" : "") +
        (f.dispute ? " disputed" : "") +
        (f.unreached ? " unreached" : ""),
      "data-id": f.id,
    },
    ghost && p.sub ? h("span", { class: "gsub" }, p.sub + " / ") : null,
    label,
    badges.map((b) => h("span", { class: "badge" }, b)),
  );
  if (!ghost) _chips.set(f.id, el);
  return el;
}

export function render() {
  _chips = new Map();
  // Recompute dependency counts from the authored edges, distinct per target, so stacking and ordering stay stable under the view toggles.
  outDeg = new Map();
  const counted = new Set();
  for (const e of data().edges) {
    if (e.to == null) continue;
    const k = e.from + ">" + e.to;
    if (counted.has(k)) continue;
    counted.add(k);
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
  }
  const hideAsset = !$("t-assets").checked;
  const expunge = !$("t-surfaces").checked;
  const threadC = !$("t-services").checked;
  // A core surface expunges like any other conduit, except the loner: that file IS its domain, the binding walk terminates on its declarations, so the dataflow view keeps it and draws it inside its obscured cake.
  const isConduit = (f) =>
    f.role.kind === "surface" || (f.role.kind === "core" && f.role.surface != null && !isLonerCore(f.role));
  const passes = (f) =>
    !(hideAsset && f.kind !== "code") &&
    !(expunge && isConduit(f)) &&
    !(threadC && isComposerFile(f)) &&
    !hiddenBlocks.has(blockOf(f));
  const visible = (f) => passes(f) && !hiddenFiles.has(f.path);
  // A ghost renders on its domain's hidden shelf: banished by middle-click yet passing every other filter.
  const ghost = (f) => passes(f) && hiddenFiles.has(f.path);
  renderRootBar(visible);
  renderOtherBox(visible);
  renderDomains(visible, ghost, expunge ? ROWS.slice(1) : ROWS, expunge);
  // A cycle closes over the landed flows, so its closing edges are on the board in the expunged view, which is the view the cycles were found in.
  // A view that redraws the arrows through their conduits routes them around the cycle; the files it encloses still raise together, which is what a cycle is.
  // The closers are keyed before the edges are drawn, because a bundle takes its paint from the worst reference it carries and a cycle closer is one of the paints it can take.
  _cycleClosers = new Set(data().cycles.flatMap((c) => c.edges.map(edgeKey)));
  // The drawn flow comes precomputed from the scanner: with surfaces expunged, every edge is expanded through the conduits (surfaces, re-export chains) to the real carriers and judged by the geometry verdicts; with surfaces shown, the raw authored edges draw as-is.
  _drawn = expunge ? data().flows : data().edges;
  if (threadC) _drawn = threadComposers(_drawn);
  if (collapsed.size) _drawn = bundleEdges(_drawn);
  // The adjacency the reach walk rides is the board's own: an edge a filter dropped or a hidden block took away is out of the walk exactly as it is out of the picture, so the reach you read is the reach of the graph in front of you.
  _adjOut = new Map();
  _adjIn = new Map();
  for (const e of _drawn) {
    if (e.from === e.to || !edgeVisible(e)) continue;
    (_adjOut.get(e.from) ?? _adjOut.set(e.from, []).get(e.from)).push(e.to);
    (_adjIn.get(e.to) ?? _adjIn.set(e.to, []).get(e.to)).push(e.from);
  }
  wrap.classList.toggle("reach", $("t-reach").checked);
  renderBlockBar();
  renderIssues();
  requestAnimationFrame(() => {
    drawEdges();
    applyPin();
  });
}

// One Application Runtime strip per composition root: the client route root, the server, and the builder each draw their own bar feeding the shared domains.
function renderRootBar(visible) {
  const container = $("root-bar");
  const blocks = data().options.roots
    .map((r) => {
      const key = "@root:" + r.key;
      const files = data().files
        .filter((f) => {
          const p = place(f);
          return p.area === "root" && p.root === r.key && visible(f);
        })
        .sort(byDeg);
      if (hiddenBlocks.has(key) || !files.length) return null;
      return h(
        "div",
        { class: "root-block" },
        h(
          "div",
          { class: "root-inner" },
          h("span", { class: "bar-title" }, r.label),
          files.map((f) => makeChip(f)),
          hideBtn(key),
        ),
      );
    })
    .filter(Boolean);
  container.style.display = blocks.length ? "" : "none";
  container.replaceChildren(...blocks);
}

// A file the classifier could not place gets a box of its own beside the domains. Leaving it undrawn was the worse silence of the two: it is a file in the tree that no rule reads, and the diagram was the one place that could say so.
function renderOtherBox(visible) {
  const otherBox = $("other-box");
  const otherFiles = data().files.filter((f) => place(f).area === "other" && visible(f)).sort(byDeg);
  otherBox.hidden = otherFiles.length === 0;
  otherBox.replaceChildren(
    "unreached ",
    hideBtn("@other"),
    ...otherFiles.map((f) => makeChip(f)),
  );
  $("nondomains").hidden = otherBox.hidden;
}

// Domain boxes: one grid per top-level domain, subdomain columns sorted by name, the fixed layer rows.
// A core area is one of the blocks, drawn first the way the diagram draws Shared to the left of the features, and marked so its box reads as the sharedness DAG's bottom.
function renderDomains(visible, ghost, rowList, expunge) {
  const domains = new Map();
  const coreBlocks = new Set();
  const shelves = new Map();
  // A folded domain's files, bucketed by the row each draws in: the two bands keep their own keys, so the composer cap and the shared base stay outside the cake exactly as they do in an open box.
  const compact = new Map();
  _compactRep = new Map();
  _compactFiles = new Map();
  // The bare composer (services) and the bare entities file are the (sub)domain's own composition root and shared base.
  // They lift out of the layer cake into a sub-root cap above the columns and a shared-base bar below them, keyed by domain then subdomain.
  const subRoots = new Map();
  const subBases = new Map();
  const bucketBar = (map, domain, sub, f) => {
    if (!map.has(domain)) map.set(domain, new Map());
    const bySub = map.get(domain);
    if (!bySub.has(sub)) bySub.set(sub, []);
    bySub.get(sub).push(f);
  };
  for (const f of data().files) {
    const p = place(f);
    if (p.area !== "domain") continue;
    if (p.core) coreBlocks.add(p.domain);
    if (ghost(f)) {
      if (!shelves.has(p.domain)) shelves.set(p.domain, []);
      shelves.get(p.domain).push(f);
      continue;
    }
    if (!visible(f)) continue;
    if (p.collapsed) {
      if (!compact.has(p.domain)) compact.set(p.domain, new Map());
      const rows = compact.get(p.domain);
      const key = compactRow(p);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(f);
      // The box still needs its entry, so a folded domain keeps its place in the order.
      if (!domains.has(p.domain)) domains.set(p.domain, new Map());
      continue;
    }
    if (!domains.has(p.domain)) domains.set(p.domain, new Map());
    const subsOf = domains.get(p.domain);
    if (!subsOf.has(p.sub)) subsOf.set(p.sub, new Map());
    // A bare reserved-name file at the services or entities layer is the subdomain's composer or shared base; lift it to the sub-root or sub-base bar.
    if (p.unit === "" && p.row === "services") {
      bucketBar(subRoots, p.domain, p.sub, f);
      continue;
    }
    if (p.unit === "" && p.row === "entities") {
      bucketBar(subBases, p.domain, p.sub, f);
      continue;
    }
    const units = subsOf.get(p.sub);
    if (!units.has(p.unit)) units.set(p.unit, new Map());
    const rows = units.get(p.unit);
    if (!rows.has(p.row)) rows.set(p.row, []);
    rows.get(p.row).push(f);
  }
  // A subdomain whose only files are its composer and base still needs one column track for those bars to span.
  const ensureSub = (domain, sub) => {
    if (!domains.has(domain)) domains.set(domain, new Map());
    const subsOf = domains.get(domain);
    if (!subsOf.has(sub)) subsOf.set(sub, new Map());
    if (subsOf.get(sub).size === 0) subsOf.get(sub).set("", new Map());
  };
  for (const [d, bySub] of subRoots)
    for (const sub of bySub.keys()) if (sub !== "") ensureSub(d, sub);
  for (const [d, bySub] of subBases)
    for (const sub of bySub.keys()) if (sub !== "") ensureSub(d, sub);
  // A domain whose every file sits on the shelf still renders, so its files stay restorable.
  for (const d of shelves.keys()) if (!domains.has(d)) domains.set(d, new Map());

  const domainsEl = $("domains");
  domainsEl.replaceChildren();
  // Nesting is unbounded, so the rows are cut for the deepest chain in the diagram rather than for a fixed two levels: each level of subdomain needs a head and a sub-root above the cake, and a shared base below it, and the whole thing is capped by the domain's own composer and floored by its own base.
  // Every domain box subgrids into this one template, which is what levels each layer row across the diagram; a shallow domain simply leaves the deeper rows empty.
  // The depth is read off every file rather than the visible ones, so hiding a subdomain never reflows the rows underneath.
  let D = 1;
  for (const f of data().files) {
    const p = place(f);
    if (p.area === "domain" && p.sub !== "") D = Math.max(D, p.sub.split("/").length);
  }
  const headRow = (d) => 2 * d;
  const rootRow = (d) => 2 * d + 1;
  const COLHEAD_ROW = 2 * D + 2;
  const layerRow = (i) => 2 * D + 3 + i;
  const baseRow = (d) => 2 * D + 3 + rowList.length + (D - d);
  const DOMBASE_ROW = 2 * D + 3 + rowList.length + D;
  domainsEl.style.gridTemplateRows = `repeat(${rowList.length + 3 * D + 4}, auto)`;
  const dotFirst = (a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b));

  // Dependency totals per domain, subdomain, and unit column, summed over every file so the toggles never reshuffle the order; the heaviest bubble left.
  const domDeg = new Map(),
    subDeg = new Map(),
    colDeg = new Map();
  const bump = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  for (const f of data().files) {
    const p = place(f);
    if (p.area !== "domain") continue;
    const d = deg(f);
    bump(domDeg, p.domain, d);
    bump(subDeg, p.domain + "\0" + p.sub, d);
    bump(colDeg, p.domain + "\0" + p.sub + "\0" + p.unit, d);
  }
  const at = (m, ...k) => m.get(k.join("\0")) ?? 0;

  // One chip standing for every file of a folded domain at one rank: it carries the count, the files behind it, and the id that every reference into that rank bundles onto.
  const aggChip = (name, key, files) => {
    const rep = Math.min(...files.map((f) => f.id));
    const row = place(files[0]).row;
    _compactRep.set(name + "\0" + key, rep);
    _compactFiles.set(rep, files);
    const el = h(
      "span",
      {
        class: "chip agg " + (row === "surface" ? "" : row),
        "data-id": rep,
        "data-domain": name,
      },
      String(files.length),
      h("span", { class: "agg-n" }, files.length === 1 ? "file" : "files"),
    );
    _chips.set(rep, el);
    return el;
  };

  // A folded domain draws one column into the same shared row template, so every rank still lines up with the open boxes beside it and an arrow still lands on the row it belongs to.
  const compactGrid = (name) => {
    const rows = compact.get(name) ?? new Map();
    const cell = (key, cls, style) =>
      rows.has(key) ? h("div", { class: cls, style }, aggChip(name, key, rows.get(key))) : null;
    return h(
      "div",
      { class: "grid", style: "grid-template-columns: 14px minmax(70px, max-content)" },
      cell("@root", "subroot domainwide", "grid-column: 2; grid-row: 1"),
      rowList.flatMap((row, ri) => [
        h(
          "div",
          { class: "rail", style: `grid-column: 1; grid-row: ${layerRow(ri)}` },
          rows.has(row) ? ROW_LABEL[row] : "",
        ),
        cell(row, "cell " + row, `grid-column: 2; grid-row: ${layerRow(ri)}`),
      ]),
      cell("@base", "subbase domainwide", `grid-column: 2; grid-row: ${DOMBASE_ROW}`),
    );
  };

  // The box around a domain, folded or open: its title folds it, the corner button hides it, and a domain holding banished files keeps its shelf either way.
  const domainBox = (name, grid) => {
    const shelf = shelves.get(name);
    return h(
      "section",
      {
        class:
          "domain" +
          (coreBlocks.has(name) ? " core" : "") +
          (shelf ? " has-hidden" : "") +
          (collapsed.has(name) ? " folded" : ""),
      },
      h(
        "h2",
        {
          title: collapsed.has(name)
            ? "click to open this domain"
            : "click to fold this domain into one column",
          onclick: (ev) => {
            ev.stopPropagation();
            toggleCollapse(name);
          },
        },
        name,
        hideBtn(name),
      ),
      grid,
      shelf
        ? h(
            "div",
            { class: "footer" },
            h(
              "button",
              {
                class: "flabel",
                title: "unhide this domain's files",
                onclick: (ev) => {
                  ev.stopPropagation();
                  for (const f of shelf) hiddenFiles.delete(f.path);
                  render();
                },
              },
              h("span", { class: "idle" }, "hidden"),
              h("span", { class: "act" }, "unhide"),
            ),
            shelf.sort(byPath).map((f) => makeChip(f, true)),
          )
        : null,
    );
  };

  // Core blocks lead, the way the diagram draws Shared to the left of the feature columns; within each group the heaviest block still bubbles left.
  const sortedDomains = [...domains.entries()].sort(
    (a, b) =>
      (coreBlocks.has(b[0]) ? 1 : 0) - (coreBlocks.has(a[0]) ? 1 : 0) ||
      at(domDeg, b[0]) - at(domDeg, a[0]) ||
      a[0].localeCompare(b[0]),
  );

  for (const [name, subsOf] of sortedDomains) {
    if (collapsed.has(name)) {
      domainsEl.append(domainBox(name, compactGrid(name)));
      continue;
    }
    // The subdomains form a tree, not a list, so the columns are laid by walking it: a subdomain emits its own unit columns first, then each child's.
    // That makes a subdomain's tracks contiguous with its descendants', which is what lets one card span exactly a subtree and a child's card sit inside its parent's.
    // Every ancestor gets a node even when it holds no files of its own, since a chain is a path and a gap in it would strand the levels below.
    const parentOf = (k) => (k === "" ? null : k.split("/").slice(0, -1).join("/"));
    const nodes = new Set([...subsOf.keys(), ""]);
    for (const k of [...nodes]) {
      let p = parentOf(k);
      while (p !== null) {
        nodes.add(p);
        p = parentOf(p);
      }
    }
    const kids = new Map();
    for (const k of nodes) {
      const p = parentOf(k);
      if (p === null) continue;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(k);
    }
    const columns = [];
    const groups = [];
    const tracks = [];
    let track = 2;
    // `span` covers the whole subtree, which is what the card, the head and the bands take: a composer composes its children too, so its band must cap them.
    // `ownSpan` covers only the subdomain's own unit columns, which is what the domain root's own dot-head takes.
    const emit = (key, depth) => {
      const start = track;
      const units = [...(subsOf.get(key)?.keys() ?? [])].sort(
        (a, b) => at(colDeg, name, key, b) - at(colDeg, name, key, a) || dotFirst(a, b),
      );
      for (const unit of units) {
        tracks.push("minmax(86px, max-content)");
        columns.push({
          sub: key,
          unit,
          rows: subsOf.get(key).get(unit),
          track: track++,
        });
      }
      const ownSpan = track - start;
      const children = (kids.get(key) ?? []).sort(
        (a, b) => at(subDeg, name, b) - at(subDeg, name, a) || dotFirst(a, b),
      );
      for (const child of children) {
        if (tracks.length) {
          tracks.push("2px");
          track++;
        }
        emit(child, depth + 1);
      }
      if (track > start)
        groups.push({
          sub: key,
          depth,
          start,
          span: track - start,
          ownStart: start,
          ownSpan,
        });
    };
    emit("", 0);

    // A loner core module is a whole domain in one file: the file draws as its surface, and the cake cell beneath it spans the layer rows it has no files for.
    // The cake draws hatched (obscured) exactly when the file owns exported value bindings - contents no layer file carries yet - so a loner that only re-exports keeps a plain cake and claims nothing.
    // The dataflow view drops the surface row, and there the file draws inside its cake cell, since the binding walk terminates on its declarations.
    const lonerCake = (col) => {
      if (col.unit !== "" || col.sub === "") return false;
      const files = col.rows.get("surface") ?? [];
      if (!files.length || !files.every((f) => place(f).loner)) return false;
      if ([...col.rows.keys()].some((r) => r !== "surface")) return false;
      if ((kids.get(col.sub) ?? []).length) return false;
      if ((subsOf.get(col.sub)?.size ?? 0) > 1) return false;
      if (subRoots.get(name)?.get(col.sub)?.length || subBases.get(name)?.get(col.sub)?.length)
        return false;
      return true;
    };
    const cakeCols = new Set(columns.filter(lonerCake).map((c) => c.track));

    const grid = h("div", {
      class: "grid",
      style: `grid-template-columns: 14px${tracks.length ? " " + tracks.join(" ") : ""}`,
    });
    // Cards paint shallowest first, so a child's card lands on top of its parent's and the containment reads.
    for (const g of [...groups].sort((a, b) => a.depth - b.depth)) {
      if (g.sub === "") continue;
      grid.append(
        h("div", {
          class: "subpanel",
          "data-depth": String(Math.min(g.depth, 4)),
          style: `grid-column: ${g.start} / span ${g.span}; grid-row: ${headRow(g.depth)} / ${baseRow(g.depth) + 1}`,
        }),
      );
    }
    for (const g of groups) {
      // A named subdomain's head labels its whole subtree; the domain root's dot-head labels only the columns it owns directly.
      const headStart = g.sub === "" ? g.ownStart : g.start;
      const headSpan = g.sub === "" ? g.ownSpan : g.span;
      if (headSpan > 0)
        grid.append(
          h(
            "div",
            {
              class: "grouphead",
              style: `grid-column: ${headStart} / span ${headSpan}; grid-row: ${headRow(Math.max(g.depth, 1))}`,
              "data-domain": name,
              "data-sub": g.sub,
              title: "middle-click hides the subdomain",
            },
            g.sub === "" ? "·" : g.sub.split("/").pop() + " /",
          ),
        );
      if (g.sub === "") continue;
      // The subdomain's own composer caps its subtree as a nested sub-root, and its bare entities file underlies the same span as the shared base.
      const rootFiles = (subRoots.get(name)?.get(g.sub) ?? []).sort(byDeg);
      if (rootFiles.length)
        grid.append(
          h(
            "div",
            {
              class: "subroot",
              style: `grid-column: ${g.start} / span ${g.span}; grid-row: ${rootRow(g.depth)}`,
            },
            rootFiles.map((f) => makeChip(f)),
          ),
        );
      const baseFiles = (subBases.get(name)?.get(g.sub) ?? []).sort(byDeg);
      if (baseFiles.length)
        grid.append(
          h(
            "div",
            {
              class: "subbase",
              style: `grid-column: ${g.start} / span ${g.span}; grid-row: ${baseRow(g.depth)}`,
            },
            baseFiles.map((f) => makeChip(f)),
          ),
        );
    }
    // The domain's own composer caps the whole box as its composition root; its shared base underlies everything. Both span every column.
    const domRoots = (subRoots.get(name)?.get("") ?? []).sort(byDeg);
    if (domRoots.length)
      grid.append(
        h(
          "div",
          { class: "subroot domainwide", style: `grid-column: 2 / -1; grid-row: 1` },
          domRoots.map((f) => makeChip(f)),
        ),
      );
    const domBases = (subBases.get(name)?.get("") ?? []).sort(byDeg);
    if (domBases.length)
      grid.append(
        h(
          "div",
          { class: "subbase domainwide", style: `grid-column: 2 / -1; grid-row: ${DOMBASE_ROW}` },
          domBases.map((f) => makeChip(f)),
        ),
      );
    for (const col of columns) {
      grid.append(
        h(
          "div",
          {
            class: "colhead",
            style: `grid-column: ${col.track}; grid-row: ${COLHEAD_ROW}`,
            "data-domain": name,
            "data-sub": col.sub,
            "data-unit": col.unit,
            title: "middle-click hides the column",
          },
          col.unit === "" ? "·" : col.unit,
        ),
      );
    }
    rowList.forEach((row, ri) => {
      const rowHasFiles = columns.some((col) => col.rows.has(row));
      grid.append(
        h(
          "div",
          { class: "rail", style: `grid-column: 1; grid-row: ${layerRow(ri)}` },
          rowHasFiles ? ROW_LABEL[row] : "",
        ),
      );
      columns.forEach((col) => {
        if (cakeCols.has(col.track) && row !== "surface") return;
        grid.append(
          h(
            "div",
            {
              class: "cell " + row,
              style: `grid-column: ${col.track}; grid-row: ${layerRow(ri)}`,
            },
            (col.rows.get(row) ?? []).sort(byDeg).map((f) => makeChip(f)),
          ),
        );
      });
    });
    const cakeStart = rowList[0] === "surface" ? 1 : 0;
    if (rowList.length > cakeStart)
      for (const col of columns) {
        if (!cakeCols.has(col.track)) continue;
        const files = (col.rows.get("surface") ?? []).sort(byDeg);
        const owned = [...new Set(files.flatMap((f) => f.owns ?? []))];
        const props = {
          class: "cell cake" + (owned.length ? " obscured" : ""),
          style: `grid-column: ${col.track}; grid-row: ${layerRow(cakeStart)} / ${layerRow(rowList.length - 1) + 1}`,
        };
        if (owned.length)
          props.title = `contents not extracted: the surface file owns ${owned.join(", ")}`;
        grid.append(h("div", props, expunge ? files.map((f) => makeChip(f)) : null));
      }
    domainsEl.append(domainBox(name, grid));
  }
}

// The bottom bar lists every top-level block; unchecking one hides its box and every edge touching it.
// The composition roots share the first row as the non-domain modules; the domains, core blocks among them, take the second.
function renderBlockBar() {
  const rootBlocks = data().options.roots.map((r) => ["@root:" + r.key, r.label]);
  if (data().files.some((f) => place(f).area === "other"))
    rootBlocks.push(["@other", "unclassified"]);
  const domainBlocks = [...new Set(data().files.map(blockOf).filter((b) => b && !b.startsWith("@")))]
    .sort()
    .map((d) => [d, d]);

  const toggle = ([key, text]) =>
    h(
      "label",
      { class: hiddenBlocks.has(key) ? "off" : "" },
      h("input", {
        type: "checkbox",
        checked: !hiddenBlocks.has(key),
        onchange: (e) => {
          hiddenBlocks[e.target.checked ? "delete" : "add"](key);
          savePrefs();
          render();
        },
      }),
      text,
    );

  // One labelled row: the group name, an all-toggle scoped to the row, then each block.
  const row = (label, blocks, ...extra) => {
    const keys = blocks.map(([k]) => k);
    const shown = keys.filter((k) => !hiddenBlocks.has(k)).length;
    return h(
      "div",
      { class: "bar-row" },
      h("span", { class: "bar-label" }, label),
      h(
        "label",
        {},
        h("input", {
          type: "checkbox",
          checked: shown === keys.length && keys.length > 0,
          indeterminate: shown > 0 && shown < keys.length,
          onchange: (e) => {
            for (const k of keys) hiddenBlocks[e.target.checked ? "delete" : "add"](k);
            savePrefs();
            render();
          },
        }),
        "all",
      ),
      ...blocks.map(toggle),
      ...extra,
    );
  };

  const unhideFiles = hiddenFiles.size
    ? h(
        "button",
        {
          class: "bar-btn",
          onclick: () => {
            hiddenFiles.clear();
            render();
          },
        },
        `unhide ${hiddenFiles.size} file${hiddenFiles.size > 1 ? "s" : ""}`,
      )
    : null;

  // Reading a tree you did not write starts by folding the whole board and opening the one domain in question, so the fold sits beside the list of domains it acts on.
  const names = domainBlocks.map(([key]) => key);
  const allFolded = names.length > 0 && names.every((n) => collapsed.has(n));
  const foldAll = names.length
    ? h(
        "button",
        {
          class: "bar-btn",
          title: allFolded ? "open every domain" : "fold every domain into one column",
          onclick: () => {
            setCollapsed(allFolded ? new Set() : new Set(names));
            savePrefs();
            render();
          },
        },
        allFolded ? "open all" : "fold all",
      )
    : null;

  $("bottombar").replaceChildren(
    row("roots", rootBlocks),
    row("domains", domainBlocks, foldAll, unhideFiles),
  );
}
