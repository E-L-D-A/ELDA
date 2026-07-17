// ---------------------------------------------------------------------------
// Issues drawer: every verdict edge, the laundered flow findings, unresolved specifiers, and files the classifier could not place.
// A drawer click re-aims the board through the board's own ports (rebuild, applyPin), so this service composes no sibling service.
// The list is navigable through a text search and a domain facet, both applied by toggling item visibility rather than rebuilding, so a keystroke never re-renders under the cursor.

import { applyPin, chips, rebuild } from "../flows/board.js";
import { $, h } from "../harnesses/dom.js";
import { edgeClass } from "../flows/edges.js";
import { place } from "../flows/placement.js";
import { collapsed, cycleId, data, getEditorLink, savePrefs, selectedKey, setPin, setPinCycle, setSelected } from "../flows/state.js";

// The section titles are referenced from three places (the section, the count that scopes to it, the empty state), so they are named once here and drift nowhere.
const T = {
  violations: "Violations",
  inadvisable: "Inadvisable (graded smells)",
  laundered: "Laundered through indirection (graph-only)",
  contested: "Contested placement (tree vs graph)",
  cycles: "Reference cycles (graph-only)",
  pressure: "Slicing pressure (partition vs dataflow)",
  recommendations: "Recommendations (re-slice)",
  unresolved: "Unresolved specifiers",
  unextracted: "Unextracted declarations (surfaces owning bindings)",
  unreachable: "Unreachable from any root",
  unsorted: "Unsorted (no layer claim)",
  unclassified: "Unclassified files",
};

// The three filter facets, held across rebuilds so a rescan keeps the reader where they were: a text query, a single domain, and a category the header counts can scope to.
let query = "";
let domainFilter = null;
let categoryFilter = null;
// Sections a reader folded shut, kept by title so the fold survives the list being rebuilt under it.
const collapsedSections = new Set();

// The domain a finding sits in, for the domain facet: a domain-area file names its domain, a root or unclassified file names its bucket.
const domainOf = (f) => {
  const p = place(f);
  return p.area === "domain" ? p.domain : p.area === "root" ? "root" : "unclassified";
};

// A reference is named by where it starts, how it is written, what it asks for, and the bindings it takes, which is what survives a rescan.
// The bindings are load-bearing: one file can import the same module twice, and those two references are one finding each.
// The names ride as an array of bindings or as the string '*' for a namespace or dynamic import, so the key takes either shape as it comes.
const edgeItemKey = (e) =>
  `${data().files[e.from].path}:${e.kind}:${e.spec}:${Array.isArray(e.names) ? e.names.join(",") : e.names ?? ""}`;

// An edge worth a drawer entry: the four paints that carry a verdict, plus the lean that a recommendation clusters.
const FINDING_EDGE = new Set(["violation", "smell", "laundered", "cycle", "lean"]);

// The composer supplies the selection sweep (LAYER.2): it lives in the focus service, and this drawer imports no sibling service.
let markSelection = () => {};
export function installIssues(ports) {
  ({ markSelection } = ports);
}

// Apply the three facets to the already-built list by toggling visibility: items that miss the query or the domain hide, a scoped category hides every other section, and each section header counts what still shows.
function applyFilter() {
  const root = $("issues");
  const q = query.trim().toLowerCase();
  const secs = [...root.querySelectorAll(".issue-section")];
  let anyVisible = false;
  for (const sec of secs) {
    const catHidden = categoryFilter != null && sec.dataset.title !== categoryFilter;
    let shown = 0;
    for (const item of sec.querySelectorAll(".item")) {
      const matchQ = !q || (item.dataset.text || "").includes(q);
      const matchD =
        domainFilter == null ||
        (" " + (item.dataset.domain || "") + " ").includes(" " + domainFilter + " ");
      const vis = matchQ && matchD;
      item.classList.toggle("filtered", !vis);
      if (vis) shown++;
    }
    const hideSec = catHidden || shown === 0;
    sec.classList.toggle("filtered", hideSec);
    sec.classList.toggle("collapsed", collapsedSections.has(sec.dataset.title));
    const badge = sec.querySelector(".sec-count");
    if (badge)
      badge.textContent = q || domainFilter != null ? `${shown}/${sec.dataset.total}` : sec.dataset.total;
    if (!hideSec) anyVisible = true;
  }
  const empty = root.querySelector(".drawer-empty");
  if (empty) {
    empty.textContent = secs.length ? "No matching findings" : "No findings";
    empty.hidden = anyVisible && secs.length > 0;
  }
  const clearBtn = root.querySelector(".filter-clear");
  if (clearBtn) clearBtn.hidden = !(q || domainFilter != null || categoryFilter != null);
  for (const chip of root.querySelectorAll(".dom-chip"))
    chip.classList.toggle("active", (chip.dataset.dom || "") === (domainFilter ?? ""));
}

