// The ELDA path model: how a file path classifies into domain, subdomain chain, and layer, and what verdict a reference between two classified points earns.
// The lint rules (index.js) and the dependency visualizer (visualize.js) both read this module, so the linter and the diagram judge every edge identically.
// Everything here is pure: strings in, plain objects out, no lint-host or filesystem coupling.

// The layer vocabulary, in rank order; the rank map and the name reading (layerOf, below) both derive from it.
export const LAYERS = ['entities', 'use-cases', 'adapters', 'services'];
export const LAYER_RANK = Object.fromEntries(LAYERS.map((l, i) => [l, i]));

export const norm = (p) => String(p ?? '').replace(/\\/g, '/');

// The code extensions: modules, and stylesheets, which are code and classify by their layer and unit like any module (SURFACE.6).
// A real extension names a file's type rather than a concern, so unlike the marker list this one is genuinely closed, and it strips first.
export const CODE_EXT_RE = /(\.d\.ts|\.[cm]?[tj]sx?|\.(?:css|scss|sass|less))$/i;
export const stripExt = (name) => String(name ?? '').replace(CODE_EXT_RE, '');

// A relative specifier. The bare dot forms name a directory's barrel and every resolver honours them, so `import { x } from '.'` is the canonical self-barrel import.
// Testing only the './' and '../' prefixes drops them, and the drop fails open: the specifier resolves nowhere, so the reference carries no target and every rule that reads one goes quiet on it.
export const isRelative = (spec) =>
  typeof spec === 'string' && (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../'));

// A specifier shaped like in-tree code is ELDA's business; a bare package name sits outside its jurisdiction and stays exempt.
export const inTreeSpec = (spec, domainAlias, appAlias) =>
  isRelative(spec) ||
  (typeof spec === 'string' && (spec.startsWith(domainAlias + '/') || spec.startsWith(appAlias + '/')));

// A reference the analyzers cannot resolve to a file. The target is unknown, so no invariant can be read on it at all.
// Staying quiet here fails open in the worst available direction, because the shape-only fallback reads a dangling `./x` as a reference INSIDE the importer's own subdomain, which is the most permissive reading there is: move a file into a new directory and leave its imports behind, and every reach it makes turns into a same-subdomain read that nothing objects to.
// So the undecidable reach reports, citing the invariants the reading role would otherwise have been judged against.
export function unjudgedVerdict(role, spec, why) {
  const cites = role.kind === 'composition-root' ? 'ROOT.1'
    : role.kind === 'core' ? 'ROOT.6'
    : 'LAYER.1 / SURFACE.3';
  return `ELDA ${cites} (unjudged): '${spec}' ${why}, so the file it names, and with it the layer and owner this reference carries, cannot be read - and no invariant can be checked on it. A reach that cannot be judged cannot be permitted: give it a specifier that resolves.`;
}

// A file name reads RIGHT TO LEFT - `<name>.<layer>.<marker>...` - and the layer is the rightmost dot-segment that names a layer.
// Everything left of it is the unit's name, and an empty name is the subdomain's own bare layer file; everything right of it is markers.
// A marker is a coloring orthogonal to the layer axis: a runtime context (`.server`), a build convention (`.css` for a vanilla-extract module), a tooling suffix (`.stories`, `.spec`). There may be any number of them, under any name, and the model does not enumerate them.
// It must not enumerate them, because an enumerated list fails OPEN: a marker the list has not been told about leaves the layer unmatched, silently demotes a layer file to a rankless surface, and takes every layer rule off it.
// Reading right to left is also what keeps `services.adapters.css.ts` decidable - the unit is `services`, the layer is `adapters`, `.css` is a marker - where a left-to-right read would take `services` for the layer and lose the file.
export const layerOf = (stripped) => {
  const parts = String(stripped ?? '').split('.');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (LAYERS.includes(parts[i])) return { layer: parts[i], name: parts.slice(0, i).join('.') };
  }
  return null;
};

