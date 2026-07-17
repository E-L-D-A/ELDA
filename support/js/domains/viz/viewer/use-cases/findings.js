// ---------------------------------------------------------------------------
// The findings projected onto files: the worst severity that names each file.
// The board reads it to badge a chip and the drawer reads the same map to colour the dot, so a file wears one severity in both places.

import { place } from "./placement.js";
import { data } from "./state.js";

// The severity ramp, worst first. A file wears the worst finding that names it.
// 'dead' is the review-signal tier (unreachable, unextracted, unclassified): real to list, never a breach, so it sorts below every scored severity.
export const SEV_RANK = { violation: 6, cycle: 5, laundered: 4, smell: 3, lean: 2, dead: 1 };

// One pass over the graph's findings, keeping the worst severity seen for every file each one names.
export function worstByFile() {
  const worst = new Map();
  const mark = (id, sev) => {
    if (id == null) return;
    const cur = worst.get(id);
    if (!cur || SEV_RANK[sev] > SEV_RANK[cur]) worst.set(id, sev);
  };
  for (const e of data().edges) {
    if (e.to == null) mark(e.from, "violation");
    else if (e.tier === "invariant") mark(e.from, "violation");
    else if (e.tier === "smell") mark(e.from, "smell");
  }
  for (const f of data().flows)
    if (f.laundered) {
      mark(f.from, "laundered");
      mark(f.to, "laundered");
    }
  for (const c of data().cycles) for (const id of c.files) mark(id, "cycle");
  for (const g of data().pressure ?? []) for (const e of g.edges) mark(e.from, "smell");
  for (const g of data().recommendations ?? []) for (const e of g.edges) mark(e.from, "lean");
  for (const f of data().files) {
    if (f.dispute) mark(f.id, "smell");
    if (f.owns?.length) mark(f.id, "dead");
    if (f.reachable === false) mark(f.id, "dead");
    if (place(f).area === "other") mark(f.id, "dead");
  }
  return worst;
}
