// @elda/oxlint-plugin - ELDA architecture rules as an oxlint plugin (ESLint-v9-compatible API, so the same plugin runs under ESLint too).
// Add to a project's existing config:
//
//   { "jsPlugins": ["@elda/oxlint-plugin"],
//     "rules": { "elda/imports": "warn", "elda/no-service-coupling": "warn",
//                "elda/no-mutable-surface": "warn", "elda/no-async-inner": "warn",
//                "elda/vocab-gate": "warn", "elda/ambient-ownership": "warn" } }
//
// or extend a shipped grade preset - adopting, aligned, or justified (see README).
// Each rule cites the ELDA constraint it enforces by its grouped ID (ELDA/README.md, "Constraints").
// The conventions are baked in: layer membership rides file names, and a directory expresses a concern, which makes it a subdomain.
// Only `domainAlias` / `appAlias` / `compositionRoot` vary per project, defaulting to `#` / `@` / `routes`.

// The layer vocabulary, in rank order; the rank map and the suffix test derive from it.
const LAYERS = ['entities', 'use-cases', 'adapters', 'services'];
const LAYER_RANK = Object.fromEntries(LAYERS.map((l, i) => [l, i]));
const LAYER_SUFFIX_RE = new RegExp(`\\.(${LAYERS.join('|')})$`);

const norm = (p) => String(p ?? '').replace(/\\/g, '/');
const filenameOf = (context) => norm(context.filename ?? (context.getFilename && context.getFilename()) ?? '');

function options(context) {
  const o = (context.options && context.options[0]) || {};
  return {
    domainAlias: o.domainAlias ?? '#',
    appAlias: o.appAlias ?? '@',
    compositionRoot: o.compositionRoot ?? 'routes',
  };
}

// After the real extension, a file name may carry markers the classification sees through: runtime-context markers (`auth.services.server.ts` is server-only) and build-convention compounds (`grid-vars.services.css.ts` is a vanilla-extract module).
// A marker is a coloring, orthogonal to the layer axis.
// This list is the marker vocabulary.
const MARKERS = ['server', 'client', 'css'];
const MARKER_RE = new RegExp(`\\.(${MARKERS.join('|')})$`);
const stripExt = (name) => {
  let n = name.replace(/\.d\.ts$/, '').replace(/\.(tsx?|jsx?|mjs|cjs|css|scss|sass|less)$/, '');
  while (MARKER_RE.test(n)) n = n.replace(MARKER_RE, '');
  return n;
};

