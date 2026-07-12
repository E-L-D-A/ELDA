# ELDA
Event-Layer-Domain Architecture

![General scheme](./ELDA-General.svg)

![Layer map](./ELDA-Layers.svg)

The two diagrams are the source of truth; this document decodes them into prose and states the binding constraints. [FEATURE-INTEGRATION.md](./FEATURE-INTEGRATION.md) turns the rules into the step-by-step procedure for integrating a feature, and [support/js](./support/js) ships the machine-checkable subset as a lint plugin, with a preset for each grade a machine can hold. A non-normative appendix at the end maps the concepts onto concrete primitives for a TypeScript runtime.

---

## The thesis

Software architecture habitually treats structure (where code lives) and dataflow (how values move, who tells whom) as separate concerns, each with its own school. The structure-first family (Clean, Hexagonal, DDD, feature-sliced designs) governs placement and dependency direction while leaving runtime communication to convention. The dataflow-first family (flow-based programming, synchronous dataflow, Rx, actors) makes communication primary and leaves structure flat.

ELDA welds the two into an identity: **structure encodes dataflow** - the layer placement and the import graph are the data path, read them and you have read how values move; **dataflow dictates structure** - where a piece of code sits is determined by what flows into it, position is dependencies, a channel's direction sets its layer, and misplaced logic is precisely logic whose dataflow disagrees with its location; **the name states the conjunction** - Events (the dataflow), Layers (the structure), Domains (the ownership boundary that welds them).

**Ownership is the welding operation.** Every element of the dataflow - a value, a channel, a piece of vocabulary, a composition decision - has exactly one owner, and the owner's position is the element's single structural home; one owner per element is what makes "structure encodes dataflow" well-defined. Most prohibitions in this document are one rule seen from different angles: a consumer may reference an owner, and never re-own what the owner holds.

ELDA has one generative principle: one graph carries both. The layer rules, the channel discipline, the surface model, and the ownership taxonomy all derive from it; anything in this document that does not is marked as an example.

### What the identity buys

- **Static traceability.** Every edge is a direct typed reference; nothing hides behind a string, and where a host namespace forces a string seam (a DOM attribute, a storage key) the owner's single declaration keeps even that edge findable (see Vocabulary). The whole inter-domain graph, feedback loops included, is discoverable by following references, and the data flow itself is navigable: a channel can be definition-hopped from producer to consumer.
- **Predictable location.** The kind of an effect predicts its layer (a binding bug in Adapters, a rule bug in Entities, an I/O bug in Services, an orchestration bug in Use-Cases), and its concern predicts its domain. Navigation is "go to a predicted location".
- **Bounded blast radius.** A change has the scope its diff says it has, and cross-domain navigation cost is constant at the surface, independent of the target's internal depth.
- **Mechanical shakeability.** By-reference edges and named surface exports give build tooling per-name granularity.

These are consequences of the identity and hold exactly as long as it does, which is why enforcement is treated below as a first-class design property.

## Positioning and prior art

ELDA's parts are prior art: Clean Architecture's four layers with the outer ring re-purposed, Hexagonal's primary and driven ports as the API and Events surfaces, DDD's bounded contexts replicated per concern, Seemann's Composition Root and Pure DI, functional-core-imperative-shell extended to a two-tier impure boundary (Adapters, then the shell), the observer/iterator duality behind Stream/Generator, the colored-function diagnosis with a decoloring response, and errors-as-values without the negative-branch bias.

What ELDA adds is the weld that binds them: structure ≡ dataflow, with ownership as the encoder.

ELDA owns *where things live and how they connect*: the one graph. It delegates *what things are made of* to the host: what a stream is (any conforming reactive primitive), enforcement mechanics (the host's linter, as a plugin), reachability analysis (the host's dead-export tooling), wire validation (a codec at the transport boundary), temporal runtime dynamics where genuinely needed (a scheduling substrate at the shell). The one thing never delegated is wiring: a library that ships its own wiring channel spanning module boundaries - a DI container's resolution graph, an effect system's context channel riding its types - would add a second dependency graph parallel to the module graph, and dataflow that travels a second graph is exactly the decoupling the identity exists to reject. Such substrates are admissible only beneath a single surface or at the imperative shell, for temporal concerns the static identity is silent about (scheduling, cancellation, backpressure), and their types never ride a consumable surface.

Scope: ELDA governs structure and flow inside one runtime. It does not cross processes (see composition roots below), does not manufacture transactional guarantees (see the state model), and does not attempt to absorb operator discipline - it assumes a maintained review tier and pays off in proportion to it. Its nearest real alternative is the hand-assembled stack: a feature-sliced layout, a reactive-primitives library, container-free DI, a functional core. ELDA's claim over that stack is the weld alone - one ownership principle governing the seams each piece leaves to convention (effects, async coloring, cross-cutting policy, string-namespace vocabulary) - priced at the ceremony and the enforcement this document closes with.

---

## Domain structure

Each product concern lives in its own **Domain**. Every domain contains the same four layers, stacked top-to-bottom:

| Layer | Color | Responsibility | Concrete examples |
|---|---|---|---|
| **Services** | blue | External interface to the domain (facade over external systems or the host), composed by the runtime root | UI system, API client, storage driver, platform SDK |
| **Adapters** | green | Bindings between layers or between the domain and its environment | UI bindings, request interceptors, interface adapters, presenters |
| **Use-Cases** | red | Business/application logic: processes, watchers, pipelines | Feature workflows, data transformations, event handlers |
| **Entities** | yellow | Pure, framework-free domain invariants | UX rules, data constraints, network policy |

The four layers face two audiences. A domain's **Services** are reached by the **composition root**, which instantiates and wires them; a **peer domain** reaches only the domain's **Use-Cases** and vocabulary, through the public surface, never its Services (one graded exception, the peer mounting treated under Composition roots).\
Hence the naming: **Services** are domains *served* up for the runtime, **Use-Cases** are how domains can be re-used.

The examples in this table, and every enumeration in this document, are descriptive, non-binding illustrations. The Layers diagram's UI / Network / Data split of a feature domain is likewise one example of subdomains - a subdomain is a full domain nested inside another (same layers, same surfaces, same rules), treated under Subdomains and nesting below - and each domain decomposes as its own concern requires.

### Reading the diagrams

A translation legend maps the two diagrams' labels onto this document's vocabulary. The Layers diagram's **Application Runtime** band is the composition root; its **Features** row is the Use-Cases layer, its **Domain Rules** row the Entities layer, and its **Shared** column the pure core (zero outside dependencies; arrows point from domains into it, never back). The General diagram draws each layer with a producer facet and a consumer facet, example artifacts on each (`web-api`, `gateways`, `streams`, `rules` down the producer side; `UI`, `presenters`, `processes`, `models` down the consumer side); the API bands face the peer domain, the Events bands sit on the outer edges, and the bottom half zooms into the Use-Cases band to draw the Pipe-Event-Stream cycle with its Active/Passive matrix. Along the U, data may be enriched, re-shaped, or filtered by data drawn from Entities. There are no upward arrows anywhere; within a subcolumn every dependency arrow points down. The runtime band's composing arrow recurses: within the Feature column the domain itself plays the Application Runtime role for its subdomain columns, the composing arrows fanning out per subdomain, and each subdomain column realizes its four layer rows as one artifact box each, one file per layer.

