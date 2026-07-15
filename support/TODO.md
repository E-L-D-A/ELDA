# Support tooling - TODO

Deferred and undecided tooling work, plus standing blind spots. A deferred entry carries the trigger that un-defers it, so each deferral stays a decision; a blind spot carries the practice that covers it; a rejected entry carries the reason it stays rejected.

## Graph pass

A whole-project pass over the resolved module graph, complementing the per-file rules, which are limited to one file plus its import specifiers. The first graph check is live and enforced: the shared binding walk ([js/core/flow.js](./js/core/flow.js)) follows each imported name through surfaces and re-export chains, `elda/no-diagonal-reach` judges each landing at lint time, and `elda-viz` projects the same landings as a live flow diagram, with laundered findings listed. The items below remain open:

- **Gate-1 cycle gate (CHANNEL.5).** The finding half has landed: the scan closes the landed value flows into strongly connected components ([js/core/graph.js](./js/core/graph.js)) and reports every reference cycle graded by the widest boundary it crosses, and the selftest holds it to a deliberate cross-domain cycle whose every edge is legal read per file. What stays open is the gate. Whether a cycle's channel settles is a value-level property no static pass decides, so a gate has to carry the reviewer's judgment: a check command that exits non-zero on a cycle, and an accepted-cycles file with one justification per entry naming the settling element that encloses it, so that only a new cycle fails. Trigger to build: the first ELDA codebase that reports a cycle, since a gate with nothing to gate cannot be calibrated against a real one.

- **Declared-versus-emergent boundary comparison (the signal register's "a domain that has yet to split").** Cluster each domain's same-layer value-import graph into connected components and compare the clusters against the declared units and subdomains; report divergence as a review signal - "the tree declares one concern here, the imports draw four." This is the general form of an under-decomposition detector: it gates nothing (Rule shape bans positive structural mandates) and feeds the governed grade's ontology reviews with evidence. Trigger to build: the first boundary-drawing session that has to reconstruct the emergent clusters by hand.

- **Surface shape: published names against consumed names (SURFACE.4).** The reachability half of SURFACE.4 - an export no runtime root reaches - belongs to [knip](https://knip.dev) and runs as an advisory pass. The shape half has no home, and the binding walk already resolves which names each consumer takes through each surface, so the graph can report what a reachability tool cannot express: a barrel that publishes a dozen names whose consumers collectively take two, or a named surface with one consumer taking one name, where the boundary is ceremony rather than a contract. It reports on the surface itself and gates nothing, since a surface published ahead of its consumers is legitimate. Trigger to build: the first surface whose breadth is argued in review with no evidence to hand.

## Visualizer

The diagram reads the current tree: per-edge legality, the cycles the flows close, the closure a pinned file reaches in either direction, and the whole board at whatever scale a domain is folded to. What it does not read is the change.

- **Structural diff against a baseline ref.** Scan a git ref in a detached worktree through the same code path (the walk is path-based, so the scan itself needs no change), then diff files, edges and verdicts: new edges drawn hot, removed edges ghosted, newly classified files outlined. The gate stops the illegal delta at authoring time and stays silent on the legal one, and structural erosion is a sequence of individually legal moves - a fresh cross-domain edge that every rule permits and nobody would have approved on purpose. The unit a person reviews is the change, and the unit the diagram draws is the state; this closes that gap. Trigger to build: the first structural regression found after it landed, or the first review that reconstructs a change's structural delta by hand.

## Self-hosting

The tool is a program the tool can read: two domains over a pure core, the same `A → S ← B` shape the diagrams draw for a shared concern. Describing it in its own vocabulary turns the repo into its own worked example, the strongest demonstration the method has. Held back until the shape stops moving.

- **Bootstrap the plugin and the viz as an ELDA app.** The dependency direction is already right: everything the two consumers share (the path model, the parse and walk primitives, the cycle pass, the verdict prose) references no domain, so it is pure core, and the plugin and the visualizer each lean on it without reaching across to each other. What is missing is the naming. A top-level `domains/` holds two domains, `enforce` (the oxlint rule) and `viz` (the CLI, the served shell, and the browser modules that are its layers), each file suffixed for its layer; the shared code stays in a top-level `core/` beside them, with no `src/`, since the plugin reads a raw top-level `domains/` and keeping it there leaves the existing `fixture` app an unambiguous sibling. The core is already divided into single-layer modules along these seams: the path model into a path/structure model and the reference verdicts; the flow reader into an oxc-parser-and-filesystem adapter and the binding-walk; the scan into a filesystem-tree adapter and the fs-free graph assembly; the rule module into the per-rule implementations and the oxlint rule-object surface. The verdict prose stays one entities unit whole, since its static strings and the functions that compose them are one concern. The viewer's composition root is the served shell that [js/viz/visualize.js](./js/viz/visualize.js) assembles; the boot module is one of the domain's own files. The viz now reads a top-level `domains/` as readily as `src/domains/` (`srcRootOf` in [js/core/scan.js](./js/core/scan.js), shared by the scan and the CLI), so the no-`src/` layout both lints and draws. Trigger to build: once the graph-pass work above settles the core's module set, so the split lands against a stable shape rather than being redone as the core grows.

## Per-file rules

- **`no-deep-side-effects` unit semantics.** The rule reads "same directory = same unit" while the coupling rules read shared names; a side-effect import crossing unit names inside one directory currently passes. Align it with `unitOf` at its next touch.

- **The undecidable-reference message cites one constraint for every role.** A specifier the analyzers cannot resolve, and a dynamic import with a computed specifier, both report as unjudged and both cite ROOT.1 - which is the composition root's constraint, and the wrong citation on a domain file's reach. The report is correct to fire (an undecidable reference is a real finding, since a reach that cannot be judged cannot be permitted); the citation needs to follow the reporting file's role.

## Ergonomics

- **Ship the visualizer as a VSCode extension.**

## Rejected

- **Coupling metrics on the diagram** (afferent and efferent counts, instability, distance from the main sequence). A number carries no remedy, while every verdict the shared model issues carries its remedy in the message. The metrics also re-ask a question the structure already answers: what a file may depend on follows from its layer and the surfaces around it, so a heavy fan-in is either legal by construction or already reported as a finding.