// Classify a path inside domains/ into its subdomain chain and its layer.
// Directories express concerns: a plain-named directory is a nested subdomain (SURFACE.7); a layer-suffixed directory (`back-nav.adapters/`) and a bare layer-named directory are the two legacy layouts (recognized here, flagged by no-layer-branches per LAYER.7).
// Layer membership otherwise rides the file name: the bare reserved names, or a `<name>.<layer>` suffix.
// A trailing plain name is a surface: `index` the consumable barrel, `services` (a layer name, caught above) the runtime-composition surface, any other name a named surface.
function classify(segs) {
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
function fileRole(filename, compositionRoot) {
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
function parseSpec(spec, domainAlias, appAlias) {
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
function posixResolve(dir, spec) {
  const out = [];
  for (const p of (dir + '/' + spec).split('/')) {
    if (p === '' || p === '.') continue;
    else if (p === '..') out.pop();
    else out.push(p);
  }
  return '/' + out.join('/');
}

function relativeTarget(filename, spec) {
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
const DATA_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)(\?.*)?$/i;

function targetOf(filename, spec, domainAlias, appAlias) {
  const t = parseSpec(spec, domainAlias, appAlias) ?? relativeTarget(filename, spec);
  if (t && typeof spec === 'string' && DATA_RE.test(spec)) return { ...t, layer: 'entities', via: 'leaf', asset: true };
  return t;
}

// Relationship between the importer's subdomain chain and the target's: the shared prefix decides whether the reference stays inside one subdomain, descends into an owned child, climbs toward an ancestor, or crosses to a peer at the divergence point.
function rel(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  if (p === a.length && p === b.length) return { p, kind: 'same' };
  if (p === a.length) return { p, kind: 'into-child' };
  if (p === b.length) return { p, kind: 'to-ancestor' };
  return { p, kind: 'peer' };
}

// A services target in surface form is the runtime-composition surface itself (`x/services` with nothing after it), the thing a composer reaches; anything past it is internals.
const isServicesSurface = (t) => t.layer === 'services' && t.sub.length === 0;

// elda/imports - the hard, decidable layer + boundary invariants (Tier 1):
//   LAYER.1    an inner layer never imports an outer one (alias and relative paths alike);
//   ROOT.6     pure core depends on nothing in any domain;
//   ROOT.1     composition roots compose top-level domains through their surfaces only;
//   ROOT.7     each domain composes its direct children only, and a subdomain never references its parent;
//   SURFACE.2  a consumable surface carries use-cases and vocabulary, never services or adapters;
//   SURFACE.3  a cross-boundary reference goes through a surface, never into a layer's internals, and a surface never re-bundles a peer or foreign domain's surface;
//   SURFACE.7  a nested subdomain is internal to its parent: outside it, only the parent's published surfaces exist.
// A trailing plain segment is ambiguous between a named surface of the chain and a nested subdomain's barrel; the rule tries both readings and stays quiet if either is legal, so it never false-positives on the ambiguity.
// The graded lateral smells are the separate warn-level rules (no-service-coupling, no-adapter-coupling).
const imports = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        domainAlias: { type: 'string' },
        appAlias: { type: 'string' },
        compositionRoot: { type: 'string' },
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { domainAlias, appAlias, compositionRoot } = options(context);
    const filename = filenameOf(context);
    const role = fileRole(filename, compositionRoot);
    if (role.kind === 'other') return {};

    // Returns a violation message for this reading of the target, or null when legal.
    const judge = (t) => {
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
    };

    const check = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      if (!t) return;
      const verdictA = judge(t);
      if (verdictA === null) return;
      // The subdomain-barrel reading of an ambiguous trailing plain segment.
      if (t.surface && t.surface !== 'index' && !t.layer) {
        const b = { ...t, chain: [...t.chain, t.surface], surface: 'index' };
        if (judge(b) === null) return;
      }
      context.report({ node, message: verdictA });
    };

    return {
      ImportDeclaration: (node) => node.source && check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => node.source && check(node, node.source.value),
      ImportExpression: (node) => node.source && node.source.type === 'Literal' && check(node, node.source.value),
    };
  },
};

// elda/no-layer-branches - LAYER.7: a layer is a classification, never a container.
// A directory named for a layer is a horizontal bucket: it accumulates unrelated concerns behind one classification, and the tree stops encoding concerns at that node.
// A layer-SUFFIXED directory (`layouts.services/`) is the same bucket wearing a file's name: it pretends to be one part while hiding a branch underneath - an undeclared subdomain dodging subdomain discipline.
// Layer membership rides file names (`entities.ts`, `<name>.entities.ts`); a directory expresses a concern, which makes it a subdomain.
// The analyzers still recognize both legacy layouts so a migrating codebase lints correctly; this rule is the migration's fix-list.
const noLayerBranches = {
  create(context) {
    const m = filenameOf(context).match(/\/domains\/(.+)$/);
    if (!m) return {};
    const segs = m[1].split('/').filter(Boolean);
    const dirs = segs.slice(0, -1);
    const bucket = dirs.find((s) => LAYERS.includes(s));
    if (bucket) {
      return {
        Program: (node) => context.report({ node, message: `ELDA LAYER.7: '${bucket}/' is a layer-named directory, a horizontal bucket; layer membership rides file names (\`${bucket}.ts\`, \`<name>.${bucket}.ts\`) and directories express concerns.` }),
      };
    }
    const unitDir = dirs.find((s) => LAYER_SUFFIX_RE.test(s));
    if (unitDir) {
      return {
        Program: (node) => context.report({ node, message: `ELDA LAYER.7: '${unitDir}/' is a layer-suffixed directory - a branch wearing a file's name. One part's files share a name (\`back-nav.adapters.tsx\` + \`back-nav.adapters.css\`); a grouping directory is a subdomain (a plain name, layer-suffixed files inside).` }),
      };
    }
    return {};
  },
};

