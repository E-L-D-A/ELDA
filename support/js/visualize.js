#!/usr/bin/env node
// elda-viz - render an app's real dependency graph as the ELDA-Layers diagram: files sorted into layer x subdomain cells, arrows colored by the same verdicts the lint rules report.
// The classification and the verdicts come from model.js, shared with the plugin, so the diagram and the linter judge every edge identically; an edge that looks wrong yet draws grey is a candidate for a missing rule.
//
//   elda-viz [appDir] [--port N] [--out file.html] [--no-open]
//
// appDir is the app workspace holding src/ (defaults to the working directory); its .oxlintrc.json supplies the elda/imports options when present.
// Default mode serves a live page and rescans on file changes; --out writes a standalone HTML snapshot instead.

import { readFileSync, readdirSync, existsSync, writeFileSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseSync } from 'oxc-parser';
import { norm, posixResolve, classify, fileRole, targetOf, importVerdict, lateralVerdict } from './model.js';

// ---------------------------------------------------------------------------
// CLI arguments.

const args = process.argv.slice(2);
let appDir = process.cwd();
let port = 5813;
let outFile = null;
let open = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--port') port = Number(args[++i]);
  else if (a.startsWith('--port=')) port = Number(a.slice(7));
  else if (a === '--out') outFile = args[++i];
  else if (a.startsWith('--out=')) outFile = a.slice(6);
  else if (a === '--no-open') open = false;
  else if (a === '--help' || a === '-h') {
    console.log('elda-viz [appDir] [--port N] [--out file.html] [--no-open]');
    process.exit(0);
  } else appDir = resolve(a);
}

const srcDir = join(appDir, 'src');
if (!existsSync(join(srcDir, 'domains'))) {
  console.error(`No src/domains under ${appDir}; pass the app workspace directory.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Project options, read from the app's .oxlintrc.json when it configures elda/imports; the config may carry // comments, so strip them before parsing.

function readOptions() {
  const defaults = { domainAlias: '#', appAlias: '@', compositionRoot: 'routes' };
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

const { domainAlias, appAlias, compositionRoot } = readOptions();

// ---------------------------------------------------------------------------
// Scan: walk the ELDA-relevant roots and classify every file.

const CODE_RE = /\.(m|c)?[tj]sx?$/;
const STYLE_RE = /\.(css|scss|sass|less)$/;
const ASSET_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)$/i;
const EXT_CANDIDATES = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs', '.d.ts'];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function buildGraph() {
  const roots = [join(srcDir, 'domains'), join(srcDir, compositionRoot), join(srcDir, 'core')].filter(existsSync);
  const files = [];
  const byPath = new Map();

  for (const root of roots) {
    for (const abs of walk(root)) {
      const path = norm(abs.slice(appDir.length + 1));
      const kind = CODE_RE.test(path) ? 'code' : STYLE_RE.test(path) ? 'style' : ASSET_RE.test(path) ? 'asset' : null;
      if (!kind) continue;
      let role = fileRole('/' + path, compositionRoot);
      // A pure-data asset carries no behaviour and classifies as vocabulary (SURFACE.6): entities of the subdomain its directory names.
      if (kind === 'asset') {
        const m = ('/' + path).match(/\/domains\/(.+)$/);
        if (m) {
          const c = classify(m[1].split('/').filter(Boolean));
          role = c.chain.length > 0
            ? { kind: 'domain', chain: c.chain, layer: c.layer ?? 'entities', via: 'asset', sub: c.sub, surface: null, name: c.surface ?? c.name }
            : { kind: 'other' };
        }
      }
      const id = files.length;
      files.push({ id, path, kind, role });
      byPath.set(path, id);
    }
  }

  // Match a specifier's resolved path against the scanned set the way the bundler would: the exact path, then each source extension, then a directory barrel.
  const resolveNode = (relDir, spec) => {
    const bare = spec.split('?')[0];
    let p = null;
    if (bare.startsWith(domainAlias + '/')) p = 'src/domains/' + bare.slice(domainAlias.length + 1);
    else if (bare.startsWith(appAlias + '/')) p = 'src/' + bare.slice(appAlias.length + 1);
    else if (bare.startsWith('./') || bare.startsWith('../')) p = posixResolve(relDir, bare).slice(1);
    if (p == null) return { external: true, node: null };
    if (byPath.has(p)) return { external: false, node: byPath.get(p) };
    for (const ext of EXT_CANDIDATES) if (byPath.has(p + ext)) return { external: false, node: byPath.get(p + ext) };
    for (const ext of EXT_CANDIDATES) if (byPath.has(p + '/index' + ext)) return { external: false, node: byPath.get(p + '/index' + ext) };
    return { external: false, node: null };
  };

  // Pull every reference a module makes: static imports (side-effect ones have no entries), re-exports carrying a module request, and literal dynamic imports.
  const referencesOf = (path, code) => {
    const parsed = parseSync(path, code);
    const refs = [];
    for (const si of parsed.module.staticImports) {
      refs.push({
        spec: si.moduleRequest.value,
        kind: si.entries.length === 0 ? 'side-effect' : 'import',
        typeOnly: si.entries.length > 0 && si.entries.every((e) => e.isType),
      });
    }
    for (const se of parsed.module.staticExports) {
      const req = se.entries.filter((e) => e.moduleRequest);
      if (req.length) refs.push({ spec: req[0].moduleRequest.value, kind: 'reexport', typeOnly: req.every((e) => e.isType) });
    }
    for (const di of parsed.module.dynamicImports) {
      const text = code.slice(di.moduleRequest.start, di.moduleRequest.end);
      const m = text.match(/^(['"`])((?:(?!\1)[^\\$])*)\1$/);
      if (m) refs.push({ spec: m[2], kind: 'dynamic', typeOnly: false });
    }
    return refs;
  };

  const edges = [];
  for (const file of files) {
    if (file.kind !== 'code') continue;
    let code;
    try { code = readFileSync(join(appDir, file.path), 'utf8'); } catch { continue; }
    let refs;
    try { refs = referencesOf(file.path, code); } catch (e) {
      console.warn(`Parse failed for ${file.path}: ${e.message}`);
      continue;
    }
    const relPath = '/' + file.path;
    const relDir = file.path.slice(0, file.path.lastIndexOf('/'));
    const importerDir = (relPath.match(/\/domains\/(.+)$/)?.[1] ?? '').split('/').slice(0, -1).join('/');
    for (const ref of refs) {
      const { external, node } = resolveNode(relDir, ref.spec);
      if (external) continue;
      const t = targetOf(relPath, ref.spec, domainAlias, appAlias);
      let verdict = null;
      let tier = null;
      if (t && file.role.kind !== 'other') {
        verdict = importVerdict(file.role, t, domainAlias);
        if (verdict) tier = 'invariant';
        else if (!ref.typeOnly && file.role.kind === 'domain') {
          verdict = lateralVerdict(file.role, t, 'services') ?? lateralVerdict(file.role, t, 'adapters');
          if (verdict) tier = 'smell';
        }
        if (!verdict && ref.kind === 'side-effect' && t.segs && t.segs.slice(0, -1).join('/') !== importerDir) {
          verdict = `ELDA SURFACE.5: side-effect import '${ref.spec}' runs another module for effect with nothing named crossing the edge; co-locate it in the unit, compose it at the root, or import a named value.`;
          tier = 'smell';
        }
      }
      edges.push({ from: file.id, to: node, spec: ref.spec, kind: ref.kind, typeOnly: ref.typeOnly, verdict, tier });
    }
  }

  return {
    app: norm(appDir).split('/').pop(),
    options: { domainAlias, appAlias, compositionRoot },
    files,
    edges,
  };
}

