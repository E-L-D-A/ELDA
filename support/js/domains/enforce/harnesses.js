// The coupling gear between the rules and the wired world (the harness posture): the memoized walker, the memoized whole-graph scan, the graph-backed classification, the resolve-first target reading, and the mounting engine that speaks the oxlint protocol.
// The scan, the walker, and the app-root resolution sit at ranks above this one (core's services, core's harnesses), so this file declares those needs and enforce's services file supplies the implementations by ordinary composition (LAYER.2); nothing here reaches upward, and the caches over those reads are this gear's own state.
// The rules (flows.js) are host-free definitions this engine consumes downward: services.js hands each definition to mountRule, the engine translates the host's AST walk into neutral events, and every report anchors on an opaque node token the definition passes back unread.

import { OPTION_DEFAULTS, fileRole, norm, targetOf, targetOfPath } from '../../core/axioms/model.js';
import { graphRoles } from '../../core/flows/ownership.js';
import { RULES, VOCAB_WRITE_METHODS, scanFault } from './axioms.js';
import {
  ambientOwnership,
  imports,
  noAsyncInner,
  noAxiomState,
  noDeepSideEffects,
  noDiagonalReach,
  noDiagonalReachGate,
  noDishonestPlacement,
  noHarnessCoupling,
  noMutableSurface,
  noPenetration,
  noSelfSurface,
  noServiceCoupling,
  noSurfaceDeclarations,
  vocabGate,
} from './flows.js';

let host = { appRootOf: () => null, buildGraph: () => null, createWalker: () => null, readOptions: () => null };
export const wire = (injected) => {
  host = { ...host, ...injected };
};
const appRootOf = (filename) => host.appRootOf(filename);
const buildGraph = (appRoot) => host.buildGraph(appRoot);
const createWalker = (opts) => host.createWalker(opts);

// The project options for the app a file belongs to, derived once per app root and shared by every rule.
// The per-rule lint options carry only rule-specific knobs (the diagonal class map); paths, aliases, and areas come from this one read, the same read the graph is built from, so the enforcer and the informer can never disagree on what the tree is.
// A read that throws is caught here and recorded per app root: the rules degrade to the file-name fallback, and the imports rule declares the degradation on every file, since a swallowed fault would under-report in silence.
const projectOptions = new Map();
const faults = new Map();
const NO_APP = { aliases: {}, ownershipAlias: null, ownershipDir: null, compositionRoot: OPTION_DEFAULTS.compositionRoot, core: [], notices: [] };
const recordFault = (appRoot, phase, error) => {
  if (!faults.has(appRoot)) faults.set(appRoot, `${phase}: ${(error && error.message) || String(error)}`);
};
const faultOf = (filename) => {
  const appRoot = appRootOf(filename);
  return appRoot ? (faults.get(appRoot) ?? null) : null;
};
const optionsFor = (filename) => {
  const appRoot = appRootOf(filename);
  if (!appRoot) return NO_APP;
  if (!projectOptions.has(appRoot)) {
    try {
      projectOptions.set(appRoot, host.readOptions(appRoot) ?? NO_APP);
    } catch (error) {
      recordFault(appRoot, 'reading the project structure', error);
      projectOptions.set(appRoot, NO_APP);
    }
  }
  return projectOptions.get(appRoot);
};

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
  if (!graphs.has(appRoot)) {
    try {
      graphs.set(appRoot, buildGraph(appRoot));
    } catch (error) {
      recordFault(appRoot, 'the whole-graph scan', error);
      graphs.set(appRoot, null);
    }
  }
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
// A domain, surface, or core role carries a boundary the reference rules read - core directionally, per judgeImport - while a root, unsorted, or unclassified target judges as no target at all rather than as a path guess about a file the graph already placed.
const graphTargetFor = (roleAt, walker, filename, spec, opts) => {
  const abs = walker && typeof spec === 'string' ? walker.resolveSpec(filename, spec) : null;
  const gr = abs ? roleAt(abs) : null;
  if (gr) {
    const readable = gr.kind === 'domain' || gr.kind === 'surface' || gr.kind === 'core';
    return { t: readable ? gr : null, resolved: true, found: true };
  }
  return resolvedTargetFor(walker, filename, spec, opts);
};

// ---------------------------------------------------------------------------
// The mounting engine: the oxlint protocol, spoken once.

const filenameOf = (context) => norm(context.filename ?? (context.getFilename && context.getFilename()) ?? '');

const options = (context) => optionsFor(filenameOf(context));

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

// AST-level value names: named imports minus type-only ones, `default`, and a namespace or dynamic import as '*' - the whole module.
const valueNames = (node) => {
  if (node.importKind === 'type' || node.exportKind === 'type') return [];
  const names = [];
  for (const s of node.specifiers ?? []) {
    if (s.type === 'ImportSpecifier') { if (s.importKind !== 'type') names.push(s.imported.name ?? s.imported.value); }
    else if (s.type === 'ImportDefaultSpecifier') names.push('default');
    else if (s.type === 'ImportNamespaceSpecifier') return '*';
    else if (s.type === 'ExportSpecifier') { if (s.exportKind !== 'type') names.push(s.local.name ?? s.local.value); }
  }
  return names;
};

