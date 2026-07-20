// The enforce domain's vocabulary: which rules are structural invariants, which are graded smells, and the diagonal class map each grade carries.
// Pure data - the services file assembles it into the plugin and the grade presets the host consumes (ELDA/README.md, "Grades of alignment"; META.6).
// A declared area is one directory name or a list of them: an app composes at several entries (a route tree, a server shell, a build config) and may hold any number of dependency-free cores.
const AREA = { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] };
const LEVEL_ENUM = { enum: ['error', 'warn', 'off'] };

// The rule-options schemas are wire schemas for the config boundary (OWNER.2): declared once here, mounted verbatim into each rule's meta, so the contract has one owner and the rules carry references.
// Paths, aliases, and areas are derived by the engine's one project read and are not rule options; the closed schemas make a config still spelling them fail loudly, which is the migration signal.
const schema = (properties) => [{ type: 'object', properties, additionalProperties: false }];
export const OPTIONS_SCHEMA = schema({ compositionRoot: AREA });
export const LATERAL_SCHEMA = schema({});
export const VOCAB_SCHEMA = schema({});
export const DIAGONAL_SCHEMA = schema({ acrossDomains: LEVEL_ENUM, acrossSubdomains: LEVEL_ENUM, withinSubdomain: LEVEL_ENUM });

// The shared-namespace setters the vocab gate watches for at the composition root: writes through these with a literal key introduce out-of-band vocabulary.
export const VOCAB_WRITE_METHODS = ['setAttribute', 'setItem', 'setProperty'];

// The diagonal pair's option vocabulary: each ownership class maps onto a lint level, and the pair partitions the classes by tier.
export const DIAGONAL_DEFAULTS = { acrossDomains: 'error', acrossSubdomains: 'warn', withinSubdomain: 'warn' };
export const DIAGONAL_CLASSES = { acrossDomains: 'across-domains', acrossSubdomains: 'across-subdomains', withinSubdomain: 'within-subdomain' };

export const RULES = {
  imports: 'imports',
  noSurfaceDeclarations: 'no-surface-declarations',
  noSelfSurface: 'no-self-surface',
  noDiagonalReach: 'no-diagonal-reach',
  noDiagonalReachGate: 'no-diagonal-reach-gate',
  noServiceCoupling: 'no-service-coupling',
  noHarnessCoupling: 'no-harness-coupling',
  noPenetration: 'no-penetration',
  noDishonestPlacement: 'no-dishonest-placement',
  noDeepSideEffects: 'no-deep-side-effects',
  noAsyncInner: 'no-async-inner',
  noMutableSurface: 'no-mutable-surface',
  noAxiomState: 'no-axiom-state',
  vocabGate: 'vocab-gate',
  ambientOwnership: 'ambient-ownership',
};

export const INVARIANTS = [
  RULES.imports,
  RULES.noSurfaceDeclarations,
  RULES.noSelfSurface,
  RULES.noAsyncInner,
  RULES.noMutableSurface,
  RULES.noAxiomState,
  RULES.ambientOwnership,
];
export const SMELLS = [
  RULES.noServiceCoupling,
  RULES.noHarnessCoupling,
  RULES.noPenetration,
  RULES.noDishonestPlacement,
  RULES.noDeepSideEffects,
  RULES.vocabGate,
];

// The diagonal pair rides every preset with one class-to-level map per grade; the two entries project the map's halves (see the rule's comment).
export const DIAGONAL_MAPS = {
  adopting: { acrossDomains: 'warn', acrossSubdomains: 'warn', withinSubdomain: 'warn' },
  aligned: { acrossDomains: 'error', acrossSubdomains: 'warn', withinSubdomain: 'warn' },
  justified: { acrossDomains: 'error', acrossSubdomains: 'error', withinSubdomain: 'error' },
};
