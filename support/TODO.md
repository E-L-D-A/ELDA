# Support tooling - TODO

Deferred and undecided tooling work, plus standing blind spots. A deferred entry carries the trigger that un-defers it, so each deferral stays a decision; a blind spot carries the practice that covers it; a rejected entry carries the reason it stays rejected.

## Graph pass

A whole-project pass over the resolved module graph, complementing the per-file rules, which are limited to one file plus its import specifiers. The first graph check is live and enforced: the shared binding walk ([js/flow.js](./js/flow.js)) follows each imported name through surfaces and re-export chains, `elda/no-diagonal-reach` judges each landing at lint time, and `elda-viz` projects the same landings as a live flow diagram, with laundered findings listed. The items below remain open:

- **Gate-1 cycle gate (CHANNEL.5).** The finding half has landed: the scan closes the landed value flows into strongly connected components ([js/graph.js](./js/graph.js)) and reports every reference cycle graded by the widest boundary it crosses, and the selftest holds it to a deliberate cross-domain cycle whose every edge is legal read per file. What stays open is the gate. Whether a cycle's channel settles is a value-level property no static pass decides, so a gate has to carry the reviewer's judgment: a check command that exits non-zero on a cycle, and an accepted-cycles file with one justification per entry naming the settling element that encloses it, so that only a new cycle fails. Trigger to build: the first ELDA codebase that reports a cycle, since a gate with nothing to gate cannot be calibrated against a real one.

- **Declared-versus-emergent boundary comparison (the signal register's "a domain that has yet to split").** Cluster each domain's same-layer value-import graph into connected components and compare the clusters against the declared units and subdomains; report divergence as a review signal - "the tree declares one concern here, the imports draw four." This is the general form of an under-decomposition detector: it gates nothing (Rule shape bans positive structural mandates) and feeds the governed grade's ontology reviews with evidence. Trigger to build: the first boundary-drawing session that has to reconstruct the emergent clusters by hand.

- **Surface shape: published names against consumed names (SURFACE.4).** The reachability half of SURFACE.4 - an export no runtime root reaches - belongs to [knip](https://knip.dev) and runs as an advisory pass. The shape half has no home, and the binding walk already resolves which names each consumer takes through each surface, so the graph can report what a reachability tool cannot express: a barrel that publishes a dozen names whose consumers collectively take two, or a named surface with one consumer taking one name, where the boundary is ceremony rather than a contract. It reports on the surface itself and gates nothing, since a surface published ahead of its consumers is legitimate. Trigger to build: the first surface whose breadth is argued in review with no evidence to hand.

## Visualizer

The diagram answers per-edge legality on the current tree. These items extend it to the questions a review asks of the graph as a whole.

- **Draw the reference cycles.** The scan reports every cycle the flows close and the board draws none of them, so today they surface only as a count on the console and a section of the payload. A cycle wants its own severity paint on the edges that close it, an issues-drawer section, and a focus mode that raises the whole cycle at once. That focus mode is the one change here that is not additive: hover, blur and the pin all key on a single file, and a cycle is a set of them. Trigger to build: the first cycle reported on a tree under review.

- **Transitive reachability from a pinned file.** Hovering a file lights one hop of its edges. The two questions a reader asks of a tree they did not write are what an entry point actually pulls in (the forward closure) and who breaks when a file changes (the reverse closure), and both are a breadth-first walk over the resolved flow graph the scan already ships, shaded by hop distance. Trigger to build: the first read of an unfamiliar tree, or the first review that traces a chain past one hop by hand.

- **Structural diff against a baseline ref.** Scan a git ref in a detached worktree through the same code path (the walk is path-based, so the scan itself needs no change), then diff files, edges and verdicts: new edges drawn hot, removed edges ghosted, newly classified files outlined. The gate stops the illegal delta at authoring time and stays silent on the legal one, and structural erosion is a sequence of individually legal moves - a fresh cross-domain edge that every rule permits and nobody would have approved on purpose. The unit a person reviews is the change, and the unit the diagram draws is the state; this closes that gap. Trigger to build: the first structural regression found after it landed, or the first review that reconstructs a change's structural delta by hand.

- **Collapse a domain to a chip (level of detail).** Past a few thousand files the board itself is the bottleneck: every file draws a chip, and the arrows between two large domains read as a hairball. A collapsed domain draws as a single chip, its inter-domain arrows bundle into one edge carrying the reference count and the worst verdict among them, and the box expands on demand. The hidden shelf and the block bar are the hand-driven form of this and they hold for a tree the reader already knows. This is the precondition for everything above on a large tree, because an analysis whose result cannot be drawn legibly is not a review instrument. Trigger to build: the first tree whose board stops being legible under the shelf and the block bar.

## Per-file rules

- **`no-deep-side-effects` unit semantics.** The rule reads "same directory = same unit" while the coupling rules read shared names; a side-effect import crossing unit names inside one directory currently passes. Align it with `unitOf` at its next touch.

- **The undecidable-reference message cites one constraint for every role.** A specifier the analyzers cannot resolve, and a dynamic import with a computed specifier, both report as unjudged and both cite ROOT.1 - which is the composition root's constraint, and the wrong citation on a domain file's reach. The report is correct to fire (an undecidable reference is a real finding, since a reach that cannot be judged cannot be permitted); the citation needs to follow the reporting file's role.

## Ergonomics

- **Ship the visualizer as a VSCode extension.**

## Rejected

- **Coupling metrics on the diagram** (afferent and efferent counts, instability, distance from the main sequence). A number carries no remedy, while every verdict the shared model issues carries its remedy in the message. The metrics also re-ask a question the structure already answers: what a file may depend on follows from its layer and the surfaces around it, so a heavy fan-in is either legal by construction or already reported as a finding.