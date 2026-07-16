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
// The conventions are baked in: layer membership rides file names, the ownership alias attributes ownership, and every declared path is app-root-relative.
// This is the plugin's composition root and the package surface: it mounts the enforce domain's finished service - the plugin object with its grade presets - and nothing else.

import { plugin } from './domains/enforce/services.js';

export default plugin;
