// The ELDA lint rules as host-free definitions: each is a gate over roles plus handlers over neutral events, judging with the shared model and verdicts and reporting through a supplied port.
// The oxlint protocol lives in one place - the mounting engine in harnesses.js - which consumes these definitions downward, prepares each file's role and resolution api, and drives the handlers; nothing here reads a host context, an AST node, or a visitor key.
// An event's `anchor` is an opaque token: a definition passes it back to report unopened, so a finding lands on the right source span without the definition knowing what a span is.
// A definition's shape: { schema?, gate?({ role, filename, opts }), file(api) -> handlers | null }, with api = { role, opts, filename, dispute, raw, report(anchor, msg), targetFor(spec), landings(spec, names), resolve(spec), roleAt(abs), hasWalker() }.

import * as msg from '../../core/axioms/messages.js';
import {
  diagonalScope,
  inArea,
  inTreeSpec,
  norm,
  targetOf,
  targetOfPath,
} from '../../core/axioms/model.js';
import {
  importVerdict,
  landedVerdict,
  lateralVerdict,
  publishVerdict,
  rootLandedVerdict,
  selfSurfaceVerdict,
  unjudgedVerdict,
} from '../../core/flows/verdicts.js';
import { DIAGONAL_CLASSES, DIAGONAL_DEFAULTS, DIAGONAL_SCHEMA, LATERAL_SCHEMA, OPTIONS_SCHEMA, VOCAB_SCHEMA } from './axioms.js';

// A path shortened to its ownership-tree remainder, for the landed-via chains a verdict prints.
const relOfIn = (ownershipDir) => (p) => {
  const h = norm(p);
  const i = h.indexOf('/' + ownershipDir + '/');
  return i >= 0 ? h.slice(i + ownershipDir.length + 2) : h.split('/').pop();
};

// elda/imports - the hard, decidable layer + boundary invariants (Tier 1): LAYER.1, ROOT.6, ROOT.1, ROOT.7, SURFACE.2, SURFACE.3, SURFACE.7 (see judgeImport in verdicts.js for the per-constraint reading).
// Targets are resolved against the filesystem before they are judged, so each reference is read as the one file it means.
// The graded lateral smells are the separate warn-level rules (no-service-coupling, no-harness-coupling).
export const imports = {
  schema: OPTIONS_SCHEMA,
  gate: ({ role }) => role.kind !== 'other' && role.kind !== 'unsorted',
  file: (api) => {
    const { role } = api;
    const { aliases, ownershipAlias, ownershipDir, compositionRoot, core } = api.opts;

    // In-tree code that names no file is undecidable, not innocent. Every role pays this, because a reach nobody can judge is a reach nobody is checking.
    const check = (anchor, spec) => {
      const { t, resolved, found } = api.targetFor(spec);
      if (api.hasWalker() && !found && inTreeSpec(spec, aliases)) {
        api.report(anchor, unjudgedVerdict(role, spec, 'is shaped like in-tree code yet resolves to no file'));
        return;
      }
      if (!t) return;
      const verdict = importVerdict(role, t, ownershipAlias, resolved);
      if (verdict) api.report(anchor, verdict);
    };

    // On the root's row ROOT.1 is a landing question: a barrel carries no layer of its own, so the per-specifier reading above passes a binding that in fact lands on a flow.
    // The walk follows each value name to the file that owns it and judges it there, the way the diagonal rule already reads domain files.
    const isRoot = role.kind === 'composition-root';
    const relOf = relOfIn(ownershipDir);
    const landed = (anchor, spec, names) => {
      if (names !== '*' && names.length === 0) return;
      const found = api.landings(spec, names);
      // An unresolvable specifier is reported by check(), for every role rather than this one alone.
      if (found == null) return;
      for (const l of found) {
        const gr = api.roleAt(l.path);
        const readable = gr && (gr.kind === 'domain' || gr.kind === 'surface' || gr.kind === 'core');
        const t = readable ? gr : targetOfPath(l.path, ownershipDir);
        if (!t) {
          // A landing outside every domain carries no layer and no owner, so ROOT.1 cannot be read on it at all, and an un-owned module is where a domain's logic goes to hide.
          // A declared root's own modules ARE the root, and a root composes its glue at itself (ROOT.2), so a root reaching a sibling module of its own area has crossed no boundary.
          if (!inArea(norm(l.path), core) && !inArea(norm(l.path), compositionRoot)) {
            api.report(anchor, msg.rootLandsOutside(relOf(l.path)));
          }
          continue;
        }
        const verdict = rootLandedVerdict(role, t);
        if (verdict) api.report(anchor, l.via && l.via.length ? `${verdict} (landed via ${l.via.map(relOf).join(' -> ')})` : verdict);
      }
    };

    // SURFACE.2's mirror: a services file may import any inner layer to wire it, but what it RE-EXPORTS is the service contract its composition root consumes.
    // Only publication is judged here; consumption stays free, which is what "composing owned parts re-owns nothing" means.
    const published = (anchor, spec) => {
      const verdict = publishVerdict(role, api.targetFor(spec).t);
      if (verdict) api.report(anchor, verdict);
    };

    return {
      reference: (ref) => {
        check(ref.anchor, ref.spec);
        if (isRoot) landed(ref.anchor, ref.spec, ref.names);
        if ((ref.kind === 'reexport' || ref.kind === 'reexport-all') && !ref.typeOnly) published(ref.anchor, ref.spec);
      },
      // A computed specifier resolves nowhere the analyzers can follow. The resolution is undecidable; the silence is not.
      dynamicComputed: ({ anchor }) => api.report(anchor, msg.rootDynamicComputed()),
      // The aliasing declaration adopts an imported binding in the walk's eyes and dodges the re-export check, so it is judged as the publication it is.
      aliasedPublication: ({ anchor, spec }) => {
        if (role.layer === 'services') published(anchor, spec);
      },
    };
  },
};

