// The filesystem read boundary for an app's file tree: it reads the app's elda options, resolves its declared areas to what sits on disk, walks those areas, and classifies each file's kind, so the graph assembly (scan.js) starts from a gathered list of files without touching the filesystem itself.
// Areas are read from the app's config rather than guessed by name, so an app composing at a worker, a CLI, or three servers is gathered without this tool knowing what any of them is called.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CODE_RE } from './parse.adapters.js';
import { isDataPath, norm } from './model.entities.js';

// A stylesheet is code (SURFACE.6) and draws in its layer x subdomain cell; everything that is neither a module nor a stylesheet is pure data, read as the complement (isDataPath) so that no extension the tool has never met classifies as a rankless surface.
export const STYLE_RE = /\.(css|scss|sass|less)$/i;
export const isAsset = (p) => isDataPath(p);

// Project options, read from the app's .oxlintrc.json when it configures elda/imports; the config may carry // comments, so strip them before parsing.
export function readOptions(appDir) {
  const defaults = { domainAlias: '#', appAlias: '@', compositionRoot: 'routes', core: 'core' };
  const rcPath = join(appDir, '.oxlintrc.json');
  if (!existsSync(rcPath)) return defaults;
  try {
    const raw = readFileSync(rcPath, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const rc = JSON.parse(raw);
    const rule = rc.rules && rc.rules['elda/imports'];
    const opts = Array.isArray(rule) && typeof rule[1] === 'object' ? rule[1] : {};
    return { ...defaults, ...opts };
  } catch {
    console.warn(`Could not parse ${rcPath}; using default elda options.`);
    return defaults;
  }
}

// A declared area, resolved to the thing on disk that holds it: a directory, or a single module where the area names one, since a build config is a composition root that lives as one file.
// An area sits under src/ (a route tree) or beside it at the app root (a server shell, that build config), so both are tried, and an entry resolving to nothing is omitted - an app with no server simply draws no server bar.
// Roots communicate only by serialization (ROOT.5), so each scans as its own block feeding the shared domains.
function areaTargets(appDir, srcDir, areas) {
  const out = [];
  for (const a of (Array.isArray(areas) ? areas : [areas]).filter(Boolean)) {
    const hit = [join(srcDir, a), join(appDir, a)].find(existsSync);
    if (!hit) continue;
    const label = norm(hit).slice(norm(appDir).length + 1);
    out.push(statSync(hit).isDirectory() ? { key: a, label, dir: hit } : { key: a, label, file: hit });
  }
  return out;
}

export function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// The domains root is either a top-level `domains/` or one nested under `src/`, the same two-step the plugin's srcDirOf follows, so an app laid out either way both lints and draws.
export function srcRootOf(appDir) {
  return existsSync(join(appDir, 'domains')) ? appDir : join(appDir, 'src');
}

// Every file in the app's scanned areas, classified into code, style, or asset, with the composition root that stamps it.
// Domains scan by directory; each composition root scans its directory or its single module and stamps every file with its root key, so the diagram draws one bar per root; each declared core scans as its own dependency-free block.
export function gatherFiles(appDir, srcDir, { compositionRoot, core }) {
  const roots = areaTargets(appDir, srcDir, compositionRoot);
  const areas = [
    { dir: join(srcDir, 'domains') },
    ...roots.map((r) => ({ root: r.key, dir: r.dir, file: r.file })),
    ...areaTargets(appDir, srcDir, core).map((c) => ({ dir: c.dir, file: c.file })),
  ];
  const found = [];
  for (const area of areas) {
    const target = area.dir ?? area.file;
    if (!target || !existsSync(target)) continue;
    for (const abs of area.file ? [area.file] : walk(area.dir)) {
      const path = norm(abs.slice(appDir.length + 1));
      const kind = CODE_RE.test(path) ? 'code' : STYLE_RE.test(path) ? 'style' : isAsset(path) ? 'asset' : null;
      if (kind) found.push({ path, kind, root: area.root });
    }
  }
  return { found, roots };
}
