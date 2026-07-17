// The runtime-composition surface of enforce: the plugin object the host mounts, and the grade presets beside it.
// The service owns the assembly - the vocabulary comes from axioms.js, the rule logic from flows.js - and it supplies everything the rules declare a need for (LAYER.2): the app-root harness, the scan, and the walker, all consumed here at or below this rank, so the root above mounts one finished service and no inner layer reaches upward.
// A preset supplies the gate; the grade is read off the tree under it. ESLint flat-config consumers spread `plugin.configs.<name>`; oxlint's `extends` is file-based, so oxlint users extend the shipped `<name>.json` by path instead (see README).
import { appRootOf } from '../../core/harnesses/parse.js';
import { buildGraph } from '../../core/services/scan.js';
import { createWalker } from '../../core/services/walk.js';
import { DIAGONAL_MAPS, INVARIANTS, RULES, SMELLS } from './axioms.js';
import { rules, wire } from './harnesses.js';

wire({ appRootOf, buildGraph, createWalker });

export const plugin = {
  meta: { name: 'elda' },
  rules,
};

const gradePreset = (invariants, smells, diagonalMap) => ({
  plugins: { elda: plugin },
  rules: Object.fromEntries([
    ...INVARIANTS.map((r) => [`elda/${r}`, invariants]),
    ...SMELLS.map((r) => [`elda/${r}`, smells]),
    [`elda/${RULES.noDiagonalReach}`, ['warn', diagonalMap]],
    [`elda/${RULES.noDiagonalReachGate}`, ['error', diagonalMap]],
  ]),
});
plugin.configs = {
  adopting: gradePreset('warn', 'warn', DIAGONAL_MAPS.adopting),
  aligned: gradePreset('error', 'warn', DIAGONAL_MAPS.aligned),
  justified: gradePreset('error', 'error', DIAGONAL_MAPS.justified),
};
