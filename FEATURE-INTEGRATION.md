# ELDA Feature Integration

Companion to [README.md](./README.md). The README defines the architecture: what the layers are, what the constraints are, why the trade-offs are what they are. This defines the procedure: how to add a feature to an ELDA codebase without breaking those constraints. Read the README first; this document assumes its vocabulary (Services / Adapters / Use-Cases / Entities, Streams / Generators, public surface, composition root, orphan intersections, the numbered constraints).

The procedure exists because ELDA is brittle by design (README, "Brittleness as a property"): the locality guarantee holds completely while every boundary is respected and degrades sharply the moment one isn't. A repeatable integration order is how a boundary stays respected without depending on anyone holding the whole architecture in their head at once.

## The short version

> Build inward, decide cross-cutting before you code, expose only the barrel, wire only at the root, and let the gate, rather than the reviewer, prove the boundaries held.

## When this applies

Any of: a new product feature, a new cross-cutting concern, a new domain or orphan, or a change that adds a cross-domain reaction. Pure bug fixes inside one layer of one domain do not need the framing phase; they still pass through the gate (Phase D).

---

## Phase A - Frame (before any code)

The whole phase is judgment, and it is the judgment ELDA cannot mechanize. Spend real attention here; the later phases are mostly mechanical once this is right.

### A1. State the feature in one sentence

"When `<trigger>`, the user can `<action>`, producing `<result>`." Extract:
- **nouns** -> candidate Entities (rules, types, value objects) and state,
- **verbs** -> candidate Use-Cases (processes, reactions, pipelines),
- **side effects** (network, storage, platform, DOM) -> candidate Adapters / Services.

This is the only essence-judgment the architecture asks of you. Make it explicit on the page rather than implicit in which folder you happened to open.

### A2. Place it by intended imports

Do not ask "what is this, really." Ask "what will it need to import." Position on the Venn diagram is determined by dependencies (README, "Domain ontology").

| What it will import | Where it goes |
|---|---|
| Only `core` + terminal subdomains (transport / storage) | A standalone **feature domain** |
| Another feature's **data** | A **consumer**: subscribe to that feature's Stream. Do not import the feature. |
| Sits between two features, consumed by both, consumes neither | An **orphan** `a+b`, carrying only the layers it currently needs |
| You can already say what it **is**, and it wants three or more substantial layers | A **domain** (skip the orphan stage and name it). |

A three-way intersection (`a+b+c`) almost always means a hidden domain that has not been named yet (README, "Orphan intersections"). If you reach for one, that is the signal to name the domain instead.

### A3. Decide the cross-cutting question now

This is the most expensive decision to defer, so make it before writing code. Will any part of this be consumed by *other* domains (navigation, theme, a toast, a loading shell, a list-with-policy)? Apply the **mechanism-vs-policy test**:

- **Mechanism** - reads only ambient framework primitives or another domain's already-published reactive state, and returns a pure value; idempotent on import; owns no state. -> Consumed **directly** as a use-case-shaped API (README constraint 17). No block, no wrapper.
- **Policy** - owns state, encodes a decision, or authors markup/DOM that more than one consumer would otherwise repeat. -> Must be a **composition block** exposed by its owning domain's Services layer (README constraint 18). Consumers contribute data and behavior contracts; the composition root renders the block with the concern already applied.

If the verdict is "block," that block is part of this feature's scope from the start. Retrofitting a block after consumers have already grown their own copies of the policy is the expensive path, and it is the path that tends to never happen.

---

## Phase B - Build inside-out

Build Entities -> Use-Cases -> Adapters -> Services, in that order, so that at every step the thing you are writing only depends on things that already exist beneath it. Dependencies point inward by construction; you never have to retrofit the direction.

### B1. Entities first

Pure rules, types, and value objects expressed as functions of plain values. Imports limited to `core`. No framework, no platform, no I/O. **Unit-test them here** - entities are where ELDA's testability dividend is actually collected, and the easiest place to leave it uncollected.

### B2. Use-Cases

