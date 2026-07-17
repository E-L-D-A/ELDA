// The ELDA path model: how a file path classifies into domain, subdomain chain, and layer, and how one classified point relates to another.
// The lint rules (index.js), the reference verdicts (verdicts.js), and the dependency visualizer (visualize.js) all read this module, so every reader resolves and relates paths identically.
// Everything here is pure structure: strings in, plain objects out, no lint-host or filesystem coupling, and no verdict prose.
// A reference earns its verdict in verdicts.js and is phrased in messages.js; this file only says what each point is and how two points relate.

// The layer vocabulary, in rank order; the rank map and the name reading (layerOf, below) both derive from it.
export const LAYERS = ['axioms', 'flows', 'harnesses', 'services'];
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
// Aliases arrive as the app's alias map or its entries; any alias prefix marks the specifier in-tree.
export const inTreeSpec = (spec, aliases) =>
  isRelative(spec) ||
  (typeof spec === 'string' &&
    (Array.isArray(aliases) ? aliases : Object.entries(aliases ?? {})).some(([a]) => spec.startsWith(a + '/')));

// A file name reads RIGHT TO LEFT - `<name>.<layer>.<marker>...` - and the layer is the rightmost dot-segment that names a layer.
// Everything left of it is the unit's name, and an empty name is the subdomain's own bare layer file; everything right of it is markers.
// A marker is a coloring orthogonal to the layer axis: a runtime context (`.server`), a build convention (`.css` for a vanilla-extract module), a tooling suffix (`.stories`, `.spec`). There may be any number of them, under any name, and the model does not enumerate them.
// It must not enumerate them, because an enumerated list fails OPEN: a marker the list has not been told about leaves the layer unmatched, silently demotes a layer file to a rankless surface, and takes every layer rule off it.
// Reading right to left is also what keeps `services.harnesses.css.ts` decidable - the unit is `services`, the layer is `harnesses`, `.css` is a marker - where a left-to-right read would take `services` for the layer and lose the file.
export const layerOf = (stripped) => {
  const parts = String(stripped ?? '').split('.');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (LAYERS.includes(parts[i])) return { layer: parts[i], name: parts.slice(0, i).join('.') };
  }
  return null;
};