// Classify a path inside domains/ into its subdomain chain and its layer.
// Directories express concerns: a plain-named directory is a nested subdomain (SURFACE.7); a layer-suffixed directory (`back-nav.adapters/`) and a bare layer-named directory are the two legacy layouts (recognized here, flagged by no-layer-branches per LAYER.7).
// Layer membership otherwise rides the file name: the bare reserved names, or a `<name>.<layer>` suffix.
// A trailing plain name is a surface: `index` the consumable barrel, `services` (a layer name, caught above) the runtime-composition surface, any other name a named surface.
export function classify(segs) {
  // A directory that merely repeats the name of the unit inside it is a grouping node for that unit, and LAYER.7 puts units beside subdomains as the concerns a grouping node may express.
  // It is transparent: it carries no chain segment, so its files stay units of the enclosing subdomain and read the subdomain's shared base like any other unit. Grouping files to rest the eye costs nothing, and only declaring a boundary costs what a boundary costs.
  // The collapse is decidable from the path alone, because the file states its own unit and the directory qualifies only by repeating it. That repetition is what buys the transparency: a transparent node contributes nothing, so the file must carry its whole identity.
  // Which is also why the bare form is not available here. `x/entities.ts` already means the shared base of the subdomain `x`, and a folder holding only bare layer files IS the minimal subdomain; letting it also mean "the unit x's entities" would collide two readings with nothing in the file to separate them.
  // The first segment is the top-level domain and is never a grouping node: a domain names a concern by being one, so `locale/locale.services.ts` is the `locale` unit OF the domain `locale`, however redundant that reads.
  // Collapsing it would leave the file with no chain at all, which classifies as unrelated to the structure - and a file no rule can place is a file no rule enforces.
  const leafHit = segs.length ? layerOf(stripExt(segs[segs.length - 1])) : null;
  const unitName = leafHit ? leafHit.name : '';
  const unitDirAt =
    unitName !== '' && segs.length > 2 && segs[segs.length - 2] === unitName
      ? segs.length - 2
      : -1;

  const chain = [];
  let layer = null;
  let via = null;
  const sub = [];
  let surface = null;
  let name = null;
  let branchDir = false;
  for (let i = 0; i < segs.length; i++) {
    if (i === unitDirAt) continue;
    const last = i === segs.length - 1;
    const seg = last ? stripExt(segs[i]) : segs[i];
    if (layer) { sub.push(seg); continue; }
    const hit = layerOf(seg);
    if (hit) {
      layer = hit.layer;
      if (hit.name === '') {
        // A bare reserved name, markers and all (`services.ts`, `services.server.ts`): the subdomain's own layer aggregate, or - as a directory - the legacy layer bucket.
        via = last ? 'leaf' : 'branch';
        if (!last) branchDir = true;
      } else {
        // A suffixed file's own name states its part; files sharing a name are one unit (SURFACE.5).
        via = last ? 'suffix' : 'unit-dir';
        if (last) name = hit.name;
        else sub.push(seg);
      }
      continue;
    }
    if (last) surface = seg;
    else chain.push(seg);
  }
  return { chain, layer, via, sub, surface, name, branchDir, segs, unitDir: unitDirAt >= 0 };
}

// Whether a file directly inside a directory belongs to the unit that directory would be a grouping node for: its own unit name is the directory's.
// Anything else there declares a concern, and a directory that declares a concern is a subdomain rather than a grouping node.
export const belongsToUnitDir = (fileName, dir) => {
  const hit = layerOf(stripExt(fileName));
  return !!hit && hit.name !== '' && hit.name === dir;
};

// Where does the current file sit in the ELDA structure?
// A path-area test anchored on whole segments, so 'routes' matches '/routes/' and never '/my-routes-helper/'.
// An area names a directory holding the file, or the file itself: an app composes at several entries and one of them is routinely a single module, since a build config is a composition root that lives as one file at the app root.
// A directory-only test cannot name that root, and a root the test cannot see is a root no rule is ever read on: the file classifies as unrelated to the structure, every rule declines it, and the tree reports clean while the root reaches wherever it likes.
// An area is also a list, because an app composes at several entries and may hold more than one dependency-free core.
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const inArea = (filename, areas) =>
  (Array.isArray(areas) ? areas : [areas]).some((a) => a && new RegExp(`(^|/)${escapeRe(a)}(/|$)`).test(filename));

