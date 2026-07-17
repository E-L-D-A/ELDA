// Surface-ownership classification: a file's domain and subdomain chain read off its position in the resolved graph rather than its path.
// A domain is its surface, so the chain from a composition root to a file is the sequence of surfaces crossed to reach it; two files share a subdomain when the same surface is the last one over them. The path was only ever a stand-in for that walk, and the path is gameable where the graph is not.
// The layer and the surface-ness ride the file's own name, wherever it sits on disk. The chain rides the edges.
// Shared by the enforcer (index.js) and the informer (visualize.js) so the linter and the diagram infer one structure. Pure: a scanned graph in, a role per file out.

import { dishonestPlacement } from '../axioms/messages.js';
import { fileRole, inArea, isRelative, layerOf, parseSpec, stripExt } from '../axioms/model.js';

// A file reached from domains that share no ancestor sits below all of them: pure core, the dependency-order's bottom (CHANNEL.6 sharedness).
// The sentinel is sticky - one more reach from one more domain never lifts a core file back into that domain - where an empty chain array could not be, since an empty array is a prefix of everything.
const CORE = Symbol('core');

const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const isPrefix = (a, b) => a.length <= b.length && a.every((s, i) => s === b[i]);
const commonPrefix = (a, b) => {
  const out = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === b[i]) out.push(a[i]); else break; }
  return out;
};

// Two ownership readings of one file, reconciled:
// nested readings (one a prefix of the other) keep the deeper - a surface crossing states ownership, and a shallower reach into the same line does not dilute it;
// divergent readings collapse to what they share - a file two domains reach is more shared than either (CHANNEL.6), and sharing nothing is core.
const merge = (a, b) => {
  if (a === CORE || b === CORE) return CORE;
  if (isPrefix(a, b)) return b;
  if (isPrefix(b, a)) return a;
  const cp = commonPrefix(a, b);
  return cp.length ? cp : CORE;
};
const same = (a, b) => (a === CORE ? b === CORE : b !== CORE && a.length === b.length && isPrefix(a, b));

// Layer, unit name, and surface-ness come from the file's own name, so they hold wherever the file lives.
// A name that resolves to a layer is a layer file; under the horizontal slicing the layer rides a bare layer-named directory instead, and a plain-named file inside one is that row's citizen; a plain name under neither is a surface (a barrel or a named surface).
function nameRole(path) {
  const segs = String(path).split('/');
  const base = segs.pop();
  const hit = layerOf(stripExt(base));
  if (hit) return { layer: hit.layer, name: hit.name, via: hit.name === '' ? 'leaf' : 'suffix', surface: null, sub: [] };
  for (let i = 0; i < segs.length; i++) {
    const row = layerOf(segs[i]);
    if (row && row.name === '') {
      return { layer: row.layer, name: null, via: 'branch', surface: null, sub: [...segs.slice(i + 1), stripExt(base)] };
    }
  }
  return { layer: null, name: null, via: null, surface: stripExt(base) || 'index', sub: [] };
}

// What a relative reference may cross into: a barrel or named surface, or the runtime-composition surface in either spelling - the bare `services` file, or the services row's `index` - since a parent composing `./host/services` is entering host, and that crossing is what names the subdomain.
const isEntry = (path) => {
  const r = nameRole(path);
  if (r.surface != null) return true;
  if (r.layer !== 'services') return false;
  return r.name === '' || (r.via === 'branch' && r.sub[r.sub.length - 1] === 'index');
};