// elda/no-service-coupling and elda/no-adapter-coupling - OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows): lateral coupling between two units of the same outer layer bypasses the use-case crossing where cross-unit flow belongs.
// A service should not invoke a sibling service (compose them at the root via a named port, or lift the shared behaviour into a use-case); an adapter should not reach a sibling adapter (the layer above composes the two bindings, or they co-locate into one unit).
// For services the grading extends across peers: a service unit mounting a peer's block at its runtime-composition surface is OWNER.5's unified-composition case, exempted from the hard surface rule in elda/imports and reported here instead.
// Warn-level - smells, not hard breaches - and separately togglable.
function lateralCoupling(layer, remedy, crossSurface) {
  return {
    meta: {
      schema: [{
        type: 'object',
        properties: {
          domainAlias: { type: 'string' },
          appAlias: { type: 'string' },
        },
        additionalProperties: false,
      }],
    },
    create(context) {
      const { domainAlias, appAlias } = options(context);
      const filename = filenameOf(context);
      const m = filename.match(/\/domains\/(.+)$/);
      if (!m) return {};
      const role = classify(m[1].split('/').filter(Boolean));
      if (role.layer !== layer || role.chain.length === 0) return {};
      // A unit is one concern-part (SURFACE.5, the spec's "Units"): the files sharing one name at a subdomain's root, or the contents of one legacy unit directory.
      // Same name or same directory means one unit and co-located imports are free; the label is the file's own name, or the directory path.
      const unitOf = (c) => {
        if (c.via === 'branch') return [c.layer, ...c.sub.slice(0, -1)].join('/');
        if (c.via === 'unit-dir') return c.sub.slice(0, -1).join('/');
        if (c.via === 'suffix') return c.name ?? '';
        // A bare reserved-name file is the subdomain's own layer aggregate.
        return '';
      };
      // The subdomain's own composer is exempt from the in-subdomain cross-unit smell: the bare `services` file (and the legacy `services/index` barrel) realizes the runtime-composition surface, and composing owned parts re-owns nothing.
      // Its peer mountings still grade below.
      const isComposer = role.via === 'leaf'
        || (role.via === 'branch' && role.sub.length === 1 && role.sub[0] === 'index');
      const importerUnit = unitOf(role);
      const flag = (node, spec) => {
        const t = targetOf(filename, spec, domainAlias, appAlias);
        if (!t || t.layer !== layer || t.asset) return;
        const r = rel(role.chain, t.chain);
        if (r.kind === 'into-child') return; // Self-composition of an owned subdomain (ROOT.7).
        if (r.kind === 'to-ancestor') return; // The hard breach; elda/imports reports it.
        if (r.kind === 'peer') {
          if (crossSurface && t.chain.length === r.p + 1 && isServicesSurface(t)) {
            context.report({ node, message: `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit || role.chain.join('/')}' mounts peer '${t.chain.join('/')}' at its runtime-composition surface; prefer a named slot port its composer fills, and justify the mounting where the port becomes ceremony.` });
          }
          return;
        }
        if (isComposer) return; // Composition by the subdomain's own composer.
        const targetUnit = unitOf(t);
        if (targetUnit === importerUnit) return; // Same unit composing itself.
        context.report({ node, message: `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit || '(subdomain root)'}' reaches a different ${layer} unit '${targetUnit || '(subdomain root)'}' in '${role.chain.join('/')}'; ${remedy}` });
      };
      // A type-only declaration is a vocabulary reference, deliberately unregulated; the lateral rules act on value edges.
      // A re-export carries the same lateral edge an import does, so `export ... from` is visited too (`export *` is no-penetration's concern).
      const isValue = (node) => node.importKind !== 'type' && node.exportKind !== 'type';
      return {
        ImportDeclaration: (node) => node.source && isValue(node) && flag(node, node.source.value),
        ImportExpression: (node) => node.source && node.source.type === 'Literal' && flag(node, node.source.value),
        ExportNamedDeclaration: (node) => node.source && isValue(node) && flag(node, node.source.value),
      };
    },
  };
}

const noServiceCoupling = lateralCoupling('services', 'supply it as a named port from the composition root, or lift the shared logic into a use-case.', true);
const noAdapterCoupling = lateralCoupling('adapters', 'let the layer above compose the two bindings, or co-locate them into one unit.');

// elda/no-penetration - the `*` imports and exports that punch holes in module edges and let the architecture leak through.
// A namespace import (`import * as ns`) consumes a surface opaquely - every export looks used, so the unconsumed-export review signal (SURFACE.4) goes blind.
// A re-export-all (`export *`) republishes whatever a module happens to expose, so the surface stops being a deliberate named contract (SURFACE.1).
// Reference and re-export by name; the rare earned case (a generated barrel, a namespace-only package) takes an inline ignore.
// Side-effect imports are a separate concern - see no-deep-side-effects.
// Warn-level and separately togglable.
const noPenetration = {
  create(context) {
    return {
      ImportNamespaceSpecifier: (node) => context.report({
        node,
        message: 'ELDA SURFACE.4: `import * as` consumes a surface opaquely - every export looks used, blinding the unconsumed-export signal. Import the named symbols you use.',
      }),
      ExportAllDeclaration: (node) => context.report({
        node,
        message: 'ELDA SURFACE.1: `export *` republishes whatever the module exports, so the surface is not a deliberate named contract. Re-export named symbols.',
      }),
    };
  },
};

