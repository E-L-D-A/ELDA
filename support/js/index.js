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
// The path classification and the reference verdicts live in model.js, shared with the dependency visualizer so the linter and the diagram judge every edge identically.

import {
  LAYERS,
  LAYER_SUFFIX_RE,
  DATA_RE,
  norm,
  classify,
  fileRole,
  targetOf,
  importVerdict,
  lateralVerdict,
  diagonalVerdict,
  landedVerdict,
} from './model.js';
import { createWalker } from './flow.js';

const filenameOf = (context) => norm(context.filename ?? (context.getFilename && context.getFilename()) ?? '');

function options(context) {
  const o = (context.options && context.options[0]) || {};
  return {
    domainAlias: o.domainAlias ?? '#',
    appAlias: o.appAlias ?? '@',
    compositionRoot: o.compositionRoot ?? 'routes',
  };
}

// elda/imports - the hard, decidable layer + boundary invariants (Tier 1): LAYER.1, ROOT.6, ROOT.1, ROOT.7, SURFACE.2, SURFACE.3, SURFACE.7 (see judgeImport in model.js for the per-constraint reading).
// A trailing plain segment is ambiguous between a named surface of the chain and a nested subdomain's barrel; the verdict tries both readings and stays quiet if either is legal, so it never false-positives on the ambiguity.
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

    const check = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      if (!t) return;
      const verdict = importVerdict(role, t, domainAlias);
      if (verdict) context.report({ node, message: verdict });
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

// elda/no-service-coupling and elda/no-adapter-coupling - OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows); the verdict logic and the remedy texts are lateralVerdict / LATERAL in model.js.
// Warn-level - smells, not hard breaches - and separately togglable.
function lateralCoupling(layer) {
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
      const flag = (node, spec) => {
        const t = targetOf(filename, spec, domainAlias, appAlias);
        const verdict = lateralVerdict(role, t, layer);
        if (verdict) context.report({ node, message: verdict });
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

const noServiceCoupling = lateralCoupling('services');
const noAdapterCoupling = lateralCoupling('adapters');

// elda/no-diagonal-reach - SURFACE.5's geometry, enforced on landings: every value reference is followed name by name through surfaces and re-export chains (flow.js) to the files that own the bindings, and each landing is judged by landedVerdict in model.js - the in-subdomain diagonal, and its cross-boundary generalization (the diagrams draw every cross-boundary arrow at equal rank, so a landed value flow below the consumer's own rank is a diagonal no row draws).
// The direct reference is the walk's zero-hop case, so this subsumes the direct-only check; a specifier that resolves to no file keeps the spec-classified direct judgment, so a broken path never hides a finding.
// Error-tier alongside the structural invariants: a declared name binds the way a declared subdomain does, and every hit resolves by a rename, a promotion to the bare file, or an equal-rank crossing.
const walkers = new Map();
const walkerFor = (srcDir, domainAlias, appAlias) => {
  const key = `${srcDir}|${domainAlias}|${appAlias}`;
  if (!walkers.has(key)) walkers.set(key, createWalker({ srcDir, domainAlias, appAlias }));
  return walkers.get(key);
};

// AST-level value names: named imports minus type-only ones, `default`, and a namespace or dynamic import as '*' - the whole module.
function valueNames(node) {
  if (node.importKind === 'type' || node.exportKind === 'type') return [];
  const names = [];
  for (const s of node.specifiers ?? []) {
    if (s.type === 'ImportSpecifier') { if (s.importKind !== 'type') names.push(s.imported.name ?? s.imported.value); }
    else if (s.type === 'ImportDefaultSpecifier') names.push('default');
    else if (s.type === 'ImportNamespaceSpecifier') return '*';
    else if (s.type === 'ExportSpecifier') { if (s.exportKind !== 'type') names.push(s.local.name ?? s.local.value); }
  }
  return names;
}

const noDiagonalReach = {
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
    if (role.kind !== 'domain') return {};
    const srcRoot = filename.match(/^(.*)\/domains\//);
    const walker = srcRoot ? walkerFor(srcRoot[1], domainAlias, appAlias) : null;
    const relOf = (p) => norm(p).match(/\/domains\/(.+)$/)?.[1] ?? norm(p).split('/').pop();
    const direct = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      const verdict = diagonalVerdict(role, t);
      if (verdict) context.report({ node, message: verdict });
    };
    const flag = (node, spec, names) => {
      if (names !== '*' && names.length === 0) return;
      const found = walker && walker.landings(filename, spec, names);
      if (found == null) { direct(node, spec); return; }
      for (const l of found) {
        const m = norm(l.path).match(/\/domains\/(.+)$/);
        if (!m) continue;
        const t = { ...classify(m[1].split('/').filter(Boolean)), asset: DATA_RE.test(l.path) };
        const verdict = landedVerdict(role, t);
        if (verdict) context.report({ node, message: l.via.length ? `${verdict} (landed via ${l.via.map(relOf).join(' -> ')})` : verdict });
      }
    };
    return {
      ImportDeclaration: (node) => node.source && flag(node, node.source.value, valueNames(node)),
      ImportExpression: (node) => node.source && node.source.type === 'Literal' && flag(node, node.source.value, '*'),
      ExportNamedDeclaration: (node) => node.source && flag(node, node.source.value, valueNames(node)),
    };
  },
};

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
    'no-diagonal-reach': noDiagonalReach,
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
const INVARIANTS = ['imports', 'no-layer-branches', 'no-diagonal-reach', 'no-async-inner', 'no-mutable-surface', 'ambient-ownership'];
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
