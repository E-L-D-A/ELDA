// The ELDA path model: how a file path classifies into domain, subdomain chain, and layer, and what verdict a reference between two classified points earns.
// The lint rules (index.js) and the dependency visualizer (visualize.js) both read this module, so the linter and the diagram judge every edge identically.
// Everything here is pure: strings in, plain objects out, no lint-host or filesystem coupling.

// The layer vocabulary, in rank order; the rank map and the suffix test derive from it.
export const LAYERS = ['entities', 'use-cases', 'adapters', 'services'];
export const LAYER_RANK = Object.fromEntries(LAYERS.map((l, i) => [l, i]));
export const LAYER_SUFFIX_RE = new RegExp(`\\.(${LAYERS.join('|')})$`);

export const norm = (p) => String(p ?? '').replace(/\\/g, '/');

// After the real extension, a file name may carry markers the classification sees through: runtime-context markers (`auth.services.server.ts` is server-only) and build-convention compounds (`grid-vars.services.css.ts` is a vanilla-extract module).
// A marker is a coloring, orthogonal to the layer axis.
// This list is the marker vocabulary.
const MARKERS = ['server', 'client', 'css'];
const MARKER_RE = new RegExp(`\\.(${MARKERS.join('|')})$`);
export const stripExt = (name) => {
  let n = name.replace(/\.d\.ts$/, '').replace(/\.(tsx?|jsx?|mjs|cjs|css|scss|sass|less)$/, '');
  while (MARKER_RE.test(n)) n = n.replace(MARKER_RE, '');
  return n;
};

// Classify a path inside domains/ into its subdomain chain and its layer.
// Directories express concerns: a plain-named directory is a nested subdomain (SURFACE.7); a layer-suffixed directory (`back-nav.adapters/`) and a bare layer-named directory are the two legacy layouts (recognized here, flagged by no-layer-branches per LAYER.7).
// Layer membership otherwise rides the file name: the bare reserved names, or a `<name>.<layer>` suffix.
// A trailing plain name is a surface: `index` the consumable barrel, `services` (a layer name, caught above) the runtime-composition surface, any other name a named surface.
export function classify(segs) {
  const chain = [];
  let layer = null;
  let via = null;
  const sub = [];
  let surface = null;
  let name = null;
  let branchDir = false;
  for (let i = 0; i < segs.length; i++) {
    const last = i === segs.length - 1;
    const seg = last ? stripExt(segs[i]) : segs[i];
    if (layer) { sub.push(seg); continue; }
    if (LAYERS.includes(seg)) {
      layer = seg;
      via = last ? 'leaf' : 'branch';
      if (!last) branchDir = true;
      continue;
    }
    const sfx = seg.match(LAYER_SUFFIX_RE);
    if (sfx) {
      layer = sfx[1];
      via = last ? 'suffix' : 'unit-dir';
      // A suffixed file's own name states its part; files sharing a name are one unit (SURFACE.5).
      if (last) name = seg.slice(0, -sfx[0].length);
      else sub.push(seg);
      continue;
    }
    if (last) surface = seg;
    else chain.push(seg);
  }
  return { chain, layer, via, sub, surface, name, branchDir, segs };
}

