#!/usr/bin/env node
// elda-viz - render an app's real dependency graph as the ELDA-Layers diagram: files sorted into layer x subdomain cells, arrows colored by the same verdicts the lint rules report.
// The classification and the verdicts come from the core modules, shared with the plugin, so the diagram and the linter judge every edge identically; an edge that looks wrong yet draws grey is a candidate for a missing rule.
// The scan itself lives in core/scan.services.js, so this CLI, the selftest, and anything else that asks a whole-graph question all read one and the same graph.
//
//   elda-viz [appDir] [--port N] [--out file.html] [--no-open]
//
// appDir is the app workspace (defaults to the working directory); its .oxlintrc.json supplies the elda options - the aliases, the ownership tree, the roots, and the cores.
// Default mode serves a live page and rescans on file changes; --out writes a standalone HTML snapshot instead.

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

import {
  hasTree,
  moduleForUrl,
  moduleSource,
  scanApp,
  viewerPage,
  viewerSnapshot,
  viewerStamp,
  watchApp,
  watchViewer,
} from "./domains/viz/services.js";

// ---------------------------------------------------------------------------
// CLI arguments.

const args = process.argv.slice(2);
let appDir = process.cwd();
let port = 5813;
let outFile = null;
let open = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--port") port = Number(args[++i]);
  else if (a.startsWith("--port=")) port = Number(a.slice(7));
  else if (a === "--out") outFile = args[++i];
  else if (a.startsWith("--out=")) outFile = a.slice(6);
  else if (a === "--no-open") open = false;
  else if (a === "--help" || a === "-h") {
    console.log("elda-viz [appDir] [--port N] [--out file.html] [--no-open]");
    process.exit(0);
  } else appDir = resolve(a);
}

if (!hasTree(appDir)) {
  console.error(
    `No ownership tree under ${appDir} (its .oxlintrc.json names the directory, 'domains' by default); pass the app workspace directory.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Output: a standalone snapshot, or a live server with rescans pushed over SSE.
// The pages come assembled from the viz domain's services surface: a live page loads the viewer modules from their served URLs, and a snapshot arrives with every module inlined as a data: URL and the graph injected.

// What one scan found: the graph's size, then each class of finding the whole-graph pass can see.
const summary = (g) =>
  [
    `${g.files.length} files`,
    `${g.edges.length} edges`,
    `${g.landings.filter((f) => f.laundered).length} laundered findings`,
    `${g.cycles.length} reference cycles`,
  ].join(", ");

if (outFile) {
  writeFileSync(resolve(outFile), viewerSnapshot(scanApp(appDir)));
  console.log(`Wrote ${resolve(outFile)}`);
  process.exit(0);
}

let graph = scanApp(appDir);
const clients = new Set();

const server = createServer((req, res) => {
  const url = req.url.split("?")[0];
  // The services surface knows which URLs are viewer modules; everything the route serves is a real module, with a JavaScript MIME so the browser runs it as one.
  const module = moduleForUrl(url);
  if (url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(viewerPage());
  } else if (url === "/data.json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...graph, viewer: viewerStamp() }));
  } else if (module != null) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(moduleSource(module));
  } else if (url === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  } else {
    res.writeHead(404);
    res.end();
  }
});

let debounce = null;
const rescan = () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    graph = scanApp(appDir);
    for (const c of clients) c.write("data: reload\n\n");
    console.log(`Rescanned: ${summary(graph)}.`);
  }, 200);
};

// The viewer modules are read from disk on every request, so editing one changes what a new page runs while an open one carries on with the old.
// Telling the clients is enough: each rereads the graph, finds a stamp it does not recognize, and reloads itself onto the viewer the server now holds.
// The shell axioms are code this process imported, so an edit to them takes a restart.
let viewerDebounce = null;
const viewerChanged = () => {
  clearTimeout(viewerDebounce);
  viewerDebounce = setTimeout(() => {
    for (const c of clients) c.write("data: reload\n\n");
    if (clients.size)
      console.log(
        `Viewer changed; ${clients.size} open page${clients.size > 1 ? "s" : ""} reloading.`,
      );
  }, 100);
};
try {
  watchViewer(viewerChanged);
} catch {
  console.warn("Could not watch the viewer; edits to it need a page reload.");
}

// The service watches every configured area and says when a rescan is due.
watchApp(appDir, rescan);

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`ELDA diagram for ${appDir}`);
  console.log(`${summary(graph)} -> ${url}`);
  if (open) {
    const cmd =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
  }
});
