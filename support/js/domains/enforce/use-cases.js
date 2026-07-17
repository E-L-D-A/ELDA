// The ELDA lint rules: each reads a file's role and its references from the oxlint / ESTree host, judges every reference with the shared model and verdicts, and reports.
// The roles come from the resolved graph (ownership.js) through the same scan the visualizer runs, so the linter and the diagram judge every edge identically; the reference verdicts live in verdicts.js, and the path reading survives only as the fallback for a file no graph holds.
// The plugin object oxlint mounts, and the grade presets, are assembled in index.js from the rules map this file exports.

import * as msg from '../../core/entities/messages.js';
import {
  diagonalScope,
  fileRole,
  inArea,
  inTreeSpec,
  norm,
  targetOf,
  targetOfPath,
} from '../../core/entities/model.js';
import { graphRoles } from '../../core/use-cases/ownership.js';
import {
  importVerdict,
  landedVerdict,
  lateralVerdict,
  publishVerdict,
  rootLandedVerdict,
  selfSurfaceVerdict,
  unjudgedVerdict,
} from '../../core/use-cases/verdicts.js';

// The scan, the walker, and the app-root resolution sit at ranks above this one (core's services, core's adapters), so the rules declare the needs here and enforce's services file supplies the implementations by ordinary composition (LAYER.2); this module touches no filesystem and reaches nothing upward.
let host = { appRootOf: () => null, buildGraph: () => null, createWalker: () => null };
export const wire = (injected) => {
  host = { ...host, ...injected };
};
const appRootOf = (filename) => host.appRootOf(filename);
const buildGraph = (appRoot) => host.buildGraph(appRoot);
const createWalker = (opts) => host.createWalker(opts);

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
  const aliases = o.aliases ?? { '#': 'domains' };
  const ownershipAlias = o.ownershipAlias ?? '#';
  return {
    aliases,
    ownershipAlias,
    ownershipDir: aliases[ownershipAlias] ?? 'domains',
    compositionRoot: o.compositionRoot ?? 'routes',
    core: o.core ?? 'core',
  };
}

// The walker for the app a file belongs to: it resolves specifiers the way the bundler would, and follows value names to their landings.
// Memoized per src directory, so a lint pass builds one per app and every rule shares its parse cache.
const walkers = new Map();
const walkerFor = (appRoot, { aliases, ownershipDir, core }) => {
  const key = `${appRoot}|${JSON.stringify(aliases)}|${ownershipDir}`;
  if (!walkers.has(key)) walkers.set(key, createWalker({ appRoot, aliases, ownershipDir, core }));
  return walkers.get(key);
};
const walkerOf = (filename, opts) => {
  const appRoot = appRootOf(filename);
  return appRoot ? walkerFor(appRoot, opts) : null;
};

// The whole resolved graph for the app a file belongs to, built once and shared across the per-file passes.
// A rule resolves its own edges through the walker one file at a time and drops what it found; the classifier reads a file's domain and boundary off its position in the graph instead of its path, and that needs the graph kept.
// So the same scan the visualizer runs is memoized here, keyed by app root, and the enforcer and the informer read one graph. The app root is the directory carrying the app's .oxlintrc.json, which is what the scan resolves against.
const graphs = new Map();
const graphFor = (filename) => {
  const appRoot = appRootOf(filename);
  if (!appRoot) return null;
  if (!graphs.has(appRoot)) graphs.set(appRoot, buildGraph(appRoot));
  return graphs.get(appRoot);
};

// The graph-inferred role for a file, and a lookup for any resolved target, taken from the app's one graph.
// This is where placement stops carrying information: a file's domain and boundary come from its position in the resolved graph (ownership.js), and only a file the graph cannot reach at all falls back to the path classification.
const roleMaps = new Map();
const rolesByPath = (graph) => {
  let byPath = roleMaps.get(graph);
  if (!byPath) {
    byPath = new Map();
    const roles = graphRoles(graph);
    for (const f of graph.files) {
      const rec = roles.get(f.id);
      byPath.set(`${graph.cwd}/${f.path}`, { role: { ...rec.role, asset: f.kind === 'asset' }, dispute: rec.dispute ?? null });
    }
    roleMaps.set(graph, byPath);
  }
  return byPath;
};
const graphClassify = (filename, opts) => {
  const graph = graphFor(filename);
  if (!graph) return { role: fileRole(filename, opts), roleAt: () => null, dispute: null };
  const byPath = rolesByPath(graph);
  return {
    role: byPath.get(filename)?.role ?? fileRole(filename, opts),
    roleAt: (abs) => byPath.get(norm(abs))?.role ?? null,
    dispute: byPath.get(filename)?.dispute ?? null,
  };
};