const patternNames = (id, out) => {
  if (!id) return;
  switch (id.type) {
    case 'Identifier': out.add(id.name); break;
    case 'ObjectPattern': for (const p of id.properties) patternNames(p.value ?? p.argument, out); break;
    case 'ArrayPattern': for (const el of id.elements) patternNames(el, out); break;
    case 'AssignmentPattern': patternNames(id.left, out); break;
    case 'RestElement': patternNames(id.argument, out); break;
  }
};

// The visitor set for one mounted definition, built from the events its handlers subscribe, so a rule pays only for what it listens to.
// Every event carries an `anchor`: the host node as an opaque token, read by nobody outside this file and handed back to report unopened.
const visitorsFor = (on) => {
  const v = {};
  const emitRef = (anchor, spec, kind, names, typeOnly, sideEffect) =>
    on.reference && on.reference({ anchor, spec, kind, names, typeOnly, sideEffect: !!sideEffect });

  if (on.reference || on.dynamicComputed || on.aliasedPublication) {
    // Publication in disguise rides ordinary declarations: `export const x = importedBinding` forwards the import exactly as a re-export would, so the imports that feed such aliases are tracked by local name in document order.
    const importedFrom = new Map();
    v.ImportDeclaration = (node) => {
      if (!node.source) return;
      if (on.aliasedPublication && node.importKind !== 'type') {
        for (const s of node.specifiers ?? []) {
          if (s.importKind !== 'type' && s.local?.name) importedFrom.set(s.local.name, node.source.value);
        }
      }
      emitRef(node, node.source.value, 'import', valueNames(node), node.importKind === 'type', (node.specifiers ?? []).length === 0);
    };
    v.ExportNamedDeclaration = (node) => {
      if (on.aliasedPublication && node.exportKind !== 'type' && !node.source && node.declaration?.type === 'VariableDeclaration') {
        for (const d of node.declaration.declarations ?? []) {
          const spec = d.init?.type === 'Identifier' ? importedFrom.get(d.init.name) : null;
          if (spec != null) on.aliasedPublication({ anchor: node, spec });
        }
      }
      if (node.source) emitRef(node, node.source.value, 'reexport', valueNames(node), node.exportKind === 'type');
    };
    v.ExportAllDeclaration = (node) =>
      node.source && emitRef(node, node.source.value, 'reexport-all', node.exportKind === 'type' ? [] : '*', node.exportKind === 'type');
    v.ImportExpression = (node) => {
      const spec = staticSpec(node);
      if (spec != null) emitRef(node, spec, 'dynamic', '*', false);
      else if (node.source && on.dynamicComputed) on.dynamicComputed({ anchor: node });
    };
  }

  if (on.namespaceImport) v.ImportNamespaceSpecifier = (node) => on.namespaceImport({ anchor: node });

  if (on.awaitExpr) v.AwaitExpression = (node) => on.awaitExpr({ anchor: node });
  if (on.forAwait) v.ForOfStatement = (node) => node.await && on.forAwait({ anchor: node });
  if (on.tryStatement) v.TryStatement = (node) => on.tryStatement({ anchor: node, hasCatch: node.handler != null });
  if (on.asyncFunction) {
    const fn = (node) => node.async && on.asyncFunction({ anchor: node });
    v.FunctionDeclaration = fn;
    v.FunctionExpression = fn;
    v.ArrowFunctionExpression = fn;
  }

  if (on.program || on.defaultExport || on.exportedDeclaration || on.exportedName || on.mutableDeclaration) {
    v.Program = (program) => {
      if (on.program) on.program({ anchor: program });
      const body = program.body ?? [];
      const importedLocals = new Set();
      const mutable = new Set();
      for (const n of body) {
        if (n.type === 'ImportDeclaration' && n.importKind !== 'type') {
          for (const s of n.specifiers ?? []) if (s.importKind !== 'type' && s.local?.name) importedLocals.add(s.local.name);
        }
        if (n.type === 'VariableDeclaration' && n.kind !== 'const') {
          for (const d of n.declarations) patternNames(d.id, mutable);
        }
      }
      for (const n of body) {
        const decl =
          n.type === 'VariableDeclaration' ? n
          : n.type === 'ExportNamedDeclaration' && n.declaration?.type === 'VariableDeclaration' ? n.declaration
          : null;
        if (decl && decl.kind !== 'const' && on.mutableDeclaration) {
          for (const d of decl.declarations ?? []) on.mutableDeclaration({ anchor: decl, name: d.id?.name ?? null });
        }
        if (n.type === 'ExportDefaultDeclaration' && on.defaultExport) on.defaultExport({ anchor: n });
        if (n.type !== 'ExportNamedDeclaration') continue;
        const isType = n.exportKind === 'type';
        if (n.declaration && on.exportedDeclaration) {
          const t = n.declaration.type;
          const declKind =
            t === 'VariableDeclaration' ? n.declaration.kind
            : t === 'TSTypeAliasDeclaration' || t === 'TSInterfaceDeclaration' || t === 'TSDeclareFunction' ? 'type'
            : t === 'FunctionDeclaration' ? 'function'
            : t === 'ClassDeclaration' ? 'class'
            : 'other';
          on.exportedDeclaration({ anchor: n, isType, declKind });
        }
        if (on.exportedName) {
          for (const s of n.specifiers ?? []) {
            const name = s.local?.name ?? null;
            on.exportedName({
              anchor: s,
              name,
              isType: isType || s.exportKind === 'type',
              imported: name != null && importedLocals.has(name),
              mutable: name != null && mutable.has(name),
              fromSource: !!n.source,
            });
          }
        }
      }
    };
  }

  if (on.namespaceWrite || on.datasetWrite) {
    const isStr = (n) => n && n.type === 'Literal' && typeof n.value === 'string';
    if (on.namespaceWrite) {
      v.CallExpression = (node) => {
        const c = node.callee;
        if (c && c.type === 'MemberExpression' && c.property && c.property.type === 'Identifier') {
          const m = c.property.name;
          if (VOCAB_WRITE_METHODS.includes(m) && isStr(node.arguments && node.arguments[0])) {
            on.namespaceWrite({ anchor: node, method: m, key: node.arguments[0].value });
          }
        }
      };
    }
    if (on.datasetWrite) {
      v.AssignmentExpression = (node) => {
        const l = node.left;
        if (l && l.type === 'MemberExpression' && l.object && l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'dataset') {
          on.datasetWrite({ anchor: node });
        }
      };
    }
  }

  return v;
};

