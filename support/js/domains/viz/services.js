// The viz domain's runtime-composition surface: the app scan, the viewer pages, the module files behind them, and the change signals, composed by the CLI root.
// This file owns where the viewer's files live and reads them off disk; the assembly itself is viewer.flows.js, and the page shape is the axioms beside it.
// The root consumes everything here and touches no harness itself: the scan, the tree checks, and the file watches are this service's work.

import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CODE_RE } from '../../core/harnesses/parse.js';
import { STYLE_RE, isAsset, readOptions, walk } from '../../core/harnesses/tree.js';
import { buildGraph } from '../../core/services/scan.js';
import { livePage, snapshotPage } from './viewer.flows.js';

// @elda-import:viewer/*
const viewerDir = join(dirname(fileURLToPath(import.meta.url)), 'viewer');
const modulePath = (name) => join(viewerDir, `${name}.js`);

// @elda-entry
const ENTRY = './viewer/services/index.js';
export const viewerPage = () => livePage(ENTRY);
export const viewerSnapshot = (graph) => snapshotPage(moduleNames(), moduleSource, graph, ENTRY);

// Module names are viewer-relative and may carry a layer directory ('flows/state'), so the listing walks the tree.
export const moduleNames = () => {
  const out = [];
  const visit = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const name = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) visit(join(dir, e.name), name);
      else if (e.name.endsWith('.js')) out.push(name.slice(0, -'.js'.length));
    }
  };
  visit(viewerDir, '');
  return out;
};
export const moduleSource = (name) => readFileSync(modulePath(name), 'utf8');

// The served route for a viewer module, matched against the real module set so the route reads no path the caller supplies; null for any other URL.
export const moduleForUrl = (url) => {
  if (!url.startsWith('/viewer/')) return null;
  const name = url.slice('/viewer/'.length).replace(/\.js$/, '');
  return moduleNames().includes(name) ? name : null;
};


// Which viewer a page is running, sent alongside the graph: the newest mtime across the modules, so a page can tell when the server now holds code it is not running and a reload is the fix.
export const viewerStamp = () =>
  String(moduleNames().reduce((max, n) => Math.max(max, statSync(modulePath(n)).mtimeMs), 0));

// A change to any viewer module reaches every open page through the caller's notification.
export const watchViewer = (onChange) => watch(viewerDir, { recursive: true }, onChange);

// The app scan and its change signal, as the service the CLI root mounts.
export const scanApp = (appDir) => buildGraph(appDir);

// Whether the target is a directory at all, so the root can refuse a path that cannot hold an app before scanning it.
export const isAppDir = (appDir) => {
  try {
    return statSync(appDir).isDirectory();
  } catch {
    return false;
  }
};

// Watch every configured area - the ownership tree, each composition root, each core - and call back on any code, style, or asset change.
// A tree with no discovered forest contributes no area, so the filter keeps the joins on real paths; where no area resolves at all the app root itself is watched, mirroring the scan's own fallback, so a misconfigured tree still rescans live.
// Recursive watch covers Windows and macOS; where a runtime lacks it, fall back to one watcher per directory.
export const watchApp = (appDir, onChange) => {
  const { ownershipDir, compositionRoot, core } = readOptions(appDir);
  const areas = [ownershipDir, ...[compositionRoot, core].flatMap((a) => (Array.isArray(a) ? a : [a]))].filter(Boolean);
  let dirs = [...new Set(areas.map((a) => join(appDir, a)).filter((p) => existsSync(p) && statSync(p).isDirectory()))];
  if (!dirs.length) dirs = [appDir];
  const relevant = (name) => name && (CODE_RE.test(name) || STYLE_RE.test(name) || isAsset(name));
  for (const dir of dirs) {
    try {
      watch(dir, { recursive: true }, (_e, name) => {
        if (relevant(name)) onChange();
      });
    } catch {
      const flat = [dir];
      for (const abs of walk(dir)) {
        const d = dirname(abs);
        if (!flat.includes(d)) flat.push(d);
      }
      for (const d of flat) watch(d, () => onChange());
    }
  }
};
