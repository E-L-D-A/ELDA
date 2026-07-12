// Filesystem-backed binding-flow analysis, shared by the lint rule (index.js) and the visualizer (visualize.js) so the enforcer and the informer walk one and the same graph.
// A module's binding table says which export names it owns, which pass through to another module, and which modules `export *` forwards to; a walk follows an import name by name to the files that own it, so a barrel import fans out only to the bindings the consumer really takes.
// Tables are cached by mtime, so a lint pass or a rescan parses each conduit at most once and an editor session stays correct across edits.

import { readFileSync, statSync, existsSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import { norm } from './model.js';

export const CODE_RE = /\.(m|c)?[tj]sx?$/;
export const EXT_CANDIDATES = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs', '.d.ts'];

// Every reference a module makes - static imports (side-effect ones have no entries), re-exports carrying a module request, literal dynamic imports - with the value-binding names each one requests ('*' is the whole module: a namespace object, a dynamic import), plus the module's own binding table.
// oxc resolves `import {a}; export {a as b}` back to its module request, so a pass-through entry is any export carrying one; a re-exported namespace binding passes '*'.
export function analyzeModule(path, code) {
  const parsed = parseSync(path, code);
  const refs = [];
  const table = { owned: new Set(), pass: new Map(), allFrom: [] };
  const nsOf = new Map();
  for (const si of parsed.module.staticImports) {
    const spec = si.moduleRequest.value;
    const names = [];
    for (const e of si.entries) {
      if (e.isType) continue;
      if (e.importName.kind === 'NamespaceObject') { names.push('*'); nsOf.set(e.localName.value, spec); }
      else names.push(e.importName.kind === 'Default' ? 'default' : e.importName.name);
    }
    refs.push({
      spec,
      kind: si.entries.length === 0 ? 'side-effect' : 'import',
      typeOnly: si.entries.length > 0 && si.entries.every((e) => e.isType),
      names: names.includes('*') ? '*' : names,
    });
  }
  for (const se of parsed.module.staticExports) {
    const names = [];
    let spec = null;
    for (const e of se.entries) {
      if (e.moduleRequest) {
        spec = e.moduleRequest.value;
        if (e.importName.kind === 'AllButDefault') {
          table.allFrom.push(spec);
          if (!e.isType) names.push('*');
        } else {
          const imported = e.importName.kind === 'Default' ? 'default' : e.importName.name;
          if (e.exportName.kind === 'Name') table.pass.set(e.exportName.name, { spec, imported });
          if (!e.isType) names.push(imported);
        }
      } else if (e.exportName.kind === 'Name') {
        const ns = e.localName.kind === 'Name' && nsOf.get(e.localName.name);
        if (ns) table.pass.set(e.exportName.name, { spec: ns, imported: '*' });
        else table.owned.add(e.exportName.name);
      } else if (e.exportName.kind === 'Default') {
        table.owned.add('default');
      }
    }
    if (spec) refs.push({ spec, kind: 'reexport', typeOnly: names.length === 0, names: names.includes('*') ? '*' : names });
  }
  for (const di of parsed.module.dynamicImports) {
    const text = code.slice(di.moduleRequest.start, di.moduleRequest.end);
    const m = text.match(/^(['"`])((?:(?!\1)[^\\$])*)\1$/);
    if (m) refs.push({ spec: m[2], kind: 'dynamic', typeOnly: false, names: '*' });
  }
  return { refs, table };
}

// Parsed module info, cached by mtime. Returns null for a file that is not parseable code (a stylesheet, an asset): such a file owns whatever reaches it.
const cache = new Map();
export function moduleInfo(absPath) {
  const p = norm(absPath);
  let st;
  try { st = statSync(p); } catch { return null; }
  const hit = cache.get(p);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.info;
  let info = null;
  if (CODE_RE.test(p)) {
    try { info = analyzeModule(p, readFileSync(p, 'utf8')); } catch { info = null; }
  }
  cache.set(p, { mtimeMs: st.mtimeMs, info });
  return info;
}

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
export function createWalker({ srcDir, domainAlias, appAlias }) {
  const root = norm(srcDir);
  const tryFile = (f) => (existsSync(f) && statSync(f).isFile() ? f : null);

  const resolveSpec = (fromAbs, spec) => {
    const bare = String(spec).split('?')[0];
    let p = null;
    if (bare.startsWith(domainAlias + '/')) p = root + '/domains/' + bare.slice(domainAlias.length + 1);
    else if (bare.startsWith(appAlias + '/')) p = root + '/' + bare.slice(appAlias.length + 1);
    else if (bare.startsWith('./') || bare.startsWith('../')) p = dirOf(norm(fromAbs)) + '/' + bare;
    if (p == null) return null;
    p = normalizePath(p);
    const exact = tryFile(p);
    if (exact) return exact;
    for (const ext of EXT_CANDIDATES) { const hit = tryFile(p + ext); if (hit) return hit; }
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