### Subdomains and nesting

A layer is a classification of code, never a container. Within a domain's tree, every grouping node expresses a concern - a nested domain (a **subdomain**) or a unit (see Units) - and layer membership rides the file names: the tree is the concern ontology made literal, position answers "which concern" at every level, and the file answers "which layer of it". A container named for a layer is a horizontal bucket: it accumulates unrelated concerns behind one classification, and the tree stops encoding anything at exactly that node.

Nesting is an ownership placement, and three consequences follow:

- **Siblings are peers.** Between two subdomains of one parent, the full cross-domain discipline applies: consumable surfaces, the use-case crossing, the graded lateral mounting.
- **Subdomains are internal.** Outside the parent, only the parent's own published surfaces exist. A subdomain is the parent's revisable decomposition decision, and a visible name is a contract: keeping children invisible is what keeps internal re-drawing contract-free, so boundary migration stays the health the Ontology section names. Publishing a child capability is the parent's deliberate act - a curated re-export on its surface, a hop that homes exactly the contract decision - and a child whose outside consumers outgrow the parent has factually stopped being internal: the sharedness move extracts or promotes it.
- **The parent is its children's composition root.** A domain reaches its own subdomains' runtime-composition surfaces and composes their blocks; composing owned parts re-owns nothing. Each level composes exactly its direct children, the runtime's roots compose the top-level domains, and root-unawareness recurses: a subdomain never references its parent, and content two siblings share extracts into a sibling subdomain.

### Layer dependency rules

- **Information flows downward**: Services → Adapters → Use-Cases → Entities
- **Awareness flows upward**: Entities define interfaces for Services to implement; Entities do not import Services
- **Activity progresses top-to-bottom** through all layers for any given request
- Inner layers (Entities, Use-Cases) **must not import** outer layers (Adapters, Services)
- Dashed dependency lines = weak/optional coupling; red dashed = inadvisable, avoid. The diagram draws the red links at both outer rows: service-to-service and adapter-to-adapter across units. Its cross-unit links at Use-Cases are ordinary solid dependencies (the designed crossing), and at Entities weak ones (vocabulary reference)

### Crossing layers

The downward edges (Services → Adapters → Use-Cases → Entities) are both control flow and source dependency: a request enters at a Service, calls down through the layers, and imports point the same way. The upward edges are control flow only, an inner layer invoking something an outer layer provides, and on those edges the source dependency is inverted.

Inversion here is purely structural - no DI container, no service locator. It means: **an inner layer declares what it needs as parameters, and the layer above supplies them.** A use-case that needs the current route takes it as an argument; the adapter that wires the router hands it down. A use-case that needs to navigate takes a `navigate` callback; the adapter supplies the concrete one. The "port" is usually just the parameter list, a structural contract, and earns a named interface only when the contract is large enough to be worth naming. The supplying happens by ordinary composition - the outer layer calls the inner one within its own scope and passes its values down - so the composition is the wiring.

The port remark generalizes into the **indirection rule**: an indirection earns its keep as a structural change - the added hop must become the home of a decision (an invariant, a shape translation, a composition authority), and a hop after which every decision lives where it already lived is ceremony. The rule governs hops at architectural boundaries; extracting a helper inside a unit (see Units) is style, outside its reach.

Corollary, the **relocation rule**: if an inner layer finds itself needing an *outer layer's module* (a use-case importing a service, an entity importing an adapter), that is misplaced logic. Split it. The pure part, a function of plain values, moves inward to where its dependencies actually are; the binding part, which reads the outer module and feeds the pure part, moves outward to the Adapters layer, whose defined job is exactly this binding. After the split nothing imports upward, because the inner part now depends only on values and on ambient mechanism. **Ambient mechanism** is the substrate the host already supplies everywhere - the language runtime, a channel-conforming reactive primitive, the rendering runtime: code uses it in place, it never forms an import edge to an outer layer, and it exempts nothing from a layer's own purity rules.

Downward, the ordering protects the activity path: a request descends through every layer's work. A bare downward *reference* at any distance (a Service naming an Entity type) is deliberately unregulated - a type is stateless vocabulary, and regulating reference distance would demand hops that home no decision, which the indirection rule refuses.

### The two axes and the projection curve

The Layers diagram draws two axes over the whole map. The **Activity axis** (vertical) is the probability of encountering an active side: Services predominantly drive (they make the outgoing call, mount the UI, boot the SDK), Adapters actively drive the external APIs they wrap, Use-Cases are the pivot where active production meets active consumption, and Entities are fully passive - pure invariants invoked on demand. The **Generalization axis** (horizontal) is how few specifics the code holds: more general code carries fewer constants and less concrete logic. The diagram's diagonal curve is a mental frame that limits divergence between the two: each layer's code should project onto the curve, so highly active code is specific and highly general code is passive. Code far off the curve (a very general module that actively drives, a very specific one that only waits) is a placement smell.

---

## Channels

### The active/passive matrix

Every piece of code has a **producer side and a consumer side**, and each side is independently **active or passive**. The two cross-domain channels are the diagonals of that matrix:

- **Stream** = active producer + passive consumer. The producer pushes; subscribers receive. Callbacks and frame-tick subscriptions are categorical subsets of Streams.
- **Generator** = passive producer + active consumer. The consumer pulls; the producer responds. Plain function calls are a categorical subset of Generators.

Push versus pull is a *consequence*, set by which side is active: an active producer pushes, an active consumer pulls, a passive consumer receives the push, a passive producer responds to the pull. Producer and consumer are **shifting roles** - the same code is a consumer in one exchange and a producer in another - so neither channel is bound to a fixed side.

The full loop between two domains (the Pipe-Event-Stream association): a consumer use-case `call`s a Generator, which `trigger`s the producer use-case, which `update`s a Stream, which `notify`s the consumer use-case. A domain is the active producer at the Stream it updates, the passive producer at the Generator it is triggered through, the active consumer at the Generator it calls, and the passive consumer at the Stream that notifies it.

### Concepts, not primitives

Stream, Generator, API, and Events are raw, shape-agnostic concepts, never specific language constructs. A reactive signal *is* a Stream; a callback registration *is* a Stream subscription; a plain function call *is* a Generator pull. A primitive that already realizes a concept is used directly - there is nothing to wrap it into. Adaptation exists for shapes that *mismatch* the concepts (a promise, a throwing call, an imperative API), and it makes them conform. The concrete primitive is a runtime concern; the architectural rule is only that domains communicate through these channels exclusively.

### Storage shape is orthogonal to direction

