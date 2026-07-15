// ---------------------------------------------------------------------------
// Issues drawer: every verdict edge, the laundered flow findings, unresolved specifiers, and files the classifier could not place.

import { getEditorLink } from "./lib.js";
import { applyPin } from "./focus.js";
import { place } from "./placement.js";
import { chips, h, render } from "./render.js";
import {
  $,
  collapsed,
  cycleId,
  data,
  markSelection,
  savePrefs,
  selectedKey,
  setPin,
  setPinCycle,
  setSelected,
} from "./state.js";

// A header stat: the count and its label; the severity stats add a dot that takes the severity color while the count is nonzero.
const stat = (n, label, sev) =>
  h(
    "span",
    { class: "stat" + (sev ? " " + sev : "") },
    sev ? h("i", { class: "dot" }) : null,
    h("b", {}, `${n}`),
    ` ${label}`,
  );

export function renderIssues() {
  const el = $("issues");
  el.replaceChildren(
    h(
      "div",
      { class: "drawer-head" },
      h("span", { class: "drawer-title" }, "Issues"),
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
  );
  const issuesBody = h("div", { class: "drawer-body" });
  el.append(issuesBody);
  // Each finding carries a key drawn from its content, so the one being read stays lit across a rebuild rather than riding a position in a list that shifts under it.
  const section = (title, items, build, keyOf = (_, i) => String(i)) => {
    if (!items.length) return;
    issuesBody.append(
      h("h3", {}, `${title} (${items.length})`),
      ...items.map((item, i) => {
        const el = build(item);
        el.dataset.key = `${title}#${keyOf(item, i)}`;
        if (el.dataset.key === selectedKey) el.classList.add("selected");
        return el;
      }),
    );
  };
  // A finding inside a folded domain has no chip of its own to raise, so the domains it names open first.
  // Returns whether the board was rebuilt, since a rebuild applies the pin itself.
  const reveal = (ids) => {
    const shut = [
      ...new Set(
        ids
          .map((id) => place(data.files[id]))
          .filter((p) => p.collapsed)
          .map((p) => p.domain),
      ),
    ];
    if (!shut.length) return false;
    for (const d of shut) collapsed.delete(d);
    savePrefs();
    render();
    return true;
  };
  const scrollTo = (id) =>
    requestAnimationFrame(() =>
      chips.get(id)?.scrollIntoView({
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
    setPin(data.files[id].path);
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
      h("div", {}, pathLink(data.files[e.from].path), " → ", h("b", {}, e.spec)),
      h("div", { class: "msg" }, e.verdict),
    );
  // A reference is named by where it starts, how it is written, what it asks for, and the bindings it takes, which is what survives a rescan.
  // The bindings are load-bearing: one file can import the same module twice, and those two references are one finding each.
  const edgeItemKey = (e) =>
    `${data.files[e.from].path}:${e.kind}:${e.spec}:${(e.names ?? []).join(",")}`;
  section(
    "Violations",
    data.edges.filter((e) => e.tier === "invariant"),
    verdictItem,
    edgeItemKey,
  );
  section(
    "Inadvisable (graded smells)",
    data.edges.filter((e) => e.tier === "smell"),
    verdictItem,
    edgeItemKey,
  );
  // Findings the per-file rules cannot see: every hop is clean, the landed flow is not.
  section(
    "Laundered through indirection (graph-only)",
    data.flows.filter((f) => f.laundered),
    (f) =>
      h(
        "div",
        {
          class: "item laundered",
          onclick: pinFrom(f),
        },
        h("div", {}, pathLink(data.files[f.from].path), " ⇒ ", pathLink(data.files[f.to].path)),
        h(
          "div",
          { class: "msg" },
          `via ${f.via.map((id) => data.files[id].path).join("\n   via ")}\n${f.verdict}`,
        ),
      ),
    (f) => `${data.files[f.from].path}=>${data.files[f.to].path}`,
  );
  // A cycle of legal references is invisible to every per-file rule, because no file in it is at fault (CHANNEL.5): every file in a cycle reaches every other, so the cycle is what a reviewer adjudicates, naming the settling element that encloses it or breaking the cycle.
  section(
    "Reference cycles (graph-only)",
    data.cycles,
    (c) =>
      h(
        "div",
        { class: "item cycle", onclick: pinCycle(c) },
        h(
          "div",
          { class: "files" },
          ...c.files.flatMap((id, i) => [i ? " ⇄ " : "", pathLink(data.files[id].path)]),
        ),
        h("div", { class: "msg" }, c.verdict),
      ),
    cycleId,
  );
  section(
    "Unresolved specifiers",
    data.edges.filter((e) => e.to == null),
    (e) =>
      h(
        "div",
        { class: "unresolved item", onclick: pinFrom(e) },
        pathLink(data.files[e.from].path),
        " → ",
        h("b", {}, e.spec),
      ),
    edgeItemKey,
  );
  // A file no composition root can reach ships to nobody. SURFACE.4 reads that as a review signal - a domain may expose more than its consumers currently require - so it is listed, never scored as a breach.
  const unreached = data.files.filter((f) => f.reachable === false);
  section(
    "Unreachable from any root",
    unreached,
    (f) => h("div", { class: "unreachable item", onclick: pinId(f.id) }, pathLink(f.path)),
    (f) => f.path,
  );
  section(
    "Unclassified files",
    data.files.filter((f) => place(f).area === "other"),
    (f) => h("div", { class: "item", onclick: pinId(f.id) }, pathLink(f.path)),
    (f) => f.path,
  );
  if (issuesBody.childElementCount === 1)
    issuesBody.append(h("div", { class: "drawer-empty" }, "No findings"));
  const bad = data.edges.filter((e) => e.tier === "invariant").length;
  const smell = data.edges.filter((e) => e.tier === "smell").length;
  const laundered = data.flows.filter((f) => f.laundered).length;
  const cycles = data.cycles.length;
  const found = bad + smell + laundered + cycles;
  $("issue-count").textContent = `${found}`;
  $("issue-count").classList.toggle("hot", found > 0);
  $("counts").replaceChildren(
    stat(data.files.length, "files"),
    stat(data.edges.length, "edges"),
    stat(bad, "violations", bad ? "sev-bad" : "sev-zero"),
    stat(laundered, "laundered", laundered ? "sev-laundered" : "sev-zero"),
    stat(cycles, "cycles", cycles ? "sev-cycle" : "sev-zero"),
    stat(smell, "inadvisable", smell ? "sev-smell" : "sev-zero"),
    stat(unreached.length, "unreachable", unreached.length ? "sev-dead" : "sev-zero"),
  );
}

$("issues-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("issues").classList.toggle("open");
});
$("bottombar").addEventListener("click", (e) => e.stopPropagation());