Compose entities into processes and reactions. Receive every outer dependency - the router, platform values, a `navigate` callback, the current path - as a **parameter** the composition root will supply later (README constraint 11; no DI container). Framework reactive primitives used purely as local state are fine (a signal inside a use-case is local state).

If a use-case finds itself wanting to import an *outer* module (a service, an adapter), stop. That is the relocation rule (README constraint 12): the logic is misplaced. Split it - the pure part moves inward to where its real dependencies are, the binding part moves out to an Adapter.

### B3. Adapters - only for shape mismatch

An Adapter exists to convert a shape the environment hands you into the shape the domain expects (README constraint 17). The triggers are specific: a throwing API, an async-callback or Promise interface, an imperative or mutable-global interface, request/response over the network. Wrap those into domain-shaped values: a Generator yielding typed branch values (README, "Concurrency model" and "Outcome model"), never a raw Promise and never a `try`/`catch` crossing into a use-case.

If the external API is already domain-shaped (a reactive accessor, a pure hook, idempotent on import), there is **no** adapter in the chain. Consume it directly as a use-case and orchestrate it as use-cases composing use-cases. Shape mismatch is what triggers the Adapter layer; externality without it does not.

### B4. Services

The domain's outward surface: the facade over an external system (platform SDK, API client, storage driver) and the domain's own styled / composable blocks. A Service exposes **ports** - named slots, callback parameters, configured policies - and is composed by the runtime (README constraint 14). It never mounts a sibling service; if it needs another service's content inside itself, it accepts a slot port and lets the composition root pass that content in. Intrinsic appearance lives here (a block's own `bg`/`border`); contextual placement (`shrink-0`, a grid column) is passed in by the caller's adapter.

---

## Phase C - Expose and wire

### C1. Define the public surface

The domain's barrel re-exports exactly what crosses its boundary and nothing else: Streams (the Events surface), use-case functions (the API surface), and the types that travel with them. Internal files - the layer structure, concrete components, helpers - stay private (README constraints 3, 15).

If the domain has both cross-domain consumers and runtime-composition pieces, split the surfaces: a cross-domain barrel (`#/<domain>`) and a runtime-composition barrel (`#/<domain>/services`). Features see only the first; the route tree reaches into both. Prefer explicit named re-exports over `export *` until a no-orphan-export lint can hold the file-level export discipline for you.

### C2. Wire at the composition root - and only there

The route file, request handler, or CLI command instantiates services, fills their ports, subscribes streams, and decides which combination this run uses (README, "Composition root"). No service composes another service; if one needs another's content, it takes a slot and the root fills it.

**The runtime integration surface is part of the composition root, and it is fenced.** The root has two jobs and one prohibition:

- *Allowed - wiring*: instantiate domain services, supply their ports, subscribe and route their streams.
- *Allowed - glue*: name the runtime's own primitives and order them into a context-fit sequence - the framework's mount lifecycle, the platform SDK's boot and lifecycle calls, service-worker registration, the async/await and try/catch that boot sequencing genuinely needs. This is the imperative shell. It reconciles high-level domain concerns into actionable, context-specific code using the context's primitives, and the domains do not concern themselves with it.
- *Prohibited - chewing owned semantics*: the root may **name** the runtime's primitives and the domains' surfaces and **order** them; it may not **make a decision a domain should own**, and it may not **re-spell a vocabulary literal an owner already holds**. `await initMiniApp(); initTheme(app)` is naming-and-ordering (glue, allowed). `if (app.env === 'max') document.body.setAttribute('data-platform', 'max')` is both a host-identity decision and an owned-vocabulary literal (see C3): the `data-platform` attribute is owned by `packages/ui`, consumed by its CSS, and re-spelling it in the runtime severs the binding. When a line decides something, or names a shared-namespace string, rather than sequencing an owned surface, relocate it to the owner, which exposes a surface the shell calls instead.

The fence matters because the root is the one zone exempt from the layer rules, and an unfenced exempt zone acquires catch-all gravity - the same pull that turns an Adapters layer or a `shared/` column into a dumping ground.

### C3. Bind owned vocabulary through its owner, never by literal