// elda/no-surface-declarations - SURFACE.2 + OWNER.2: a surface curates what the layers own, and declares nothing itself.
// A binding DECLARED on a surface holds no rank, so it has no layer and no owner: the binding walk terminates on a rankless file and every geometry verdict bails on it (the `!t.layer || t.surface` guard).
// That makes the barrel the cheapest laundering path in the system - wrap a flow in a locally-declared function and every reach through it goes silent - so a surface re-exports, and only re-exports.
// A name bound by an import and then exported keeps its module request, so `export { foo }` over an import stays curation; only a genuine local declaration reports.
// A core file that carries a surface is judged the same way: core modules are domains (the bottom of the sharedness DAG), and a plain-named loner file is a whole domain doubling as its own surface, so its declarations report with the remedy that fits - a layer suffix, or extraction.
export const noSurfaceDeclarations = {
  gate: ({ role }) => role.kind === 'surface' || (role.kind === 'core' && role.surface != null),
  file: (api) => {
    const { role } = api;
    const coreSurface = role.kind === 'core' && role.surface != null;
    const loner = coreSurface && (role.chain ?? [])[Math.max(0, (role.chain ?? []).length - 1)] === role.surface;
    const report = (anchor, what) => api.report(anchor, loner ? msg.surfaceDeclarationLoner(what) : msg.surfaceDeclaration(what));
    return {
      defaultExport: ({ anchor }) => report(anchor, 'a default export'),
      // A type or interface is vocabulary reference, deliberately unregulated at the edges; only value declarations report.
      exportedDeclaration: ({ anchor, isType, declKind }) => {
        if (!isType && declKind !== 'type') report(anchor, 'a binding declared on it');
      },
      exportedName: ({ anchor, name, isType, imported, fromSource }) => {
        if (!isType && !fromSource && name && !imported) report(anchor, `the locally-declared \`${name}\``);
      },
    };
  },
};

// elda/no-self-surface - LAYER.1 / SURFACE.3: a domain's surface is what it shows its consumers, and a domain is not a consumer of itself.
// This is the mirror of no-surface-declarations, and the two close the same hole from opposite sides: a surface holds no rank, so a binding DECLARED there has no layer to be judged at, and a binding TAKEN from there arrives with no layer either.
// The verdict is selfSurfaceVerdict in verdicts.js; the target must be resolved for the rule to see anything, because a self-reference by alias reads syntactically as a reach at the parent's surface and only the resolved path reveals it as the subdomain's own.
export const noSelfSurface = {
  schema: OPTIONS_SCHEMA,
  gate: ({ role }) => role.kind === 'domain' || role.kind === 'surface',
  file: (api) => ({
    // Only a resolved target is judged: `imports` owns the unresolvable-specifier finding, so this rule stays quiet rather than doubling it with a guess.
    reference: (ref) => {
      const { t, found } = api.targetFor(ref.spec);
      const verdict = found && t && selfSurfaceVerdict(api.role, t);
      if (verdict) api.report(ref.anchor, verdict);
    },
  }),
};