A Stream or Generator may carry **event-shaped** values (discrete emissions, no notion of a current value, missed emissions lost without explicit replay) or **state-shaped** values (always a current value, late subscribers see it, intermediate updates aggregated). Both shapes fit both channel roles. The category names which side is active; the storage model is a separate choice governed by what consumers need from the channel (replay semantics, late-subscriber behavior, memory of past emissions).

### Publication is immutable

Channels push values by reference, so a mutable published object would hand every subscriber a live reference into producer state - shared state with extra steps, re-opening the write contention and torn snapshots the state model forecloses. A value is therefore immutable from the moment it is published: the producer never mutates a value after publishing it (copy-on-publish where the source is mutable), and a consumer holds what it receives as a snapshot it does not own.

### Cycle safety: the two gates

The Pipe-Event-Stream loop is a cycle by construction, and feedback loops are inherent to interactive systems, so a blanket prohibition would be wrong. The discipline splits into two gates:

- **Gate 1 - no synchronous short-circuit (statically checkable).** Every cross-domain reference cycle must enclose a **settling element**: a delayed or change-gated channel that breaks synchronous re-entry. This is the causality analysis of synchronous dataflow (every cycle contains a delay), run on the reference graph the by-reference rule keeps statically visible. A settling-less cycle is a causality loop, rejected structurally; a stack overflow at runtime is only its weak symptom.
- **Gate 2 - convergence is observable.** A settling element guarantees progress; convergence is a value-level property, undecidable in general. A change-gated loop quiesces when values stop changing, and a genuinely non-converging loop stays visibly hot: a localized, observable logic bug.

The conformance contract that follows: a channel that participates in a reference cycle must be **change-gated** - equality-gated delivery with a tight equality. A value-retaining replay channel inside a loop re-fires its retained value forever, and a too-coarse equality can itself sustain a low-amplitude oscillation, so neither satisfies the gate.

---

## Surfaces

### API, Events, and audiences

A domain exposes two perpendicular interfaces - **API** (callable input: how other code invokes it, carrying its callable use-cases and the Generators others trigger) and **Events** (observable output: what it emits when state changes, carrying its Streams). Both are realized as one or more named public **surfaces**: targets consumers reference by name, in whatever form the host language and module system provide (a barrel module, a `pub` export, a public package interface, split entry targets where build output requires them).

The surfaces divide by audience. The **consumable surface** carries the use-cases and vocabulary any peer domain references, and never exposes services or adapters: peers consume at the use-case crossing. The **runtime-composition surface** carries the services the composition root instantiates and wires, and only the root reaches it, save the graded mounting exception (see Composition roots). A surface additionally splits whenever one target would conflate two consumer types - a client-facing and a server-facing target are distinct surfaces of the same API, so server-only vocabulary never rides into a client bundle.

### The surface is the contract

Consumers reference a surface by name and never reach past it into the domain's internal layers, modules, or directory tree. Internals reorganize freely behind it. Internal files use concrete, engineer-canonical names describing their contents; ELDA's architectural vocabulary (Stream, Generator, Service) belongs in this document, and the surface mediates between the two registers.

The invariant is `consumers ⊆ surface`: nothing is reached past the surface, and a domain may expose more than its current consumers require, so a new consumer can arrive without forcing a producer edit. An unconsumed export is a review signal: dead surface to trim, or a capability deliberately ahead of demand.

### Units

A **unit is the files sharing one name, dedicated to one concern-part**: `back-nav.adapters.tsx` and `back-nav.adapters.css` are one unit composing itself, and intra-unit imports carry no restriction beyond layer rank, which binds regardless of path form; co-location is ELDA's organizing structure. A different name is a different unit, and the cross-unit rules (the lateral service-to-service and adapter-to-adapter smells among them) act on names: to draw a boundary between two things sharing a name, give each its own. Directories express concerns, which makes a grouping directory a subdomain with surfaces of its own (see Subdomains and nesting); a layer-suffixed directory is that subdomain dodging its discipline behind a file's name. The spec never mandates decomposition; structure starts coarse and splits when a boundary becomes real. An effect-only import (a bare import for its side effect) reaching past its unit hides an effect in the graph and is a smell; effect composition by import belongs to the composition root.

### What a file is fixes its classification

A stylesheet is code: it composes through ports, scopes on boundaries, and layers internally, so it classifies by the layer it occupies, obeys that layer's rules, and belongs to the unit it is co-located with. A runtime-context marker (`.server`, `.client`) and a build-convention compound (vanilla-extract's `.css.ts`) are colorings the classification sees through; the layer rides the suffix before them. A pure-data asset (an image, a font, a media file) carries no behavior and resolves to a value on import, so it is vocabulary, classified as an Entity: importable from any layer, never a service, surface-gated across domains.

---

## Ownership

### The re-ownership principle

A consumer may **reference** a domain, never **re-own** it. An invocation re-owns when it commits a decision over something the consumer does not own. A domain owns five things, and re-owning any of them is the violation:

1. **Setup** - its instantiation and wiring. Only composition roots instantiate services and wire ports.
2. **State** - published, never shared by mutable reference; a consumer writing to a received value re-owns producer state.
3. **Vocabulary** - declared once by the owner; a re-declaration anywhere else re-owns it.
4. **Behavior** - the owner publishes the capability its identities imply; a consumer branching on the owner's identity values re-derives policy the owner should hold.
5. **Cross-cutting placement** - a concern spanning other domains is composed by the root; a consumer mounting it re-owns placement over domains it does not own.

Re-use is always by reference to the single conceptual owner and never re-instances ownership. Rendering a domain-controlled component with the consumer's own content inside it is fine - the consumer owns that content. Mounting a concern whose scope spans domains the consumer does not own (a loading shell, a theme application, a router) is the root's prerogative.

Adoption is re-ownership's legal counterpart: a layer file that republishes a name it consumes - a named re-export, a forwarding declaration - takes that name into its own concern at its own layer, and its consumers reference the new owner. The seam is the declaration; a body forms around it when logic does, and no consumer moves. The adopting reference is judged at the adopting file's own layer, so adoption never reaches further than the file could already legally reference, and it costs one line - the indirection rule tolerates the hop precisely because it is the declared home of a future decision. A surface republishes without adopting: it holds no layer and curates for outside consumers, so what a consumer takes through a surface is judged where it lands.

Worked example, in both directions: an environment-access domain owns the *mechanism* (typed, per-runtime read and validation) and its own generic deployment vocabulary; a tooling domain that needs a gating variable owns *that key* as its own vocabulary and reads it through the mechanism. The tooling domain re-declaring the environment contract re-owns the mechanism-owner's vocabulary; the environment domain absorbing the tooling-specific key re-owns the tooling domain's - semantic coupling without an import edge is still re-ownership. The root composes the full per-runtime contract from each wired domain's declared keys.

The state vector carries one sharpening: a published write operation's input space is the domain's legal transition space. Where every value the type admits is a legal state, the state's raw setter is that operation, published as-is; a narrower operation exists only where it holds an invariant the raw width would otherwise delegate to every consumer to know and re-enforce. The wrapper earns its keep exactly when it is the invariant's home - the indirection rule again; a wrapper holding no rule is ceremony.

