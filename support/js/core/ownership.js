// Surface-ownership classification: a file's domain and subdomain chain read off its position in the resolved graph rather than its path.
// A domain is its surface, so the chain from a composition root to a file is the sequence of surfaces crossed to reach it; two files share a subdomain when the same surface is the last one over them. The path was only ever a stand-in for that walk, and the path is gameable where the graph is not.
// The layer and the surface-ness ride the file's own name, wherever it sits on disk. The chain rides the edges.
// Shared by the enforcer (index.js) and the informer (visualize.js) so the linter and the diagram infer one structure. Pure: a scanned graph in, a role per file out.

import { isRelative, layerOf, stripExt, targetOf } from './model.js';

// A file reached from domains that share no ancestor sits below all of them: pure core, the dependency-order's bottom (CHANNEL.6 sharedness).
// The sentinel is sticky - one more reach from one more domain never lifts a core file back into that domain - where an empty chain array could not be, since an empty array is a prefix of everything.
const CORE = Symbol('core');

const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const isPrefix = (a, b) => a.length <= b.length && a.every((s, i) => s === b[i]);
const commonPrefix = (a, b) => {
  const out = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === b[i]) out.push(a[i]); else break; }
  return out;
};

// Two ownership readings of one file, reconciled:
// nested readings (one a prefix of the other) keep the deeper - a surface crossing states ownership, and a shallower reach into the same line does not dilute it;
// divergent readings collapse to what they share - a file two domains reach is more shared than either (CHANNEL.6), and sharing nothing is core.
const merge = (a, b) => {
  if (a === CORE || b === CORE) return CORE;
  if (isPrefix(a, b)) return b;
  if (isPrefix(b, a)) return a;
  const cp = commonPrefix(a, b);
  return cp.length ? cp : CORE;
};
const same = (a, b) => (a === CORE ? b === CORE : b !== CORE && a.length === b.length && isPrefix(a, b));

// Layer, unit name, and surface-ness come from the file's own name, so they hold wherever the file lives.
// A name that resolves to a layer is a layer file; a plain name is a surface (a barrel or a named surface).
function nameRole(path) {
  const base = String(path).split('/').pop();
  const hit = layerOf(stripExt(base));
  if (hit) return { layer: hit.layer, name: hit.name, via: hit.name === '' ? 'leaf' : 'suffix', surface: null, sub: [] };
  return { layer: null, name: null, via: null, surface: stripExt(base) || 'index', sub: [] };
}

// What a relative reference may cross into: a barrel or named surface, or the bare `services` file, which doubles as the runtime-composition surface - a parent composing `./host/services` is entering host, and that crossing is what names the subdomain.
const isEntry = (path) => {
  const r = nameRole(path);
  return r.surface != null || (r.layer === 'services' && r.name === '');
};

// The chain a relative reference hands its target: the importer's chain walked along the directory delta.
// A step up leaves the current subdomain, so it pops; a step down names a child only when the reference enters through a surface, since a directory by itself carries no boundary and a reach past the surface stays classified by its other, owning reaches (the deeper side of the merge).
// The child's name is the surface's own directory - one segment - because the directories travelled on the way are grouping, and the one the surface sits in is the one it names.
function relativeChain(importerChain, importerDir, targetPath) {
  if (importerChain === CORE) return CORE;
  const from = importerDir ? importerDir.split('/') : [];
  const to = dirOf(targetPath) ? dirOf(targetPath).split('/') : [];
  const shared = commonPrefix(from, to).length;
  const ups = from.length - shared;
  const downs = to.slice(shared);
  let chain = importerChain.slice(0, Math.max(0, importerChain.length - ups));
  if (downs.length && isEntry(targetPath)) chain = [...chain, downs[downs.length - 1]];
  return chain;
}

// The domain/subdomain chain for every file, walked outward from the composition roots.
// An aliased specifier names its chain absolutely; a relative one walks from the crossing file; a specifier carrying no chain information (a bare package alias, a non-domain app path) hands on the importer's own chain.
function inferChains(graph) {
  const { files, edges, options } = graph;
  const out = new Map();
  for (const e of edges) {
    if (e.to == null) continue;
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  const chainOf = new Map();
  // Which root's reach carried the file: a file whose chain stays empty is that root's own glue, and the key says whose bar it draws in; glue two roots reach at once is shared glue.
  const rootKeyOf = new Map();
  const roots = new Set(files.filter((f) => f.role.kind === 'composition-root').map((f) => f.id));
  const queue = [...roots];
  for (const id of roots) {
    chainOf.set(id, []);
    rootKeyOf.set(id, files[id].role.root ?? '(glue)');
  }
  let guard = 0;
  while (queue.length && guard++ < 200000) {
    const id = queue.shift();
    const chain = chainOf.get(id);
    const rootKey = rootKeyOf.get(id);
    for (const e of out.get(id) ?? []) {
      let child;
      if (isRelative(e.spec)) {
        child = relativeChain(chain, dirOf(files[id].path), files[e.to].path);
      } else {
        const t = targetOf('', e.spec, options.domainAlias, options.appAlias);
        child = t ? t.chain : chain;
      }
      const prev = chainOf.get(e.to);
      const next = prev === undefined ? child : merge(prev, child);
      const prevKey = rootKeyOf.get(e.to);
      const nextKey = prevKey === undefined || prevKey === rootKey ? rootKey : '(shared)';
      if (prev === undefined || !same(prev, next) || prevKey !== nextKey) {
        chainOf.set(e.to, next);
        rootKeyOf.set(e.to, nextKey);
        if (!roots.has(e.to)) queue.push(e.to);
      }
    }
  }
  return { chainOf, rootKeyOf, roots };
}

// A role per file: kind and chain inferred from the graph, layer and surface from the name.
// A declared root keeps the role the scan gave it, which carries the root area's own key; a file whose chain stays empty was reached from roots without crossing any surface, and that is the root's own glue (ROOT.2), drawn under its own key.
// A pure-data file is vocabulary (SURFACE.6): it classifies as its chain's entities and never as a surface, since a surface target passes every boundary rule and an asset must not ride that pass.
// A file no reference reaches is a lone domain (kind 'other'); we can only lint the structure we can see, and a file the graph cannot place has none yet.
export function graphRoles(graph) {
  const { chainOf, rootKeyOf, roots } = inferChains(graph);
  const roles = new Map();
  for (const f of graph.files) {
    if (roots.has(f.id)) { roles.set(f.id, f.role); continue; }
    const chain = chainOf.get(f.id);
    if (chain === undefined) { roles.set(f.id, { kind: 'other', chain: [], ...nameRole(f.path) }); continue; }
    if (chain === CORE) { roles.set(f.id, { kind: 'core', chain: [], layer: null, surface: null, sub: [] }); continue; }
    if (chain.length === 0) { roles.set(f.id, { kind: 'composition-root', chain: [], layer: null, surface: null, sub: [], root: rootKeyOf.get(f.id) ?? '(glue)' }); continue; }
    if (f.kind === 'asset') {
      roles.set(f.id, { kind: 'domain', chain, layer: 'entities', via: 'asset', surface: null, name: String(f.path).split('/').pop(), sub: [], asset: true });
      continue;
    }
    const nr = nameRole(f.path);
    roles.set(f.id, { kind: nr.surface ? 'surface' : 'domain', chain, ...nr });
  }
  return roles;
}