// elda/no-service-coupling and elda/no-harness-coupling - OWNER.5 as Tier-2 "inadvisable dependencies" (the red arrows in ELDA-Layers, drawn at both outer rows); the verdict logic and the remedy texts are lateralVerdict / LATERAL in verdicts.js.
// A type-only declaration is a vocabulary reference, deliberately unregulated; the lateral rules act on value edges, re-exports included.
export const lateralCoupling = (layer) => ({
  schema: LATERAL_SCHEMA,
  gate: ({ role }) => role.kind === 'domain' && role.layer === layer && role.chain.length > 0,
  file: (api) => ({
    reference: (ref) => {
      if (ref.typeOnly) return;
      const { t } = api.targetFor(ref.spec);
      const verdict = lateralVerdict(api.role, t, layer);
      if (verdict) api.report(ref.anchor, verdict);
    },
  }),
});
export const noServiceCoupling = lateralCoupling('services');
export const noHarnessCoupling = lateralCoupling('harnesses');

// elda/no-diagonal-reach - SURFACE.5's geometry, enforced on landings: every value reference is followed name by name through surfaces and re-export chains to the files that own the bindings, and each landing is judged by landedVerdict in verdicts.js.
// Severity grows with the ownership regime the launder crossed and never with the distance it travelled (diagonalScope in model.js draws the line); the lint host binds one level per rule ID, so the class-to-level map is realized as a preset-managed pair sharing this implementation - each instance reports the classes whose mapped level matches its tier, a partition, and nothing reports twice.
export const diagonalReach = (tier) => ({
  schema: DIAGONAL_SCHEMA,
  gate: ({ role }) => role.kind === 'domain',
  file: (api) => {
    const mine = new Set(
      Object.entries(DIAGONAL_CLASSES)
        .filter(([opt]) => (api.raw[opt] ?? DIAGONAL_DEFAULTS[opt]) === tier)
        .map(([, scope]) => scope),
    );
    if (mine.size === 0) return null;
    const { ownershipAlias, ownershipDir } = api.opts;
    const relOf = relOfIn(ownershipDir);
    const judge = (anchor, t, via) => {
      if (!t || !mine.has(diagonalScope(api.role, t))) return;
      const verdict = landedVerdict(api.role, t);
      if (verdict) api.report(anchor, via && via.length ? `${verdict} (landed via ${via.map(relOf).join(' -> ')})` : verdict);
    };
    return {
      reference: (ref) => {
        if (ref.names !== '*' && ref.names.length === 0) return;
        const found = api.landings(ref.spec, ref.names);
        // A specifier that resolves to no file keeps the spec-classified direct judgment, so a broken path never hides a finding.
        if (found == null) {
          judge(ref.anchor, targetOf(api.filename, ref.spec, ownershipAlias, ownershipDir));
          return;
        }
        // A landing in core is legal at or below the consumer's own rank - the geometry here only grades below-rank landings - so a core-classified landing carries no target to grade, and the upward reach is judged on the authored edge.
        for (const l of found) {
          const gr = api.roleAt(l.path);
          judge(ref.anchor, gr ? (gr.kind === 'domain' || gr.kind === 'surface' ? gr : null) : targetOfPath(l.path, ownershipDir), l.via);
        }
      },
    };
  },
});
export const noDiagonalReach = diagonalReach('warn');
export const noDiagonalReachGate = diagonalReach('error');

// elda/no-penetration - the `*` imports and exports that punch holes in module edges and let the architecture leak through.
// A namespace import consumes a surface opaquely, so the unconsumed-export review signal (SURFACE.4) goes blind; a re-export-all republishes whatever a module happens to expose, so the surface stops being a deliberate named contract (SURFACE.1).
export const noPenetration = {
  file: (api) => ({
    namespaceImport: ({ anchor }) => api.report(anchor, msg.importStarOpaque()),
    reference: (ref) => {
      if (ref.kind === 'reexport-all') api.report(ref.anchor, msg.exportStar());
    },
  }),
};