// Classify a path inside domains/ into its subdomain chain and its layer.
// Directories express concerns: a plain-named directory is a nested subdomain (SURFACE.7); a bare layer-named directory is the horizontal slicing (the spec's Slicing direction), rank-first rows of plain concern-named files carrying the same classification; a layer-suffixed directory (`back-nav.harnesses/`) is its per-unit variant.
// Layer membership otherwise rides the file name: the bare reserved names, or a `<name>.<layer>` suffix.
// A trailing plain name is a surface: `index` the consumable barrel, `services` (a layer name, caught above) the runtime-composition surface, any other name a named surface.
export function classify(segs) {
  // A directory that merely repeats the name of the unit inside it is a grouping node for that unit, and LAYER.7 puts units beside subdomains as the concerns a grouping node may express.
  // It is transparent: it carries no chain segment, so its files stay units of the enclosing subdomain and read the subdomain's shared base like any other unit. Grouping files to rest the eye costs nothing, and only declaring a boundary costs what a boundary costs.
  // The collapse is decidable from the path alone, because the file states its own unit and the directory qualifies only by repeating it. That repetition is what buys the transparency: a transparent node contributes nothing, so the file must carry its whole identity.
  // Which is also why the bare form is not available here. `x/axioms.ts` already means the shared base of the subdomain `x`, and a folder holding only bare layer files IS the minimal subdomain; letting it also mean "the unit x's axioms" would collide two readings with nothing in the file to separate them.
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
        // A bare reserved name, markers and all (`services.ts`, `services.server.ts`): the subdomain's own layer aggregate, or - as a directory - the horizontal slicing's rank row.
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

// The same segment-anchored test, keeping which area matched and the path remainder inside it, so the area's contents can classify like any domain tree.
const areaHit = (filename, areas) => {
  for (const a of Array.isArray(areas) ? areas : [areas]) {
    if (!a) continue;
    const m = norm(filename).match(new RegExp(`(^|/)${escapeRe(a)}(?:/(.*))?$`));
    if (m) return { area: a, rest: m[2] ?? '' };
  }
  return null;
};

// Where does the current file sit? The tree encodes a claim in exactly three places, all configured: the ownership directory (the one the ownership alias resolves to), the declared composition roots, and the declared cores.
// Everywhere else placement is free organization and the claim is null; no directory name is special on its own.
// Naming a core buys no enforcement by itself. ROOT.6 ("pure core is dependency-free; arrows point from domains into core, never back") is a property, and the declaration is a claim the graph adjudicates like any other placement.
// A core area's contents classify as TOP-LEVEL shared domains - the bottom of the sharedness DAG stands beside the feature domains, never inside a domain named after the folder - so the chain never carries the area's name, and `area` rides along only so the diagram can group the shared blocks.
// A loner file directly in the area is a whole domain in one file: a plain name is the domain's own surface (contents not yet extracted), and a layer-suffixed name is that domain's one layer file; either way the unit name lifts into the chain as the domain it is.
export function fileRole(filename, { ownershipDir, compositionRoot, core } = {}) {
  const own = areaHit(filename, ownershipDir ?? 'domains');
  if (own && own.rest) {
    const c = classify(own.rest.split('/').filter(Boolean));
    if (c.layer && c.chain.length > 0) return { kind: 'domain', ...c };
    if (c.surface && c.chain.length > 0) return { kind: 'surface', ...c };
    return { kind: 'other' };
  }
  if (inArea(filename, compositionRoot ?? [])) return { kind: 'composition-root' };
  const hit = areaHit(filename, core ?? []);
  if (hit) {
    const area = hit.area.split('/').pop();
    const segs = hit.rest.split('/').filter(Boolean);
    if (!segs.length) {
      const name = stripExt(area) || area;
      return { kind: 'core', area, chain: [name], layer: null, via: null, sub: [], surface: name, name: null };
    }
    const c = classify(segs);
    if (c.chain.length === 0 && c.surface && c.surface !== 'index') return { kind: 'core', area, ...c, chain: [c.surface] };
    if (c.chain.length === 0 && c.layer && c.name) return { kind: 'core', area, ...c, chain: [c.name] };
    return { kind: 'core', area, ...c };
  }
  return { kind: 'other' };
}

// Parse an ownership-alias specifier (`#/...`), or null for anything else (bare packages, other aliases, relatives).
// The ownership alias is the one specifier form that NAMES a domain: its path remainder is the chain, so writing it attributes ownership in one spelling, and every other form is anonymous travel.
// A single-segment specifier is the domain's consumable barrel.
export function parseSpec(spec, ownershipAlias) {
  if (typeof spec !== 'string' || !ownershipAlias) return null;
  if (!spec.startsWith(ownershipAlias + '/')) return null;
  const segs = spec.slice(ownershipAlias.length + 1).split('/').filter(Boolean);
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

export function relativeTarget(filename, spec, ownershipDir) {
  if (!isRelative(spec)) return null;
  const resolved = posixResolve(filename.slice(0, filename.lastIndexOf('/')), spec);
  const hit = areaHit(resolved, ownershipDir ?? 'domains');
  if (!hit || !hit.rest) return null;
  const segs = hit.rest.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  return finishTarget(classify(segs));
}

function finishTarget(t) {
  // A bare `#/x` is x's consumable barrel: with no chain, the surface name is the domain itself, so read it as chain `x`, surface `index`.
  if (t.chain.length === 0 && t.surface && !t.layer) return { ...t, chain: [t.surface], surface: 'index' };
  return t;
}

// Pure-data files (images, fonts, media, JSON, anything that is not code) carry no behaviour; importing one yields a value.
// That is vocabulary, classified as `axioms` (SURFACE.6): importable from any layer inside the owning domain's tree, and surface-gated across boundaries.
// Data is read as the COMPLEMENT of code, and never as a list of its own. A list fails open on the first extension it has not been told about: the file classifies as a rankless named surface instead, its cross-boundary reach stops being surface-gated because a surface target passes, and reading it from inside its own domain reports as a self-surface import.
// The test needs a resolved path, where the trailing extension is always there to read. A specifier normally omits it (`./cart.flows`), so the complement cannot be read on one, and the specifier path keeps the media list below as its degraded fallback - reached only when the file does not resolve, where nothing else is decidable either.
export const isDataPath = (p) => {
  const s = String(p ?? '').split('?')[0];
  return /\.[^./\\]+$/.test(s) && !CODE_EXT_RE.test(s);
};
export const DATA_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|json|jsonc|txt|csv|md|wasm|graphql|gql|ya?ml|toml)(\?.*)?$/i;

// Vocabulary carries a rank and no surface: a data file classifies as its subdomain's Axioms, and it is not a named surface of the subdomain just because its name is plain.
// Leaving `surface` set is what let a cross-domain asset reach pass, since every boundary rule reads a surface target as a legal way in.
const asData = (t) => ({ ...t, layer: 'axioms', via: 'leaf', surface: null, asset: true });

export function targetOf(filename, spec, ownershipAlias, ownershipDir) {
  const t = parseSpec(spec, ownershipAlias) ?? relativeTarget(filename, spec, ownershipDir);
  if (t && typeof spec === 'string' && DATA_RE.test(spec)) return asData(t);
  return t;
}

// Classify a reference target from the path the specifier actually resolved to, rather than from the specifier's own shape.
// A specifier's trailing plain segment is ambiguous - `#/checkout/payment` is either a named surface of `checkout` or the `payment` subdomain's barrel - and only the filesystem knows which, so a caller that can resolve reads the target here and judges it once.
// The caller supplies the resolution (this module touches no filesystem); a path that lands outside the ownership directory, or directly in it with no domain to belong to, carries no target and returns null.
export function targetOfPath(absPath, ownershipDir) {
  const hit = areaHit(norm(absPath), ownershipDir ?? 'domains');
  if (!hit || !hit.rest) return null;
  const t = classify(hit.rest.split('/').filter(Boolean));
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
// The vertical slicing spells it `x/services`, and the horizontal slicing spells the same surface `x/services/index`. Both are the surface: the analyzers read both spellings correctly by promise (no rule misjudges either), so reading only one spelling would turn a graded OWNER.5 mounting into a hard boundary breach on a tree sliced the other way.
export const isServicesSurface = (t) => t.layer === 'services'
  && (t.sub.length === 0 || (t.via === 'branch' && t.sub.length === 1 && t.sub[0] === 'index'));

// OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows): lateral coupling between two units of the same outer layer bypasses the flow crossing where cross-unit flow belongs.
// A unit is one concern-part (SURFACE.5, the spec's "Units"): the files sharing one name at a subdomain's root, or the contents of one unit directory.
// Same name or same directory means one unit and co-located imports are free; the label is the file's own name, or the directory path.
// A layer row of the horizontal slicing carries no unit name of its own: a plain file directly in the row is the layer aggregate spread across files, the same shared base the vertical spelling writes as one bare reserved-name file, while a directory inside the row labels a unit the way a unit directory does.
export const unitOf = (c) => {
  if (c.via === 'branch') return c.sub.slice(0, -1).join('/');
  if (c.via === 'unit-dir') return c.sub.slice(0, -1).join('/');
  if (c.via === 'suffix') return c.name ?? '';
  // A bare reserved-name file is the subdomain's own layer aggregate.
  return '';
};

// The subdomain's own composer is exempt from the in-subdomain cross-unit smell: the bare `services` file (and the horizontal slicing's `services/index` barrel) realizes the runtime-composition surface, and composing owned parts re-owns nothing.
// Its peer mountings still grade.
export const isComposer = (role) => role.via === 'leaf'
  || (role.via === 'branch' && role.sub.length === 1 && role.sub[0] === 'index');

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
