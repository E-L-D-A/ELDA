# ELDA - Software Architecture Analysis

## Strengths

**1. Dependency inversion is structurally enforced**
The inner-layer rule (Entities and Use-Cases do not import Adapters or Services) makes the constraint architectural, not just conventional. In most layered systems this rule exists as a team guideline and erodes over time. ELDA makes violation visually obvious at the folder level.

**2. Explicit inter-domain contract surfaces**
Separating API (callable input) from Events (observable output) per domain is a meaningful distinction that most architectures conflate. It forces the question "is this a call or a notification?" at design time, which prevents the common pattern of domains growing tangled service-to-service call graphs.

**3. The Streams/Generators cycle maps naturally to reactive runtimes**
The Producer-updates-Stream, Stream-notifies-Consumer, Consumer-calls-Generator, Generator-triggers-Producer cycle is essentially the observable/reaction loop that RxJS, SolidJS signals, and similar systems already implement. ELDA gives this loop a structural name and placement rather than leaving it as ad hoc reactive spaghetti.

**4. Producer/Consumer duality is realistic**
Allowing the same domain to be Active (producer) in one interaction and Passive (consumer) in another reflects how real systems behave. Architectures that assign permanent roles per domain (e.g. strict CQRS read/write split) often require awkward workarounds when a domain genuinely needs both capabilities.

**5. Subdomain generalization prevents duplication**
Extracting UI, Network, and Data as cross-cutting subdomains shared across feature columns acknowledges that these are implementation infrastructure, not product features. Without this, each feature domain tends to re-implement its own HTTP layer and storage abstraction.

**6. Entities layer is framework-free by design**
Keeping domain rules in a layer that imports nothing from the framework makes them independently testable and portable. This is the most stable layer and also the most likely to survive a framework migration.

---

## Weaknesses

**1. "Features" and "Feature domain" collide terminologically** - resolved
The Layers diagram renamed Use-Cases to "Features" within the Feature domain. The word "Feature" named both the top-level domain concept and a specific layer inside it. Resolved by restoring the original CLEAN term "Use-Cases" consistently across all files.

**2. The event cycle trades traceability for decoupling** - resolved
Two constraints together eliminate this concern.

First: Streams and Generators are direct typed references, not string-keyed subscriptions. A type system and IDE tooling can statically follow the reference graph from any Use-Case to every stream it touches and every consumer downstream. String-based dispatch (EventEmitter topic names, custom bus keys) would break this - it is explicitly disallowed by constraint 6.

Second: `async`/`await` is banned from all userland code. Async/await splits a codebase into two mutually incompatible function kinds; that split is what makes runtime stack traces lose context across async boundaries. Instead, every async operation is wrapped as a single-value stream at the Adapters layer and consumed via generator `yield` inside the domain. The call stack stays coherent end-to-end because generators advance synchronously under caller control. Both constraints are now specified (README constraints 6 and 7, Concurrency model section).

**3. No error propagation model** - resolved
ELDA has no error model because it does not classify exceptions as a distinct category. All outcomes - successful, failed, partial - are branches in logic and flow as typed values through the same Streams/Generators infrastructure. There is no "happy path" and "error path"; there are only branches.

Exception-throwing code is impure for the same reason async/await is: it breaks the uniform value-producing contract of generators. Wrapping it belongs at the Adapters layer, consistent with the existing impurity boundary. Use-Cases and Entities never see a thrown exception; they receive typed branch values and handle them as domain logic.

The remaining adoption concern: this model is fully enforceable only with type-system support (exhaustive union checking). Without it, unhandled branches become a discipline problem rather than a compiler error. This is a tooling dependency, not an architectural flaw, and is now documented in the README Outcome model section.

**4. The cycle is structurally susceptible to infinite loops** - resolved
Three layers of protection together close this:

First, for typical UI-touching feature domains, the cycle always passes through a Services layer boundary (user interaction or external service response) before completing. Services are externally driven and do not fire spontaneously, so no tight computational loop can form without a real-world event to sustain it.

Second, the inter-domain stream graph is required to be a DAG. Domains are arranged into tiers (Feature, Shared, Terminal) and stream subscriptions only flow downward. A Consumer domain can trigger a Producer, but not one that is upstream of itself in the same causal chain. When same-tier coordination is genuinely needed, a Mediator use-case is introduced to own and explicitly terminate the interaction.

Third, the event-exchange interface - the single choke point all emissions and generator triggers pass through - tracks a causal set per emission. Any trigger that would re-enter a stream already in that causal set is dropped automatically. This is implemented once in the infrastructure and covers every domain in the system without per-domain code.

**5. The Shared column has no principled boundary rule** - resolved
Resolved by replacing the Shared column entirely with two honest concepts.