// elda/no-deep-side-effects - SURFACE.5: a side-effect-only import runs another module for effect with nothing named crossing the edge.
// In the file's own directory that is fine - co-location is the directory itself - and external packages resolve to no in-tree file and pass; the smell is the deep effect a named value would make visible.
export const noDeepSideEffects = {
  schema: OPTIONS_SCHEMA,
  gate: ({ role }) => role.kind === 'domain' || role.kind === 'surface',
  file: (api) => {
    const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));
    return {
      reference: (ref) => {
        if (ref.kind !== 'import' || !ref.sideEffect) return;
        const abs = api.resolve(ref.spec);
        if (!abs) return;
        if (dirOf(norm(abs)) === dirOf(api.filename)) return;
        api.report(ref.anchor, msg.deepSideEffect(ref.spec));
      },
    };
  },
};

// elda/no-async-inner - LAYER.4 and the Outcome model: async / await / try-catch stay out of the inner layers (wrapped at harnesses into channel-conforming values; outcomes are typed branch values).
export const noAsyncInner = {
  gate: ({ role }) => role.kind === 'domain' && (role.layer === 'axioms' || role.layer === 'flows'),
  file: (api) => ({
    awaitExpr: ({ anchor }) => api.report(anchor, msg.awaitExpr()),
    forAwait: ({ anchor }) => api.report(anchor, msg.forAwait()),
    // A catch is error control flow and stays banned; a finally with no catch clause is completion protocol, licensed in flows where a language generator restores the flow's own state on early return (LAYER.4).
    tryStatement: ({ anchor, hasCatch }) => {
      if (!hasCatch && api.role.layer === 'flows') return;
      api.report(anchor, msg.tryCatch());
    },
    asyncFunction: ({ anchor }) => api.report(anchor, msg.asyncFn()),
  }),
};

// elda/no-mutable-surface - CHANNEL.4: state crosses boundaries as published immutable values.
// A module-level `export let` / `export var` (directly, or exporting a top-level `let` binding by name) is a live mutable binding every importer shares by reference, so domain code never exposes one; publish a constant, an accessor, or a channel instead.
export const noMutableSurface = {
  gate: ({ role }) => role.kind === 'domain' || role.kind === 'surface' || role.kind === 'core',
  file: (api) => ({
    exportedDeclaration: ({ anchor, declKind }) => {
      if (declKind === 'let' || declKind === 'var') api.report(anchor, msg.mutableExportDecl(declKind));
    },
    exportedName: ({ anchor, name, mutable, fromSource }) => {
      if (!fromSource && name && mutable) api.report(anchor, msg.mutableExportNamed(name));
    },
  }),
};

// elda/no-dishonest-placement - the thesis's own rule: placement is a claim the graph adjudicates, and a claim the graph contradicts is the finding.
// The two judges are computed in ownership.js; where they disagree, this rule reports the contest once, on the file itself, and every other rule judges the file by its claim.
export const noDishonestPlacement = {
  schema: OPTIONS_SCHEMA,
  file: (api) => (api.dispute ? { program: ({ anchor }) => api.report(anchor, api.dispute) } : null),
};

// elda/vocab-gate - OWNER.2 / ROOT.2: shared-namespace writes with literal keys at the integration surface (the composition root) introduce out-of-band vocabulary the owner should hold.
export const vocabGate = {
  schema: VOCAB_SCHEMA,
  gate: ({ filename, opts }) => inArea(filename, opts.compositionRoot),
  file: (api) => ({
    namespaceWrite: ({ anchor, method, key }) => api.report(anchor, msg.vocabWrite(method, key)),
    datasetWrite: ({ anchor }) => api.report(anchor, msg.vocabDataset()),
  }),
};

// elda/no-axiom-state - LAYER.4: axioms hold pure domain invariants and own no state.
// A module-level `let`/`var` in an axioms file is state at the pure rank, whether exported or private behind an accessor; the decidable slice is the mutable binding itself, and whether a const collection is mutated stays with review.
export const noAxiomState = {
  schema: OPTIONS_SCHEMA,
  gate: ({ role }) => role.layer === 'axioms' && !role.asset,
  file: (api) => ({
    mutableDeclaration: ({ anchor, name }) => api.report(anchor, msg.axiomState(name ?? 'it')),
  }),
};

// elda/ambient-ownership - OWNER.2: ambient declarations are vocabulary, owned by a domain.
// A .d.ts outside the ownership tree and every declared core is an un-owned catch-all (the type-layer `shared/` column).
export const ambientOwnership = {
  schema: OPTIONS_SCHEMA,
  gate: ({ filename, opts }) => filename.endsWith('.d.ts') && !inArea(filename, opts.ownershipDir) && !inArea(filename, opts.core),
  file: (api) => ({
    program: ({ anchor }) => api.report(anchor, msg.ambientDecl()),
  }),
};
