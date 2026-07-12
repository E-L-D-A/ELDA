# Support tooling - TODO

Deferred and undecided tooling work, plus standing blind spots. A deferred entry carries the trigger that un-defers it, so each deferral stays a decision; a blind spot carries the practice that covers it.

## Graph pass

A whole-project pass over the resolved module graph, complementing the per-file rules, which are limited to one file plus its import specifiers. The first graph check is live and enforced: the shared binding walk ([js/flow.js](./js/flow.js)) follows each imported name through surfaces and re-export chains, `elda/no-diagonal-reach` judges each landing at lint time, and `elda-viz` projects the same landings as a live flow diagram, with laundered findings listed. The items below remain open:

- **Gate-1 cycle audit (CHANNEL.5).** Verify that every cross-domain reference cycle encloses a settling element (a change-gated channel with a tight equality). Per-file linting cannot decide a whole-graph property, so until this pass exists the audit runs as a scheduled review item (META.3), kept feasible by the by-reference rule: every cycle is discoverable by following references. Trigger to build: the first hot-loop or synchronous re-entry incident in an ELDA codebase, or the first cross-domain reference cycle surfacing in review. The substrate exists: `elda-viz` ([js/visualize.js](./js/visualize.js)) already builds the whole-project resolved reference graph with the shared classification on every node, so the audit reduces to an SCC pass over its cross-domain edges plus the settling-element check per cycle.

- **Declared-versus-emergent boundary comparison (the signal register's "a domain that has yet to split").** Cluster each domain's same-layer value-import graph into connected components and compare the clusters against the declared units and subdomains; report divergence as a review signal - "the tree declares one concern here, the imports draw four." This is the general form of an under-decomposition detector: it gates nothing (Rule shape bans positive structural mandates) and feeds the governed grade's ontology reviews with evidence. Trigger to build: the first boundary-drawing session that has to reconstruct the emergent clusters by hand.

## Per-file rules

- **Composition-root reach: nested form vs flat form (undecided).** `elda/imports` errors on a root importing `#/parent/child/services` (ROOT.1 / SURFACE.7: 'parent/child' is internal to 'parent') yet accepts `#/parent/child.services`, a chain-1 layer file with the same semantics: the flat spelling launders the nested reach, so the rule currently flags the honest form and passes the laundered one. The rule should allow both or disallow both; which way is an open design decision (does a root's license stop at the top-level domain's own surfaces, or extend to any published services file one level down?).

- **`no-deep-side-effects` unit semantics.** The rule reads "same directory = same unit" while the coupling rules read shared names; a side-effect import crossing unit names inside one directory currently passes. Align it with `unitOf` at its next touch.

- **Non-literal dynamic imports.** `import(expr)` with a template or computed specifier is invisible to every import-reading rule and statically undecidable, so it stays with review as a standing blind spot.
