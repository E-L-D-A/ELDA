// The graph assembly: gather the files, resolve every reference, infer each file's role from its position in the resolved graph, and judge every reference with the shared model.
// A per-file rule reads one file and its specifiers, so everything a whole-graph question needs is assembled here: the classified nodes, the authored edges, the landed landings behind the conduits, the reachable set, and the reference cycles the landings close.
// The roles come from ownership.js - surface ownership over the edges, the same classification the lint rules read - so the diagram and the linter judge every edge identically; only the declared composition roots are taken from the scan's own areas.
// The tree walk lives in tree.js and the module parsing in parse.js, so this file touches no filesystem of its own; the CLI (visualize.js) serves what it returns and the selftest asserts on it.

import { join } from 'node:path';

import { deepSideEffect, slicingLean, slicingPressure } from '../axioms/messages.js';
import { LAYER_RANK, inTreeSpec, isRelative, norm, posixResolve, targetOf } from '../axioms/model.js';
import { createWalker } from './walk.js';
import { cycles } from '../flows/graph.js';
import { graphRoles } from '../flows/ownership.js';
import { EXT_CANDIDATES, moduleInfo } from '../harnesses/parse.js';
import { gatherFiles, readOptions } from '../harnesses/tree.js';
import { diagonalVerdict, importVerdict, landedVerdict, lateralVerdict, rootLandedVerdict, selfSurfaceVerdict, unjudgedVerdict } from '../flows/verdicts.js';

