// The graph assembly: gather the files, resolve every reference, infer each file's role from its position in the resolved graph, and judge every reference with the shared model.
// A per-file rule reads one file and its specifiers, so everything a whole-graph question needs is assembled here: the classified nodes, the authored edges, the landed flows behind the conduits, the reachable set, and the reference cycles the flows close.
// The roles come from ownership.js - surface ownership over the edges, the same classification the lint rules read - so the diagram and the linter judge every edge identically; only the declared composition roots are taken from the scan's own areas.
// The tree walk lives in tree.js and the module parsing in parse.js, so this file touches no filesystem of its own; the CLI (visualize.js) serves what it returns and the selftest asserts on it.

import { join } from 'node:path';

import { createWalker } from './flow.js';
import { graphRoles } from './ownership.js';
import { EXT_CANDIDATES, moduleInfo } from './parse.js';
import { gatherFiles, readOptions, srcRootOf } from './tree.js';
import { cycles } from './graph.js';
import { deepSideEffect } from './messages.js';
import { inTreeSpec, isRelative, norm, posixResolve, targetOf } from './model.js';
import { diagonalVerdict, importVerdict, landedVerdict, lateralVerdict, rootLandedVerdict, selfSurfaceVerdict, unjudgedVerdict } from './verdicts.js';

