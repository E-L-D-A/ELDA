#!/usr/bin/env node
// elda-viz - render an app's real dependency graph as the ELDA-Layers diagram: files sorted into layer x subdomain cells, arrows colored by the same verdicts the lint rules report.
// The classification and the verdicts come from model.js, shared with the plugin, so the diagram and the linter judge every edge identically; an edge that looks wrong yet draws grey is a candidate for a missing rule.
//
//   elda-viz [appDir] [--port N] [--out file.html] [--no-open]
//
// appDir is the app workspace holding src/ (defaults to the working directory); its .oxlintrc.json supplies the elda/imports options when present.
// Default mode serves a live page and rescans on file changes; --out writes a standalone HTML snapshot instead.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CODE_RE, EXT_CANDIDATES, createWalker, moduleInfo } from './flow.js';
import { classify, diagonalVerdict, fileRole, importVerdict, landedVerdict, lateralVerdict, norm, posixResolve, targetOf } from './model.js';

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

const STYLE_RE = /\.(css|scss|sass|less)$/;
const ASSET_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)$/i;

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

  const edges = [];
  for (const file of files) {
    if (file.kind !== 'code') continue;
    // The mtime-cached analysis from flow.js: the same references and binding tables the lint rule walks.
    const info = moduleInfo(join(appDir, file.path));
    if (!info) {
      console.warn(`Parse failed for ${file.path}`);
      continue;
    }
    const refs = info.refs;
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
          verdict = diagonalVerdict(file.role, t);
          if (verdict) tier = 'invariant';
          else {
            verdict = lateralVerdict(file.role, t, 'services') ?? lateralVerdict(file.role, t, 'adapters');
            if (verdict) tier = 'smell';
          }
        }
        if (!verdict && ref.kind === 'side-effect' && t.segs && t.segs.slice(0, -1).join('/') !== importerDir) {
          verdict = `ELDA SURFACE.5: side-effect import '${ref.spec}' runs another module for effect with nothing named crossing the edge; co-locate it in the unit, compose it at the root, or import a named value.`;
          tier = 'smell';
        }
      }
      edges.push({ from: file.id, to: node, spec: ref.spec, kind: ref.kind, typeOnly: ref.typeOnly, names: ref.names, verdict, tier });
    }
  }

  const walker = createWalker({ srcDir, domainAlias, appAlias });
  return {
    app: norm(appDir).split('/').pop(),
    options: { domainAlias, appAlias, compositionRoot },
    files,
    edges,
    flows: expandFlows(files, edges, walker, appDir, byPath),
    cwd: norm(appDir)
  };
}

// The whole-graph flow pass: which binding actually lands where, once re-export indirection is followed name by name.
// The walk itself lives in flow.js and is the same one the lint rule enforces with; here each landing additionally inherits the worst authored-edge verdict along its hops, and clean-hop landings are judged by the geometry verdicts - the landed diagonal and the lateral coupling - because those constrain the dataflow itself, and a re-export chain does not change where a value lives.
// The boundary verdicts stay per-reference, since consuming internals through a surface is exactly what a surface is for.
// A fresh verdict on a clean-hop landing is a laundered finding: real in the graph, invisible to any per-file judgment of a single reference.
function expandFlows(files, edges, walker, appDir, byPath) {
  const rank = (t) => (t === 'invariant' ? 2 : t === 'smell' ? 1 : 0);
  const rootAbs = norm(appDir);
  const absOf = (id) => rootAbs + '/' + files[id].path;
  const idOf = (abs) => byPath.get(norm(abs).slice(rootAbs.length + 1));
  // The worst authored edge per (module, specifier), for inheriting hop verdicts along a walk.
  const edgeAt = new Map();
  for (const e of edges) {
    if (e.to == null) continue;
    const key = `${e.from}>${e.spec}`;
    const prev = edgeAt.get(key);
    if (!prev || rank(e.tier) > rank(prev.tier)) edgeAt.set(key, e);
  }
  const acc = new Map();
  const push = (flow) => {
    const key = `${flow.from}>${flow.to}>${flow.typeOnly}`;
    const prev = acc.get(key);
    if (!prev) acc.set(key, flow);
    else {
      if (rank(flow.tier) > rank(prev.tier)) Object.assign(prev, flow);
      if (Array.isArray(prev.names) && Array.isArray(flow.names)) prev.names = [...new Set([...prev.names, ...flow.names])];
    }
  };
  for (const e of edges) {
    if (e.to == null || files[e.from].role.kind === 'surface') continue;
    const src = files[e.from];
    // Side-effect imports execute the target rather than take bindings, and type-only edges are vocabulary; both draw as authored and do not expand.
    if (e.kind === 'side-effect' || e.typeOnly) { push({ ...e, via: [], laundered: false }); continue; }
    const judge = (toId) => {
      if (src.role.kind !== 'domain') return null;
      const t = { ...files[toId].role, asset: files[toId].kind === 'asset' };
      const dv = landedVerdict(src.role, t);
      if (dv) return { verdict: dv, tier: 'invariant' };
      const lv = lateralVerdict(src.role, t, 'services') ?? lateralVerdict(src.role, t, 'adapters');
      if (lv) return { verdict: lv, tier: 'smell' };
      return null;
    };
    const found = walker.landings(absOf(e.from), e.spec, e.names);
    if (found == null) continue;
    for (const l of found) {
      const to = idOf(l.path);
      if (to == null || to === e.from) continue;
      let tier = e.tier, verdict = e.verdict;
      for (const h of l.hops) {
        const hid = idOf(h.from);
        const hop = hid != null ? edgeAt.get(`${hid}>${h.spec}`) : null;
        if (hop && rank(hop.tier) > rank(tier)) { tier = hop.tier; verdict = hop.verdict; }
      }
      const j = verdict == null && l.via.length > 0 ? judge(to) : null;
      push({
        from: e.from, to, spec: e.spec, kind: e.kind, typeOnly: false,
        names: l.names === '*' ? '*' : l.names,
        verdict: verdict ?? (j ? j.verdict : null),
        tier: tier ?? (j ? j.tier : null),
        via: l.via.map(idOf).filter((x) => x != null),
        laundered: j != null,
      });
    }
  }
  return [...acc.values()];
}

// ---------------------------------------------------------------------------
// Output: a standalone snapshot, or a live server with rescans pushed over SSE.

const viewerPath = join(dirname(fileURLToPath(import.meta.url)), 'viewer.html');
const viewerHtml = () => readFileSync(viewerPath, 'utf8');

if (outFile) {
  const html = viewerHtml().replace(/\/\*\s*__DATA__\s*\*\/\s*null/, JSON.stringify(buildGraph()));
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
    console.log(`Rescanned: ${graph.files.length} files, ${graph.edges.length} edges, ${graph.flows.filter((f) => f.laundered).length} laundered findings.`);
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
  console.log(`${graph.files.length} files, ${graph.edges.length} edges, ${graph.flows.filter((f) => f.laundered).length} laundered findings -> ${url}`);
  if (open) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  }
});