// Where does the current file sit in the ELDA structure?
export function fileRole(filename, compositionRoot) {
  const m = filename.match(/\/domains\/(.+)$/);
  if (m) {
    const c = classify(m[1].split('/').filter(Boolean));
    if (c.layer && c.chain.length > 0) return { kind: 'domain', ...c };
    if (c.surface && c.chain.length > 0) return { kind: 'surface', ...c };
    return { kind: 'other' };
  }
  if (new RegExp(`/${compositionRoot}/`).test(filename)) return { kind: 'composition-root' };
  if (/\/core\//.test(filename)) return { kind: 'core' };
  return { kind: 'other' };
}

// Parse a `#/...` or `@/domains/...` import specifier, or null for anything else (bare packages, `@/core`, ...).
// A single-segment specifier is the domain's consumable barrel.
export function parseSpec(spec, domainAlias, appAlias) {
  if (typeof spec !== 'string') return null;
  let rest = null;
  if (spec.startsWith(domainAlias + '/')) rest = spec.slice(domainAlias.length + 1);
  else if (spec.startsWith(appAlias + '/domains/')) rest = spec.slice((appAlias + '/domains/').length);
  if (rest == null) return null;
  const segs = rest.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  return finishTarget(classify(segs));
}

// Resolve a relative import against the importing file's path, so the layer and boundary rules apply to relative imports too.
// Returns null when it resolves outside domains/.
export function posixResolve(dir, spec) {
  const out = [];
  for (const p of (dir + '/' + spec).split('/')) {
    if (p === '' || p === '.') continue;
    else if (p === '..') out.pop();
    else out.push(p);
  }
  return '/' + out.join('/');
}

export function relativeTarget(filename, spec) {
  if (typeof spec !== 'string' || !(spec.startsWith('./') || spec.startsWith('../'))) return null;
  const resolved = posixResolve(filename.slice(0, filename.lastIndexOf('/')), spec);
  const m = resolved.match(/\/domains\/(.+)$/);
  if (!m) return null;
  const segs = m[1].split('/').filter(Boolean);
  if (segs.length === 0) return null;
  return finishTarget(classify(segs));
}

function finishTarget(t) {
  // A bare `#/x` is x's consumable barrel: with no chain, the surface name is the domain itself, so read it as chain `x`, surface `index`.
  if (t.chain.length === 0 && t.surface && !t.layer) return { ...t, chain: [t.surface], surface: 'index' };
  return t;
}

// Pure-data assets (images, fonts, media) carry no behaviour; importing one yields a value.
// That is vocabulary, classified as `entities` (SURFACE.6): importable from any layer inside the owning domain's tree, surface-gated across boundaries.
// CSS is deliberately excluded: it is code, and classifies by its layer and unit like any module.
export const DATA_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)(\?.*)?$/i;

export function targetOf(filename, spec, domainAlias, appAlias) {
  const t = parseSpec(spec, domainAlias, appAlias) ?? relativeTarget(filename, spec);
  if (t && typeof spec === 'string' && DATA_RE.test(spec)) return { ...t, layer: 'entities', via: 'leaf', asset: true };
  return t;
}

// Relationship between the importer's subdomain chain and the target's: the shared prefix decides whether the reference stays inside one subdomain, descends into an owned child, climbs toward an ancestor, or crosses to a peer at the divergence point.
export function rel(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p === a.length && p === b.length) return { p, kind: 'same' };
  if (p === a.length) return { p, kind: 'into-child' };
  if (p === b.length) return { p, kind: 'to-ancestor' };
  return { p, kind: 'peer' };
}

// A services target in surface form is the runtime-composition surface itself (`x/services` with nothing after it), the thing a composer reaches; anything past it is internals.
export const isServicesSurface = (t) => t.layer === 'services' && t.sub.length === 0;

