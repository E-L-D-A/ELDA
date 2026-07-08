# Support tooling - TODO

Deferred tooling work. Each entry carries the trigger that un-defers it, so the deferral stays a
decision rather than a drift.

## Graph pass (does not exist yet)

A whole-project pass over the resolved module graph, complementing the per-file lint plugin
([js](./js)), which is structurally limited to one file plus its import specifiers.

- **Gate-1 cycle audit (CHANNEL.5).** Verify that every cross-domain reference cycle encloses a
  settling element (a change-gated channel with a tight equality). Per-file linting cannot decide a
  whole-graph property, so until this pass exists the audit runs as a scheduled review item
  (META.3), kept feasible by the by-reference rule making every cycle discoverable through
  references. Trigger to build: the first hot-loop or synchronous re-entry incident in an ELDA
  codebase, or the first cross-domain reference cycle surfacing in review.