### Vocabulary

Vocabulary - types, wire schemas, design tokens, identifiers - is owned by the domain that emits it and declared at that owner's entity layer. Other domains do not re-declare, re-bundle, or hold their own manifest of it; consumption flows through the owner's surface. Reactive vocabulary (a current theme, a current locale) rides whatever runtime channel the host provides for supplied values; static vocabulary that must exist before runtime composition lives with the owner and is referenced through channels that do not import the owner's module (a name lookup, a code-generation output).

The same ownership governs identifiers living in a **shared runtime namespace** rather than a module: a DOM attribute and its selector, a CSS custom property, a storage key, a URL parameter, a message type, a runtime global. These cross representation boundaries no single type system spans, with no import edge linking writer to reader, so the discipline is collapsed to one point: the owner declares the identifier once (a typed constant, an exposed binding surface, a generation output emitting both representations from one source), and consumers reference the declaration, never a re-spelled literal. A re-spelled literal is invisible to import-following search and reads as dead code to anyone without the cross-package context. Introducing a new such identifier is an act of creating vocabulary: it gets an owner before any site writes it.

Consuming an owner's *identity* vocabulary has three forms of decreasing safety. **Referencing** it by type is sound: a rename breaks the reference at compile time. **Deriving behavior keyed on it** (branching on a host identifier to pick a rule) is a smell even when type-bound: the type checks the name and misses the policy, so a new identity with the same behavior is silently mishandled; the owner publishes the capability its identities imply, and consumers branch on that. **Re-declaring** the literal with no type binding is forbidden outright.

Ambient declarations (global augmentations, ambient modules, declaration files) are vocabulary like any other: co-located with their owning domain, never pooled in a root catch-all.

A foreign owner's contract (a shared library's tokens, an external system's types) is referenced by name at the layer its kind permits: a type at any layer, a presentation token at Adapters and above and never in an Entity, an implementation detail (a utility-class string) nowhere.

### Cross-cutting concerns are blocks

A concern that owns state, encodes a policy, or authors markup more than one consumer would otherwise re-author cannot escape its owning domain as a free-floating hook; each consumer mounting it would re-instance ownership. The owning domain absorbs it into a **composition block** - a service - and the root composes it once, with consumer content composed in; other domains contribute data and behavior contracts. A helper that owns nothing and returns a pure value over ambient mechanism or already-published state stays directly consumable as a use-case; the discriminator is re-ownership: does consuming it as a bare hook force each consumer to re-instance or re-decide what one owner should hold?

---

## Composition roots

A **composition root** is the host runtime's entry band above every domain: the one position that reaches a domain's Services to instantiate and wire them. In a router-driven UI app it is the route tree; in a request-driven server, the request handlers; in a CLI, the entry command. It is not a domain, has no four-layer stack, and holds no layer-typed domain code; domains are unaware of it. There is no limit on the number of roots or their relations - a client, a server, and a build-time bundler root under identical rules is a normal shape - because execution context is a coloring (see Concurrency). Composition also recurses beneath the root: each domain is the composition root of its own subdomains (see Subdomains and nesting).

**All data starts and ends at the root.** A root-side producer feeds a producer Service; data descends the producer domain's layers to its use-case, crosses to the consumer domain's use-case over the channel, ascends to the consumer Service, and exits at the root-side consumer - a U-shaped detour, enriched along the way from the Entities layer. The same root is both faces of its U.

**Breadth, with depth held at the surface.** The root's cross-domain license is breadth across many domains with depth held at each surface: it consumes each domain only through its published surfaces (consumable, and runtime-composition for what it wires) and never reaches into a layer's internals. Services are composed by the root - instantiated, given ports (slot content, callbacks, configured policies), combined per run.

**Lateral composition is graded.** The grading concerns peers; a domain composing its own subdomains is self-composition (see Subdomains and nesting), ungraded. The designed form is a named slot port the root fills with the sibling block. Mounting the sibling block itself - another service unit of the same domain, or a peer domain's block reached at its runtime-composition surface and never past it - is inadvisable and carries a per-instance justification. The graded case exists for unified composition: a domain's own rules sometimes legitimately compose two peers. It stays soft because a hard ban steers somewhere worse: re-authoring the sibling concern from its use-cases, which re-owns it, the actual violation. The justification test is the indirection rule: name the decision the root makes at the port hop; none means the port is ceremony and the mounting is honest. The same grading holds between Adapters of different units - cross-unit data crosses at use-cases, so the layer above composes the two bindings, or they co-locate into one unit.

**Wiring needs no container.** The wiring graph is bounded at surface granularity, so it stays small enough to remain ordinary code; published-not-shared state leaves no lifetimes for a container to manage; parameter inversion keeps construction inside the type system's ordinary checking. What remains for a container is only a wiring channel parallel to the module graph - rejected like every other out-of-band channel.

### The imperative shell

The root's outer face is the **runtime integration surface**: the imperative shell where the architecture meets the host's own primitives (mount lifecycles, SDK boot calls, service-worker registration). It is the one place where the otherwise-banned awaiting and catching of host primitives is legitimate, because boot sequencing genuinely needs them and they never enter a domain's call graph.

The shell may **sequence**: instantiate services, supply ports, subscribe and route channels, and order the host's own async and throwing primitives into a context-fit boot. It may not **chew**: it holds no domain decision and no owned-vocabulary literal. The discriminator is whether a line *names and orders* owned surfaces and runtime primitives, or *re-implements* a semantic a domain owns. The prohibition exists because an exempt zone acquires catch-all gravity; owners break their semantics into parts inside their domains and expose them, and the shell feeds the pre-chewed parts to the platform in sequence.

### Failure and blast radius

An outcome a domain cannot turn into a meaningful branch (a boot failure, an SDK refusing to initialize) is translated back into the runtime's own terms at the shell, as a last resort, never modeled as a domain outcome. What it tears down is the root's decision: the root partitions its composition into scopes of its own choosing (an app, a request, a subtree); the failure terminates the scope that composed the failing piece, and the root decides restart, degrade, or propagate. A domain never supervises another domain - supervision is composition, so it is root work.

### Roots connect through transport

Domains communicate intra-root, by reference, through the use-case channel; a reference is valid only inside one runtime's memory, so a U never spans two roots. Roots communicate inter-root by serialization through the **transport plane** at the Services layer: a server-to-client flow is two Us chained through transport, each root the alpha and omega of its own plane. This is a deliberate rejection of location transparency: a network hop is never disguised as a local reference.

---

## The cross-domain data path

The use-case ↔ use-case channel is the only cross-domain crossing, so every compliant path has one spine: source layer descends to its own use-case (import-and-call), crosses the channel, ascends the consumer's layers (by inversion) to the target. Entities are data sources, drawn from and never written to; Services are where data exits; Use-Cases are the pivot. An effect never crosses at all: only data does - a request on the API surface, a value on the Events surface - so an effect stays contained to the domain that owns it.

