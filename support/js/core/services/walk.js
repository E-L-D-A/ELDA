// The binding-flow walk, shared by the lint rules (index.js) and the visualizer (visualize.js) so the enforcer and the informer walk one graph.
// A walk follows an import name by name to where it lands, reading each conduit's binding table from parse.js, so a barrel import fans out only to the bindings the consumer really takes.
// Only surfaces are transparent to the walk: they hold no rank and curate for outsiders, so what a consumer takes through them is judged where it lands.
// A rank-bearing file is a terminus - a named re-export there re-owns the binding at that file's rank (the seam is the declaration, and a body arrives when logic forms), and the re-owning file's own edges are judged per-file at its own rank.
// The parse and read primitives live in parse.js; this file resolves specifiers against the filesystem and traverses the tables they yield.

import { existsSync, statSync } from 'node:fs';

import { fileRole, isRelative, norm } from '../axioms/model.js';
import { EXT_CANDIDATES, moduleInfo } from '../harnesses/parse.js';

const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));

const normalizePath = (p) => {
  const out = [];
  for (const s of norm(p).split('/')) {
    if (s === '' && out.length === 0) { out.push(''); continue; }
    if (s === '.' || s === '') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return out.join('/');
};

// A walker bound to one app: resolves specifiers against the filesystem the way the bundler would, and follows value names to their landings.
// Every alias in the app's map resolves (the graph needs every edge), while attribution stays the ownership alias's alone - resolution and attribution are separate concerns.
export function createWalker({ appRoot, aliases = {}, ownershipDir, core }) {
  const root = norm(appRoot);
  const tryFile = (f) => (existsSync(f) && statSync(f).isFile() ? f : null);
  // Longest alias first, so an alias that prefixes another never shadows it.
  const aliasEntries = Object.entries(aliases).sort((a, b) => b[0].length - a[0].length);

  // A surface is a plain-named file inside the ownership tree or a declared core (a barrel, a named surface): rank-less curation, the walk's only conduit.
  // Owned bindings terminate on it regardless, so transparency only lets its re-exports carry the walk onward.
  const isSurface = (absPath) => {
    const r = fileRole(norm(absPath), { ownershipDir, core });
    return (r.kind === 'surface' || r.kind === 'core') && !r.layer && !!r.surface;
  };

  const resolveSpec = (fromAbs, spec) => {
    const bare = String(spec).split('?')[0];
    let p = null;
    for (const [alias, dir] of aliasEntries) {
      if (bare.startsWith(alias + '/')) { p = root + '/' + dir + '/' + bare.slice(alias.length + 1); break; }
    }
    if (p == null && isRelative(bare)) p = dirOf(norm(fromAbs)) + '/' + bare;
    if (p == null) return null;
    p = normalizePath(p);
    const exact = tryFile(p);
    if (exact) return exact;
    for (const ext of EXT_CANDIDATES) { const hit = tryFile(p + ext); if (hit) return hit; }
    // TypeScript's ESM convention writes the emitted extension while the source carries the authoring one, so `./x.js` is how a `.ts` module is imported under NodeNext.
    // Left unresolved it would report as an undecidable reach, and the rules that only judge a resolved target would fall silent on it.
    const swapped = p.replace(/\.([cm]?)js$/, '.$1ts');
    if (swapped !== p) {
      for (const ext of ['', 'x']) { const hit = tryFile(swapped + ext); if (hit) return hit; }
    }
    for (const ext of EXT_CANDIDATES) { const hit = tryFile(p + '/index' + ext); if (hit) return hit; }
    return null;
  };

  // Where the requested value names land, walking pass-throughs and `export *` candidates; null when the specifier does not resolve to a file at all.
  // Each landing carries the names that landed, the conduit chain (via), and the (module, specifier) hops for looking up the authored edges along the way.
  const landings = (fromAbs, spec, names) => {
    const start = resolveSpec(fromAbs, spec);
    if (start == null) return null;
    const source = norm(fromAbs);
    const out = [];
    const seen = new Set();
    const nkey = (n) => (n === '*' ? '*' : [...n].sort().join(','));
    const stack = [[start, names === '*' ? '*' : new Set(names), [], []]];
    while (stack.length) {
      const [p, want, via, hops] = stack.pop();
      if (via.length > 32) continue;
      const key = `${p}|${nkey(want)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A rank-bearing file (or anything unparseable) is a terminus: everything requested lands here, re-owned; whether the names truly exist there is the type checker's concern.
      if (!isSurface(p)) { out.push({ path: p, names: want === '*' ? '*' : [...want], via, hops }); continue; }
      const info = moduleInfo(p);
      if (!info) { out.push({ path: p, names: want === '*' ? '*' : [...want], via, hops }); continue; }
      const { table } = info;
      const go = (spec2, wanted) => {
        const next = resolveSpec(p, spec2);
        if (next == null || next === source) return;
        stack.push([next, wanted, [...via, p], [...hops, { from: p, spec: spec2 }]]);
      };
      const continueBySpec = (bySpec) => { for (const [s2, w] of bySpec) go(s2, w); };
      if (want === '*') {
        if (table.owned.size) out.push({ path: p, names: '*', via, hops });
        const bySpec = new Map();
        for (const pt of table.pass.values()) {
          if (pt.imported === '*') go(pt.spec, '*');
          else (bySpec.get(pt.spec) ?? bySpec.set(pt.spec, new Set()).get(pt.spec)).add(pt.imported);
        }
        continueBySpec(bySpec);
        for (const s2 of table.allFrom) go(s2, '*');
        continue;
      }
      const landed = [...want].filter((n) => table.owned.has(n));
      if (landed.length) out.push({ path: p, names: landed, via, hops });
      const bySpec = new Map();
      const unmatched = [];
      for (const n of want) {
        if (table.owned.has(n)) continue;
        const pt = table.pass.get(n);
        if (pt) {
          if (pt.imported === '*') go(pt.spec, '*');
          else (bySpec.get(pt.spec) ?? bySpec.set(pt.spec, new Set()).get(pt.spec)).add(pt.imported);
        } else unmatched.push(n);
      }
      continueBySpec(bySpec);
      // A name matched by no explicit entry may come through an `export *`; every star source is a candidate, and a wrong candidate lands nowhere.
      if (unmatched.length) for (const s2 of table.allFrom) go(s2, new Set(unmatched));
    }
    return out;
  };

  return { resolveSpec, landings };
}