export function buildGraph(appDir) {
  const options = readOptions(appDir);
  const { aliases, ownershipAlias, ownershipDir, core } = options;
  const { found, roots } = gatherFiles(appDir, options);

  // The path a specifier names, or null for a bare package; every configured alias resolves against its declared app-root-relative directory.
  const aliasEntries = Object.entries(aliases ?? {}).sort((a, b) => b[0].length - a[0].length);
  const specPath = (relDir, spec) => {
    const bare = String(spec).split('?')[0];
    for (const [alias, dir] of aliasEntries) {
      if (bare.startsWith(alias + '/')) return dir + '/' + bare.slice(alias.length + 1);
    }
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

  // An `@elda-import:` directive (parse.js) is the serialization handoff between runtimes (ROOT.5), declared at the site that performs it: the host consumes every matched file as source, and another runtime composes them.
  // The pattern resolves against the host's own directory, and a trailing `/*` takes the whole subtree. Each match becomes an `embeds` edge: it carries reachability and draws as dataflow, it takes no reference judgment - no binding crosses a runtime boundary, and the shipped files' own edges are judged here like any other - and ownership hands each match its own tree claim rather than the host's chain.
  // An `@elda-entry` directive names where the other runtime enters the shipped files. It sharpens the host's fan: reach then landings through the entry's own imports rather than through every shipped byte, so a shipped file no entry composes surfaces as dead bundle weight below.
  const entryHosts = new Set();
  for (const file of files) {
    if (file.kind !== 'code') continue;
    const info = moduleInfo(join(appDir, file.path));
    const directives = info?.directives ?? [];
    const entrySpecs = info?.entries ?? [];
    if (!directives.length && !entrySpecs.length) continue;
    const slash = file.path.lastIndexOf('/');
    const relDir = slash < 0 ? '' : file.path.slice(0, slash);
    for (const pattern of directives) {
      const subtree = pattern.endsWith('/*');
      const base = posixResolve(relDir, subtree ? pattern.slice(0, -2) : pattern).slice(1);
      const targets = subtree
        ? [...byPath.keys()].filter((p) => p.startsWith(base + '/'))
        : [matchIn(base, byPath)].filter((p) => p != null);
      if (!targets.length) {
        console.warn(`@elda-import in ${file.path}: '${pattern}' matches nothing in the scanned areas.`);
        continue;
      }
      for (const t of targets) {
        const to = byPath.get(t);
        if (to === file.id) continue;
        edges.push({ from: file.id, to, spec: pattern, kind: 'embeds', typeOnly: false, names: '*', verdict: null, tier: null });
      }
    }
    for (const spec of entrySpecs) {
      const hit = matchIn(posixResolve(relDir, spec).slice(1), byPath);
      const edge = hit == null ? null : edges.find((e) => e.kind === 'embeds' && e.from === file.id && e.to === byPath.get(hit));
      if (!edge) {
        console.warn(`@elda-entry in ${file.path}: '${spec}' names no file this module's @elda-import ships.`);
        continue;
      }
      edge.entry = true;
      entryHosts.add(file.id);
    }
  }

  // The roles, reconciled from the two judges (ownership): the graph reading and the tree's claim, with a dispute where they disagree and an unreached reason where the graph is silent.
  const roles = graphRoles({ files, edges, options });
  for (const f of files) {
    const r = roles.get(f.id);
    if (!r) continue;
    f.role = r.role;
    if (r.dispute) f.dispute = r.dispute;
    if (r.unreached) f.unreached = r.unreached;
  }

  // The informer's own reading of the surface-declaration fact: a surface that owns exported value bindings holds contents no layer file carries yet.
  // It is read off the shared binding tables (parse.js ownedValues), never a second AST pass, so this observation and the lint rule cannot fork; the rule keeps the per-declaration reports, this carries the per-file fact.
  // Ambient .d.ts modules are vocabulary throughout, so they never count as contents.
  for (const f of files) {
    if (f.kind !== 'code' || /\.d\.ts$/i.test(f.path)) continue;
    if ((f.role.kind !== 'surface' && f.role.kind !== 'core') || f.role.surface == null) continue;
    const table = moduleInfo(join(appDir, f.path))?.table;
    if (table?.ownedValues?.size) f.owns = [...table.ownedValues];
  }

  // The reference target read off the file a specifier actually resolved to.
  // A domain, surface, or core file carries a target the reference rules read - core targets are judged directionally, since a reach into core is legal at or below the consumer's own rank and an upward reach is the inversion no row draws; a root or an unscanned path carries none, and the caller falls back to the specifier's own shape.
  const targetOfNode = (node) => {
    if (node == null) return null;
    const f = files[node];
    if (f.role.kind !== 'domain' && f.role.kind !== 'surface' && f.role.kind !== 'core') return null;
    return { ...f.role, asset: f.kind === 'asset' };
  };
  const dirOf = (p) => (p.lastIndexOf('/') < 0 ? '' : p.slice(0, p.lastIndexOf('/')));

  // An unsorted file is judged by nothing: its imports carry no layer to read, and a reference INTO one resolves to a real file whose kind says the spec-shape guess must not run.
  const judged = (k) => k !== 'other' && k !== 'unsorted';
  // Pass two: judge every reference with the inferred roles - the same ladder the lint rules climb.
  for (const e of edges) {
    if (e.kind === 'embeds') continue;
    const file = files[e.from];
    const relPath = '/' + file.path;
    // Resolve first, judge second, exactly as the plugin does: the scanned file the specifier landed on IS the target, so the trailing-segment ambiguity never needs the tolerant two-reading fallback.
    const resolved = targetOfNode(e.to);
    const t = resolved ?? (e.to != null && files[e.to].role.kind === 'unsorted' ? null : targetOf(relPath, e.spec, ownershipAlias, ownershipDir));
    // An in-tree specifier naming no file is undecidable, and the shape-only reading of one is the most permissive reading available: a dangling `./x` reads as a reference inside the importer's own subdomain, so a half-finished move would draw an all-grey diagram.
    if (e.to == null && judged(file.role.kind) && inTreeSpec(e.spec, aliasEntries)) {
      e.verdict = unjudgedVerdict(file.role, e.spec, 'is shaped like in-tree code yet resolves to no file');
      e.tier = 'invariant';
      continue;
    }
    if (t && judged(file.role.kind)) {
      e.verdict = importVerdict(file.role, t, ownershipAlias, resolved != null) ?? selfSurfaceVerdict(file.role, t);
      if (e.verdict) e.tier = 'invariant';
      else if (!e.typeOnly && file.role.kind === 'domain') {
        e.verdict = diagonalVerdict(file.role, t);
        if (e.verdict) e.tier = 'invariant';
        else {
          e.verdict = lateralVerdict(file.role, t, 'services') ?? lateralVerdict(file.role, t, 'harnesses');
          if (e.verdict) e.tier = 'smell';
        }
      }
    }
    // A side-effect import reaching past its own directory hides an effect in the graph (SURFACE.5); co-location is the directory itself, wherever it lives.
    if (!e.verdict && e.kind === 'side-effect' && e.to != null && judged(file.role.kind) && dirOf(files[e.to].path) !== dirOf(file.path)) {
      e.verdict = deepSideEffect(e.spec);
      e.tier = 'smell';
    }
  }

  // Reachability from the composition roots: the roots are the app's entry points (ROOT.5), and a file joins the reachable set the moment anything reachable references it.
  // A file no root can reach ships to nobody. It is dead weight, or a capability deliberately ahead of its demand, and SURFACE.4 reads that as a review signal rather than a fault - so this counts and never gates.
  const outEdges = new Map();
  for (const e of edges) {
    if (e.to == null) continue;
    // A host that declares an entry ships through it: only the entry's edge carries reach, and the shipped subtree unfolds through the entry's own imports. A host with no entry keeps the blanket fan.
    if (e.kind === 'embeds' && entryHosts.has(e.from) && !e.entry) continue;
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
  // A shipped file the entry never composes is dead weight in the bundle: its bytes travel and nothing runs them. The reason rides the file the way every unreached reason does, and SURFACE.4 reads it as a review signal.
  for (const e of edges) {
    if (e.kind !== 'embeds' || e.to == null) continue;
    const f = files[e.to];
    if (!f.reachable && !f.unreached) f.unreached = `ships with '${files[e.from].path}', and no declared entry composes it`;
  }

  // The slicing-pressure pass (the spec's Slicing direction): rank-climbing imports whose two ends have a piece boundary between them, grouped by the nearest scope containing both.
  // Every climb is a violation on its own; this is the second-order reading over those findings - a cluster between sibling pieces is a partition fighting its dataflow - so the pass gathers and the reviewer decides the new slice.
  // A boundary sits between two units of one subdomain, two subdomains or domains, two core pieces, and a domain-and-core pair; a within-unit climb has no boundary a re-slice could move, so it stays the local finding its own verdict already remedies.
  const pressureGroups = new Map();
  for (const e of edges) {
    if (e.to == null || e.typeOnly || e.kind === 'embeds') continue;
    const a = files[e.from].role;
    const b = files[e.to].role;
    if (!a.layer || !b.layer) continue;
    if (a.kind !== 'domain' && a.kind !== 'core') continue;
    if (b.kind !== 'domain' && b.kind !== 'core') continue;
    if (LAYER_RANK[b.layer] <= LAYER_RANK[a.layer]) continue;
    const ca = a.chain ?? [];
    const cb = b.chain ?? [];
    if (!ca.length || !cb.length) continue;
    let p = 0;
    while (p < ca.length && p < cb.length && ca[p] === cb[p]) p++;
    const sameChain = p === ca.length && p === cb.length;
    let scope;
    let pair;
    if (a.kind !== b.kind) {
      scope = '(app)';
      pair = `${ca.join('/')} -> ${cb.join('/')}`;
    } else if (sameChain) {
      const ua = a.name ?? '';
      const ub = b.name ?? '';
      if (ua === ub) continue;
      scope = ca.join('/');
      pair = `${ua || '(base)'} -> ${ub || '(base)'}`;
    } else if (a.kind === 'core') {
      scope = a.area != null && a.area === b.area ? a.area : '(app)';
      pair = `${ca.join('/')} -> ${cb.join('/')}`;
    } else {
      scope = p > 0 ? ca.slice(0, p).join('/') : '(app)';
      pair = `${ca.join('/')} -> ${cb.join('/')}`;
    }
    if (!pressureGroups.has(scope)) pressureGroups.set(scope, []);
    pressureGroups.get(scope).push({ from: e.from, to: e.to, pair });
  }
  const pressure = [...pressureGroups.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([scope, list]) => ({
      scope,
      edges: list.map(({ from, to }) => ({ from, to })),
      verdict: slicingPressure(scope, list.length, [...new Set(list.map((x) => x.pair))]),
    }));

  // The pressure pass's legal mirror - the slicing leans: downward imports that cross a piece boundary to reach the shared base below, each one legal, and a cluster of them is the drawn geometry of a slice at odds with its dataflow.
  // A named unit reading its subdomain's bare base crosses every column to reach it, and a core piece reading a lower core piece does the same across the shared block; the marked edges take their own paint, and a cluster from two or more pieces ships as a recommendation to consider the other slicing direction.
  const leanOf = (ref) => {
    if (ref.to == null || ref.typeOnly || ref.tier || ref.kind === 'embeds') return null;
    const a = files[ref.from].role;
    const b = files[ref.to].role;
    if (!a.layer || !b.layer) return null;
    if (LAYER_RANK[b.layer] >= LAYER_RANK[a.layer]) return null;
    if (a.kind === 'domain' && b.kind === 'domain') {
      const ca = (a.chain ?? []).join('/');
      const cb = (b.chain ?? []).join('/');
      if (ca !== cb || (a.name ?? '') === '' || (b.name ?? '') !== '') return null;
      return { scope: ca, piece: a.name, via: a.via };
    }
    if (a.kind === 'core' && b.kind === 'core') {
      if ((a.chain ?? []).join('/') === (b.chain ?? []).join('/')) return null;
      if (a.area == null || a.area !== b.area) return null;
      return { scope: a.area, piece: (a.chain ?? []).join('/'), via: a.via };
    }
    return null;
  };
  const leanGroups = new Map();
  for (const e of edges) {
    const hit = leanOf(e);
    if (!hit) continue;
    e.lean = true;
    if (!leanGroups.has(hit.scope)) leanGroups.set(hit.scope, []);
    leanGroups.get(hit.scope).push({ from: e.from, to: e.to, piece: hit.piece, via: hit.via });
  }
  const recommendations = [...leanGroups.entries()]
    .filter(([, list]) => new Set(list.map((x) => x.piece)).size >= 2)
    .map(([scope, list]) => {
      const spelled =
        list.filter((x) => x.via === 'branch').length > list.length / 2 ? 'horizontal' : 'vertical';
      return {
        scope,
        edges: list.map(({ from, to }) => ({ from, to })),
        verdict: slicingLean(scope, list.length, spelled),
      };
    });

  const walker = createWalker({ appRoot: appDir, aliases, ownershipDir, core });
  const landings = expandLandings(files, edges, walker, appDir, byPath);
  for (const f of landings) if (leanOf(f)) f.lean = true;
  // Root glue draws in the bar of the root that reached it, and glue shared between roots gets a bar of its own, so every composition-root file has a place on the board.
  const rootBars = roots.map((r) => ({ key: r.key, label: r.label }));
  for (const f of files) {
    const key = f.role.kind === 'composition-root' ? f.role.root : null;
    if (key && !rootBars.some((r) => r.key === key)) rootBars.push({ key, label: key === '(shared)' ? 'shared root glue' : key });
  }
  return {
    app: norm(appDir).split('/').pop(),
    options: { ...options, roots: rootBars },
    files,
    edges,
    landings,
    pressure,
    recommendations,
    cycles: cycles(files, cycleEdges(edges, landings)),
    cwd: norm(appDir)
  };
}

// The graph the cycle pass rides: the landings, one edge per ordered pair.
// A surface holds no rank and owns no value of its own, so a cycle closes through the carriers behind it, and the landed landings are already expanded through the conduits; a type-only reference is vocabulary, and no value rides it.
// A file referencing itself never lands (the walk stops at the source), so its self-edge is taken from the authored graph, and a self-reference is a cycle by construction.
function cycleEdges(edges, landings) {
  const out = [];
  const seen = new Set();
  const add = (e) => {
    const key = `${e.from}>${e.to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from: e.from, to: e.to });
  };
  for (const f of landings) if (f.to != null && !f.typeOnly) add(f);
  for (const e of edges) if (e.to != null && e.to === e.from && !e.typeOnly) add(e);
  return out;
}

// The whole-graph flow pass: which binding actually lands where, once re-export indirection is followed name by name.
// The walk itself lives in flow.js and is the same one the lint rule enforces with; here each landing additionally inherits the worst authored-edge verdict along its hops, and clean-hop landings are judged by the geometry verdicts - the landed diagonal and the lateral coupling - because those constrain the dataflow itself, and a re-export chain does not change where a value lives.
// The boundary verdicts stay per-reference, since consuming internals through a surface is exactly what a surface is for.
// A fresh verdict on a clean-hop landing is a laundered finding: real in the graph, invisible to any per-file judgment of a single reference.
function expandLandings(files, edges, walker, appDir, byPath) {
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
    // Side-effect imports execute the target rather than take bindings, type-only edges are vocabulary, and an embed ships source across a runtime boundary; all three draw as authored and do not expand.
    if (e.kind === 'side-effect' || e.kind === 'embeds' || e.typeOnly) { push({ ...e, via: [], laundered: false }); continue; }
    const judge = (toId) => {
      const t = { ...files[toId].role, asset: files[toId].kind === 'asset' };
      // The root's landings answer ROOT.1 in core exactly as in a domain: a binding it takes that lands off the services row is a service smashed into the root.
      if (src.role.kind === 'composition-root') {
        const rv = rootLandedVerdict(src.role, t);
        return rv ? { verdict: rv, tier: 'invariant' } : null;
      }
      // A domain's landing in core is legal at or below its own rank - the geometry verdicts only grade below-rank landings, and those are the leans the diagram blesses - while the upward reach is judged on the authored edge.
      if (t.kind === 'core') return null;
      if (src.role.kind !== 'domain') return null;
      const dv = landedVerdict(src.role, t);
      if (dv) return { verdict: dv, tier: 'invariant' };
      const lv = lateralVerdict(src.role, t, 'services') ?? lateralVerdict(src.role, t, 'harnesses');
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