What needs no path: a pure, total, effect-free thing (a name, a shape, a pure total function) is referenced directly by name through the surface - there is no state to go stale and no effect to contain. Whether such a thing is an entity or a use-case is the separate invariant-versus-process axis; purity earns the direct reference, the axis sets the layer.

Effect regulation follows the same ownership, because an effect is a write to some target. A write to state the domain owns is legal at the layer that owns it - a reactive primitive's setter called inside the use-case that created it is the domain exercising its own state - and needs no containment of its own, because what the architecture contains is the write's *observability*: nothing outside the owner sees the mutation except through published, immutable, change-gated channels. A write to the outside world binds at the outer layers, where the world's shape is bound. A write to another domain's anything is re-ownership and never happens; the consumer invokes the owner's published operation instead. Entities own no state, which makes them the one effect-free floor. The incidental micro-effects a host runtime makes unavoidable (allocation, module evaluation, memo caches) sit below the architecture's resolution and go unregulated.

---

## Outcome model

Two parties speak different outcome vocabularies. The platform knows only **runs or throws** - it observes termination shape alone. The domain knows only its **typed business outcomes** - branches with meaning. Architectures that let the machine's binary leak into business flow route a valid pessimistic outcome (a not-found, a validation failure) as a soft value or a hard exception by implementation accident. ELDA makes the layer stack a **bidirectional translator** between the two vocabularies:

- **Inbound**: a throwing external API is wrapped at Adapters into a typed value - one of the domain's meaningful branches. From there outcomes travel the normal data paths; there is no separate error channel, no exception in the call graph, and no branch designated as semantically wrong. Async and throwing are the same shape mismatch, translated at the same boundary.
- **Outbound**: an outcome the domain cannot handle is converted back into the runtime's binary at the imperative shell (see blast radius above). Domains never see it.

Ownership of outcomes: the Adapter touching a throwing API owns the inbound conversion; each domain owns its outcome shapes as vocabulary declared at Entities and exposed through the surface; a consumer handles the producer's typed branches and never reaches in to catch a raw throw. Exhaustive union checking is an ergonomic lift that makes the bookkeeping cheap; the substance is the translation itself, which runs the same on tagged values and convention.

---

## Concurrency: neutralize the colorings

Async/await splits a codebase into two incompatible function kinds whose agreement propagates transitively through the call graph. ELDA neutralizes the coloring into one kind: every asynchronous operation is wrapped at the Adapters layer into a single-emission channel, and inner layers receive only channel protocol, never a raw promise. The channel's storage shape (whether a late subscriber sees the settled value) is the usual orthogonal choice. Execution context (compile-time, server-before-hydration, client-after) is the same kind of coloring, neutralized the same way: each context gets its own composition root under identical rules, and none is granted a structural exception. "Static" means stateless and behaviorless, never compile-time.

---

## State model

State is local to the domain and layer where it originates; there is no global state construct and no shared mutable reference between domains. A reactive primitive holding local state inside a use-case is that use-case's own affair. State that must cross a boundary is **published**: the producer emits values through a channel, consumers hold a subscription reference - a reference to the channel, never into producer state - and published values are immutable (see Channels). This forecloses the three failure classes of shared state: write contention (each location has one owner; published values cannot be written), implicit reflow (propagation is explicit channel delivery), and stale snapshots (a state-shaped channel delivers the current value at subscription and every update after).

Scope honesty: a co-change invariant spanning several entities has one owner - a domain whose use-case performs the whole change as one published operation - and transactional atomicity itself is a terminal-tier capability (the storage or backend transaction), reached through transport or storage domains. ELDA locates the invariant; it does not manufacture the guarantee.

---

## Ontology

Domain boundaries are deliberate decisions that evolve as understanding matures; there is no single correct partition. The working model is a **Venn diagram**: each domain is a set, and a piece of code sits where its dependencies place it - inside one circle, at an edge, or at an intersection. "Which domain does this belong to?" becomes "where on the diagram does this sit?", which is always answerable from the imports.

**Sharedness.** Code functionally intersecting two domains depends on both, so it is more shared - more general - than either parent: it extracts downward into a shared domain both parents depend on and that depends on neither (`A → S ← B`), collapsing any would-be mutual dependency into one-way edges. The dependency order that results is a DAG read straight off the graph, ordered by how many domains lean on each node, with the dependency-free **pure core** at the bottom (consumed by everything, importing nothing). How close a domain sits to core says how shared it is; reference count is never an importance judgment.

**The coordinator dual.** Code that *coordinates* two domains by consuming both their surfaces sits above both - the opposite pole from the extracted intersection. The discriminator is ownership: pure wiring (subscribe one domain's stream, call another's use-case, no policy held) is the composition root's job; coordination that owns a policy (an arbitration rule, a priority, a debounce discipline) is a concern with an owner - a domain that references both surfaces and sits exactly where its dependencies place it.

Naming an extracted intersection, and deciding when it has earned a concept of its own, is judgment the architecture does not decide. Boundaries are provisional; code migrates toward the circle it most belongs to as the diagram changes shape, and that migration is health.

---

## Libraries

A third-party library is a black box: ELDA does not see or govern its internals, only its surface as consumed. Consumption follows the same rules as any foreign system. An API that already conforms to the concepts (reactive accessors, value-returning hooks, pure callbacks, idempotent on import) is consumed directly and orchestrated by use-cases; externality alone triggers nothing. A mismatched shape is adapted at the boundary layers. At a foreign boundary the Adapter's obligation is **translation**: the domain declares its own entity vocabulary and the Adapter maps the foreign shape into it - a wrapper that merely re-shapes, leaving the foreign model in charge of the domain's types, has adopted the foreign model behind a compliant import graph. Between in-repo peer domains no such obligation exists: referencing a peer's vocabulary through its surface is the designed path, because the owner is inside the system and renames propagate by type. A library's own vocabulary is a foreign owner's contract, referenced by name and never re-declared. Wiring substrates are bounded by the bar stated under Positioning.

One recurring boundary case: a validation library whose schema factory co-locates the data shape with a throwing validator produces an effectful object, and invoking that factory at the Entity layer lands the object on the pure floor. The Entity holds the shape; the factory invocation and its throwing surface belong outward, at the Adapter that translates the boundary. The library will not separate the two structurally, so that wall is the architecture's to build.

---

## The type-level language

A type-level language (compile-time-gated type computation) is a second computational language, and ELDA is self-similar into it. The static principles recurse in full: a plain shape is a type-level entity, a type-level function (conditional, mapped, recursive) is a type-level use-case, exported types are the surface and unexported helpers are private, ambient declarations and merges are owned side-effects, and a computation that resolves to an error-shaped type instead of the compiler's bottom is the inbound outcome translation, recursed. The dynamic principles relocate to the meta-runtime whose clock ticks during reference resolution (largely at authoring time): navigation ergonomics become resolution paths, execution frequency becomes instantiation cost, state-over-time becomes state-over-resolution. In practice type-level code shadows the value-level layer it types; standalone type-level domains live mostly in libraries, which are opaque anyway.

---

## Navigation