The integration surface, and any adapter or service that writes to a shared runtime namespace, touches **vocabulary**: a string-keyed identifier whose meaning lives elsewhere. DOM attributes and their CSS selectors, CSS custom properties, storage keys, URL parameters, postMessage types, runtime globals - all are string conventions in a namespace shared across packages and across the JS / CSS / DOM representation boundary, with no import edge linking writer to reader. This is the one channel where the typed source-dependency the architecture relies on cannot exist, because the host platform offers no slot to carry the semantic alongside the primitive. The identifier is still owned by exactly one domain (README constraint 16, and "Vocabulary, concretely"). Two cases, and the second is the one no machine and no absent reviewer will catch:

- **Referencing existing vocabulary.** Find the owner and reference its declaration: a typed constant it exports, a binding surface it exposes (`bindHostIdentity(env)` rather than `setAttribute('data-platform', env)`), or its code-generation output. Never re-spell the literal. A re-spelled literal is a re-declaration by a non-owner; it is invisible to every search that follows imports and reads as dead code to anyone without the cross-package context, so the leak is both silent and dangerous to remove. (This is the `data-platform="max"` leak: a `packages/ui`-owned attribute re-spelled in the runtime.)
- **Introducing new vocabulary.** You are about to write a shared-namespace string that no domain owns yet. Stop - this is the self-applied checkpoint, because the type system cannot see a string it was never told about and there may be no peer reviewer behind you. Make it a deliberate, owned act: pick or create the owning domain, declare the identifier there, expose a binding surface and (for static-before-runtime representations like CSS selectors) generate both ends from the one declaration so the seam is consistent by construction, then consume the surface from the integration code.

The discriminator: the integration surface sequences owners' exposed surfaces and raw runtime primitives, and holds no owned-vocabulary literal. A literal naming a shared namespace is the signal that an owner is missing or being bypassed. Enforcement splits the way the cases do - a lint can forbid owned-vocabulary literals outside their owner (re-declaration, machine-checkable against the registry of owned identifiers), and can flag any shared-namespace write for owner-justification (introduction, a review-and-registry control, not a proof). The registry of owned vocabulary is what lets the next leak be recognized at all.

### C4. Cross-domain reaction (if the feature reacts to another domain)

Use the Pipe-Event-Stream pattern (README, "Inter-domain communication"), never a direct cross-domain call:

1. Producer's use-case updates a typed **Stream** (constraint 6: a direct typed reference, not a string-keyed channel).
2. The stream notifies the consumer's use-case.
3. The consumer calls back through the producer's **public-surface** use-case (not a deep import into the producer's internals).

Confirm the subscription points strictly downward across tiers (Feature -> Orphan -> Terminal -> Core) and introduces no back-edge among peers (constraint 8). Until the event-exchange causal-set enforcement exists (README, "Cycle enforcement"), this acyclicity is checked by hand, and "domains may react freely" is licensed only within the subset you have actually proven acyclic.

---

## Phase D - The gate (do not skip)

This is the step that converts ELDA's "scout signals" into enforcement. It is where the brittleness is held.

### D1. Run the boundary checks