// elda/no-deep-side-effects - SURFACE.5: a side-effect-only import (`import './x'`, no binding) runs another module for effect with nothing named crossing the edge.
// Inside a unit that is fine - a co-located stylesheet is part of the unit - and the composition root composes global effects without restriction (ROOT.2).
// The smell is a side-effect import that reaches *past the unit* into another module: a deep effect that co-location would make honest, or a named value would make visible.
// External packages (a polyfill, a vendor stylesheet) are not a reach into the domain tree and pass.
// Warn-level and separately togglable.
const noDeepSideEffects = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        domainAlias: { type: 'string' },
        appAlias: { type: 'string' },
        compositionRoot: { type: 'string' },
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { domainAlias, appAlias, compositionRoot } = options(context);
    const filename = filenameOf(context);
    const role = fileRole(filename, compositionRoot);
    if (role.kind !== 'domain' && role.kind !== 'surface') return {};
    const m = filename.match(/\/domains\/(.+)$/);
    if (!m) return {};
    const importerDir = m[1].split('/').filter(Boolean).slice(0, -1).join('/');
    const flag = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      if (!t) return; // An external or bare package is not a reach into the domain tree.
      if (t.segs && t.segs.slice(0, -1).join('/') === importerDir) return; // Same unit: co-located.
      context.report({ node, message: `ELDA SURFACE.5: side-effect import '${spec}' runs another module for effect with nothing named crossing the edge; co-locate it in the unit, compose it at the root, or import a named value.` });
    };
    return {
      ImportDeclaration: (node) => {
        if (node.specifiers.length === 0 && node.source) flag(node, node.source.value);
      },
    };
  },
};

// elda/no-async-inner - LAYER.4 and the Outcome model: async / await / try-catch stay out of the inner layers (wrapped at adapters into channel-conforming values; outcomes are typed branch values).
const noAsyncInner = {
  create(context) {
    const m = filenameOf(context).match(/\/domains\/(.+)$/);
    if (!m) return {};
    const c = classify(m[1].split('/').filter(Boolean));
    if (c.layer !== 'entities' && c.layer !== 'use-cases') return {};
    const reportAsync = (node) => node.async && context.report({ node, message: 'ELDA LAYER.4: async functions are not permitted in entities/use-cases.' });
    return {
      AwaitExpression: (node) => context.report({ node, message: 'ELDA LAYER.4: await is not permitted in entities/use-cases; wrap async at the adapters layer.' }),
      ForOfStatement: (node) => node.await && context.report({ node, message: 'ELDA LAYER.4: for-await is not permitted in entities/use-cases.' }),
      TryStatement: (node) => context.report({ node, message: 'ELDA LAYER.4 (Outcome model): try/catch is not permitted in entities/use-cases; outcomes flow as typed branch values.' }),
      FunctionDeclaration: reportAsync,
      FunctionExpression: reportAsync,
      ArrowFunctionExpression: reportAsync,
    };
  },
};

// elda/no-mutable-surface - CHANNEL.4: state crosses boundaries as published immutable values.
// A module-level `export let` / `export var` (directly, or exporting a top-level `let` binding by name) is a live mutable binding every importer shares by reference - shared state with none of a channel's delivery semantics - so domain code never exposes one.
// Publish a constant, an accessor, or a channel instead.
function patternNames(id, out) {
  if (!id) return;
  switch (id.type) {
    case 'Identifier': out.add(id.name); break;
    case 'ObjectPattern': for (const p of id.properties) patternNames(p.value ?? p.argument, out); break;
    case 'ArrayPattern': for (const el of id.elements) patternNames(el, out); break;
    case 'AssignmentPattern': patternNames(id.left, out); break;
    case 'RestElement': patternNames(id.argument, out); break;
  }
}

