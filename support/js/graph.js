// The whole-graph cycle pass: CHANNEL.5's Gate 1, decided over the resolved value graph.
// A per-file rule reads one file and its specifiers, so a cycle whose every edge is legal on its own is invisible to it: no file in the cycle is at fault, and the cycle is a property of the graph.
// Every cross-domain reference cycle must enclose a settling element - a delayed or change-gated channel that breaks synchronous re-entry - and whether a given channel settles is a value-level property no static pass decides.
// So this pass finds every cycle and grades it by the widest boundary it crosses; the settling element is the reviewer's to name, and an ungraded cycle is a causality loop waiting for its first stack overflow.
// Pure: classified nodes and edges in, cycles out. The scan supplies the graph and the roles, and nothing here reads a filesystem or a lint host.

// The distance classes, widest first, mirroring the diagonal's gradient (model.js): severity grows with the width of the boundary the cycle crosses, and Gate 1 names the widest class.
export const CYCLE_SCOPES = ['across-domains', 'across-subdomains', 'within-subdomain'];

// A node's domain and its full subdomain chain, for measuring how wide a cycle reaches.
// A file outside domains/ (a composition root, pure core) carries no chain, and its role kind names it: a cycle that reaches one has already crossed the widest boundary there is.
const domainOf = (n) => (n.role.chain?.length ? n.role.chain[0] : `(${n.role.kind})`);
const chainOf = (n) => (n.role.chain?.length ? n.role.chain.join('/') : `(${n.role.kind})`);

// Tarjan's strongly connected components, iterated rather than recursed, so a deep graph cannot overflow the call stack.
// Each frame carries its node and a cursor into that node's neighbours, which is what the recursive form keeps on the call stack.
function stronglyConnected(count, adj) {
  const index = new Int32Array(count).fill(-1);
  const low = new Int32Array(count);
  const onStack = new Uint8Array(count);
  const path = [];
  const out = [];
  let counter = 0;

  for (let root = 0; root < count; root++) {
    if (index[root] >= 0) continue;
    const work = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame[0];
      if (frame[1] === 0) {
        index[v] = low[v] = counter++;
        path.push(v);
        onStack[v] = 1;
      }
      const neighbours = adj[v] ?? [];
      let descended = false;
      while (frame[1] < neighbours.length) {
        const w = neighbours[frame[1]++];
        if (index[w] < 0) {
          work.push([w, 0]);
          descended = true;
          break;
        }
        if (onStack[w]) low[v] = Math.min(low[v], index[w]);
      }
      if (descended) continue;
      if (low[v] === index[v]) {
        const component = [];
        for (;;) {
          const w = path.pop();
          onStack[w] = 0;
          component.push(w);
          if (w === v) break;
        }
        out.push(component);
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low[parent] = Math.min(low[parent], low[v]);
      }
    }
  }
  return out;
}

// Every reference cycle in the graph, widest boundary first.
// Each one carries the files it encloses, the edges that close it, the width class, and the verdict; the across-domains class is Gate 1's own subject, and the narrower classes report as review signals at the same seam.
// A file that references itself closes a cycle of its own, by construction.
export function cycles(nodes, edges) {
  const adj = [];
  for (const e of edges) (adj[e.from] ??= []).push(e.to);

  const found = [];
  for (const component of stronglyConnected(nodes.length, adj)) {
    const members = new Set(component);
    const closing = edges.filter((e) => members.has(e.from) && members.has(e.to));
    if (component.length === 1 && !closing.some((e) => e.from === e.to)) continue;

    const files = component.map((id) => nodes[id]);
    const domains = new Set(files.map(domainOf));
    const chains = new Set(files.map(chainOf));
    const scope = domains.size > 1 ? 'across-domains' : chains.size > 1 ? 'across-subdomains' : 'within-subdomain';

    const where = domains.size > 1
      ? `across the domains ${[...domains].map((d) => `'${d}'`).join(' and ')}`
      : chains.size > 1
        ? `across the subdomains ${[...chains].map((c) => `'${c}'`).join(' and ')}`
        : `inside '${[...chains][0]}'`;
    const what = component.length === 1
      ? `the file '${files[0].path}' references itself`
      : `${component.length} files close a reference cycle ${where}`;

    found.push({
      scope,
      gate: scope === 'across-domains',
      files: component,
      edges: closing.map((e) => ({ from: e.from, to: e.to })),
      verdict: `ELDA CHANNEL.5 (Gate 1): ${what}, and every reference in it carries a value synchronously. Enclose a settling element - a change-gated channel with a tight equality, which breaks the synchronous re-entry - or break the cycle by lifting the shared content into a subdomain both sides consume.`,
    });
  }

  return found.sort(
    (a, b) => CYCLE_SCOPES.indexOf(a.scope) - CYCLE_SCOPES.indexOf(b.scope) || b.files.length - a.files.length,
  );
}