Import boundaries (inner layers import no outer layer; features import only barrels; only composition roots reach a domain's `services/`) and no async/await or try/catch inside `entities/` or `use-cases/`: green, or fix. A reviewer should never be the first line of defense for a rule a machine can check. Separately, the surface-reachability pass lists exports with no consumer outside their file - review each as dead surface to trim or a capability exposed ahead of demand to keep. The invariant is only `consumers ⊆ surface` (nothing is reached past the surface), not `surface ⊆ consumers`; an unconsumed export is a candidate for review, not a failure.

### D2. Verify blast radius equals diff

This is the operational definition of whether the architecture is still holding. Did any file *outside* the touched domain change? If yes, and you did not intend a contract change, a boundary leaked - find it before merging. A change whose diff reaches past the domain it claims to touch is the brittleness activating.

### D3. Update the surfaces and the ontology log

Refresh the public-surface doc if the boundary changed. Then ask the maintenance questions the architecture depends on but does not trigger on its own: did this feature trip a promotion signal (you can now say what an orphan *is*; an orphan started consuming outside its intersection; a domain accumulated all four layers)? Did it create a new orphan or a new cross-domain edge? Record it for the next scheduled boundary review, so the labels stop lagging the code.

### Pre-merge checklist

- [ ] Feature stated in one sentence; nouns/verbs/effects mapped to layers (A1).
- [ ] Placement decided by imports; orphan-vs-domain call made (A2).
- [ ] Cross-cutting parts decided as mechanism (direct) or policy (block) (A3).
- [ ] Built inside-out; entities unit-tested (B).
- [ ] Adapters present only at real shape mismatches; no raw Promise or cross-boundary try/catch into a use-case (B3).
- [ ] Public surface re-exports only the boundary; internals private (C1).
- [ ] Wired only at the composition root; no service-to-service composition; the runtime glue holds no domain decision and no owned-vocabulary literal (C2).
- [ ] Shared-namespace identifiers (DOM attributes, CSS vars, storage / URL / postMessage keys) reference their owner's declaration; any new one was given an owner before first use (C3).
- [ ] Cross-domain reactions go Stream -> consumer use-case -> producer public surface; subscription is acyclic and downward (C4).
- [ ] Boundary checks green; blast radius equals diff; ontology log updated (D).

---

## Decision aids (consolidated)

**Which layer does this code go in?** What does it depend on? Plain values only -> Entity. Composes entities and receives outer deps as params -> Use-Case. Wraps a shape-mismatched external -> Adapter. Outward facade or styled/composable block exposing ports -> Service.

**Domain, orphan, or consumer?** Needs only core/terminal -> domain. Needs another feature's data -> consumer (subscribe). Between two features, consumed by both -> orphan. Can name what it is and it has substance in three or more layers -> name it a domain.

**Hook or composition block?** Pure value over ambient mechanism or published state, no state of its own -> direct hook (constraint 17). Owns state, encodes policy, or authors shared markup -> composition block (constraint 18).

**Glue or domain logic (at the runtime root)?** Names and orders the runtime's primitives and the domains' surfaces -> glue, allowed in the imperative shell. Makes a decision a domain should own, or re-spells an owned-vocabulary literal -> not glue, relocate it to the owner.

**Is this string owned vocabulary?** Does it name a shared runtime namespace (DOM attribute, CSS custom property, storage key, URL param, postMessage type, global)? Then it is vocabulary owned by one domain. Reference the owner's declaration; if no owner exists, create one before writing the literal. The integration surface holds no owned-vocabulary literal.

---

## Worked example

Feature: a text filter over the current branch's list.

- **A1.** "When the user types in the search box, the list shows only items whose label matches, producing a filtered list." Nouns: a match rule, a query string (state). Verb: filter. Effect: none (no network, no platform).
- **A2.** It filters a list the feature already owns and needs no other feature's data, so it starts inside the feature domain. No orphan, no new domain.
- **A3.** Two parts, two verdicts. The *match predicate* is pure - mechanism, consumed directly. The *search box itself* (input, debounce, clear affordance, match highlighting) is policy the moment a second list wants the same behavior, so it becomes a composition block. If only one list will ever use it, keep it a local component and revisit on the second consumer.
- **B1.** Entity: `matches(query, label): boolean` - pure, unit-tested.
- **B2.** Use-case: `filteredItems(items$, query$)` - composes `matches` over the reactive list and query; receives both as accessors.
- **B3.** No adapter - nothing async, throwing, or imperative is crossing a boundary.
- **B4.** Service (only if A3 said "block"): a `SearchBox` block exposing a `query` port and an `onClear` callback, owning the debounce policy internally.
- **C1.** Barrel exports `filteredItems` (use-case) and, if built, `SearchBox` (block). `matches` stays internal.
- **C2.** The route composes `<SearchBox>`, passes the list, and renders `filteredItems(...)`. The query state is wired here, at the route.
- **C3.** None - the feature reacts to nothing cross-domain.
- **D.** Boundary checks green; the diff touches only the feature domain and the route that composes it; ontology log unchanged (no new edge, no promotion).