Go-to-definition and find-references always land: every edge is a reference, and the string seams a host namespace forces are collapsed to their owner's single declaration (see Vocabulary). Distance is the only question. Within a domain, cost is layer distance and asymmetric: downward is direct import-following, upward is the inversion's tax - a reverse lookup to the composition site that supplied the port. Across domains, cost is constant at the surface (one indirection) regardless of how deep the target sits. Flat architectures smooth navigation by flatness and pay at scale, when boundaries erode and flow has no reference to follow; ELDA accepts the reverse-lookup tax and the surface indirection in exchange for costs that stay bounded and locations that stay predictable as the system grows.

---

## Enforcement

### Brittleness as a property

ELDA optimizes for composability, refactor-friendliness, and locality of change at the cost of robustness against discipline lapses. A single cross-domain deep import, one escaped cross-cutting hook, one service composing a service, and the locality property degrades from that point outward. This trade-off is deliberate and it is the opposite of malleability-first architectures, which absorb slips gracefully and pay in structure. Choose accordingly: ELDA fits long-lived codebases whose operators will hold a review tier; it is the wrong fit for prototypes and for teams that want the architecture to absorb lapses.

The operational check of the property is **blast radius equals diff**: if a change's effects reach files outside the domains its diff touches, and no contract change was intended, a boundary leaked - find it before merging.

### Three tiers

Brittleness is rational only while the mechanically checkable rules are mechanically checked, so human attention is spent where no machine reaches.

- **Tier 1 - machine-checked invariants**: decidable and unambiguous when violated. Layer boundaries, surface reaches, inner-layer async and try/catch, mutable surface bindings, ambient-declaration placement, owned-vocabulary literals at the shell. These are lint/CI gates ([support/js](./support/js)); reviewer attention starts at Tier 2.
- **Tier 2 - review judgments**: calls a tool can at most surface. Domain placement and boundary drawing, hook-versus-block, the introduction of a new shared-namespace identifier, an unconsumed export (dead surface, or capability ahead of demand), under-decomposition, translation adequacy at foreign boundaries.
- **Tier 3 - scheduled maintenance**: obligations the architecture does not self-trigger. Ontology re-evaluation as understanding matures, vocabulary-registry upkeep, and the Gate-1 cycle audit (a whole-graph property) until a graph pass automates it.

### Grades of alignment

The rules above speak in three registers, and the registers are the grading scale. A **violation** breaks a stated invariant: an inner layer importing an outer one, a reach past a surface, a mutable published binding. An **inadvisable** deviation may stand and carries a per-instance justification: the lateral mounting under Composition roots, an effect-only import reaching past its unit, opaque namespace consumption. A **signal** is information addressed to review: an unconsumed export, a domain that has yet to split. Each register has a natural holder - the machine holds the first two, standing practice holds the third - and each holder has a cost shape, so the grades double as an investment ladder: what a team spends once, what it spends per deviation, and what it spends on a cadence.

A grade is claimed over an **enforcement scope**: the set of rules the project's gate holds, declared by the lint configuration itself. Every rule is individually adoptable, and a rule switched off is a **de-regulated seam** - the map's guarantees end there and the claim shrinks to match, so "aligned over the import seams" is a coherent, permanent position while the unqualified claim of any grade means the full ruleset. A waiver carries its grounding like any other exemption: "this rule is vacuous here" and "we accept this seam unregulated" are both honest declarations, the second the smaller claim. Scope stays a flat declaration - no ranking into essential and optional, since a named subset would become an identity claim, the carve-out this document refuses everywhere else. Every de-regulation is a declaration the diff can show: a rule switched off in the config, a merge into one name, an inline suppression carrying its justification at its site; the scope is part of the claim, so an invisible loosening falsifies the grade it leaves standing.

Within its scope, a project's **grade** is the highest register it has discharged, verified by a gate that runs and passes. The grades are residences, each a legitimate permanent position:

- **Aligned** - the violation register is empty. Reaching it costs the migration hump: every standing breach paid down once. Holding it is the cheapest discipline in this document, because the machine gates violations at authoring time and reviewer attention is freed for the other registers. Aligned is the floor at which the locality payoff becomes real: from here, blast radius equals diff is a checked property.
- **Justified** - the inadvisable register is discharged: every standing deviation carries its justification at the site, as an inline suppression stating the reason. The reasoning was already owed, since a graded deviation carries a per-instance justification by definition; this grade moves it from review memory into a searchable artifact, and a new deviation now announces itself in the diff. Justified is the standing home of bounded looseness: a deviation grounded at its site may stand indefinitely. Cost above aligned: minutes per deviation.
- **Governed** - the signal register is worked: the reachability pass runs, the cycle audit happens on its cadence, ontology reviews get made and their outcomes recorded. This register is the enforcement residue that stays with humans (see Three tiers), so governed carries the one permanent operating cost; it is held by the operator's practice, and the practices existing is what verifies the claim.

**Adopting** is the transit posture between scopes or grades: every in-scope rule reports, standing findings form the fix-list, and the gate for a change is no new findings in touched files against the accepted baseline - a ratchet toward the target grade. Warn-tier is transit by design: held indefinitely at full scope, it spends recurring review attention on findings a gate would hold for free (see Three tiers). The standing forms of looseness are the other two dials - a narrower scope, gated properly, or grounded deviations under justified. A project may still run everything advisory indefinitely; it holds no grade and claims no guarantee, and the tooling stays useful as a map.

The plugin ([support/js](./support/js)) ships a preset per machine-holdable state: adopting, aligned, justified, each at full scope. A preset is a ratchet - it holds a reached state against regression - and the grade itself is read off the tree under its gate, so a hand-tuned configuration declares its scope and maps to the highest grade whose in-scope gates it fully holds. The grades price the assurance stack; the ceremony of applying the architecture (the framing judgment, inside-out builds, ports, translation at foreign boundaries, surface curation) is the entry price at every grade, and coarseness is its dial: ceremony grows with the boundaries that have earned a split (see Rule shape). Choosing a lower grade is a legitimate, priced position under Brittleness as a property: each step up buys more of the locality payoff and more brittleness against lapses.

### Rule shape

The spec states **prohibitions**; the complement is permitted by construction. No rule takes the form of a positive structural mandate ("a domain must have four layers of substance", "split at cohesion X"): positive mandates are ungameable only by cargo-culting, and a tool never enforces an upper bound on coarseness. The dual holds for lists: every enumeration in this document is descriptive, and an allow-list reading (a pattern table read as "only these") forbids the complement by proxy, which is the same disease. Structure starts coarse, splits when boundaries become real, and the tool stays quiet about code that has simply not yet needed a split.

### Advised patterns

Historically good fits per layer, as illustrations of each layer's character - a pattern that clashes with its layer is a placement smell, an unlisted pattern that fits the responsibility fits, and no pattern is ever inserted for its own sake:

| Layer | Patterns that have fit |
|---|---|
| Services | Facade, Factory, Composite, Observer |
| Adapters | Adapter, Decorator, Proxy, Component |
| Use-Cases | Command, Mediator (coordination policy with one owner), Chain of Responsibility |
| Entities | Strategy, Composite, Specification, Value Object |

---

## Constraints

The binding ruleset, grouped by the seam each rule guards. IDs are stable; the lint plugin cites them.

### LAYER - within a domain

- **LAYER.1** Inner layers never import outer layers: the rank order is Entities → Use-Cases → Adapters → Services, and an import against it is a violation regardless of path form.
- **LAYER.2** Upward edges are dependency-inverted structurally: an inner layer declares its needs as parameters and the adjacent outer layer supplies them by ordinary composition. No DI container, no service locator (ROOT.4 carries the bounding argument).
- **LAYER.3** An inner layer needing an outer layer's module is misplaced logic: split it - the pure part (a function of plain values) moves inward, the binding part moves out to Adapters.
- **LAYER.4** Use-Cases and Entities traffic only in values: no async/await or promise chains, no try/catch, no throwing calls. Async and throwing shapes are wrapped at Adapters into channel-conforming values; the imperative shell is the only other legitimate host for them (ROOT.2).
- **LAYER.5** The Adapters layer is triggered by shape mismatch with the concepts (imperative interfaces, throwing APIs, async or promise control flow, mutable global state, request/response). Externality alone never triggers it: an external API that already conforms is consumed directly and orchestrated by use-cases.
- **LAYER.6** At a foreign boundary (a wire format, a platform SDK, a third-party API) the Adapter translates the foreign shape into the domain's own entity vocabulary; re-shaping that leaves the foreign model in charge of the domain's types is conformity, a violation. In-repo peer domains are exempt: referencing a peer's vocabulary through its surface is the designed path.
- **LAYER.7** A layer is a classification: within a domain's tree, grouping nodes express concerns (subdomains and units), layer membership rides the file names, and a container named for or dedicated to a layer is a horizontal bucket, a violation.

### CHANNEL - between domains

- **CHANNEL.1** Domains communicate exclusively through Streams and Generators attached at the use-case layer; the use-case ↔ use-case channel is the only cross-domain crossing, and effects never cross - only data does.
- **CHANNEL.2** Channels are direct typed references; string-keyed dispatch is not permitted.
- **CHANNEL.3** Storage shape (event-shaped or state-shaped) is orthogonal to channel direction; both fit both roles, chosen by consumer need; the concrete primitive is a runtime concern.
- **CHANNEL.4** A published value is immutable from the moment it is published: the producer never mutates it afterward (copy-on-publish where the source is mutable), and consumers hold snapshots they do not own.
- **CHANNEL.5** Every cross-domain reference cycle encloses a settling element (Gate 1); a channel participating in a cycle is change-gated with a tight equality, never value-retaining replay (Gate 2 conformance).
- **CHANNEL.6** A mutual dependency between domains never forms: the shared concern extracts downward (`A → S ← B`). The resulting order is sharedness read off the dependency graph, never an importance ranking.

### SURFACE - the domain boundary

- **SURFACE.1** A domain's API and Events interfaces are realized as one or more named public surfaces, split by consumer type whenever a single target would conflate channels or audiences.
- **SURFACE.2** The consumable surface carries use-cases and vocabulary and never exposes services or adapters; services are published only on the runtime-composition surface, reached by composition roots - and, under OWNER.5's graded exception, by a peer service mounting the block at that surface, never past it.
- **SURFACE.3** Consumers reference a surface by name and never reach past every surface into a layer's internals; a domain's surface never re-bundles a peer or foreign domain's surface, while curating its own nested domains' capabilities is its job (SURFACE.7).
- **SURFACE.4** The surface invariant is `consumers ⊆ surface`; a domain may expose more than its consumers currently require, and an unconsumed export is a review signal.
- **SURFACE.5** A unit is the files sharing one name, dedicated to one concern-part: intra-unit imports are unrestricted except by layer rank (LAYER.1); cross-unit rules act on the shared names (a legacy unit directory counts as one name), and decomposition is never mandated. A cross-name value reference - into a sibling unit, a nested domain, a peer - lands at the consumer's own rank; a landing below it is a diagonal reach no row of the diagrams draws, direct and republication-laundered alike. A layer file that republishes a name by named re-export adopts it at its own layer and owns it toward its consumers; a surface republishes without adopting, so a reference through a surface is judged at its landing. An effect-only import reaching past its unit is a smell; effect composition by import belongs to the root.
- **SURFACE.6** What a file is fixes its classification: a stylesheet is code and classifies by its layer and unit; a pure-data asset is vocabulary, classified as an Entity - importable from any layer, never a service, surface-gated across domains.
- **SURFACE.7** A domain may nest domains, and a nested domain is internal to its parent: outside the parent only the parent's published surfaces exist, and reaching a nested domain from outside its parent is a reach past the parent's surface. Siblings under one parent are peer domains under the full ruleset. A parent curating an owned child's capability onto its own surfaces is the surface's job.

### OWNER - ownership and vocabulary

- **OWNER.1** A consumer may reference a domain, never re-own it. A domain owns its setup, state, vocabulary, behavior, and cross-cutting placement; an invocation that commits a decision over any of these from outside is the violation. Re-use references the single owner and never re-instances ownership.
- **OWNER.2** Vocabulary (types, wire schemas, design tokens, shared-namespace identifiers, ambient declarations) is declared once at its owner's entity layer and consumed through the owner's surface; re-declaration, re-bundling, and shadow manifests are violations. Ambient declarations co-locate with their owning domain. A new shared-namespace identifier gets an owner before first use.
- **OWNER.3** Identity vocabulary: reference by type freely; deriving behavior keyed on an identity value is a smell - the owner publishes the capability its identities imply and consumers branch on that; re-declaring a literal with no type binding is forbidden.
- **OWNER.4** A cross-cutting concern that owns state, encodes policy, or authors markup consumers would re-author is absorbed into a composition block (a service) composed once by the root; it never escapes as a free-floating hook. A helper owning nothing, returning a pure value over ambient mechanism or published state, stays directly consumable.
- **OWNER.5** Lateral composition between outer-layer units of peers is graded (a domain composing its own nested domains is self-composition, ROOT.7): a named slot port the root fills is the designed form; a service unit mounting a sibling block - another service unit of its domain, or a peer domain's block at its runtime-composition surface, never past it - is inadvisable and carries a per-instance justification; re-authoring a sibling concern from its use-cases re-owns it and is the violation (OWNER.4). Between Adapters of different units the same grading holds, without the surface case since adapters are published on no surface: the layer above composes the two bindings, or they co-locate into one unit.
- **OWNER.6** A foreign owner's contract is referenced by name at the layer its kind permits: a type at any layer; a presentation token at Adapters and above, never in an Entity; a foreign implementation detail nowhere.

### ROOT - composition roots