export function buildGraph(appDir) {
  const srcDir = srcRootOf(appDir);
  const { domainAlias, appAlias, compositionRoot, core } = readOptions(appDir);
  const { found, roots } = gatherFiles(appDir, srcDir, { compositionRoot, core });

  // The path a specifier names, or null for a bare package; the alias prefixes resolve against the source root, wherever the app keeps it.
  const srcBase = norm(srcDir).length > norm(appDir).length ? norm(srcDir).slice(norm(appDir).length + 1) + '/' : '';
  const specPath = (relDir, spec) => {
    const bare = String(spec).split('?')[0];
    if (bare.startsWith(domainAlias + '/')) return srcBase + 'domains/' + bare.slice(domainAlias.length + 1);
    if (bare.startsWith(appAlias + '/')) return srcBase + bare.slice(appAlias.length + 1);
    if (isRelative(bare)) return posixResolve(relDir, bare).slice(1);
    return null;
  };
  // Match that path against a set of real paths the way the bundler would: the exact path, then each source extension, then a directory barrel.
  const matchIn = (p, set) => {
    if (p == null) return null;
    if (set.has(p)) return p;
    for (const ext of EXT_CANDIDATES) if (set.has(p + ext)) return p + ext;
    for (const ext of EXT_CANDIDATES) if (set.has(p + '/index' + ext)) return p + '/index' + ext;
    return null;
  };
  const dirOfPath = (p) => (p.lastIndexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/')));

  // A data file joins the graph only when something imports it. A domain's README is data by the complement rule and belongs to no dependency, so drawing it would add a node with no edges and a badge for an extension nobody referenced.
  // Code and stylesheets always draw: an unreferenced module is a review signal (SURFACE.4) the diagram should show, and knip is what prunes it.
  const allPaths = new Set(found.map((f) => f.path));
  const imported = new Set();
  for (const f of found) {
    if (f.kind !== 'code') continue;
    const info = moduleInfo(join(appDir, f.path));
    if (!info) continue;
    for (const ref of info.refs) {
      const hit = matchIn(specPath(dirOfPath(f.path), ref.spec), allPaths);
      if (hit) imported.add(hit);
    }
  }

  const files = [];
  const byPath = new Map();
  for (const f of found) {
    if (f.kind === 'asset' && !imported.has(f.path)) continue;
    const id = files.length;
    // Only the declared roots carry a role up front; every other file's role is inferred from the resolved graph once the edges exist.
    files.push({ id, path: f.path, kind: f.kind, role: f.root ? { kind: 'composition-root', root: f.root } : { kind: 'other' } });
    byPath.set(f.path, id);
  }

  const resolveNode = (relDir, spec) => {
    const p = specPath(relDir, spec);
    if (p == null) return { external: true, node: null };
    const hit = matchIn(p, byPath);
    return { external: false, node: hit == null ? null : byPath.get(hit) };
  };

  // Pass one: resolve every reference. The chains need the whole edge set before any file can be placed, so nothing is judged yet.
  const edges = [];
  for (const file of files) {
    if (file.kind !== 'code') continue;
    // The mtime-cached analysis from parse.js: the same references and binding tables the lint rule walks.
    const info = moduleInfo(join(appDir, file.path));
    if (!info) {
      console.warn(`Parse failed for ${file.path}`);
      continue;
    }
    // A root config file sits at the app root with no directory segment, so an absent slash resolves relatives against the app root itself.
    const slash = file.path.lastIndexOf('/');
    const relDir = slash < 0 ? '' : file.path.slice(0, slash);
    for (const ref of info.refs) {
      const { external, node } = resolveNode(relDir, ref.spec);
      if (external) continue;
      edges.push({ from: file.id, to: node, spec: ref.spec, kind: ref.kind, typeOnly: ref.typeOnly, names: ref.names, verdict: null, tier: null });
    }
  }

  // The roles, read off the resolved graph: surface ownership decides each file's domain and chain, and the name decides its layer (ownership.js).
  const roles = graphRoles({ files, edges, options: { domainAlias, appAlias } });
  for (const f of files) f.role = roles.get(f.id) ?? f.role;

  // The reference target read off the file a specifier actually resolved to.
  // Only a domain or surface file carries a target the reference rules can read; a root, a core module, or an unscanned path carries none, and the caller falls back to the specifier's own shape.
  const targetOfNode = (node) => {
    if (node == null) return null;
    const f = files[node];
    if (f.role.kind !== 'domain' && f.role.kind !== 'surface') return null;
    return { ...f.role, asset: f.kind === 'asset' };
  };
  const dirOf = (p) => (p.lastIndexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/')));

  // Pass two: judge every reference with the inferred roles - the same ladder the lint rules climb.
  for (const e of edges) {
    const file = files[e.from];
    const relPath = '/' + file.path;
    // Resolve first, judge second, exactly as the plugin does: the scanned file the specifier landed on IS the target, so the trailing-segment ambiguity never needs the tolerant two-reading fallback.
    const resolved = targetOfNode(e.to);
    const t = resolved ?? targetOf(relPath, e.spec, domainAlias, appAlias);
    // An in-tree specifier naming no file is undecidable, and the shape-only reading of one is the most permissive reading available: a dangling `./x` reads as a reference inside the importer's own subdomain, so a half-finished move would draw an all-grey diagram.
    if (e.to == null && file.role.kind !== 'other' && inTreeSpec(e.spec, domainAlias, appAlias)) {
      e.verdict = unjudgedVerdict(file.role, e.spec, 'is shaped like in-tree code yet resolves to no file');
      e.tier = 'invariant';
      continue;
    }
    if (t && file.role.kind !== 'other') {
      e.verdict = importVerdict(file.role, t, domainAlias, resolved != null) ?? selfSurfaceVerdict(file.role, t);
      if (e.verdict) e.tier = 'invariant';
      else if (!e.typeOnly && file.role.kind === 'domain') {
        e.verdict = diagonalVerdict(file.role, t);
        if (e.verdict) e.tier = 'invariant';
        else {
          e.verdict = lateralVerdict(file.role, t, 'services') ?? lateralVerdict(file.role, t, 'adapters');
          if (e.verdict) e.tier = 'smell';
        }
      }
    }
    // A side-effect import reaching past its own directory hides an effect in the graph (SURFACE.5); co-location is the directory itself, wherever it lives.
    if (!e.verdict && e.kind === 'side-effect' && e.to != null && file.role.kind !== 'other' && dirOf(files[e.to].path) !== dirOf(file.path)) {
      e.verdict = deepSideEffect(e.spec);
      e.tier = 'smell';
    }
  }

  // Reachability from the composition roots: the roots are the app's entry points (ROOT.5), and a file joins the reachable set the moment anything reachable references it.
  // A file no root can reach ships to nobody. It is dead weight, or a capability deliberately ahead of its demand, and SURFACE.4 reads that as a review signal rather than a fault - so this counts and never gates.
  const outEdges = new Map();
  for (const e of edges) {
    if (e.to == null) continue;
    if (!outEdges.has(e.from)) outEdges.set(e.from, []);
    outEdges.get(e.from).push(e.to);
  }
  const queue = files.filter((f) => f.role.kind === 'composition-root').map((f) => f.id);
  const reachable = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const next of outEdges.get(queue[i]) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }
  for (const f of files) f.reachable = reachable.has(f.id);

  const walker = createWalker({ srcDir, domainAlias, appAlias });
  const flows = expandFlows(files, edges, walker, appDir, byPath);
  return {
    app: norm(appDir).split('/').pop(),
    options: { domainAlias, appAlias, compositionRoot, core, roots: roots.map((r) => ({ key: r.key, label: r.label })) },
    files,
    edges,
    flows,
    cycles: cycles(files, cycleEdges(edges, flows)),
    cwd: norm(appDir)
  };
}

// The graph the cycle pass rides: the landed value flows, one edge per ordered pair.
// A surface holds no rank and owns no value of its own, so a cycle closes through the carriers behind it, and the landed flows are already expanded through the conduits; a type-only reference is vocabulary, and no value rides it.
// A file referencing itself never lands (the walk stops at the source), so its self-edge is taken from the authored graph, and a self-reference is a cycle by construction.
function cycleEdges(edges, flows) {
  const out = [];
  const seen = new Set();
  const add = (e) => {
    const key = `${e.from}>${e.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from: e.from, to: e.to });
  };
  for (const f of flows) if (f.to != null && !f.typeOnly) add(f);
  for (const e of edges) if (e.to != null && e.to === e.from && !e.typeOnly) add(e);
  return out;
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
      const t = { ...files[toId].role, asset: files[toId].kind === 'asset' };
      // The root's landings answer ROOT.1: a binding it takes that lands off the services row is a service smashed into the root.
      if (src.role.kind === 'composition-root') {
        const rv = rootLandedVerdict(src.role, t);
        return rv ? { verdict: rv, tier: 'invariant' } : null;
      }
      if (src.role.kind !== 'domain') return null;
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
