// The ELDA reference verdicts: given two points the path model has classified, the ruling a reference between them earns.
// A verdict decides here and is phrased in messages.js, so this file carries the judgment and that one carries the words; the structural facts it reads (a relationship, a unit, a rank, the composer and services-surface predicates) come from model.js.
// The lint rules (index.js) and the dependency visualizer (visualize.js) both read this module, so the linter and the diagram judge every edge identically.

import * as msg from '../entities/messages.js';
import { LAYER_RANK, isComposer, isServicesSurface, rel, unitOf } from '../entities/model.js';

// A reference the analyzers cannot resolve to a file. The target is unknown, so no invariant can be read on it at all.
// Staying quiet here fails open in the worst available direction, because the shape-only fallback reads a dangling `./x` as a reference INSIDE the importer's own subdomain, which is the most permissive reading there is: move a file into a new directory and leave its imports behind, and every reach it makes turns into a same-subdomain read that nothing objects to.
// So the undecidable reach reports, citing the invariants the reading role would otherwise have been judged against.
export function unjudgedVerdict(role, spec, why) {
  const cites = role.kind === 'composition-root' ? 'ROOT.1'
    : role.kind === 'core' ? 'ROOT.6'
    : 'LAYER.1 / SURFACE.3';
  return msg.unjudged(cites, spec, why);
}

// The hard, decidable layer + boundary invariants (Tier 1), judged for one reading of one reference:
//   LAYER.1    an inner layer never imports an outer one (alias and relative paths alike);
//   ROOT.6     pure core depends on nothing in any domain;
//   ROOT.1     composition roots compose top-level domains through their surfaces only;
//   ROOT.7     each domain composes its direct children only, and a subdomain never references its parent;
//   SURFACE.2  a consumable surface carries use-cases and vocabulary, never services or adapters;
//   SURFACE.3  a cross-boundary reference goes through a surface, never into a layer's internals, and a surface never re-bundles a peer or foreign domain's surface;
//   SURFACE.7  a nested subdomain is internal to its parent: outside it, only the parent's published surfaces exist.
// Returns a violation message for this reading of the target, or null when legal.
// A core target is judged directionally: core modules are shared domains everything may lean on, so no surface ceremony gates the reach, and rank still governs it - leaning at or below one's own rank is the diagram's dashed lateral, while the upward reach is the inversion no row draws.
// Only a resolved target can carry the core reading (a specifier's shape never names core), so the judgment stays fact-based.
export function judgeImport(role, t, ownershipAlias) {
  const intoCore = t != null && (t.kind === 'core' || t.area != null);

  if (role.kind === 'core') {
    if (t == null) return null;
    if (intoCore) {
      if (t.layer && role.layer && LAYER_RANK[t.layer] > LAYER_RANK[role.layer]) {
        return msg.innerImportsOuter(role.layer, t.layer);
      }
      return null;
    }
    return msg.coreDependsOnDomain();
  }

  if (role.kind === 'composition-root') {
    if (t.chain.length > 1) return msg.rootComposesTopLevel(t.chain.join('/'), t.chain[0]);
    if (t.layer && t.layer !== 'services') return msg.rootConsumesSurfaces(t.layer);
    return null;
  }

  if (intoCore) {
    if (role.kind === 'surface' || !role.layer) return null;
    if (t.layer && LAYER_RANK[t.layer] > LAYER_RANK[role.layer]) {
      return msg.innerImportsOuter(role.layer, t.layer);
    }
    return null;
  }

  const r = rel(role.chain, t.chain);

  if (role.kind === 'surface') {
    // A surface curates its own subdomain and its owned children (SURFACE.7); republishing a peer or foreign domain re-bundles that domain's surface (SURFACE.3).
    // A consumable surface carries use-cases and vocabulary only; services and adapters belong to the runtime-composition surface, which the `services` file realizes and may reference freely.
    if (r.kind === 'peer' || r.kind === 'to-ancestor') {
      return msg.surfaceRebundles(ownershipAlias, t.chain.join('/'));
    }
    if (r.kind === 'into-child' && t.chain.length > role.chain.length + 1) {
      return msg.surfaceCurateDirectChild(t.chain[role.chain.length], t.chain.join('/'));
    }
    if (role.surface !== 'services' && (t.layer === 'services' || t.layer === 'adapters')) {
      return msg.surfaceCarriesUseCases(t.layer, ownershipAlias, role.chain.join('/'));
    }
    return null;
  }

  // role.kind === 'domain'
  if (r.kind === 'same') {
    if (t.layer && LAYER_RANK[t.layer] > LAYER_RANK[role.layer]) {
      return msg.innerImportsOuter(role.layer, t.layer);
    }
    return null;
  }

  if (r.kind === 'into-child') {
    if (t.asset) return null;
    const child = t.chain.slice(0, role.chain.length + 1).join('/');
    if (t.chain.length > role.chain.length + 1) {
      return msg.composesDirectChildren(role.chain.join('/'), t.chain.join('/'));
    }
    if (t.surface) return null;
    if (t.layer === 'services') {
      if (!isServicesSurface(t)) return msg.subPastServicesSurface(child);
      if (role.layer !== 'services') return msg.composingChildIsServices(child, role.layer);
      return null;
    }
    return msg.consumeSubThroughSurface(child, t.layer);
  }

  if (r.kind === 'to-ancestor') {
    return msg.subReferencesParent(t.chain.join('/') || t.chain[0] || '');
  }

  // r.kind === 'peer'
  const sib = t.chain.slice(0, r.p + 1).join('/');
  if (t.chain.length > r.p + 1) {
    return msg.referencePeerThroughSurface(sib, t.chain.join('/'));
  }
  if (t.surface || (!t.layer && !t.surface)) return null;
  if (t.layer === 'services' && isServicesSurface(t) && role.layer === 'services') {
    // The graded OWNER.5 mounting, reported by no-service-coupling at warn instead of here.
    return null;
  }
  return msg.referenceSibPublicSurface(sib, ownershipAlias, t.layer);
}