- **ROOT.1** A root's cross-domain license is breadth with depth held at each surface: it consumes consumable surfaces and the runtime-composition surface, and never a layer's internals.
- **ROOT.2** The imperative shell may sequence (instantiate, supply ports, subscribe, order host primitives, awaiting and catching where boot genuinely needs it); it may never chew: no domain decision, no owned-vocabulary literal.
- **ROOT.3** The root owns the blast radius: it partitions composition into scopes, an outbound failure terminates the scope that composed the failing piece, and the root decides restart, degrade, or propagate. A domain never supervises another domain.
- **ROOT.4** No DI container or service locator: the wiring graph is surface-bounded (ROOT.1), published state leaves no lifetimes to manage (CHANNEL.4), and parameter inversion keeps construction type-checked ordinary code; a container is a second wiring graph with no remaining job.
- **ROOT.5** Roots communicate inter-root only through the transport plane at the Services layer, by serialization; the use-case channel never spans two roots.
- **ROOT.6** Pure core is dependency-free; any code with an import belongs in a domain above it, and arrows point from domains into core, never back.
- **ROOT.7** Composition recurses: each domain is the composition root of its own nested domains, reaching their runtime-composition surfaces and composing their blocks, and every composer reaches its direct children only. Nested domains are unaware of their parent as domains are unaware of the root: a subdomain never references its parent, and content shared between siblings extracts into a sibling subdomain.

### META - rule shape and enforcement

- **META.1** The spec states prohibitions; the complement is permitted by construction. No rule is a positive structural mandate, and no tool enforces an upper bound on coarseness.
- **META.2** Every enumeration is descriptive and non-binding; an allow-list reading forbids the complement by proxy and is itself an error.
- **META.3** Enforcement runs in three tiers: machine-checked invariants as lint/CI gates, review judgments surfaced by tools where possible and decided by humans, and scheduled maintenance for the obligations the architecture does not self-trigger. Choosing ELDA's brittleness without standing Tier 1 is irrational: the locality payoff is bought by enforcement, never by intention.
- **META.4** Blast radius equals diff: a change whose effects reach past the domains its diff touches is a boundary leak to find before merging.
- **META.5** An indirection earns its keep as a structural change: the added hop must become the home of a decision - an invariant, a shape translation, a composition authority. An indirection after which every decision lives where it already lived is ceremony. The rule governs hops at architectural boundaries; intra-unit extraction (SURFACE.5) is style, outside its reach.
- **META.6** The rules speak in three registers - violations, inadvisable deviations carrying per-instance justification, and review signals. A grade is claimed over an enforcement scope: the rule set the gate holds, declared by the configuration, where a waived rule is a de-regulated seam that shrinks the claim and carries its grounding; the unqualified claim of any grade means the full ruleset, and scope is a flat declaration with no ranked or named subsets. Within its scope, a project's grade is the highest register discharged under verification that runs and passes, and each grade is a stationary position: **aligned** empties the violation register (the rational floor of META.3); **justified** additionally discharges the inadvisable register as inline artifacts at each site; **governed** additionally works the signal register on its cadence, held by the operator practices of META.3's second and third tiers. **Adopting** names the transit posture: every in-scope rule reports, standing findings form the fix-list, and a change lands with no new findings in touched files; an indefinite all-advisory configuration holds no grade and makes no claim. A grade is a property of the working tree under its standing gate; a preset supplies the gate.

---

## Appendix: realization in a TypeScript runtime

Non-normative. The concrete primitive is a runtime concern (see Channels) and no list here is an allowed-set (see Rule shape); these are choices that have held up in one TypeScript, fine-grained-reactivity stack, with the reasoning attached so a different stack can re-derive them.

- **Stream, state-shaped**: a fine-grained reactive signal, or an RxJS `BehaviorSubject` piped through `distinctUntilChanged`. A signal is equality-gated on write, so it satisfies the cycle-safety change-gating by default; a bare `BehaviorSubject` replays ungated and conforms only with the distinct gate attached.
- **Stream, event-shaped**: an RxJS `Subject`, a plain callback registry, host event targets (wrapped only on shape mismatch). Late subscribers miss what came before, by design.
- **Generator**: a plain function or accessor on the surface. A language `function*` only where consumers genuinely pull a sequence step by step; a Subject-backed intent channel only where real producer-side aggregation exists (multiple consumers, debouncing, conditional flows). "On event, call the producer's published use-case" needs no reactive plumbing.
- **Async operation**: wrapped at Adapters into a single-emission channel, state-shaped if late subscribers must see the settled value. Never a raw Promise past the Adapter.

Two footguns, both from cycle safety: a value-retaining replay channel (a bare `BehaviorSubject`, Effect's `SubscriptionRef`) inside a reference cycle re-fires its retained value forever, so add the equality gate before a channel enters any loop; a loose equality on a change gate can itself sustain a low-amplitude oscillation, so keep it tight.

Values and outcomes: published values as `Readonly` shapes so the type system carries the immutability constraint, copy-on-publish where the working state is mutable, and a dev-mode `Object.freeze` on published objects to catch violators empirically. Outcomes are discriminated unions handled by exhaustive `switch` with `never` checks; a biased `Result` library adds the negative-branch semantic the outcome model rejects, and a plain tagged union is the whole mechanism.

The transport codec, where foreign wire shape becomes owned vocabulary: default to a small functional mapper core - two symmetric, type-checked map functions per wire type. Adopt a schema-first codec only when validation is both gating and comprehensive for that boundary and a schema-first workflow is accepted for it; half-adopting a schema library as a type generator forfeits the reason to have it. Whatever the codec, its types stop at the Adapter.

Wiring: routes and handlers instantiate services and pass parameters, and the whole wiring of a mid-sized app is a handful of root files that read top to bottom. A test harness is one more composition root: parameter inversion already hands every inner layer its seam as plain arguments, and the one thing a scheduling substrate genuinely adds at a test root is deterministic clock control. Effect-system libraries sit under the substrate bar stated in Positioning; one vocabulary caution when reading their docs: an Effect `Stream` is pull-driven, which is an ELDA Generator, while ELDA's Stream (push) corresponds to their PubSub and subscription shapes.

Subdomains and files on disk: a domain is a directory, and layer membership rides file names - the bare reserved names (`entities.ts`, `use-cases.ts`, `adapters.tsx`, `services.tsx`) or a `<name>.<layer>` suffix (`cart-view.adapters.tsx`, `back-nav.adapters.css`), with the runtime-context markers `.server` / `.client` and the vanilla-extract `.css.ts` compound seen through; `index` is the consumable surface, the `services` file doubles as the runtime-composition surface, and any other root file of a domain is a named surface. A unit is the files sharing one name; a plain-named directory under a domain is a nested subdomain. The plugin recognizes both legacy layouts - layer directories and layer-suffixed unit directories - so a migrating codebase lints correctly, and flags them under `no-layer-branches`.

Enforcement: the lint plugin ([support/js](./support/js)) carries the machine tier; the unconsumed-export review signal rides a reachability tool (knip, entries at the composition roots) as a separate advisory pass; the whole-graph cycle audit stays a scheduled item until a graph pass exists ([support/TODO.md](./support/TODO.md)).
