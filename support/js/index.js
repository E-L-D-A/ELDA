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
// This is the plugin's composition root: it mounts the enforce domain's rules and ships the grade presets.
// The rules live in domains/enforce; the path classification is in core/model.js and the reference verdicts in core/verdicts.js, shared with the dependency visualizer so the linter and the diagram judge every edge identically.

import { rules } from './domains/enforce/enforce.use-cases.js';

const plugin = {
  meta: { name: 'elda' },
  rules,
};

// Presets, one per machine-holdable alignment state (ELDA/README.md, "Grades of alignment"; META.6).
// `adopting` is the migration posture: every rule reports and the fix-list stays visible.
// `aligned` holds the aligned grade: the structural invariants gate as errors.
// `justified` holds the justified grade: the graded smells gate too, so a deviation lands only as an inline suppression carrying its justification.
// A preset supplies the gate; the grade is read off the tree under it.
// ESLint flat-config consumers spread `plugin.configs.<name>`; oxlint's `extends` is file-based and does not read a plugin's `configs`, so oxlint users extend the shipped `<name>.json` by path instead (see README).
const INVARIANTS = ['imports', 'no-surface-declarations', 'no-self-surface', 'no-async-inner', 'no-mutable-surface', 'ambient-ownership'];
const SMELLS = ['no-service-coupling', 'no-adapter-coupling', 'no-penetration', 'no-deep-side-effects', 'vocab-gate'];
// The diagonal pair rides every preset with one class-to-level map per grade; the two entries project the map's halves (see the rule's comment).
const DIAGONAL_MAPS = {
  adopting: { acrossDomains: 'warn', acrossSubdomains: 'warn', withinSubdomain: 'warn' },
  aligned: { acrossDomains: 'error', acrossSubdomains: 'warn', withinSubdomain: 'warn' },
  justified: { acrossDomains: 'error', acrossSubdomains: 'error', withinSubdomain: 'error' },
};
const gradePreset = (invariants, smells, diagonalMap) => ({
  plugins: { elda: plugin },
  rules: Object.fromEntries([
    ...INVARIANTS.map((r) => [`elda/${r}`, invariants]),
    ...SMELLS.map((r) => [`elda/${r}`, smells]),
    ['elda/no-diagonal-reach', ['warn', diagonalMap]],
    ['elda/no-diagonal-reach-gate', ['error', diagonalMap]],
  ]),
});
plugin.configs = {
  adopting: gradePreset('warn', 'warn', DIAGONAL_MAPS.adopting),
  aligned: gradePreset('error', 'warn', DIAGONAL_MAPS.aligned),
  justified: gradePreset('error', 'error', DIAGONAL_MAPS.justified),
};

export default plugin;