// Naming a core buys no enforcement. ROOT.6 ("pure core is dependency-free; arrows point from domains into core, never back") is a property, not a place:
// a module that references no domain satisfies it wherever it lives, and one that references a domain is either a domain, a declared root, or a conduit laundering the reach - which is what the unclassified-file reading reports.
// So the area is declared only to tell the informer which box to draw, and an app may hold any number of cores, or none.
export function fileRole(filename, compositionRoot, core = 'core') {
  const m = filename.match(/\/domains\/(.+)$/);
  if (m) {
    const c = classify(m[1].split('/').filter(Boolean));
    if (c.layer && c.chain.length > 0) return { kind: 'domain', ...c };
    if (c.surface && c.chain.length > 0) return { kind: 'surface', ...c };
    return { kind: 'other' };
  }
  if (inArea(filename, compositionRoot)) return { kind: 'composition-root' };
  if (inArea(filename, core)) return { kind: 'core' };
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
  if (!isRelative(spec)) return null;
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

// Pure-data files (images, fonts, media, JSON, anything that is not code) carry no behaviour; importing one yields a value.
// That is vocabulary, classified as `entities` (SURFACE.6): importable from any layer inside the owning domain's tree, and surface-gated across boundaries.
// Data is read as the COMPLEMENT of code, and never as a list of its own. A list fails open on the first extension it has not been told about: the file classifies as a rankless named surface instead, its cross-boundary reach stops being surface-gated because a surface target passes, and reading it from inside its own domain reports as a self-surface import.
// The test needs a resolved path, where the trailing extension is always there to read. A specifier normally omits it (`./cart.use-cases`), so the complement cannot be read on one, and the specifier path keeps the media list below as its degraded fallback - reached only when the file does not resolve, where nothing else is decidable either.
export const isDataPath = (p) => {
  const s = String(p ?? '').split('?')[0];
  return /\.[^./\\]+$/.test(s) && !CODE_EXT_RE.test(s);
};
export const DATA_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|json|jsonc|txt|csv|md|wasm|graphql|gql|ya?ml|toml)(\?.*)?$/i;

// Vocabulary carries a rank and no surface: a data file classifies as its subdomain's Entities, and it is not a named surface of the subdomain just because its name is plain.
// Leaving `surface` set is what let a cross-domain asset reach pass, since every boundary rule reads a surface target as a legal way in.
const asData = (t) => ({ ...t, layer: 'entities', via: 'leaf', surface: null, asset: true });

export function targetOf(filename, spec, domainAlias, appAlias) {
  const t = parseSpec(spec, domainAlias, appAlias) ?? relativeTarget(filename, spec);
  if (t && typeof spec === 'string' && DATA_RE.test(spec)) return asData(t);
  return t;
}

