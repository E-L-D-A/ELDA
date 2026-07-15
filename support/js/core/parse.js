// The filesystem and oxc read boundary for the binding-flow analysis, shared by the lint rules (index.js) and the visualizer (visualize.js): it reads directories and modules off disk and parses each module into its binding table, so the walk (flow.js) traverses tables and resolved paths without holding the parser itself.
// A module's binding table says which export names it owns, which pass through to another module, and which modules `export *` forwards to.
// Tables and directory listings are cached by mtime, so a lint pass or a rescan parses each conduit at most once and an editor session stays correct across edits.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parseSync } from 'oxc-parser';
import { norm } from './model.js';

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
