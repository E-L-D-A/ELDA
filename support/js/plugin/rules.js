// The ELDA lint rules: each reads a file's role and its references from the oxlint / ESTree host, judges every reference with the shared model and verdicts, and reports.
// The path classification lives in model.js and the reference verdicts in verdicts.js, shared with the dependency visualizer so the linter and the diagram judge every edge identically.
// The plugin object oxlint mounts, and the grade presets, are assembled in index.js from the rules map this file exports.

import {
  LAYERS,
  layerOf,
  norm,
  classify,
  fileRole,
  inArea,
  inTreeSpec,
  targetOf,
  targetOfPath,
  diagonalScope,
  belongsToUnitDir,
} from '../core/model.js';
import {
  importVerdict,
  unjudgedVerdict,
  lateralVerdict,
  landedVerdict,
  rootLandedVerdict,
  publishVerdict,
  selfSurfaceVerdict,
} from '../core/verdicts.js';
import { createWalker } from '../core/flow.js';
import { dirEntries, srcDirOf } from '../core/parse.js';
import * as msg from '../core/messages.js';

const filenameOf = (context) => norm(context.filename ?? (context.getFilename && context.getFilename()) ?? '');

// A dynamic specifier is statically known when it is a quoted string OR a template with no substitutions; a bundler resolves both identically.
// Reading only `Literal` would let a backtick delete the rule, so the template form is read too, and a genuinely computed specifier returns null for the caller to fail closed on.
const staticSpec = (node) => {
  const s = node.source;
  if (!s) return null;
  if (s.type === 'Literal') return typeof s.value === 'string' ? s.value : null;
  if (s.type === 'TemplateLiteral' && (s.expressions ?? []).length === 0 && (s.quasis ?? []).length === 1) {
    const q = s.quasis[0].value ?? {};
    return q.cooked ?? q.raw ?? null;
  }
  return null;
};

// A declared area is one directory name or a list of them: an app composes at several entries (a route tree, a server shell, a build config) and may hold any number of dependency-free cores.
const AREA = { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] };

function options(context) {
  const o = (context.options && context.options[0]) || {};
  return {
    domainAlias: o.domainAlias ?? '#',
    appAlias: o.appAlias ?? '@',
    compositionRoot: o.compositionRoot ?? 'routes',
    core: o.core ?? 'core',
  };
}

// The walker for the app a file belongs to: it resolves specifiers the way the bundler would, and follows value names to their landings.
// Memoized per src directory, so a lint pass builds one per app and every rule shares its parse cache.
const walkers = new Map();
const walkerFor = (srcDir, domainAlias, appAlias) => {
  const key = `${srcDir}|${domainAlias}|${appAlias}`;
  if (!walkers.has(key)) walkers.set(key, createWalker({ srcDir, domainAlias, appAlias }));
  return walkers.get(key);
};
const walkerOf = (filename, domainAlias, appAlias) => {
  const srcDir = srcDirOf(filename);
  return srcDir ? walkerFor(srcDir, domainAlias, appAlias) : null;
};

// Resolve first, judge second.
// A specifier's trailing plain segment does not say whether it names a surface of the chain or a nested subdomain's barrel, and reading the shape alone forces a rule to accept a reference whenever EITHER reading is legal - a tolerance that buys silence on the ambiguity by spending it on everything the ambiguity overlaps.
// The filesystem knows which file the specifier means, so the target is read off the resolved path and judged once.
// Where resolution finds no file the tolerant reading stands, which keeps a broken path from manufacturing a finding; a root's landing walk reports that same unresolvable path separately, so the silence here is covered.
// `found` says the specifier named a real file; `resolved` says the target was read off that file rather than guessed from the specifier's shape.
// The two come apart, and conflating them reports every legal reach into pure core or a root's own module as undecidable: those resolve perfectly well and simply carry no domain target, which is a fact about the file and not a failure to find it.
const resolvedTargetFor = (walker, filename, spec, domainAlias, appAlias) => {
  const abs = walker && typeof spec === 'string' ? walker.resolveSpec(filename, spec) : null;
  if (abs) return { t: targetOfPath(abs), resolved: true, found: true };
  return { t: targetOf(filename, spec, domainAlias, appAlias), resolved: false, found: false };
};

