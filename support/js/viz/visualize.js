#!/usr/bin/env node
// elda-viz - render an app's real dependency graph as the ELDA-Layers diagram: files sorted into layer x subdomain cells, arrows colored by the same verdicts the lint rules report.
// The classification and the verdicts come from model.js, shared with the plugin, so the diagram and the linter judge every edge identically; an edge that looks wrong yet draws grey is a candidate for a missing rule.
// The scan itself lives in scan.js, so this CLI, the selftest, and anything else that asks a whole-graph question all read one and the same graph.
//
//   elda-viz [appDir] [--port N] [--out file.html] [--no-open]
//
// appDir is the app workspace holding src/ (defaults to the working directory); its .oxlintrc.json supplies the elda/imports options when present.
// Default mode serves a live page and rescans on file changes; --out writes a standalone HTML snapshot instead.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CODE_RE } from '../core/flow.js';
import { STYLE_RE, buildGraph, isAsset, walk } from '../core/scan.js';

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
// Output: a standalone snapshot, or a live server with rescans pushed over SSE.

const viewerPath = join(dirname(fileURLToPath(import.meta.url)), 'viewer.html');
const viewerHtml = () => readFileSync(viewerPath, 'utf8');
// Which viewer a page is running, sent alongside the graph.
// A page reads its own stamp back on every load, and a stamp that moved is the one thing it cannot fix by redrawing: the markup and the script it is running are the ones this file no longer holds.
const viewerStamp = () => String(statSync(viewerPath).mtimeMs);

// What one scan found: the graph's size, then each class of finding the whole-graph pass can see.
const summary = (g) => [
  `${g.files.length} files`,
  `${g.edges.length} edges`,
  `${g.flows.filter((f) => f.laundered).length} laundered findings`,
  `${g.cycles.length} reference cycles`,
].join(', ');

if (outFile) {
  const html = viewerHtml().replace(/\/\*\s*__DATA__\s*\*\/\s*null/, JSON.stringify(buildGraph(appDir)));
  writeFileSync(resolve(outFile), html);
  console.log(`Wrote ${resolve(outFile)}`);
  process.exit(0);
}

let graph = buildGraph(appDir);
const clients = new Set();

const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(viewerHtml());
  } else if (url === '/data.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...graph, viewer: viewerStamp() }));
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
    graph = buildGraph(appDir);
    for (const c of clients) c.write('data: reload\n\n');
    console.log(`Rescanned: ${summary(graph)}.`);
  }, 200);
};

// The viewer is served from disk on every request, so editing it changes what a new page runs while an open one carries on with the old.
// Telling the clients is enough: each rereads the graph, finds a stamp it does not recognize, and reloads itself onto the viewer this file now holds.
let viewerDebounce = null;
try {
  watch(viewerPath, () => {
    clearTimeout(viewerDebounce);
    viewerDebounce = setTimeout(() => {
      for (const c of clients) c.write('data: reload\n\n');
      if (clients.size) console.log(`Viewer changed; ${clients.size} open page${clients.size > 1 ? 's' : ''} reloading.`);
    }, 100);
  });
} catch {
  console.warn('Could not watch the viewer; edits to it need a page reload.');
}

// Recursive watch covers the whole src tree on Windows and macOS; where a runtime lacks it, fall back to one watcher per directory.
try {
  watch(srcDir, { recursive: true }, (_e, name) => {
    if (name && (CODE_RE.test(name) || STYLE_RE.test(name) || isAsset(name))) rescan();
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
  console.log(`${summary(graph)} -> ${url}`);
  if (open) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  }
});