const noMutableSurface = {
  create(context) {
    if (!/\/domains\//.test(filenameOf(context))) return {};
    return {
      Program(program) {
        const mutable = new Set();
        for (const node of program.body) {
          if (node.type === 'VariableDeclaration' && node.kind !== 'const') {
            for (const d of node.declarations) patternNames(d.id, mutable);
          }
        }
        for (const node of program.body) {
          if (node.type !== 'ExportNamedDeclaration') continue;
          if (node.declaration && node.declaration.type === 'VariableDeclaration' && node.declaration.kind !== 'const') {
            context.report({ node, message: `ELDA CHANNEL.4: \`export ${node.declaration.kind}\` shares a live mutable binding by reference; publish a constant, an accessor, or a channel instead.` });
          }
          if (!node.source) {
            for (const s of node.specifiers ?? []) {
              if (s.local && s.local.type === 'Identifier' && mutable.has(s.local.name)) {
                context.report({ node: s, message: `ELDA CHANNEL.4: exporting the mutable binding '${s.local.name}' shares it live by reference; publish a constant, an accessor, or a channel instead.` });
              }
            }
          }
        }
      },
    };
  },
};

// elda/vocab-gate - OWNER.2 / ROOT.2: shared-namespace writes with literal keys at the integration surface (the composition root) introduce out-of-band vocabulary the owner should hold.
const vocabGate = {
  meta: {
    schema: [{
      type: 'object',
      properties: { compositionRoot: { type: 'string' } },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { compositionRoot } = options(context);
    if (!new RegExp(`/${compositionRoot}/`).test(filenameOf(context))) return {};
    const isStr = (n) => n && n.type === 'Literal' && typeof n.value === 'string';
    return {
      CallExpression(node) {
        const c = node.callee;
        if (c && c.type === 'MemberExpression' && c.property && c.property.type === 'Identifier') {
          const m = c.property.name;
          if ((m === 'setAttribute' || m === 'setItem' || m === 'setProperty') && isStr(node.arguments && node.arguments[0])) {
            context.report({ node, message: `ELDA OWNER.2 / ROOT.2: shared-namespace write ${m}('${node.arguments[0].value}', ...) at the integration surface; route it through the owner's binding surface.` });
          }
        }
      },
      AssignmentExpression(node) {
        const l = node.left;
        if (l && l.type === 'MemberExpression' && l.object && l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'dataset') {
          context.report({ node, message: 'ELDA OWNER.2 / ROOT.2: dataset write at the integration surface; identity vocabulary belongs to its owner.' });
        }
      },
    };
  },
};

// elda/ambient-ownership - OWNER.2: ambient declarations are vocabulary, owned by a domain.
// A .d.ts outside src/domains/ is an un-owned catch-all (the type-layer `shared/` column).
const ambientOwnership = {
  create(context) {
    const f = filenameOf(context);
    if (!(f.endsWith('.d.ts') && !f.includes('/domains/'))) return {};
    return {
      Program: (node) => context.report({ node, message: 'ELDA OWNER.2: ambient declarations belong co-located in the owning domain (src/domains/<x>/), not a root or shared .d.ts catch-all.' }),
    };
  },
};

const plugin = {
  meta: { name: 'elda' },
  rules: {
    'imports': imports,
    'no-layer-branches': noLayerBranches,
    'no-service-coupling': noServiceCoupling,
    'no-adapter-coupling': noAdapterCoupling,
    'no-penetration': noPenetration,
    'no-deep-side-effects': noDeepSideEffects,
    'no-async-inner': noAsyncInner,
    'no-mutable-surface': noMutableSurface,
    'vocab-gate': vocabGate,
    'ambient-ownership': ambientOwnership,
  },
};

// Presets, one per machine-holdable alignment state (ELDA/README.md, "Grades of alignment"; META.6).
// `adopting` is the migration posture: every rule reports and the fix-list stays visible.
// `aligned` holds the aligned grade: the structural invariants gate as errors.
// `justified` holds the justified grade: the graded smells gate too, so a deviation lands only as an inline suppression carrying its justification.
// A preset supplies the gate; the grade is read off the tree under it.
// ESLint flat-config consumers spread `plugin.configs.<name>`; oxlint's `extends` is file-based and does not read a plugin's `configs`, so oxlint users extend the shipped `<name>.json` by path instead (see README).
const INVARIANTS = ['imports', 'no-layer-branches', 'no-async-inner', 'no-mutable-surface', 'ambient-ownership'];
const SMELLS = ['no-service-coupling', 'no-adapter-coupling', 'no-penetration', 'no-deep-side-effects', 'vocab-gate'];
const gradePreset = (invariants, smells) => ({
  plugins: { elda: plugin },
  rules: Object.fromEntries([
    ...INVARIANTS.map((r) => [`elda/${r}`, invariants]),
    ...SMELLS.map((r) => [`elda/${r}`, smells]),
  ]),
});
plugin.configs = {
  adopting: gradePreset('warn', 'warn'),
  aligned: gradePreset('error', 'warn'),
  justified: gradePreset('error', 'error'),
};

export default plugin;