// elda/imports - the hard, decidable layer + boundary invariants (Tier 1): LAYER.1, ROOT.6, ROOT.1, ROOT.7, SURFACE.2, SURFACE.3, SURFACE.7 (see judgeImport in verdicts.js for the per-constraint reading).
// Targets are resolved against the filesystem before they are judged, so each reference is read as the one file it means.
// The graded lateral smells are the separate warn-level rules (no-service-coupling, no-adapter-coupling).
const imports = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        domainAlias: { type: 'string' },
        appAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { domainAlias, appAlias, compositionRoot, core } = options(context);
    const filename = filenameOf(context);
    const role = fileRole(filename, compositionRoot, core);
    if (role.kind === 'other') return {};

    const walker = walkerOf(filename, domainAlias, appAlias);
    const targetFor = (spec) => resolvedTargetFor(walker, filename, spec, domainAlias, appAlias);

    // In-tree code that names no file is undecidable, not innocent. Every role pays this, because a reach nobody can judge is a reach nobody is checking.
    const check = (node, spec) => {
      const { t, resolved, found } = targetFor(spec);
      if (walker && !found && inTreeSpec(spec, domainAlias, appAlias)) {
        context.report({ node, message: unjudgedVerdict(role, spec, 'is shaped like in-tree code yet resolves to no file') });
        return;
      }
      if (!t) return;
      const verdict = importVerdict(role, t, domainAlias, resolved);
      if (verdict) context.report({ node, message: verdict });
    };

    // On the root's row ROOT.1 is a landing question: a barrel carries no layer of its own, so the per-specifier reading above passes a binding that in fact lands on a use-case.
    // The walk follows each value name to the file that owns it and judges it there, the way the diagonal rule already reads domain files.
    const isRoot = role.kind === 'composition-root';
    const relOf = (p) => norm(p).match(/\/domains\/(.+)$/)?.[1] ?? norm(p).split('/').pop();
    const landed = (node, spec, names) => {
      if (!walker || (names !== '*' && names.length === 0)) return;
      const found = walker.landings(filename, spec, names);
      // An unresolvable specifier is reported by check(), for every role rather than this one alone.
      if (found == null) return;
      for (const l of found) {
        const m = norm(l.path).match(/\/domains\/(.+)$/);
        if (!m) {
          // A landing outside every domain carries no layer and no owner, so ROOT.1 cannot be read on it at all, and an un-owned module is where a domain's logic goes to hide.
          // Two landings sit outside a domain by right. Pure core depends on nothing in any domain (ROOT.6), so consuming it re-owns nothing. A declared root's own modules ARE the root, and a root composes its glue at itself (ROOT.2), so a root reaching a sibling module of its own area has crossed no boundary.
          if (!inArea(norm(l.path), core) && !inArea(norm(l.path), compositionRoot)) {
            context.report({ node, message: msg.rootLandsOutside(relOf(l.path)) });
          }
          continue;
        }
        const t = targetOfPath(l.path);
        const verdict = t && rootLandedVerdict(role, t);
        if (verdict) context.report({ node, message: l.via && l.via.length ? `${verdict} (landed via ${l.via.map(relOf).join(' -> ')})` : verdict });
      }
    };
    // SURFACE.2's mirror: a services file may import any inner layer to wire it, but what it RE-EXPORTS is the service contract its composition root consumes.
    // Only publication is judged here; consumption stays free, which is what "composing owned parts re-owns nothing" means.
    const published = (node, spec) => {
      if (node.exportKind === 'type') return;
      const verdict = publishVerdict(role, targetFor(spec).t);
      if (verdict) context.report({ node, message: verdict });
    };

    const judge = (node, spec, names) => {
      check(node, spec);
      if (isRoot) landed(node, spec, names);
    };
    const judgeExport = (node, spec, names) => {
      judge(node, spec, names);
      published(node, spec);
    };

    return {
      ImportDeclaration: (node) => node.source && judge(node, node.source.value, valueNames(node)),
      ExportNamedDeclaration: (node) => node.source && judgeExport(node, node.source.value, valueNames(node)),
      ExportAllDeclaration: (node) => node.source && judgeExport(node, node.source.value, node.exportKind === 'type' ? [] : '*'),
      // A computed specifier resolves nowhere the analyzers can follow. The resolution is undecidable; the silence is not.
      ImportExpression: (node) => {
        const spec = staticSpec(node);
        if (spec != null) return judge(node, spec, '*');
        if (node.source) {
          context.report({ node, message: msg.rootDynamicComputed() });
        }
      },
    };
  },
};