function toggleSection(title) {
  if (collapsedSections.has(title)) collapsedSections.delete(title);
  else collapsedSections.add(title);
  applyFilter();
}

// Clicking a header count opens the drawer showing only that category; clicking the lit one again lets go.
function scopeCategory(cat) {
  categoryFilter = categoryFilter === cat ? null : cat;
  query = "";
  const search = $("issue-search");
  if (search) search.value = "";
  $("issues").classList.add("open");
  applyFilter();
  if (categoryFilter) {
    const sec = [...$("issues").querySelectorAll(".issue-section")].find(
      (s) => s.dataset.title === cat,
    );
    sec?.scrollIntoView({ block: "start" });
  }
}

function clearFilters() {
  query = "";
  domainFilter = null;
  categoryFilter = null;
  const search = $("issue-search");
  if (search) search.value = "";
  applyFilter();
}

// The drawer item behind a board click: the exact reference when the arrow names one, otherwise the file's worst finding when the arrow itself carries a verdict.
function locate({ edge, fileId }) {
  const items = [...$("issues").querySelectorAll(".item")];
  if (edge) {
    const exact = items.find((el) => el.dataset.edge === edgeItemKey(edge));
    if (exact) return exact;
    if (!FINDING_EDGE.has(edgeClass(edge))) return null;
    fileId = edge.from;
  }
  if (fileId == null) return null;
  const id = String(fileId);
  return items.find((el) => (el.dataset.files || "").split(" ").includes(id)) ?? null;
}

// The board's way into the drawer: open it, drop any filter that would hide the target, then click the finding so it pins and scrolls exactly as a drawer click would, and lift the item into view with a brief flash.
export function openFinding(target) {
  $("issues").classList.add("open");
  clearFilters();
  const item = locate(target);
  if (!item) return;
  const key = item.dataset.key;
  item.click();
  // A pin can reveal a folded domain, which rebuilds the drawer, so the item to flash is found again by its content key after the rebuild settles.
  requestAnimationFrame(() => {
    const cur = [...$("issues").querySelectorAll(".item")].find((el) => el.dataset.key === key);
    if (!cur) return;
    cur.scrollIntoView({ block: "center" });
    cur.classList.add("flash");
    setTimeout(() => cur.classList.remove("flash"), 1200);
  });
}

// A header stat: the count and its label; the severity stats add a dot that takes the severity color while the count is nonzero, and a stat with a category scopes the drawer to it when clicked.
const stat = (n, label, sev, cat) => {
  const clickable = cat && n;
  return h(
    "span",
    {
      class: "stat" + (sev ? " " + sev : "") + (clickable ? " clickable" : ""),
      ...(clickable ? { onclick: () => scopeCategory(cat), title: "show only these in the drawer" } : {}),
    },
    sev ? h("i", { class: "dot" }) : null,
    h("b", {}, `${n}`),
    ` ${label}`,
  );
};