// ---------------------------------------------------------------------------
// Output: a standalone snapshot, or a live server with rescans pushed over SSE.

const viewerPath = join(dirname(fileURLToPath(import.meta.url)), 'viewer.html');
const viewerHtml = () => readFileSync(viewerPath, 'utf8');

if (outFile) {
  const html = viewerHtml().replace('/*__DATA__*/null', JSON.stringify(buildGraph()));
  writeFileSync(resolve(outFile), html);
  console.log(`Wrote ${resolve(outFile)}`);
  process.exit(0);
}

let graph = buildGraph();
const clients = new Set();

const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(viewerHtml());
  } else if (url === '/data.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(graph));
  } else if (url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else {
    res.writeHead(404);
    res.end();
  }
});

let debounce = null;
const rescan = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    graph = buildGraph();
    for (const c of clients) c.write('data: reload\n\n');
    console.log(`Rescanned: ${graph.files.length} files, ${graph.edges.length} edges.`);
  }, 200);
};

// Recursive watch covers the whole src tree on Windows and macOS; where a runtime lacks it, fall back to one watcher per directory.
try {
  watch(srcDir, { recursive: true }, (_e, name) => {
    if (name && (CODE_RE.test(name) || STYLE_RE.test(name) || ASSET_RE.test(name))) rescan();
  });
} catch {
  const dirs = [srcDir];
  for (const abs of walk(srcDir)) {
    const d = dirname(abs);
    if (!dirs.includes(d)) dirs.push(d);
  }
  for (const d of dirs) watch(d, rescan);
}

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`ELDA diagram for ${appDir}`);
  console.log(`${graph.files.length} files, ${graph.edges.length} edges -> ${url}`);
  if (open) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  }
});