// elda/no-surface-declarations - SURFACE.2 + OWNER.2: a surface curates what the layers own, and declares nothing itself.
// A binding DECLARED on a surface holds no rank, so it has no layer and no owner: the binding walk terminates on a rankless file and every geometry verdict bails on it (the `!t.layer || t.surface` guard).
// That makes the barrel the cheapest laundering path in the system - wrap a use-case in a locally-declared function and every reach through it goes silent - so a surface re-exports, and only re-exports.
// A name bound by an import and then exported keeps its module request, so `export { foo }` over an import stays curation; only a genuine local declaration reports.
const noSurfaceDeclarations = {
  create(context) {
    const { compositionRoot, core } = options(context);
    const role = fileRole(filenameOf(context), compositionRoot, core);
    if (role.kind !== 'surface') return {};
    return {
      Program: (program) => {
        const body = program.body ?? [];
        const imported = new Set();
        for (const n of body) {
          if (n.type !== 'ImportDeclaration' || n.importKind === 'type') continue;
          for (const s of n.specifiers ?? []) {
            if (s.importKind !== 'type' && s.local && s.local.name) imported.add(s.local.name);
          }
        }
        const report = (node, what) => context.report({
          node,
          message: msg.surfaceDeclaration(what),
        });
        for (const n of body) {
          if (n.type === 'ExportDefaultDeclaration') { report(n, 'a default export'); continue; }
          if (n.type !== 'ExportNamedDeclaration' || n.exportKind === 'type') continue;
          if (n.source) continue; // A re-export is exactly what a surface is for.
          if (n.declaration) {
            // A type or interface is vocabulary reference, deliberately unregulated at the edges; only value declarations report.
            const d = n.declaration.type;
            if (d === 'TSTypeAliasDeclaration' || d === 'TSInterfaceDeclaration' || d === 'TSDeclareFunction') continue;
            report(n, 'a binding declared on it');
            continue;
          }
          for (const s of n.specifiers ?? []) {
            if (s.exportKind === 'type') continue;
            const local = s.local && s.local.name;
            if (local && !imported.has(local)) report(s, `the locally-declared \`${local}\``);
          }
        }
      },
    };
  },
};

// elda/no-self-surface - LAYER.1 / SURFACE.3: a domain's surface is what it shows its consumers, and a domain is not a consumer of itself.
// This is the mirror of no-surface-declarations, and the two close the same hole from opposite sides: a surface holds no rank, so a binding DECLARED there has no layer to be judged at, and a binding TAKEN from there arrives with no layer either.
// The taking side is the sharper of the two, because the consumable surface legally carries use-cases (SURFACE.2): a file at entities or use-cases rank that imports its own barrel can take an outer-layer binding through it, and LAYER.1 - a per-file rule reading the specifier - sees a rankless surface and passes. The landing walk does not cover the gap, since it grades flows landing below the consumer's rank and this inversion lands above.
// The verdict is selfSurfaceVerdict in verdicts.js; the target must be resolved for the rule to see anything, because a self-reference by alias (`#/shell/viewport` from inside `shell/viewport`) reads syntactically as a reach at the parent's surface and only the resolved path reveals it as the subdomain's own.
const noSelfSurface = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        domainAlias: { type: 'string' },
        appAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { domainAlias, appAlias, compositionRoot, core } = options(context);
    const filename = filenameOf(context);
    const role = fileRole(filename, compositionRoot, core);
    if (role.kind !== 'domain' && role.kind !== 'surface') return {};
    const walker = walkerOf(filename, domainAlias, appAlias);
    // Only a resolved target is judged. A specifier that names no file cannot be judged at all, and guessing from its shape would report a dangling `./x` as a self-surface import - a verdict about a file that does not exist.
    // The undecidability is not lost by the silence: `imports` reports every unresolvable in-tree specifier in its own right, so one rule owns that finding and this one stays quiet rather than doubling it with a guess.
    const flag = (node, spec) => {
      const { t, found } = resolvedTargetFor(walker, filename, spec, domainAlias, appAlias);
      const verdict = found && t && selfSurfaceVerdict(role, t);
      if (verdict) context.report({ node, message: verdict });
    };
    return {
      ImportDeclaration: (node) => node.source && flag(node, node.source.value),
      ImportExpression: (node) => { const s = staticSpec(node); if (s != null) flag(node, s); },
      ExportNamedDeclaration: (node) => node.source && flag(node, node.source.value),
      ExportAllDeclaration: (node) => node.source && flag(node, node.source.value),
    };
  },
};