// Resolve first, judge second.
// A specifier's trailing plain segment does not say whether it names a surface of the chain or a nested subdomain's barrel, and reading the shape alone forces a rule to accept a reference whenever EITHER reading is legal - a tolerance that buys silence on the ambiguity by spending it on everything the ambiguity overlaps.
// The filesystem knows which file the specifier means, so the target is read off the resolved path and judged once.
// Where resolution finds no file the tolerant reading stands, which keeps a broken path from manufacturing a finding; a root's landing walk reports that same unresolvable path separately, so the silence here is covered.
// `found` says the specifier named a real file; `resolved` says the target was read off that file rather than guessed from the specifier's shape.
// The two come apart, and conflating them reports every legal reach into pure core or a root's own module as undecidable: those resolve perfectly well and simply carry no domain target, which is a fact about the file and not a failure to find it.
const resolvedTargetFor = (walker, filename, spec, { ownershipAlias, ownershipDir }) => {
  const abs = walker && typeof spec === 'string' ? walker.resolveSpec(filename, spec) : null;
  if (abs) return { t: targetOfPath(abs, ownershipDir), resolved: true, found: true };
  return { t: targetOf(filename, spec, ownershipAlias, ownershipDir), resolved: false, found: false };
};

// The target's role read from the same graph as the importer's: the resolved file's inferred role when the graph holds it, the path reading when it does not.
// A domain, surface, or core role carries a boundary the reference rules read - core directionally, per judgeImport - while a root or unclassified target judges as no target at all rather than as a path guess about a file the graph already placed.
const graphTargetFor = (roleAt, walker, filename, spec, opts) => {
  const abs = walker && typeof spec === 'string' ? walker.resolveSpec(filename, spec) : null;
  const gr = abs ? roleAt(abs) : null;
  if (gr) {
    const readable = gr.kind === 'domain' || gr.kind === 'surface' || gr.kind === 'core';
    return { t: readable ? gr : null, resolved: true, found: true };
  }
  return resolvedTargetFor(walker, filename, spec, opts);
};