// The hard, decidable layer + boundary invariants (Tier 1), judged for one reading of one reference:
//   LAYER.1    an inner layer never imports an outer one (alias and relative paths alike);
//   ROOT.6     pure core depends on nothing in any domain;
//   ROOT.1     composition roots compose top-level domains through their surfaces only;
//   ROOT.7     each domain composes its direct children only, and a subdomain never references its parent;
//   SURFACE.2  a consumable surface carries use-cases and vocabulary, never services or adapters;
//   SURFACE.3  a cross-boundary reference goes through a surface, never into a layer's internals, and a surface never re-bundles a peer or foreign domain's surface;
//   SURFACE.7  a nested subdomain is internal to its parent: outside it, only the parent's published surfaces exist.
// Returns a violation message for this reading of the target, or null when legal.
export function judgeImport(role, t, domainAlias) {
  if (role.kind === 'core') return 'ELDA ROOT.6: pure core depends on nothing in any domain.';

  if (role.kind === 'composition-root') {
    if (t.chain.length > 1) return `ELDA ROOT.1 / SURFACE.7: composition roots compose top-level domains; '${t.chain.join('/')}' is internal to '${t.chain[0]}', composed by its parent.`;
    if (t.layer && t.layer !== 'services') return `ELDA ROOT.1: composition roots consume a domain's published surfaces (its barrel, a named surface, or services), never its ${t.layer} layer.`;
    return null;
  }

  const r = rel(role.chain, t.chain);

  if (role.kind === 'surface') {
    // A surface curates its own subdomain and its owned children (SURFACE.7); republishing a peer or foreign domain re-bundles that domain's surface (SURFACE.3).
    // A consumable surface carries use-cases and vocabulary only; services and adapters belong to the runtime-composition surface, which the `services` file realizes and may reference freely.
    if (r.kind === 'peer' || r.kind === 'to-ancestor') {
      return `ELDA SURFACE.3: a domain's surface must not re-bundle a peer or foreign domain's surface (${domainAlias}/${t.chain.join('/')}); reference foreign vocabulary at the point of use, not by republishing it.`;
    }
    if (r.kind === 'into-child' && t.chain.length > role.chain.length + 1) {
      return `ELDA SURFACE.7 / ROOT.7: curate the direct child '${t.chain[role.chain.length]}'; '${t.chain.join('/')}' is internal to it.`;
    }
    if (role.surface !== 'services' && (t.layer === 'services' || t.layer === 'adapters')) {
      return `ELDA SURFACE.2: the consumable surface carries use-cases + vocabulary; '${t.layer}' belongs to the runtime-composition surface (${domainAlias}/${role.chain.join('/')}/services), reached only by its composer.`;
    }
    return null;
  }

  // role.kind === 'domain'
  if (r.kind === 'same') {
    if (t.layer && LAYER_RANK[t.layer] > LAYER_RANK[role.layer]) {
      return `ELDA LAYER.1: ${role.layer} (inner) must not import the outer layer ${t.layer}.`;
    }
    return null;
  }

  if (r.kind === 'into-child') {
    if (t.asset) return null;
    const child = t.chain.slice(0, role.chain.length + 1).join('/');
    if (t.chain.length > role.chain.length + 1) {
      return `ELDA ROOT.7: '${role.chain.join('/')}' composes its direct children only; '${t.chain.join('/')}' is composed by its own parent.`;
    }
    if (t.surface) return null;
    if (t.layer === 'services') {
      if (!isServicesSurface(t)) return `ELDA SURFACE.3: '${child}' is composed at its runtime-composition surface, never past it.`;
      if (role.layer !== 'services') return `ELDA ROOT.7: composing the subdomain '${child}' is services work; ${role.layer} consumes it through its surface.`;
      return null;
    }
    return `ELDA SURFACE.3: consume the subdomain '${child}' through its surface, never its ${t.layer} files.`;
  }

  if (r.kind === 'to-ancestor') {
    return `ELDA ROOT.7: a subdomain never references its parent ('${t.chain.join('/') || t.chain[0] || ''}'); shared content extracts into a sibling subdomain.`;
  }

  // r.kind === 'peer'
  const sib = t.chain.slice(0, r.p + 1).join('/');
  if (t.chain.length > r.p + 1) {
    return `ELDA SURFACE.7: reference '${sib}' through its surface; '${t.chain.join('/')}' is internal to it.`;
  }
  if (t.surface || (!t.layer && !t.surface)) return null;
  if (t.layer === 'services' && isServicesSurface(t) && role.layer === 'services') {
    // The graded OWNER.5 mounting, reported by no-service-coupling at warn instead of here.
    return null;
  }
  return `ELDA SURFACE.3: reference '${sib}' through a public surface (${domainAlias}/${sib}, or a named surface entry), never its ${t.layer} layer.`;
}