// elda/no-layer-branches - LAYER.7: a layer is a classification, never a container, and a grouping node expresses a concern - a subdomain or a unit.
// A directory named for a layer is a horizontal bucket: it accumulates unrelated concerns behind one classification, and the tree stops encoding concerns at that node.
// A layer-SUFFIXED directory (`layouts.services/`) is the same bucket wearing a file's name: it pretends to be one part while hiding a branch underneath - an undeclared subdomain dodging subdomain discipline.
// A UNIT directory (`back-nav/` holding `back-nav.*`) is the legitimate third shape, and it is transparent: it groups one unit's files so a crowded subdomain reads at a glance, and it carries no boundary of its own.
// The reading only holds while the directory holds nothing else. A surface, a bare layer file, a second unit or a nested directory each make the directory MEAN something, and a directory that means something is a concern, which is a subdomain - so the two readings would both apply and neither would be true. The mixture reports here, on whatever is not part of the unit.
// The analyzers still recognize the two legacy layouts so a migrating codebase lints correctly; this rule is the migration's fix-list.
const noLayerBranches = {
  create(context) {
    const filename = filenameOf(context);
    const m = filename.match(/^(.*\/domains)\/(.+)$/);
    if (!m) return {};
    const [, domainsAbs, rel] = m;
    const segs = rel.split('/').filter(Boolean);
    const dirs = segs.slice(0, -1);
    const bucket = dirs.find((s) => LAYERS.includes(s));
    if (bucket) {
      return {
        Program: (node) => context.report({ node, message: msg.layerNamedDir(bucket) }),
      };
    }
    // Walk the file's ancestors: a directory holding a file named for itself is a unit directory, and this file is intruding on it unless it sits directly inside and belongs to that same unit.
    // The walk starts past the top-level domain, which names a concern by being one and is never a grouping node, so a domain holding a unit of its own name (`locale/locale.services.ts`) is redundant rather than mixed.
    const leaf = segs[segs.length - 1];
    for (let i = 1; i < dirs.length; i++) {
      const dir = dirs[i];
      const abs = `${domainsAbs}/${segs.slice(0, i + 1).join('/')}`;
      const entries = dirEntries(abs);
      if (!entries || !entries.some((e) => !e.dir && belongsToUnitDir(e.name, dir))) continue;
      if (i === dirs.length - 1 && belongsToUnitDir(leaf, dir)) continue;
      return {
        Program: (node) => context.report({
          node,
          message: msg.unitDirTwoReadings(dir, leaf),
        }),
      };
    }
    const unitDir = dirs.find((s) => layerOf(s)?.name);
    if (unitDir) {
      return {
        Program: (node) => context.report({ node, message: msg.layerSuffixedDir(unitDir) }),
      };
    }
    return {};
  },
};

// elda/no-service-coupling and elda/no-adapter-coupling - OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows); the verdict logic and the remedy texts are lateralVerdict / LATERAL in verdicts.js.
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
      // A re-export carries the same lateral edge an import does, so `export ... from` and `export * from` are visited too; no-penetration separately flags the star form itself.
      const isValue = (node) => node.importKind !== 'type' && node.exportKind !== 'type';
      return {
        ImportDeclaration: (node) => node.source && isValue(node) && flag(node, node.source.value),
        ImportExpression: (node) => { const s = staticSpec(node); if (s != null) flag(node, s); },
        ExportNamedDeclaration: (node) => node.source && isValue(node) && flag(node, node.source.value),
        ExportAllDeclaration: (node) => node.source && isValue(node) && flag(node, node.source.value),
      };
    },
  };
}

