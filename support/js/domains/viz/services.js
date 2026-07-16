// The viz domain's runtime-composition surface: the app scan, the viewer pages, the module files behind them, and the change signals, composed by the CLI root.
// This file owns where the viewer's files live and reads them off disk; the assembly itself is viewer.use-cases.js, and the page shape is the entities beside it.
// The root consumes everything here and touches no adapter itself: the scan, the tree checks, and the file watches are this service's work.

import { existsSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CODE_RE } from '../../core/parse.adapters.js';
import { buildGraph } from '../../core/scan.services.js';
import { STYLE_RE, isAsset, readOptions, walk } from '../../core/tree.adapters.js';
import { livePage, snapshotPage } from './viewer.use-cases.js';

const viewerDir = join(dirname(fileURLToPath(import.meta.url)), 'viewer');
const modulePath = (name) => join(viewerDir, `${name}.js`);

export const moduleNames = () =>
  readdirSync(viewerDir).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -'.js'.length));
export const moduleSource = (name) => readFileSync(modulePath(name), 'utf8');

// The served route for a viewer module, matched against the real module set so the route reads no path the caller supplies; null for any other URL.
export const moduleForUrl = (url) => {
  if (!url.startsWith('/viewer/')) return null;
  const name = url.slice('/viewer/'.length).replace(/\.js$/, '');
  return moduleNames().includes(name) ? name : null;
};

export const viewerPage = () => livePage();
export const viewerSnapshot = (graph) => snapshotPage(moduleNames(), moduleSource, graph);

// Which viewer a page is running, sent alongside the graph: the newest mtime across the modules, so a page can tell when the server now holds code it is not running and a reload is the fix.
export const viewerStamp = () =>
  String(moduleNames().reduce((max, n) => Math.max(max, statSync(modulePath(n)).mtimeMs), 0));

// A change to any viewer module reaches every open page through the caller's notification.
export const watchViewer = (onChange) => watch(viewerDir, onChange);

// The app scan and its change signal, as the service the CLI root mounts.
export const scanApp = (appDir) => buildGraph(appDir);

// Whether the app declares an ownership tree at all, so the root can refuse a directory that is not an app workspace.
export const hasTree = (appDir) => existsSync(join(appDir, readOptions(appDir).ownershipDir));

// Watch every configured area - the ownership tree, each composition root, each core - and call back on any code, style, or asset change.
// Recursive watch covers Windows and macOS; where a runtime lacks it, fall back to one watcher per directory.
export const watchApp = (appDir, onChange) => {
  const { ownershipDir, compositionRoot, core } = readOptions(appDir);
  const areas = [ownershipDir, ...[compositionRoot, core].flatMap((a) => (Array.isArray(a) ? a : [a]))];
  const dirs = [...new Set(areas.map((a) => join(appDir, a)).filter((p) => existsSync(p) && statSync(p).isDirectory()))];
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
