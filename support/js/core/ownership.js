// Surface-ownership classification: a file's domain and subdomain chain read off its position in the resolved graph rather than its path.
// A domain is its surface, so the chain from a composition root to a file is the sequence of surfaces crossed to reach it; two files share a subdomain when the same surface is the last one over them. The path was only ever a stand-in for that walk, and the path is gameable where the graph is not.
// The layer and the surface-ness ride the file's own name, wherever it sits on disk. The chain rides the edges.
// Shared by the enforcer (index.js) and the informer (visualize.js) so the linter and the diagram infer one structure. Pure: a scanned graph in, a role per file out.

import { isRelative, layerOf, stripExt, targetOf } from './model.js';

// The first domain/subdomain segment a relative specifier steps into.
const relName = (spec) => String(spec).split('/').filter((s) => s && s !== '.' && s !== '..')[0] ?? '';
const commonPrefix = (a, b) => {
  const out = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === b[i]) out.push(a[i]); else break; }
  return out;
};

// Layer, unit name, and surface-ness come from the file's own name, so they hold wherever the file lives.
// A name that resolves to a layer is a layer file; a plain name is a surface (a barrel or a named surface).
function nameRole(path) {
  const base = String(path).split('/').pop();
  const hit = layerOf(stripExt(base));
  if (hit) return { layer: hit.layer, name: hit.name, via: hit.name === '' ? 'leaf' : 'suffix', surface: null, sub: [] };
  return { layer: null, name: null, via: null, surface: stripExt(base) || 'index', sub: [] };
}
const isSurface = (path) => nameRole(path).surface != null;

// The domain/subdomain chain for every file, walking surfaces outward from the composition roots.
// A cross into a surface names a domain or subdomain: an aliased specifier names it absolutely, a relative one names it relative to the crossing file. A reference to a layer file stays in the current domain.
// A file reached from two disjoint domains has its chain collapse to their common prefix; an empty prefix means it sits below both, which is core (sharedness).
function inferChains(graph) {
  const { files, edges, options } = graph;
  const out = new Map();
  for (const e of edges) {
    if (e.to == null) continue;
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  const chainOf = new Map();
  const roots = new Set(files.filter((f) => f.role.kind === 'composition-root').map((f) => f.id));
  const queue = [...roots].map((id) => [id, []]);
  for (const id of roots) chainOf.set(id, []);
  for (let i = 0; i < queue.length && i < 100000; i++) {
    const [id, chain] = queue[i];
    for (const e of out.get(id) ?? []) {
      let child;
      if (!isRelative(e.spec)) {
        const t = targetOf('', e.spec, options.domainAlias, options.appAlias);
        child = t ? t.chain : chain;
      } else if (isSurface(files[e.to].path)) {
        child = [...chain, relName(e.spec)];
      } else {
        child = chain;
      }
      const prev = chainOf.get(e.to);
      if (prev === undefined) { chainOf.set(e.to, child); queue.push([e.to, child]); }
      else { const cp = commonPrefix(prev, child); if (cp.length < prev.length) { chainOf.set(e.to, cp); queue.push([e.to, cp]); } }
    }
  }
  return { chainOf, roots };
}

// A role per file: kind and chain inferred from the graph, layer and surface from the name.
// A file no surface owns is a lone domain (kind 'other' here); we can only lint the structure we can see, and a file the graph cannot place has none yet.
export function graphRoles(graph) {
  const { chainOf, roots } = inferChains(graph);
  const roles = new Map();
  for (const f of graph.files) {
    if (roots.has(f.id)) { roles.set(f.id, { kind: 'composition-root', chain: [], layer: null, surface: null, sub: [] }); continue; }
    const chain = chainOf.get(f.id);
    if (chain === undefined) { roles.set(f.id, { kind: 'other', chain: [], ...nameRole(f.path) }); continue; }
    if (chain.length === 0) { roles.set(f.id, { kind: 'core', chain: [], layer: null, surface: null, sub: [] }); continue; }
    const nr = nameRole(f.path);
    roles.set(f.id, { kind: nr.surface ? 'surface' : 'domain', chain, ...nr });
  }
  return roles;
}