// elda/imports - the hard, decidable layer + boundary invariants (Tier 1): LAYER.1, ROOT.6, ROOT.1, ROOT.7, SURFACE.2, SURFACE.3, SURFACE.7 (see judgeImport in verdicts.js for the per-constraint reading).
// Targets are resolved against the filesystem before they are judged, so each reference is read as the one file it means.
// The graded lateral smells are the separate warn-level rules (no-service-coupling, no-adapter-coupling).
const imports = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        aliases: { type: 'object', additionalProperties: { type: 'string' } },
        ownershipAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const opts = options(context);
    const { aliases, ownershipAlias, ownershipDir, compositionRoot, core } = opts;
    const filename = filenameOf(context);
    const { role, roleAt } = graphClassify(filename, opts);
    if (role.kind === 'other') return {};

    const walker = walkerOf(filename, opts);
    const targetFor = (spec) => graphTargetFor(roleAt, walker, filename, spec, opts);

    // In-tree code that names no file is undecidable, not innocent. Every role pays this, because a reach nobody can judge is a reach nobody is checking.
    const check = (node, spec) => {
      const { t, resolved, found } = targetFor(spec);
      if (walker && !found && inTreeSpec(spec, aliases)) {
        context.report({ node, message: unjudgedVerdict(role, spec, 'is shaped like in-tree code yet resolves to no file') });
        return;
      }
      if (!t) return;
      const verdict = importVerdict(role, t, ownershipAlias, resolved);
      if (verdict) context.report({ node, message: verdict });
    };

    // On the root's row ROOT.1 is a landing question: a barrel carries no layer of its own, so the per-specifier reading above passes a binding that in fact lands on a use-case.
    // The walk follows each value name to the file that owns it and judges it there, the way the diagonal rule already reads domain files.
    const isRoot = role.kind === 'composition-root';
    const relOf = (p) => {
      const h = norm(p);
      const i = h.indexOf('/' + ownershipDir + '/');
      return i >= 0 ? h.slice(i + ownershipDir.length + 2) : h.split('/').pop();
    };
    const landed = (node, spec, names) => {
      if (!walker || (names !== '*' && names.length === 0)) return;
      const found = walker.landings(filename, spec, names);
      // An unresolvable specifier is reported by check(), for every role rather than this one alone.
      if (found == null) return;
      for (const l of found) {
        const gr = roleAt(l.path);
        const readable = gr && (gr.kind === 'domain' || gr.kind === 'surface' || gr.kind === 'core');
        const t = readable ? gr : targetOfPath(l.path, ownershipDir);
        if (!t) {
          // A landing outside every domain carries no layer and no owner, so ROOT.1 cannot be read on it at all, and an un-owned module is where a domain's logic goes to hide.
          // A declared root's own modules ARE the root, and a root composes its glue at itself (ROOT.2), so a root reaching a sibling module of its own area has crossed no boundary.
          if (!inArea(norm(l.path), core) && !inArea(norm(l.path), compositionRoot)) {
            context.report({ node, message: msg.rootLandsOutside(relOf(l.path)) });
          }
          continue;
        }
        const verdict = rootLandedVerdict(role, t);
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

    // Publication in disguise: on a services file, `export const x = importedBinding` forwards the import exactly as a re-export would, while contributing nothing of its own - the aliasing declaration adopts the binding in the walk's eyes and dodges the re-export check.
    // The import that fed the alias is tracked by local name, so the declaration is judged as the publication it is.
    const importedFrom = new Map();
    const trackImports = (node) => {
      if (!node.source || node.importKind === 'type') return;
      for (const s of node.specifiers ?? []) {
        if (s.importKind !== 'type' && s.local?.name) importedFrom.set(s.local.name, node.source.value);
      }
    };
    const publishedAlias = (node) => {
      if (role.layer !== 'services' || node.exportKind === 'type' || node.source || !node.declaration) return;
      if (node.declaration.type !== 'VariableDeclaration') return;
      for (const d of node.declaration.declarations ?? []) {
        const spec = d.init?.type === 'Identifier' ? importedFrom.get(d.init.name) : null;
        if (spec != null) published(node, spec);
      }
    };

    return {
      ImportDeclaration: (node) => {
        trackImports(node);
        if (node.source) judge(node, node.source.value, valueNames(node));
      },
      ExportNamedDeclaration: (node) => {
        publishedAlias(node);
        if (node.source) judgeExport(node, node.source.value, valueNames(node));
      },
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
// A core file that carries a surface is judged the same way: core modules are domains (the bottom of the sharedness DAG), and a plain-named loner file is a whole domain doubling as its own surface, so its declarations report with the remedy that fits - a layer suffix, or extraction.
const noSurfaceDeclarations = {
  create(context) {
    const opts = options(context);
    const { role } = graphClassify(filenameOf(context), opts);
    const coreSurface = role.kind === 'core' && role.surface != null;
    if (role.kind !== 'surface' && !coreSurface) return {};
    const loner = coreSurface && (role.chain ?? [])[Math.max(0, (role.chain ?? []).length - 1)] === role.surface;
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
          message: loner ? msg.surfaceDeclarationLoner(what) : msg.surfaceDeclaration(what),
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
        aliases: { type: 'object', additionalProperties: { type: 'string' } },
        ownershipAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const opts = options(context);
    const filename = filenameOf(context);
    const { role, roleAt } = graphClassify(filename, opts);
    if (role.kind !== 'domain' && role.kind !== 'surface') return {};
    const walker = walkerOf(filename, opts);
    // Only a resolved target is judged. A specifier that names no file cannot be judged at all, and guessing from its shape would report a dangling `./x` as a self-surface import - a verdict about a file that does not exist.
    // The undecidability is not lost by the silence: `imports` reports every unresolvable in-tree specifier in its own right, so one rule owns that finding and this one stays quiet rather than doubling it with a guess.
    const flag = (node, spec) => {
      const { t, found } = graphTargetFor(roleAt, walker, filename, spec, opts);
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

// elda/no-service-coupling and elda/no-adapter-coupling - OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows); the verdict logic and the remedy texts are lateralVerdict / LATERAL in verdicts.js.
// Warn-level - smells, not hard breaches - and separately togglable.
function lateralCoupling(layer) {
  return {
    meta: {
      schema: [{
        type: 'object',
        properties: {
          aliases: { type: 'object', additionalProperties: { type: 'string' } },
          ownershipAlias: { type: 'string' },
        },
        additionalProperties: false,
      }],
    },
    create(context) {
      const opts = options(context);
      const filename = filenameOf(context);
      const { role, roleAt } = graphClassify(filename, opts);
      if (role.kind !== 'domain' || role.layer !== layer || role.chain.length === 0) return {};
      const walker = walkerOf(filename, opts);
      const flag = (node, spec) => {
        const { t } = graphTargetFor(roleAt, walker, filename, spec, opts);
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
          aliases: { type: 'object', additionalProperties: { type: 'string' } },
          ownershipAlias: { type: 'string' },
          compositionRoot: AREA, core: AREA,
          acrossDomains: LEVEL_ENUM,
          acrossSubdomains: LEVEL_ENUM,
          withinSubdomain: LEVEL_ENUM,
        },
        additionalProperties: false,
      }],
    },
    create(context) {
      const opts = options(context);
      const { ownershipAlias, ownershipDir } = opts;
      const o = (context.options && context.options[0]) || {};
      // This instance reports the classes whose mapped level matches its tier; the twin covers the other half.
      const mine = new Set(
        Object.entries(DIAGONAL_CLASSES)
          .filter(([opt]) => (o[opt] ?? DIAGONAL_DEFAULTS[opt]) === tier)
          .map(([, scope]) => scope),
      );
      if (mine.size === 0) return {};
      const filename = filenameOf(context);
      const { role, roleAt } = graphClassify(filename, opts);
      if (role.kind !== 'domain') return {};
      const walker = walkerOf(filename, opts);
      const relOf = (p) => {
      const h = norm(p);
      const i = h.indexOf('/' + ownershipDir + '/');
      return i >= 0 ? h.slice(i + ownershipDir.length + 2) : h.split('/').pop();
    };
      const judge = (node, t, via) => {
        if (!t || !mine.has(diagonalScope(role, t))) return;
        const verdict = landedVerdict(role, t);
        if (verdict) context.report({ node, message: via && via.length ? `${verdict} (landed via ${via.map(relOf).join(' -> ')})` : verdict });
      };
      const flag = (node, spec, names) => {
        if (names !== '*' && names.length === 0) return;
        const found = walker && walker.landings(filename, spec, names);
        if (found == null) { judge(node, targetOf(filename, spec, ownershipAlias, ownershipDir)); return; }
        // A landing in core is legal at or below the consumer's own rank - the geometry here only grades below-rank landings, which are the leans the diagram blesses - so a core-classified landing carries no target to grade, and the upward reach is judged on the authored edge.
        for (const l of found) {
          const gr = roleAt(l.path);
          judge(node, gr ? (gr.kind === 'domain' || gr.kind === 'surface' ? gr : null) : targetOfPath(l.path, ownershipDir), l.via);
        }
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
// In the file's own directory that is fine - a co-located stylesheet is part of the unit, and co-location is the directory itself, wherever it lives - and the composition root composes global effects without restriction (ROOT.2).
// The smell is a side-effect import that reaches past that directory into another module: a deep effect that co-location would make honest, or a named value would make visible.
// External packages (a polyfill, a vendor stylesheet) resolve to no in-tree file and pass; an in-tree specifier that resolves nowhere is the imports rule's own finding.
// Warn-level and separately togglable.
const noDeepSideEffects = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        aliases: { type: 'object', additionalProperties: { type: 'string' } },
        ownershipAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const opts = options(context);
    const filename = filenameOf(context);
    const { role } = graphClassify(filename, opts);
    if (role.kind !== 'domain' && role.kind !== 'surface') return {};
    const walker = walkerOf(filename, opts);
    const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));
    const flag = (node, spec) => {
      const abs = walker && walker.resolveSpec(filename, spec);
      if (!abs) return;
      if (dirOf(norm(abs)) === dirOf(filename)) return;
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
    const opts = options(context);
    const { role } = graphClassify(filenameOf(context), opts);
    if (role.kind !== 'domain' || (role.layer !== 'entities' && role.layer !== 'use-cases')) return {};
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
    const opts = options(context);
    const { role } = graphClassify(filenameOf(context), opts);
    if (role.kind !== 'domain' && role.kind !== 'surface' && role.kind !== 'core') return {};
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

// elda/no-dishonest-placement - the thesis's own rule: placement is a claim the graph adjudicates, and a claim the graph contradicts is the finding.
// The two judges are computed in ownership.js: the tree's claim and the graph's surface-ownership reading. Where they disagree, this rule reports the contest once, on the file itself, and every other rule judges the file by its claim - so the tree behaves the way its author reads it, and one honest finding replaces a cascade of re-homed neighbours.
// Warn-level: the contest is mechanically decidable, and the remedy - attribute the consumption, publish a surface, or move the file - is the reviewer's call.
const noDishonestPlacement = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        aliases: { type: 'object', additionalProperties: { type: 'string' } },
        ownershipAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const opts = options(context);
    const { dispute } = graphClassify(filenameOf(context), opts);
    if (!dispute) return {};
    return {
      Program: (node) => context.report({ node, message: dispute }),
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

// elda/no-entity-state - LAYER.4: entities hold pure domain invariants and own no state.
// A module-level `let`/`var` in an entities file is state at the pure rank, whether exported or private behind an accessor; the decidable slice is the mutable binding itself, and whether a const collection is mutated stays with review, the same split no-mutable-surface declares for CHANNEL.4.
const noEntityState = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        aliases: { type: 'object', additionalProperties: { type: 'string' } },
        ownershipAlias: { type: 'string' },
        compositionRoot: AREA, core: AREA,
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const opts = options(context);
    const { role } = graphClassify(filenameOf(context), opts);
    if (role.layer !== 'entities' || role.asset) return {};
    return {
      Program: (program) => {
        for (const n of program.body ?? []) {
          const decl =
            n.type === 'VariableDeclaration' ? n
            : n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'VariableDeclaration' ? n.declaration
            : null;
          if (!decl || decl.kind === 'const') continue;
          for (const d of decl.declarations ?? []) {
            context.report({ node: decl, message: msg.entityState(d.id?.name ?? 'it') });
          }
        }
      },
    };
  },
};

// elda/ambient-ownership - OWNER.2: ambient declarations are vocabulary, owned by a domain.
// A .d.ts outside the ownership tree and every declared core is an un-owned catch-all (the type-layer `shared/` column).
const ambientOwnership = {
  meta: { schema: [{ type: 'object', properties: { aliases: { type: 'object', additionalProperties: { type: 'string' } }, ownershipAlias: { type: 'string' }, compositionRoot: AREA, core: AREA }, additionalProperties: false }] },
  create(context) {
    const { ownershipDir, core } = options(context);
    const f = filenameOf(context);
    if (!(f.endsWith('.d.ts') && !inArea(f, ownershipDir) && !inArea(f, core))) return {};
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
  'no-diagonal-reach': noDiagonalReach,
  'no-diagonal-reach-gate': noDiagonalReachGate,
  'no-service-coupling': noServiceCoupling,
  'no-adapter-coupling': noAdapterCoupling,
  'no-penetration': noPenetration,
  'no-dishonest-placement': noDishonestPlacement,
  'no-deep-side-effects': noDeepSideEffects,
  'no-async-inner': noAsyncInner,
  'no-mutable-surface': noMutableSurface,
  'no-entity-state': noEntityState,
  'vocab-gate': vocabGate,
  'ambient-ownership': ambientOwnership,
};