export function renderIssues() {
  const el = $("issues");
  const search = h("input", {
    id: "issue-search",
    class: "issue-search",
    type: "search",
    placeholder: "search findings…",
    value: query,
    oninput: (ev) => {
      query = ev.target.value;
      applyFilter();
    },
  });
  const clearBtn = h(
    "button",
    { class: "filter-clear", hidden: true, title: "clear filters", onclick: clearFilters },
    "clear",
  );
  const facetEl = h("div", { class: "drawer-facet" });
  el.replaceChildren(
    h(
      "div",
      { class: "drawer-head" },
      h(
        "div",
        { class: "drawer-head-row" },
        h("span", { class: "drawer-title" }, "Issues"),
        search,
        clearBtn,
        h(
          "button",
          {
            class: "drawer-close",
            title: "close",
            onclick: (ev) => {
              ev.stopPropagation();
              el.classList.remove("open");
            },
          },
          "✕",
        ),
      ),
      facetEl,
    ),
  );
  const issuesBody = h("div", { class: "drawer-body" });
  el.append(issuesBody);
  // Each finding carries a key drawn from its content, so the one being read stays lit across a rebuild rather than riding a position in a list that shifts under it.
  // Each item also carries the files it names, the domains those sit in, and a search haystack, so the facets can hide it without the list being rebuilt.
  const section = (title, items, build, keyOf = (_, i) => String(i), filesOf = () => [], edgeOf) => {
    if (!items.length) return;
    const sec = h("section", {
      class: "issue-section",
      "data-title": title,
      "data-total": String(items.length),
    });
    sec.append(
      h(
        "h3",
        {
          onclick: (ev) => {
            ev.stopPropagation();
            toggleSection(title);
          },
        },
        h("span", { class: "sec-caret" }),
        `${title} `,
        h("span", { class: "sec-count" }, String(items.length)),
      ),
    );
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const node = build(item);
      node.dataset.key = `${title}#${keyOf(item, i)}`;
      if (node.dataset.key === selectedKey()) node.classList.add("selected");
      const files = filesOf(item).filter((x) => x != null);
      node.dataset.files = files.join(" ");
      node.dataset.domain = [...new Set(files.map((id) => domainOf(data().files[id])))].join(" ");
      node.dataset.text = node.textContent.toLowerCase();
      if (edgeOf) {
        const k = edgeOf(item);
        if (k) node.dataset.edge = k;
      }
      sec.append(node);
    }
    issuesBody.append(sec);
  };
  // A finding inside a folded domain has no chip of its own to raise, so the domains it names open first.
  // Returns whether the board was rebuilt, since a rebuild applies the pin itself.
  const reveal = (ids) => {
    const shut = [
      ...new Set(
        ids
          .map((id) => place(data().files[id]))
          .filter((p) => p.collapsed)
          .map((p) => p.domain),
      ),
    ];
    if (!shut.length) return false;
    for (const d of shut) collapsed.delete(d);
    savePrefs();
    rebuild();
    return true;
  };
  const scrollTo = (id) =>
    requestAnimationFrame(() =>
      chips().get(id)?.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      }),
    );
  // Clicking a finding reveals the file it names: the chip pins on the diagram, the item lights in the drawer, and the board scrolls to it.
  // A reveal rebuilds the board, and that rebuild applies the pin and the selection on its own.
  const select = (ev) => {
    setSelected(ev.currentTarget?.dataset.key ?? null);
  };
  const pinId = (id) => (ev) => {
    ev.stopPropagation();
    select(ev);
    setPinCycle(null);
    setPin(data().files[id].path);
    if (!reveal([id])) {
      applyPin();
      markSelection();
    }
    scrollTo(id);
  };
  const pinFrom = (e) => pinId(e.from);
  // A cycle names no single culprit, so clicking one raises the whole set and scrolls to the first file it encloses.
  const pinCycle = (c) => (ev) => {
    ev.stopPropagation();
    select(ev);
    setPin(null);
    setPinCycle(cycleId(c));
    if (!reveal(c.files)) {
      applyPin();
      markSelection();
    }
    scrollTo(c.files[0]);
  };
  // A finding names a file, and the name is the way into it: the path opens the editor, while the item around it still pins the chip on the diagram.
  // Only the path is the link, so the two actions never compete for the same click.
  const pathLink = (path) =>
    h(
      "a",
      {
        class: "path",
        href: getEditorLink(path),
        onclick: (ev) => ev.stopPropagation(),
      },
      path,
    );
  const verdictItem = (e) =>
    h(
      "div",
      {
        class: "item " + (e.tier === "invariant" ? "violation" : "smell"),
        onclick: pinFrom(e),
      },
      h("div", {}, pathLink(data().files[e.from].path), " → ", h("b", {}, e.spec)),
      h("div", { class: "msg" }, e.verdict),
    );
  // A verdict edge names its source and, when it lands, its target, so the domain facet reads both ends of a cross-domain reach.
  const edgeFiles = (e) => (e.to != null ? [e.from, e.to] : [e.from]);
  section(
    T.violations,
    data().edges.filter((e) => e.tier === "invariant"),
    verdictItem,
    edgeItemKey,
    edgeFiles,
    edgeItemKey,
  );
  section(
    T.inadvisable,
    data().edges.filter((e) => e.tier === "smell"),
    verdictItem,
    edgeItemKey,
    edgeFiles,
    edgeItemKey,
  );
  // Findings the per-file rules cannot see: every hop is clean, the landed flow is not.
  const flowKey = (f) => `${data().files[f.from].path}=>${data().files[f.to].path}`;
  section(
    T.laundered,
    data().landings.filter((f) => f.laundered),
    (f) =>
      h(
        "div",
        {
          class: "item laundered",
          onclick: pinFrom(f),
        },
        h("div", {}, pathLink(data().files[f.from].path), " ⇒ ", pathLink(data().files[f.to].path)),
        h(
          "div",
          { class: "msg" },
          `via ${f.via.map((id) => data().files[id].path).join("\n   via ")}\n${f.verdict}`,
        ),
      ),
    flowKey,
    (f) => [f.from, f.to, ...(f.via ?? [])],
    flowKey,
  );
  // The two judges disagree: the tree places the file as one thing, the graph consumes it as another (the thesis's own finding).
  // The file draws where the tree claims it and its other findings are judged by that claim, so this list is where the contest itself surfaces.
  section(
    T.contested,
    data().files.filter((f) => f.dispute),
    (f) =>
      h(
        "div",
        { class: "item smell", onclick: pinId(f.id) },
        h("div", {}, pathLink(f.path)),
        h("div", { class: "msg" }, f.dispute),
      ),
    (f) => f.path,
    (f) => [f.id],
  );
  // A cycle of legal references is invisible to every per-file rule, because no file in it is at fault (CHANNEL.5): every file in a cycle reaches every other, so the cycle is what a reviewer adjudicates, naming the settling element that encloses it or breaking the cycle.
  section(
    T.cycles,
    data().cycles,
    (c) =>
      h(
        "div",
        { class: "item cycle", onclick: pinCycle(c) },
        h(
          "div",
          { class: "files" },
          ...c.files.flatMap((id, i) => [i ? " ⇄ " : "", pathLink(data().files[id].path)]),
        ),
        h("div", { class: "msg" }, c.verdict),
      ),
    cycleId,
    (c) => c.files,
  );
  // Slicing pressure is the spec's re-slice indicator: rank-climbing imports clustered between sibling pieces of one scope.
  // The pass gathers the cluster; choosing the new slice is the reviewer's decision, so this lists and never scores.
  const groupFiles = (g) => [...new Set(g.edges.flatMap((e) => [e.from, e.to]))];
  section(
    T.pressure,
    data().pressure ?? [],
    (g) =>
      h(
        "div",
        { class: "item pressure", onclick: pinFrom(g.edges[0]) },
        h(
          "div",
          { class: "files" },
          ...g.edges.flatMap((e, i) => [
            i ? " · " : "",
            pathLink(data().files[e.from].path),
            " ↗ ",
            pathLink(data().files[e.to].path),
          ]),
        ),
        h("div", { class: "msg" }, g.verdict),
      ),
    (g) => g.scope,
    groupFiles,
  );
  // The recommendations are the slicing leans clustered per scope: every listed import is legal, and the fan of them is the drawn geometry of a slice at odds with its dataflow, so the section recommends the other direction and scores nothing.
  section(
    T.recommendations,
    data().recommendations ?? [],
    (g) =>
      h(
        "div",
        { class: "item recommendation", onclick: pinFrom(g.edges[0]) },
        h(
          "div",
          { class: "files" },
          ...g.edges.slice(0, 6).flatMap((e, i) => [
            i ? " · " : "",
            pathLink(data().files[e.from].path),
            " ↘ ",
            pathLink(data().files[e.to].path),
          ]),
          g.edges.length > 6 ? ` + ${g.edges.length - 6} more` : "",
        ),
        h("div", { class: "msg" }, g.verdict),
      ),
    (g) => g.scope,
    groupFiles,
  );
  section(
    T.unresolved,
    data().edges.filter((e) => e.to == null),
    (e) =>
      h(
        "div",
        { class: "unresolved item", onclick: pinFrom(e) },
        pathLink(data().files[e.from].path),
        " → ",
        h("b", {}, e.spec),
      ),
    edgeItemKey,
    (e) => [e.from],
    edgeItemKey,
  );
  // A surface that owns exported value bindings holds contents no layer file carries yet, read off the shared binding tables.
  // The lint rule reports each declaration with its remedy and keeps the authoritative counts; this list is the per-file fact, so the two never claim one number.
  const owning = data().files.filter((f) => f.owns?.length);
  section(
    T.unextracted,
    owning,
    (f) =>
      h(
        "div",
        { class: "item unextracted", onclick: pinId(f.id) },
        h("div", {}, pathLink(f.path)),
        h(
          "div",
          { class: "msg" },
          `owns ${f.owns.join(", ")}. ` +
            (place(f).loner
              ? "A whole domain in one file: rename it with the layer suffix its contents hold, or extract them into layer files behind this surface."
              : "A surface curates what the layers own: declare these in layer files and re-export them here."),
        ),
      ),
    (f) => f.path,
    (f) => [f.id],
  );
  // A file no composition root can reach ships to nobody. SURFACE.4 reads that as a review signal - a domain may expose more than its consumers currently require - so it is listed, never scored as a breach.
  const unreached = data().files.filter((f) => f.reachable === false);
  section(
    T.unreachable,
    unreached,
    (f) =>
      h(
        "div",
        { class: "unreachable item", onclick: pinId(f.id) },
        pathLink(f.path),
        f.unreached ? h("div", { class: "msg" }, f.unreached) : null,
      ),
    (f) => f.path,
    (f) => [f.id],
  );
  section(
    T.unsorted,
    data().files.filter((f) => f.role.kind === "unsorted"),
    (f) => h("div", { class: "item", onclick: pinId(f.id) }, pathLink(f.path)),
    (f) => f.path,
    (f) => [f.id],
  );
  section(
    T.unclassified,
    data().files.filter((f) => place(f).area === "other"),
    (f) => h("div", { class: "item", onclick: pinId(f.id) }, pathLink(f.path)),
    (f) => f.path,
    (f) => [f.id],
  );
  issuesBody.append(h("div", { class: "drawer-empty", hidden: true }, "No findings"));

  // The domain facet is built from the domains the findings actually sit in, so it never offers a scope with nothing behind it; a crowded set folds into a select rather than wrapping across the head.
  const domTokens = new Set();
  for (const item of issuesBody.querySelectorAll(".item"))
    for (const d of (item.dataset.domain || "").split(" ")) if (d) domTokens.add(d);
  const rankDom = (d) => (d === "root" ? 1 : d === "unclassified" ? 2 : 0);
  const doms = [...domTokens].sort((a, b) => rankDom(a) - rankDom(b) || a.localeCompare(b));
  if (doms.length > 8) {
    facetEl.append(
      h(
        "select",
        {
          class: "dom-select",
          onchange: (ev) => {
            domainFilter = ev.target.value || null;
            applyFilter();
          },
        },
        h("option", { value: "" }, "all domains"),
        ...doms.map((d) => h("option", { value: d, selected: domainFilter === d }, d)),
      ),
    );
  } else if (doms.length) {
    const chip = (dom, label) =>
      h(
        "button",
        {
          class: "dom-chip" + ((domainFilter ?? "") === dom ? " active" : ""),
          "data-dom": dom,
          onclick: () => {
            domainFilter = dom || null;
            applyFilter();
          },
        },
        label,
      );
    facetEl.append(h("div", { class: "dom-chips" }, chip("", "all"), ...doms.map((d) => chip(d, d))));
  }

  const bad = data().edges.filter((e) => e.tier === "invariant").length;
  const smell = data().edges.filter((e) => e.tier === "smell").length;
  const laundered = data().landings.filter((f) => f.laundered).length;
  const cycles = data().cycles.length;
  const contested = data().files.filter((f) => f.dispute).length;
  const found = bad + smell + laundered + cycles + contested;
  $("issue-count").textContent = `${found}`;
  $("issue-count").classList.toggle("hot", found > 0);
  $("counts").replaceChildren(
    stat(data().files.length, "files"),
    stat(data().edges.length, "edges"),
    stat(bad, "violations", bad ? "sev-bad" : "sev-zero", T.violations),
    stat(laundered, "laundered", laundered ? "sev-laundered" : "sev-zero", T.laundered),
    stat(cycles, "cycles", cycles ? "sev-cycle" : "sev-zero", T.cycles),
    stat(contested, "contested", contested ? "sev-smell" : "sev-zero", T.contested),
    stat(smell, "inadvisable", smell ? "sev-smell" : "sev-zero", T.inadvisable),
    stat(owning.length, "unextracted", owning.length ? "sev-dead" : "sev-zero", T.unextracted),
    stat((data().pressure ?? []).length, "slicing", (data().pressure ?? []).length ? "sev-smell" : "sev-zero", T.pressure),
    stat((data().recommendations ?? []).length, "re-slice", (data().recommendations ?? []).length ? "sev-lean" : "sev-zero", T.recommendations),
    stat(unreached.length, "unreachable", unreached.length ? "sev-dead" : "sev-zero", T.unreachable),
  );

  applyFilter();
}

$("issues-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("issues").classList.toggle("open");
});
// A click anywhere in the drawer stays in the drawer: the board's own body handler clears the pin on an outside click, and reading or filtering the list is not that.
$("issues").addEventListener("click", (e) => e.stopPropagation());
$("bottombar").addEventListener("click", (e) => e.stopPropagation());
// The slash key jumps into the search from anywhere on the board, and Escape closes the drawer the way the corner button does.
addEventListener("keydown", (e) => {
  const drawer = $("issues");
  if (e.key === "Escape" && drawer.classList.contains("open")) {
    drawer.classList.remove("open");
  } else if (e.key === "/" && !/^(input|textarea|select)$/i.test(e.target.tagName)) {
    e.preventDefault();
    drawer.classList.add("open");
    $("issue-search")?.focus();
  }
});
