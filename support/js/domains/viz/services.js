// The viz domain's runtime-composition surface: the viewer pages, the module files behind them, and the change signals, composed by the CLI root.
// This file owns where the viewer's files live and reads them off disk; the assembly itself is viewer.use-cases.js, and the page shape is the entities beside it.

import { readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
