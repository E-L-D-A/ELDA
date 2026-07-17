// The enforce domain's vocabulary: which rules are structural invariants, which are graded smells, and the diagonal class map each grade carries.
// Pure data - the services file assembles it into the plugin and the grade presets the host consumes (ELDA/README.md, "Grades of alignment"; META.6).
export const INVARIANTS = [
  'imports',
  'no-surface-declarations',
  'no-self-surface',
  'no-async-inner',
  'no-mutable-surface',
  'no-entity-state',
  'ambient-ownership',
];
export const SMELLS = [
  'no-service-coupling',
  'no-adapter-coupling',
  'no-penetration',
  'no-dishonest-placement',
  'no-deep-side-effects',
  'vocab-gate',
];
// The diagonal pair rides every preset with one class-to-level map per grade; the two entries project the map's halves (see the rule's comment).
export const DIAGONAL_MAPS = {
  adopting: { acrossDomains: 'warn', acrossSubdomains: 'warn', withinSubdomain: 'warn' },
  aligned: { acrossDomains: 'error', acrossSubdomains: 'warn', withinSubdomain: 'warn' },
  justified: { acrossDomains: 'error', acrossSubdomains: 'error', withinSubdomain: 'error' },
};