// The full verdict for one reference: judge the direct reading, and where a trailing plain segment is ambiguous between a named surface and a nested subdomain's barrel, accept the reference when either reading is legal, so the ambiguity never false-positives.
export function importVerdict(role, t, domainAlias) {
  const verdictA = judgeImport(role, t, domainAlias);
  if (verdictA === null) return null;
  if (t.surface && t.surface !== 'index' && !t.layer) {
    const b = { ...t, chain: [...t.chain, t.surface], surface: 'index' };
    if (judgeImport(role, b, domainAlias) === null) return null;
  }
  return verdictA;
}

// OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows): lateral coupling between two units of the same outer layer bypasses the use-case crossing where cross-unit flow belongs.
// A unit is one concern-part (SURFACE.5, the spec's "Units"): the files sharing one name at a subdomain's root, or the contents of one legacy unit directory.
// Same name or same directory means one unit and co-located imports are free; the label is the file's own name, or the directory path.
export const unitOf = (c) => {
  if (c.via === 'branch') return [c.layer, ...c.sub.slice(0, -1)].join('/');
  if (c.via === 'unit-dir') return c.sub.slice(0, -1).join('/');
  if (c.via === 'suffix') return c.name ?? '';
  // A bare reserved-name file is the subdomain's own layer aggregate.
  return '';
};

// The subdomain's own composer is exempt from the in-subdomain cross-unit smell: the bare `services` file (and the legacy `services/index` barrel) realizes the runtime-composition surface, and composing owned parts re-owns nothing.
// Its peer mountings still grade.
export const isComposer = (role) => role.via === 'leaf'
  || (role.via === 'branch' && role.sub.length === 1 && role.sub[0] === 'index');

// The remedy each lateral smell names, and whether the grading extends across peers: a service unit mounting a peer's block at its runtime-composition surface is OWNER.5's unified-composition case, exempted from the hard surface rule and graded here instead.
export const LATERAL = {
  services: { remedy: 'supply it as a named port from the composition root, or lift the shared logic into a use-case.', crossSurface: true },
  adapters: { remedy: 'let the layer above compose the two bindings, or co-locate them into one unit.', crossSurface: false },
};

// The lateral-coupling verdict for one reference at one outer layer, or null when the reference does not smell.
export function lateralVerdict(role, t, layer, { remedy, crossSurface } = LATERAL[layer]) {
  if (role.layer !== layer || role.chain.length === 0) return null;
  if (!t || t.layer !== layer || t.asset) return null;
  const importerUnit = unitOf(role);
  const r = rel(role.chain, t.chain);
  if (r.kind === 'into-child') {
    // ROOT.7 self-composition is the composer's license, not every parent-level unit's.
    // A named unit reaching into an owned child mounts its surface the way a peer mount does, and wants a port from the composer.
    if (isComposer(role)) return null;
    if (crossSurface && t.chain.length === r.p + 1 && isServicesSurface(t)) {
      return `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit || role.chain.join('/')}' mounts its child '${t.chain.join('/')}' at its runtime-composition surface; prefer a named slot port its composer fills, and justify the mounting where the port becomes ceremony.`;
    }
    return null;
  }
  if (r.kind === 'to-ancestor') return null; // The hard breach; the imports verdict reports it.
  if (r.kind === 'peer') {
    if (crossSurface && t.chain.length === r.p + 1 && isServicesSurface(t)) {
      return `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit || role.chain.join('/')}' mounts peer '${t.chain.join('/')}' at its runtime-composition surface; prefer a named slot port its composer fills, and justify the mounting where the port becomes ceremony.`;
    }
    return null;
  }
  if (isComposer(role)) return null; // Composition by the subdomain's own composer.
  const targetUnit = unitOf(t);
  if (targetUnit === importerUnit) return null; // Same unit composing itself.
  return `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit || '(subdomain root)'}' reaches a different ${layer} unit '${targetUnit || '(subdomain root)'}' in '${role.chain.join('/')}'; ${remedy}`;
}