// The chain a relative reference hands its target: the importer's chain walked along the directory delta.
// A step up leaves the current subdomain, so it pops; a step down names a child only when the reference enters through a surface, since a directory by itself carries no boundary and a reach past the surface stays classified by its other, owning reaches (the deeper side of the merge).
// The child's name is the surface's own directory - one segment - because the directories travelled on the way are grouping, and the one the surface sits in is the one it names.
// The delta describes positions in the ownership tree, so a target outside it has no position to walk to: the reference carries no chain information and hands on the importer's chain, exactly as a chainless aliased specifier does.
function relativeChain(importerChain, importerDir, targetPath, ownershipDir) {
  if (importerChain === CORE) return CORE;
  if (!inArea(targetPath, ownershipDir ?? 'domains')) return importerChain;
  // The horizontal slicing's layer rows are rows of one subdomain, never subdomains, so a bare layer-named directory is transparent to the delta walk: stepping out of a row pops no ownership, and a surface inside a row names its subdomain by the directory above the row.
  const rowless = (segs) => segs.filter((s) => { const hit = layerOf(s); return !(hit && hit.name === ''); });
  const from = rowless(importerDir ? importerDir.split('/') : []);
  const to = rowless(dirOf(targetPath) ? dirOf(targetPath).split('/') : []);
  const shared = commonPrefix(from, to).length;
  const ups = from.length - shared;
  const downs = to.slice(shared);
  let chain = importerChain.slice(0, Math.max(0, importerChain.length - ups));
  if (downs.length && isEntry(targetPath)) chain = [...chain, downs[downs.length - 1]];
  return chain;
}