const noServiceCoupling = lateralCoupling('services');
const noAdapterCoupling = lateralCoupling('adapters');

// elda/no-diagonal-reach - SURFACE.5's geometry, enforced on landings: every value reference is followed name by name through surfaces and re-export chains (flow.js) to the files that own the bindings, and each landing is judged by landedVerdict in verdicts.js - the in-subdomain diagonal, and its cross-boundary generalization (the diagrams draw every cross-boundary arrow at equal rank, so a landed value flow below the consumer's own rank is a diagonal no row draws).
// The direct reference is the walk's zero-hop case, so this subsumes the direct-only check; a specifier that resolves to no file keeps the spec-classified direct judgment, so a broken path never hides a finding.
// Severity grows with the ownership regime the launder crossed and never with the distance it travelled (diagonalScope in model.js draws the line), and the rule's options map each class onto a lint level:
//   withinSubdomain    no surface crossed at all - the mildest, a naming-honesty smell between sibling units (default 'warn');
//   acrossSubdomains   a surface the domain itself declared, at any nesting depth (default 'warn');
//   acrossDomains      a foreign domain's surface - a laundered cross-domain crossing off the use-case row (default 'error').
// The lint host binds one level per rule ID and ignores per-report severity, so the mapping is realized as a preset-managed pair sharing this implementation and one option map: `no-diagonal-reach` (configured warn) reports the classes mapped 'warn', and `no-diagonal-reach-gate` (configured error) reports the classes mapped 'error' - a partition, so nothing reports twice and each class keeps its own level.
// The pair travels together and the presets carry both with the same map; every hit resolves by a rename, a promotion to the bare file, or an equal-rank crossing.

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

const LEVEL_ENUM = { enum: ['error', 'warn', 'off'] };
const DIAGONAL_DEFAULTS = { acrossDomains: 'error', acrossSubdomains: 'warn', withinSubdomain: 'warn' };
const DIAGONAL_CLASSES = { acrossDomains: 'across-domains', acrossSubdomains: 'across-subdomains', withinSubdomain: 'within-subdomain' };

function diagonalReach(tier) {
  return {
    meta: {
      schema: [{
        type: 'object',
        properties: {
          domainAlias: { type: 'string' },
          appAlias: { type: 'string' },
          compositionRoot: AREA, core: AREA,
          acrossDomains: LEVEL_ENUM,
          acrossSubdomains: LEVEL_ENUM,
          withinSubdomain: LEVEL_ENUM,
        },
        additionalProperties: false,
      }],
    },
    create(context) {
      const { domainAlias, appAlias, compositionRoot, core } = options(context);
      const o = (context.options && context.options[0]) || {};
      // This instance reports the classes whose mapped level matches its tier; the twin covers the other half.
      const mine = new Set(
        Object.entries(DIAGONAL_CLASSES)
          .filter(([opt]) => (o[opt] ?? DIAGONAL_DEFAULTS[opt]) === tier)
          .map(([, scope]) => scope),
      );
      if (mine.size === 0) return {};
      const filename = filenameOf(context);
      const role = fileRole(filename, compositionRoot, core);
      if (role.kind !== 'domain') return {};
      const walker = walkerOf(filename, domainAlias, appAlias);
      const relOf = (p) => norm(p).match(/\/domains\/(.+)$/)?.[1] ?? norm(p).split('/').pop();
      const judge = (node, t, via) => {
        if (!t || !mine.has(diagonalScope(role, t))) return;
        const verdict = landedVerdict(role, t);
        if (verdict) context.report({ node, message: via && via.length ? `${verdict} (landed via ${via.map(relOf).join(' -> ')})` : verdict });
      };
      const flag = (node, spec, names) => {
        if (names !== '*' && names.length === 0) return;
        const found = walker && walker.landings(filename, spec, names);
        if (found == null) { judge(node, targetOf(filename, spec, domainAlias, appAlias)); return; }
        for (const l of found) judge(node, targetOfPath(l.path), l.via);
      };
      return {
        ImportDeclaration: (node) => node.source && flag(node, node.source.value, valueNames(node)),
        ImportExpression: (node) => { const s = staticSpec(node); if (s != null) flag(node, s, '*'); },
        ExportNamedDeclaration: (node) => node.source && flag(node, node.source.value, valueNames(node)),
        ExportAllDeclaration: (node) => node.source && node.exportKind !== 'type' && flag(node, node.source.value, '*'),
      };
    },
  };
}

