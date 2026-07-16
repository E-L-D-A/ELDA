// ---------------------------------------------------------------------------
// The reach walk behind a focus: what a file pulls in and what breaks when it changes, each direction carrying its hop distance.
// Pure over the board's adjacency; the class application that paints the result lives in focus.services.js.

import { adjIn, adjOut } from "./board.js";
import { toggle } from "./state.js";

// One hop answers "who does it touch"; the reach toggle walks the closure, which is the question a reader asks of a tree they did not write.
export function neighbourhood(id) {
  const deep = toggle("t-reach");
  const walk = (adj) => {
    const dist = new Map();
    let frontier = [id];
    for (let hop = 1; frontier.length; hop++) {
      const next = [];
      for (const v of frontier)
        for (const w of adj.get(v) ?? []) {
          if (w === id || dist.has(w)) continue;
          dist.set(w, hop);
          next.push(w);
        }
      if (!deep) break;
      frontier = next;
    }
    return dist;
  };
  return { out: walk(adjOut()), inc: walk(adjIn()), deep };
}