// The diagonal verdict - SURFACE.5's geometry inside one subdomain: a value reference between two named units crosses at its own rank only, and the bare layer files are the subdomain's shared base outside any name.
// A value reach from one named unit into a lower layer of another unit crosses a name and a rank at once, an arrow no row of the diagram draws - and it is how a misnamed unit hides: the name claims a column the dataflow contradicts.
// The bare `services` composer is exempt (composing owned parts re-owns nothing); a bare-file target is the shared base, so reading it is vertical; assets are vocabulary from any layer (SURFACE.6); type-only edges are vocabulary references, filtered at the visitor.
export function diagonalVerdict(role, t) {
  if (role.kind !== 'domain') return null;
  if (!t || !t.layer || t.surface || t.asset) return null;
  if (LAYER_RANK[t.layer] >= LAYER_RANK[role.layer]) return null;
  if (rel(role.chain, t.chain).kind !== 'same') return null;
  if (role.layer === 'services' && isComposer(role)) return null;
  const importerUnit = unitOf(role);
  const targetUnit = unitOf(t);
  if (targetUnit === '' || targetUnit === importerUnit) return null;
  const from = importerUnit ? `unit '${importerUnit}' (${role.layer})` : `the subdomain's bare ${role.layer} file`;
  return `ELDA SURFACE.5: ${from} takes a value from '${targetUnit}' at ${t.layer} - a diagonal reach across both name and rank. Rename the target into the consuming unit if it alone consumes it, promote it to the subdomain's bare ${t.layer} file if the subdomain shares it, or cross at equal rank through this unit's own ${t.layer} row.`;
}

// The landed-flow verdict - the diagonal generalized across boundaries, judged on where a value actually lands once conduits are followed.
// The Layers diagram draws every cross-boundary arrow at equal rank: B-Logic to B-Logic, rules to rules, the outer rows' red laterals; a landed value flow below the consumer's own rank across any name - a sibling unit, a child subdomain, a peer, a foreign domain - is a diagonal no row of the diagram draws.
// Within one subdomain the direct form is the per-file rule's territory (diagonalVerdict above); this generalization belongs to the graph pass, where the reference hides behind a surface or a re-export chain and only the landing reveals the shape.
export function landedVerdict(role, t) {
  if (role.kind !== 'domain') return null;
  if (!t || !t.layer || t.surface || t.asset) return null;
  if (LAYER_RANK[t.layer] >= LAYER_RANK[role.layer]) return null;
  const r = rel(role.chain, t.chain);
  if (r.kind === 'same') return diagonalVerdict(role, t);
  if (r.kind === 'to-ancestor') return null; // The hard breach; the boundary verdicts report it on the authored edge.
  const importerUnit = unitOf(role);
  const from = importerUnit ? `unit '${importerUnit}' (${role.layer})` : `the bare ${role.layer} file of '${role.chain.join('/')}'`;
  const where = r.kind === 'into-child' ? `its child '${t.chain.join('/')}'` : `'${t.chain.join('/')}'`;
  return `ELDA SURFACE.5 (landed): ${from} takes a value landing in ${where} at ${t.layer}, below its own rank - a diagonal no row of the diagram draws. Cross at equal rank: reference it from this unit's own ${t.layer} row, and let its own column climb.`;
}

// The diagonal's distance class - how wide a boundary the landed flow crosses: within one subdomain, across subdomains of one domain, or across domains.
// Severity grows with the width, and a lint level binds per rule, so each class reports through its own rule and the presets map the gradient onto the levels.
export function diagonalScope(role, t) {
  const r = rel(role.chain, t.chain);
  if (r.kind === 'same') return 'within-subdomain';
  if (r.kind === 'peer' && r.p === 0) return 'across-domains';
  return 'across-subdomains';
}