// Classify a reference target from the path the specifier actually resolved to, rather than from the specifier's own shape.
// A specifier's trailing plain segment is ambiguous - `#/checkout/payment` is either a named surface of `checkout` or the `payment` subdomain's barrel - and only the filesystem knows which, so a caller that can resolve reads the target here and judges it once.
// The caller supplies the resolution (model.js touches no filesystem); a path that lands outside `domains/`, or directly in it with no domain to belong to, carries no target and returns null.
export function targetOfPath(absPath) {
  const m = norm(absPath).match(/\/domains\/(.+)$/);
  if (!m) return null;
  const t = classify(m[1].split('/').filter(Boolean));
  if (t.chain.length === 0) return null;
  return isDataPath(absPath) ? asData(t) : t;
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

// A services target in surface form is the runtime-composition surface itself, the thing a composer reaches; anything past it is internals.
// The leaf layout spells it `x/services`, and the legacy layer-directory layout spells the same surface `x/services/index`. Both are the surface: the analyzers read the legacy layout correctly by promise (no-layer-branches flags the layout, and no rule misjudges it), so reading only the leaf spelling turns a graded OWNER.5 mounting into a hard boundary breach on a tree that has not migrated yet.
export const isServicesSurface = (t) => t.layer === 'services'
  && (t.sub.length === 0 || (t.via === 'branch' && t.sub.length === 1 && t.sub[0] === 'index'));

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
    return `ELDA ROOT.7: a subdomain never references its parent ('${t.chain.join('/') || t.chain[0] || ''}'); either unwrap the subdomain or extract its shared content into a sibling subdomain.`;
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

// The full verdict for one reference.
// A target read from a resolved path (targetOfPath) is a fact, so it is judged once and the verdict stands.
// A target read from the specifier alone carries the trailing-segment ambiguity - a named surface of the chain, or a nested subdomain's barrel - so both readings are tried and the reference is accepted when either is legal, and the ambiguity never manufactures a finding.
// The tolerant reading is the fallback a caller reaches when it cannot resolve at all, which happens for a specifier that names no file; a caller with a filesystem resolves first and never pays the tolerance.
export function importVerdict(role, t, domainAlias, resolved = false) {
  const verdictA = judgeImport(role, t, domainAlias);
  if (verdictA === null) return null;
  if (!resolved && t.surface && t.surface !== 'index' && !t.layer) {
    const b = { ...t, chain: [...t.chain, t.surface], surface: 'index' };
    if (judgeImport(role, b, domainAlias) === null) return null;
  }
  return verdictA;
}

// A surface is what a domain shows its consumers (SURFACE.3 binds "Consumers"), and a domain is not a consumer of itself.
// Read from inside, the surface is a hop that houses no decision (META.5), and it houses no rank either: a binding taken through it arrives with no layer at all.
// That blinds LAYER.1 outright, and the blinding is one-directional in the dangerous direction - the consumable surface legally carries use-cases (SURFACE.2), so an entities or use-cases file can take an outer-layer binding straight through its own barrel and no per-file rule sees the inversion.
// The landing walk does not cover it either: it grades value flows landing BELOW the consumer's rank (the diagonals), and a LAYER.1 inversion lands above.
// A self-reference is also a module cycle by construction, and the cycle audit (CHANNEL.5) is a scheduled review rather than a gate.
// Only the rankless surfaces are the rule's business; the runtime-composition surface is a layer file that holds rank, so a sibling reaching it is a lateral the OWNER.5 rules already grade.
export function selfSurfaceVerdict(role, t) {
  if (role.kind !== 'domain' && role.kind !== 'surface') return null;
  if (!t || t.asset || t.layer || !t.surface) return null;
  if (rel(role.chain, t.chain).kind !== 'same') return null;
  const own = role.chain.join('/');
  const face = t.surface === 'index' ? 'its own barrel' : `its own named surface '${t.surface}'`;
  return `ELDA LAYER.1 / SURFACE.3: a surface is a domain's face to its consumers, and '${own}' is not a consumer of itself; this reference takes ${face} from inside. A surface holds no rank, so the binding arrives carrying no layer and LAYER.1 cannot be read on this reference at all: an inner layer reaches an outer one straight through the surface and no per-file rule sees it. Import the file that owns the binding.`;
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

// The composition root's reach, judged on landings: ROOT.1 read the way SURFACE.5 taught us to read the diagonals.
// A root wires services - it instantiates them, injects their ports, and mounts them - and consuming behavior is a service's own work.
// So a binding the root takes that lands off the services row marks a service smashed into the root: the twin, one rank out, of a service reaching a foreign use-case.
// The per-specifier reading cannot see it, because a barrel carries no layer of its own; the reach launders through the barrel and only the landing tells the truth.
export function rootLandedVerdict(role, t) {
  if (role.kind !== 'composition-root') return null;
  if (!t || !t.layer || t.surface || t.asset) return null;
  if (t.layer === 'services') return null;
  return `ELDA ROOT.1 (landed): a composition root wires services; this binding lands on '${t.chain.join('/')}' at ${t.layer}. Consuming ${t.layer} is a service's own work, so the reach marks a service smashed into the root: extract that service, publish it on the domain's runtime-composition surface, and mount it.`;
}

// SURFACE.2 read on the runtime-composition surface: the mirror of the clause it already states for the consumable one.
// A services file may IMPORT any inner layer to wire it, since composing owned parts re-owns nothing; what it RE-EXPORTS is the service contract its composition root consumes.
// A use-case does not become a service by transiting a services file, so publication is judged at the seam where the decision was made, and not once per consuming root.
// Enforcing it also makes the walk's terminus sound: a name published on a services surface is either declared there or forwarded from another services file, so by induction its owner is a services file.
export function publishVerdict(role, t) {
  if (role.kind !== 'domain' || role.layer !== 'services') return null;
  if (!t || t.asset) return null; // A bare package is outside ELDA's jurisdiction; an asset is vocabulary from any layer (SURFACE.6).
  if (t.layer === 'services') return null;
  const what = t.layer
    ? `the ${t.layer} layer of '${t.chain.join('/')}'`
    : `the consumable surface '${[...t.chain, t.surface].filter(Boolean).join('/')}'`;
  return `ELDA SURFACE.2 (published): the runtime-composition surface publishes the domain's services to its composition root, and this re-export forwards ${what} onto it instead. A use-case does not become a service by transiting a services file: consume it here and declare the service that owns it, or publish it on the consumable surface where it belongs.`;
}

// The diagonal's boundary class - whose contract the landed flow crossed: no surface at all (two units of one subdomain), a surface the domain itself declared, or a foreign domain's surface.
// It is the shared-prefix question rel() already answers, so it reads the same at every nesting depth: an owner nine levels down is the same owner as one level down, and a foreign domain is foreign at every depth.
// Severity grows with the ownership regime and never with distance. The levels between a deep importer and its target are the importer's own ancestors rather than conduits on the edge, so counting them would grade a file for where it lives instead of for what it depends on.
// A lint level binds per rule, so each class reports through its own rule and the presets map the gradient onto the levels. How far a value laundered is an unbounded quantity: it rides each finding as the landed-via chain, and is never graded.
export function diagonalScope(role, t) {
  const r = rel(role.chain, t.chain);
  if (r.kind === 'same') return 'within-subdomain';
  if (r.kind === 'peer' && r.p === 0) return 'across-domains';
  return 'across-subdomains';
}