const noDiagonalReach = diagonalReach('warn');
const noDiagonalReachGate = diagonalReach('error');

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
        message: msg.importStarOpaque(),
      }),
      ExportAllDeclaration: (node) => context.report({
        node,
        message: msg.exportStar(),
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
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { domainAlias, appAlias, compositionRoot, core } = options(context);
    const filename = filenameOf(context);
    const role = fileRole(filename, compositionRoot, core);
    if (role.kind !== 'domain' && role.kind !== 'surface') return {};
    const m = filename.match(/\/domains\/(.+)$/);
    if (!m) return {};
    const importerDir = m[1].split('/').filter(Boolean).slice(0, -1).join('/');
    const flag = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      if (!t) return; // An external or bare package is not a reach into the domain tree.
      if (t.segs && t.segs.slice(0, -1).join('/') === importerDir) return; // Same unit: co-located.
      context.report({ node, message: msg.deepSideEffect(spec) });
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
    const reportAsync = (node) => node.async && context.report({ node, message: msg.asyncFn() });
    return {
      AwaitExpression: (node) => context.report({ node, message: msg.awaitExpr() }),
      ForOfStatement: (node) => node.await && context.report({ node, message: msg.forAwait() }),
      TryStatement: (node) => context.report({ node, message: msg.tryCatch() }),
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
            context.report({ node, message: msg.mutableExportDecl(node.declaration.kind) });
          }
          if (!node.source) {
            for (const s of node.specifiers ?? []) {
              if (s.local && s.local.type === 'Identifier' && mutable.has(s.local.name)) {
                context.report({ node: s, message: msg.mutableExportNamed(s.local.name) });
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
      properties: { compositionRoot: AREA, core: AREA },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { compositionRoot } = options(context);
    if (!inArea(filenameOf(context), compositionRoot)) return {};
    const isStr = (n) => n && n.type === 'Literal' && typeof n.value === 'string';
    return {
      CallExpression(node) {
        const c = node.callee;
        if (c && c.type === 'MemberExpression' && c.property && c.property.type === 'Identifier') {
          const m = c.property.name;
          if ((m === 'setAttribute' || m === 'setItem' || m === 'setProperty') && isStr(node.arguments && node.arguments[0])) {
            context.report({ node, message: msg.vocabWrite(m, node.arguments[0].value) });
          }
        }
      },
      AssignmentExpression(node) {
        const l = node.left;
        if (l && l.type === 'MemberExpression' && l.object && l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'dataset') {
          context.report({ node, message: msg.vocabDataset() });
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
      Program: (node) => context.report({ node, message: msg.ambientDecl() }),
    };
  },
};

// The rule-name-to-implementation map the plugin surface (index.js) mounts.
export const rules = {
  'imports': imports,
  'no-surface-declarations': noSurfaceDeclarations,
  'no-self-surface': noSelfSurface,
  'no-layer-branches': noLayerBranches,
  'no-diagonal-reach': noDiagonalReach,
  'no-diagonal-reach-gate': noDiagonalReachGate,
  'no-service-coupling': noServiceCoupling,
  'no-adapter-coupling': noAdapterCoupling,
  'no-penetration': noPenetration,
  'no-deep-side-effects': noDeepSideEffects,
  'no-async-inner': noAsyncInner,
  'no-mutable-surface': noMutableSurface,
  'vocab-gate': vocabGate,
  'ambient-ownership': ambientOwnership,
};