The underlying problem was that Shared was defined negatively - "things not specific enough to belong to one domain" - which made it a catch-all with no eviction pressure. Any taxonomic replacement (infrastructure-only, utilities-only) relocates the same fuzzy boundary rather than removing it.

The resolution comes from shifting away from taxonomy toward ontology. Domain boundaries are decisions, not facts, and they are best reasoned about using a Venn diagram: each domain is a set, and code exists somewhere on the diagram based on its dependencies. This reframes "which domain does this belong to?" (requires judging essence) into "where on the diagram does this sit?" (always answerable from imports).

Under this model, code at the intersection of two domains becomes an **orphan** - named by relationship (`home+profile`), not by concept. Orphans have no owner, are consumed by their parent domains, carry only the ELDA layers they need, and become full named domains when the concept they represent becomes clear. Three-way intersections signal a hidden domain rather than a legitimate three-way orphan.

Code with no imports and no side effects has no domain gravity at all. It lives in **pure core** at the bottom of the tier hierarchy, consumed by everything, depending on nothing.

The migration stall the original Shared caused is also addressed: orphans require no concept-naming upfront (removing the pressure that caused stalling), and pure code is always cheap to migrate because it has no entanglement to untangle.

**6. The column/subdomain matrix is visually complex** - partially resolved
The naming collision is resolved: the vertical domain column that owns transport concerns is renamed to "Transport subdomain". The cross-cutting horizontal concern retains the name "Network subdomain". The two concepts are now distinguishable by name.

The visual complexity itself is inherent to any two-dimensional slice model (layers x domains). A module genuinely exists in both dimensions simultaneously - it belongs to a column and potentially a cross-cutting subdomain - and there is no representation that removes this without losing information. Readers must hold the 2D model in mind; no documentation restructuring changes that. This is accepted as an irreducible property of the architecture.

**7. No state management placement** - resolved
ELDA has no state management layer because it has no shared state. State is always local to the domain, layer, or entity where it originates. State that needs to cross a domain boundary is published as a Stream; consumers subscribe rather than hold a shared reference. This eliminates write contention, implicit reflow, and stale snapshot problems that a shared state layer would introduce. Framework-level reactive primitives (signals, subjects) are local implementation tools; they belong at the originating layer and are wrapped into a Stream when the domain needs to expose them.

**8. Active/Passive roles are context-dependent, not statically readable** - resolved (false premise)
The criticism assumes that understanding a component in isolation is a baseline property architectures should provide. No compositional system satisfies this: the moment two components communicate, understanding either one fully requires knowing what it communicates with. This is not an ELDA-specific deficiency.

The comparison to strict CQRS or event sourcing is also misleading. Those architectures do not make roles easier to understand in isolation - they make roles immutable. Immutability is a trade-off (inflexibility for predictability), not a free improvement over ELDA's duality.

The right question is whether the subscription graph is traceable when inspection is needed. ELDA's answer: direct typed references (constraint 6) mean IDE tooling can follow every stream from producer to consumer statically; the DAG constraint (constraint 8) bounds the graph's shape; the explicit Events surface per domain (constraint 3) makes each domain's observable output enumerable. The graph requires inspection, but ELDA makes it more traceable than most event-driven systems.

**9. "Advised patterns" lack placement guidance** - resolved
The original four compound entries (Mediator Commands, Composite Strategies, Adapter Components, Composite Observer) were self-reminders rather than a proper spec. Two described the layers themselves rather than patterns (Adapter Components, Composite Observer as Streams). The table is replaced with a layer-explicit three-column format listing twelve patterns across all four layers, derived from GoF and DDD. Observer is removed as it describes the Streams infrastructure, not an optional pattern above it.

---

## Synthesis

Most apparent weaknesses were false premises grounded in assumptions from conventional architectures. Five of the nine dissolved or resolved under examination without requiring new constraints: the architecture had already made the relevant decision, it just was not documented. Cycles, error propagation, state management, traceability, and static role readability all fell into this category. The remaining four were documentation and naming deficiencies, now corrected.

Two genuine limitations remain. The outcome model depends on exhaustive type-system support; without it, unhandled branches become a discipline problem rather than a compiler error. The two-dimensional column/subdomain model is visually complex by nature; any representation that flattens it loses information. Both are accepted as irreducible properties of the architecture.

The documentation produced by this analysis: naming consistency restored (Use-Cases throughout), state model and outcome model formalized as explicit sections, orphan intersections and pure core replacing the Shared escape hatch, cycle prevention specified with the causal set mechanism, and the patterns table rewritten with layer-explicit placements derived from GoF and DDD.

The architecture is coherent and ready for adoption at scale. The remaining open question is tooling: a linter or type-level enforcement for layer dependency rules and the DAG constraint would move the last discipline-dependent pieces to compile time.
