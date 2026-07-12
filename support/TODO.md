# Support tooling - TODO

Deferred tooling work. Each entry carries the trigger that un-defers it, so the deferral stays a
decision rather than a drift.

## Graph pass

A whole-project pass over the resolved module graph, complementing the per-file rules, which
are limited to one file plus its import specifiers. The first graph check is live and enforced:
the shared binding walk ([js/flow.js](./js/flow.js)) follows every import name by name through
surfaces and re-export chains, `elda/no-diagonal-reach` judges each landing at lint time, and
`elda-viz` projects the same landings as the drawn flow with laundered findings listed. The
items below remain open:

- **Gate-1 cycle audit (CHANNEL.5).** Verify that every cross-domain reference cycle encloses a
  settling element (a change-gated channel with a tight equality). Per-file linting cannot decide a
  whole-graph property, so until this pass exists the audit runs as a scheduled review item
  (META.3), kept feasible by the by-reference rule making every cycle discoverable through
  references. Trigger to build: the first hot-loop or synchronous re-entry incident in an ELDA
  codebase, or the first cross-domain reference cycle surfacing in review. The substrate
  exists: `elda-viz` ([js/visualize.js](./js/visualize.js)) already builds the whole-project
  resolved reference graph with the shared classification on every node, so the audit reduces to
  an SCC pass over its cross-domain edges plus the settling-element check per cycle.

- **Declared-versus-emergent boundary comparison (the Signal register's "a domain that has yet to
  split").** Cluster each domain's same-layer value-import graph into connected components and
  compare against the declared units and subdomains; report divergence as a review signal - "the tree
  declares one concern here, the imports draw four." This is the general form of an
  under-decomposition detector: it gates nothing (Rule shape bans positive structural mandates)
  and feeds the governed grade's ontology reviews with evidence. Trigger to build: the first
  boundary-drawing session that has to reconstruct the emergent clusters by hand.

## Per-file rule refinements (deferred)

- **`no-deep-side-effects` unit semantics.** The rule still reads "same directory = same unit"
  while the coupling rules read shared names; a side-effect import crossing unit names inside one
  directory currently passes. Align it with `unitOf` when it next gets touched.
- **Non-literal dynamic imports.** `import(expr)` with a template or computed specifier is
  invisible to every import-reading rule; statically undecidable, so it stays with review. Noted
  so the blind spot is a known one.
