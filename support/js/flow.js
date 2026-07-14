// Filesystem-backed binding-flow analysis, shared by the lint rules (index.js) and the visualizer (visualize.js) so the enforcer and the informer walk one and the same graph.
// A module's binding table says which export names it owns, which pass through to another module, and which modules `export *` forwards to; a walk follows an import name by name to where it lands, so a barrel import fans out only to the bindings the consumer really takes.
// Only surfaces are transparent to the walk: they hold no rank and curate for outsiders, so what a consumer takes through them is judged where it lands.
// A rank-bearing file is a terminus - a named re-export there re-owns the binding at that file's rank (the seam is the declaration, and a body arrives when logic forms), and the re-owning file's own edges are judged per-file at its own rank.
// Tables are cached by mtime, so a lint pass or a rescan parses each conduit at most once and an editor session stays correct across edits.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import { norm, classify, isRelative } from './model.js';

// A directory's entries, cached by mtime: the unit-directory guard has to know what else lives beside a file, and a lint pass asks that of the same directory once per file in it.
const dirCache = new Map();
export function dirEntries(absDir) {
  const p = norm(absDir);
  let st;
  try { st = statSync(p); } catch { return null; }
  const hit = dirCache.get(p);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.entries;
  let entries = null;
  try {
    entries = readdirSync(p, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }));
  } catch { entries = null; }
  dirCache.set(p, { mtimeMs: st.mtimeMs, entries });
  return entries;
}

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

// A surface is a plain-named file inside domains/ (a barrel, a named surface): rank-less curation, the walk's only conduit.
const isSurface = (absPath) => {
  const m = norm(absPath).match(/\/domains\/(.+)$/);
  if (!m) return false;
  const c = classify(m[1].split('/').filter(Boolean));
  return !c.layer && !!c.surface && c.chain.length > 0;
};

const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));

// The src directory of the app a file belongs to: the one holding `domains/`, which is what an alias like `#/x` resolves against.
// A file inside the tree names it outright. A file outside it - a route tree, a server shell, a build config at the app root - is found by walking up and testing each level for `domains/` and for a `src/domains/` child, so a root that sits beside src rather than under it still resolves.
// Cached per starting directory; a null result is cached too, so a file in a tree with no domains costs one walk.
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const srcDirs = new Map();
export function srcDirOf(filename) {
  const f = norm(filename);
  const inside = f.match(/^(.*)\/domains\//);
  if (inside) return inside[1];
  const start = dirOf(f);
  if (srcDirs.has(start)) return srcDirs.get(start);
  let found = null;
  let dir = start;
  while (dir && dir.includes('/')) {
    if (isDir(dir + '/domains')) { found = dir; break; }
    if (isDir(dir + '/src/domains')) { found = dir + '/src'; break; }
    dir = dirOf(dir);
  }
  srcDirs.set(start, found);
  return found;
}

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
    else if (isRelative(bare)) p = dirOf(norm(fromAbs)) + '/' + bare;
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