// One definition in, one oxlint rule object out: the engine parses the options, classifies the file, gates, prepares the definition's api, and drives its handlers with neutral events.
// A recorded scan fault reports through the imports rule alone - one declaration per file rather than one per rule - and it rides every return path, because a faulted app classifies its files as nothing and the gates would otherwise silence the declaration too.
const mountRule = (def) => ({
  meta: def.schema ? { schema: def.schema } : {},
  create(context) {
    const opts = options(context);
    const filename = filenameOf(context);
    const { role, roleAt, dispute } = graphClassify(filename, opts);
    const fault = def === imports ? faultOf(filename) : null;
    const declared = (v) => {
      if (!fault) return v;
      const inner = v.Program;
      v.Program = (node) => {
        context.report({ node, message: scanFault(fault) });
        if (inner) inner(node);
      };
      return v;
    };
    if (def.gate && !def.gate({ role, filename, opts })) return declared({});
    const walker = walkerOf(filename, opts);
    const api = {
      role,
      opts,
      filename,
      dispute,
      raw: (context.options && context.options[0]) || {},
      report: (anchor, message) => context.report({ node: anchor, message }),
      targetFor: (spec) => graphTargetFor(roleAt, walker, filename, spec, opts),
      landings: (spec, names) => (walker ? walker.landings(filename, spec, names) : null),
      resolve: (spec) => (walker ? walker.resolveSpec(filename, spec) : null),
      roleAt,
      hasWalker: () => walker != null,
    };
    const on = def.file(api);
    if (!on) return declared({});
    return declared(visitorsFor(on));
  },
});

// The rules oxlint sees, mounted as they are mapped: the public IDs come from the vocabulary (RULES), the judgments from flows.js, and the oxlint rule objects are this gear's product.
export const rules = {
  [RULES.imports]: mountRule(imports),
  [RULES.noSurfaceDeclarations]: mountRule(noSurfaceDeclarations),
  [RULES.noSelfSurface]: mountRule(noSelfSurface),
  [RULES.noDiagonalReach]: mountRule(noDiagonalReach),
  [RULES.noDiagonalReachGate]: mountRule(noDiagonalReachGate),
  [RULES.noServiceCoupling]: mountRule(noServiceCoupling),
  [RULES.noHarnessCoupling]: mountRule(noHarnessCoupling),
  [RULES.noPenetration]: mountRule(noPenetration),
  [RULES.noDishonestPlacement]: mountRule(noDishonestPlacement),
  [RULES.noDeepSideEffects]: mountRule(noDeepSideEffects),
  [RULES.noAsyncInner]: mountRule(noAsyncInner),
  [RULES.noMutableSurface]: mountRule(noMutableSurface),
  [RULES.noAxiomState]: mountRule(noAxiomState),
  [RULES.vocabGate]: mountRule(vocabGate),
  [RULES.ambientOwnership]: mountRule(ambientOwnership),
};