// The domain/subdomain chain for every file, walked outward from the composition roots.
// An aliased specifier names its chain absolutely; a relative one walks from the crossing file; a specifier carrying no chain information (a bare package alias, a non-domain app path) hands on the importer's own chain.
function inferChains(graph) {
  const { files, edges, options } = graph;
  const out = new Map();
  for (const e of edges) {
    if (e.to == null) continue;
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  const chainOf = new Map();
  // Which root's reach carried the file: a file whose chain stays empty is that root's own glue, and the key says whose bar it draws in; glue two roots reach at once is shared glue.
  const rootKeyOf = new Map();
  const roots = new Set(files.filter((f) => f.role.kind === 'composition-root').map((f) => f.id));
  const queue = [...roots];
  for (const id of roots) {
    chainOf.set(id, []);
    rootKeyOf.set(id, files[id].role.root ?? '(glue)');
  }
  let guard = 0;
  while (queue.length && guard++ < 200000) {
    const id = queue.shift();
    const chain = chainOf.get(id);
    const rootKey = rootKeyOf.get(id);
    for (const e of out.get(id) ?? []) {
      let child;
      if (e.kind === 'embeds') {
        // An `@elda-import:` directive ships its matches to another runtime as source (ROOT.5, serialization): shipping grants reach and attributes no ownership, so each match enters with its own tree claim rather than the host's chain.
        child = pathClaim(graph.files[e.to], options)?.chain ?? chain;
      } else if (isRelative(e.spec)) {
        child = relativeChain(chain, dirOf(files[id].path), files[e.to].path, options.ownershipDir);
      } else {
        const t = parseSpec(e.spec, options.ownershipAlias ?? '#');
        child = t ? t.chain : chain;
      }
      const prev = chainOf.get(e.to);
      const next = prev === undefined ? child : merge(prev, child);
      const prevKey = rootKeyOf.get(e.to);
      const nextKey = prevKey === undefined || prevKey === rootKey ? rootKey : '(shared)';
      if (prev === undefined || !same(prev, next) || prevKey !== nextKey) {
        chainOf.set(e.to, next);
        rootKeyOf.set(e.to, nextKey);
        if (!roots.has(e.to)) queue.push(e.to);
      }
    }
  }
  return { chainOf, rootKeyOf, roots };
}

// The path claim: what the tree's placement says the file is, where placement says anything.
// The tree claims a domain, a surface, or a core only where it encodes one; everywhere else placement is free organization, the claim is null, and a scattered app never meets this judge.
function pathClaim(file, options) {
  if (file.kind === 'asset') return null;
  const claim = fileRole('/' + file.path, options);
  return claim.kind === 'domain' || claim.kind === 'surface' || claim.kind === 'core' ? claim : null;
}

const sameChain = (a, b) => a.length === b.length && a.every((s, i) => s === b[i]);
// A core claim is compared at kind level only: the graph's core reading is the absorbing sentinel and carries no module chain, while the tree's names the module, and the two say the same thing.
const claimAgrees = (claim, graphRole) =>
  claim.kind === 'core' || graphRole.kind === 'core'
    ? claim.kind === graphRole.kind
    : claim.kind === graphRole.kind &&
      sameChain(claim.chain ?? [], graphRole.chain ?? []) &&
      (claim.layer ?? null) === (graphRole.layer ?? null) &&
      (claim.surface ?? null) === (graphRole.surface ?? null);

const describeClaim = (c) =>
  c.kind === 'core' ? 'pure core'
    : c.kind === 'surface' ? `a surface of '${c.chain.join('/')}'`
    : `a ${c.layer} file of '${c.chain.join('/')}'`;

// The dispute verdict, phrased per mismatch: what the tree says, what the imports say, and the remedy that fits, in words that stand without the documentation.
function disputeVerdict(claim, g, options) {
  const alias = options.ownershipAlias ?? '#';
  const claimed = describeClaim(claim);
  const claimChain = (claim.chain ?? []).join('/');
  const gChain = (g.chain ?? []).join('/');
  if (g.kind === 'composition-root') {
    return dishonestPlacement(
      claimed,
      `only the composition root '${g.root}' imports it, through a plain path that names no owner`,
      claim.kind === 'core'
        ? 'Move it beside the root, or let a domain import it: core only the root uses is the root\'s own utility.'
        : `Import it as '${alias}/${claimChain}/...' to keep it under '${claimChain}', publish it on a surface the root crosses, or move it beside the root.`,
    );
  }
  if (g.kind === 'core') {
    return dishonestPlacement(
      claimed,
      'domains with nothing else in common all import it',
      'That is pure core in fact: move the file below the domains, where every consumer can lean on it.',
    );
  }
  if (claim.kind === 'core') {
    return dishonestPlacement(
      claimed,
      `only '${gChain}' consumes it`,
      `Pure core is what every domain leans on, and a lone consumer owns its helpers: move it into '${gChain}' until a second domain needs it.`,
    );
  }
  if (claimChain === gChain) {
    return dishonestPlacement(claimed, `its name and its imports read it as ${describeClaim(g)}`, 'Rename the file so its name and the tree tell one story.');
  }
  return dishonestPlacement(
    claimed,
    `every import of it treats it as part of '${gChain}', and none names '${claimChain}'`,
    `Move it into '${gChain}', or let an import name '${claimChain}' as the owner: '${alias}/${claimChain}/...' says so in one spelling.`,
  );
}

// Two judges per file, reconciled: the graph reading (kind and chain from surface ownership, layer and surface from the name) and the tree's claim.
// Where they agree, or only one speaks, the file gets one confident role. Where both speak and disagree, the disagreement is the finding (the thesis: a claim the graph contradicts), and the role stays the CLAIM - every other rule then judges the tree the way its author reads it, so a dispute surfaces once instead of cascading through re-homed neighbours.
// A declared root keeps the role the scan gave it; a file whose chain stays empty is its reaching root's own glue (ROOT.2); a file nothing reaches keeps its claim, marked with why the graph is silent, and a claim-less unreached file is a true unknown.
// A pure-data file is vocabulary (SURFACE.6): it classifies as its chain's axioms and never as a surface, since a surface target passes every boundary rule and an asset must not ride that pass.
export function graphRoles(graph) {
  const { chainOf, rootKeyOf, roots } = inferChains(graph);
  const inbound = new Set();
  for (const e of graph.edges) if (e.to != null) inbound.add(e.to);
  const claims = new Map(graph.files.map((f) => [f.id, roots.has(f.id) ? null : pathClaim(f, graph.options ?? {})]));
  const coreClaimed = new Set(graph.files.filter((f) => claims.get(f.id)?.kind === 'core').map((f) => f.id));
  const out = new Map();

  // A core claim is adjudicated on core's own properties rather than on chains, because crossing into a declared core area names no domain: the folder is organization.
  // ROOT.6 first - pure core depends on no domain - and sharedness second: a helper that a single domain consumes belongs to that domain, and a helper with no domain consumers, or several, holds its claim.
  const coreVerdict = (f) => {
    const dep = graph.edges.find((e) => e.from === f.id && e.to != null && !coreClaimed.has(e.to) && (chainOf.get(e.to)?.length ?? 0) > 0);
    if (dep) {
      const depChain = chainOf.get(dep.to).join('/');
      return dishonestPlacement('pure core', `it imports '${depChain}'`, `Core depends on nothing: cut the import, or move the file into '${depChain}'.`);
    }
    const consumers = graph.edges
      .filter((e) => e.to === f.id && !coreClaimed.has(e.from) && (chainOf.get(e.from)?.length ?? 0) > 0)
      .map((e) => chainOf.get(e.from));
    if (!consumers.length) return null;
    // Roots compose core (the runtime's own arrow into Shared) and core composes itself, so a root-side or core-internal consumer is a witness against lone ownership: the lone-owner verdict is concluded only when every consumer sits inside the one domain.
    const witnessed = graph.edges.some((e) => {
      if (e.to !== f.id || e.from === f.id) return false;
      if (coreClaimed.has(e.from)) return true;
      const c = chainOf.get(e.from);
      return c === CORE || (c !== undefined && c.length === 0);
    });
    if (witnessed) return null;
    const common = consumers.reduce((a, b) => { const o = []; for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] === b[i]) o.push(a[i]); else break; } return o; });
    if (common.length === 0) return null;
    const owner = common.join('/');
    return dishonestPlacement('pure core', `only '${owner}' consumes it`, `Pure core is what every domain leans on, and a lone consumer owns its helpers: move it into '${owner}' until a second domain needs it.`);
  };

  for (const f of graph.files) {
    if (roots.has(f.id)) { out.set(f.id, { role: f.role, dispute: null, unreached: null }); continue; }
    const claim = claims.get(f.id);
    const chain = chainOf.get(f.id);
    let graphRole = null;
    if (chain === CORE) graphRole = { kind: 'core', chain: [], ...nameRole(f.path) };
    else if (chain !== undefined && chain.length === 0) graphRole = { kind: 'composition-root', chain: [], layer: null, surface: null, sub: [], root: rootKeyOf.get(f.id) ?? '(glue)' };
    else if (chain !== undefined && f.kind === 'asset') graphRole = { kind: 'domain', chain, layer: 'axioms', via: 'asset', surface: null, name: String(f.path).split('/').pop(), sub: [], asset: true };
    else if (chain !== undefined) {
      const nr = nameRole(f.path);
      graphRole = { kind: nr.surface ? 'surface' : 'domain', chain, ...nr };
    }
    if (graphRole == null) {
      const why = inbound.has(f.id) ? 'imported only by files nothing reaches' : 'nothing imports this file';
      out.set(f.id, { role: claim ?? { kind: 'other', chain: [], ...nameRole(f.path) }, dispute: null, unreached: why });
      continue;
    }
    // An agreed core file keeps the claim as its role, since only the tree names which core module it belongs to; everywhere else the graph reading is the richer of the two.
    if (claim == null || claimAgrees(claim, graphRole)) { out.set(f.id, { role: claim?.kind === 'core' ? claim : graphRole, dispute: null, unreached: null }); continue; }
    if (claim.kind === 'core' && graphRole.kind !== 'composition-root' && graphRole.kind !== 'core') {
      out.set(f.id, { role: claim, dispute: coreVerdict(f), unreached: null });
      continue;
    }
    out.set(f.id, { role: claim, dispute: disputeVerdict(claim, graphRole, graph.options ?? {}), unreached: null });
  }
  return out;
}