// The full verdict for one reference.
// A target read from a resolved path (targetOfPath) is a fact, so it is judged once and the verdict stands.
// A target read from the specifier alone carries the trailing-segment ambiguity - a named surface of the chain, or a nested subdomain's barrel - so both readings are tried and the reference is accepted when either is legal, and the ambiguity never manufactures a finding.
// The tolerant reading is the fallback a caller reaches when it cannot resolve at all, which happens for a specifier that names no file; a caller with a filesystem resolves first and never pays the tolerance.
export function importVerdict(role, t, ownershipAlias, resolved = false) {
  const verdictA = judgeImport(role, t, ownershipAlias);
  if (verdictA === null) return null;
  if (!resolved && t.surface && t.surface !== 'index' && !t.layer) {
    const b = { ...t, chain: [...t.chain, t.surface], surface: 'index' };
    if (judgeImport(role, b, ownershipAlias) === null) return null;
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
  return msg.selfSurface(own, face);
}

// The remedy each lateral smell names, and whether the grading extends across peers: a service unit mounting a peer's block at its runtime-composition surface is OWNER.5's unified-composition case, exempted from the hard surface rule and graded here instead.
export const LATERAL = {
  services: { remedy: 'supply it as a named port from the composition root, or lift the shared logic into a use-case.', crossSurface: true },
  adapters: { remedy: 'let the layer above compose the two bindings, or co-locate them into one unit.', crossSurface: false },
};

// The lateral-coupling verdict for one reference at one outer layer, or null when the reference does not smell.
// A core target never grades as a lateral mount: the diagram draws the lean into Shared as its weak-dependency arrow, distinct from the red laterals between feature domains, so consuming a core piece at or below one's own rank stays plain.
export function lateralVerdict(role, t, layer, { remedy, crossSurface } = LATERAL[layer]) {
  if (role.layer !== layer || role.chain.length === 0) return null;
  if (!t || t.layer !== layer || t.asset) return null;
  if (t.kind === 'core' || t.area != null) return null;
  const importerUnit = unitOf(role);
  const r = rel(role.chain, t.chain);
  if (r.kind === 'into-child') {
    // ROOT.7 self-composition is the composer's license, not every parent-level unit's.
    // A named unit reaching into an owned child mounts its surface the way a peer mount does, and wants a port from the composer.
    if (isComposer(role)) return null;
    if (crossSurface && t.chain.length === r.p + 1 && isServicesSurface(t)) {
      return msg.lateralMountsChild(layer, importerUnit || role.chain.join('/'), t.chain.join('/'));
    }
    return null;
  }
  if (r.kind === 'to-ancestor') return null; // The hard breach; the imports verdict reports it.
  if (r.kind === 'peer') {
    if (crossSurface && t.chain.length === r.p + 1 && isServicesSurface(t)) {
      return msg.lateralMountsPeer(layer, importerUnit || role.chain.join('/'), t.chain.join('/'));
    }
    return null;
  }
  if (isComposer(role)) return null; // Composition by the subdomain's own composer.
  const targetUnit = unitOf(t);
  if (targetUnit === importerUnit) return null; // Same unit composing itself.
  return msg.lateralReachesUnit(layer, importerUnit || '(subdomain root)', targetUnit || '(subdomain root)', role.chain.join('/'), remedy);
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
  return msg.diagonal(from, targetUnit, t.layer);
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
  return msg.landedDiagonal(from, where, t.layer);
}

// The composition root's reach, judged on landings: ROOT.1 read the way SURFACE.5 taught us to read the diagonals.
// A root wires services - it instantiates them, injects their ports, and mounts them - and consuming behavior is a service's own work.
// So a binding the root takes that lands off the services row marks a service smashed into the root: the twin, one rank out, of a service reaching a foreign use-case.
// The per-specifier reading cannot see it, because a barrel carries no layer of its own; the reach launders through the barrel and only the landing tells the truth.
export function rootLandedVerdict(role, t) {
  if (role.kind !== 'composition-root') return null;
  if (!t || !t.layer || t.surface || t.asset) return null;
  if (t.layer === 'services') return null;
  return msg.rootLanded(t.chain.join('/'), t.layer);
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
  return msg.published(what);
}
