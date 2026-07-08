# ELDA Feature Integration

Companion to [README.md](./README.md). The README defines the architecture: the layers, the channels, the constraints, and why the trade-offs are what they are. This document defines the procedure: how to add a feature to an ELDA codebase without breaking those constraints. It references the spec's named principles (re-ownership, the relocation rule, the indirection rule, the two cycle gates), so targeted edits to the spec's individual clauses leave the procedure intact.

The procedure exists because ELDA is brittle by design: the locality guarantee holds while every boundary is respected and degrades sharply the moment one is not. A repeatable integration order is how boundaries stay respected without anyone holding the whole spec in their head at once.

## The short version

> Build inward, decide cross-cutting before you code, expose only surfaces, wire at the root, and let the gate prove the boundaries held.

## When this applies

Any of: a new product feature, a new cross-cutting concern, a new domain, or a change that adds a cross-domain reaction. A pure bug fix inside one layer of one domain skips the framing phase; it still passes through the gate (Phase D).

---

## Phase A - Frame (before any code)

This phase is the judgment the architecture cannot mechanize; the later phases are mostly mechanical once it is right.

### A1. State the feature in one sentence

"When `<trigger>`, the user can `<action>`, producing `<result>`." Extract:

- **nouns** - candidate Entities (rules, shapes, value objects) and state,
- **verbs** - candidate Use-Cases (processes, reactions, pipelines),
- **effects** (network, storage, platform, DOM) - candidate Adapters and Services.

This is the only essence-judgment the procedure asks for. Make it explicit on the page rather than implicit in which folder you happened to open.

### A2. Place it by intended imports

Do not ask "what is this, really." Ask "what will it need to import." Position on the Venn diagram is determined by dependencies.

| What it will import | Where it goes |
|---|---|
| Only core and already-shared domains | A standalone **feature domain** |
| Another feature's data | A **consumer**: subscribe to that feature's channel through its surface. Do not import the feature's internals. |
| Consumed by two features, consuming neither | A **shared domain** extracted below both (the lens between their circles) |
| Consumes two features' surfaces and owns a policy over them (arbitration, priority, debounce) | A **coordinator domain** above both |
| Consumes two features' surfaces and holds no policy | Root wiring, never a new domain |

### A3. Decide the cross-cutting question now

Will any part of this be consumed by *other* domains (navigation, theme, a toast, a loading shell)? Re-ownership decides, and its test is re-instancing:

- A helper that **owns nothing** - it returns a pure value over ambient mechanism or another domain's already-published state - is consumed **directly** as a use-case. No block, no wrapper.
- A concern that **owns state, encodes a policy, or authors markup** more than one consumer would otherwise re-author becomes a **composition block**: a service its owning domain exposes, composed once by the root, with consumer content composed in. Consumers contribute data and behavior contracts.

Re-use references the single owner; it never re-instances ownership. If the verdict is "block," the block is part of this feature's scope from the start - retrofitting one after consumers have grown their own copies of the policy is the expensive path, and in practice tends never to get done.

### A4. Give new vocabulary an owner

List every identifier the feature introduces that lives in a shared runtime namespace: DOM attributes and their selectors, CSS custom properties, storage keys, URL parameters, message types, runtime globals. Each one is vocabulary and gets an owner **before any site writes it**: pick or create the owning domain, declare the identifier there, expose a binding surface (or generate both representations from the one declaration), and consume that. A re-spelled literal is invisible to import-following search and dangerous to remove; this checkpoint is self-applied because no type system sees a string it was never told about.

---

## Phase B - Build inside-out

Build Entities, then Use-Cases, then Adapters, then Services, so that at every step the thing you are writing depends only on things that already exist beneath it. Dependencies point inward by construction; the direction never needs retrofitting.

### B1. Entities

Pure rules, shapes, and value objects expressed as functions of plain values. Imports limited to core. No framework, no platform, no I/O. **Unit-test them here** - this layer is where the testability dividend is collected, and the easiest place to leave it uncollected. If a validation library's schema factory bundles the shape with a throwing validator, the shape is the entity and the factory invocation belongs outward at the boundary; the library will not build that wall for you.

### B2. Use-Cases

Compose entities into processes and reactions. Receive every outer dependency - platform values, a navigation callback, the current route - as a **parameter** the layer above will supply; the port is the parameter list. Local reactive state created here is this layer's own affair, and its writes need no ceremony: the architecture contains what is *observable* of state, and what crosses a boundary is published as immutable snapshots.

If a use-case wants to import an *outer* module (a service, an adapter), stop: that is the relocation rule. The logic is misplaced - the pure part moves inward to where its dependencies are, the binding part moves out to an Adapter.

### B3. Adapters - only at shape mismatch

An Adapter exists to make a mismatched shape conform to the concepts: a throwing API, a promise or async-callback interface, an imperative or mutable-global interface, request/response over the network. Wrap those into domain-shaped values - async into a single-emission channel, throws into typed branch values - choosing the channel's storage shape (does a late subscriber see the settled value?) by what consumers need.

Two bounds. An external API that is already domain-shaped (a reactive accessor, a pure hook, idempotent on import) gets **no** adapter - wrapping it is a hop that homes no decision, and the indirection rule refuses it. And at a genuinely foreign boundary (a wire format, a platform SDK, a third-party API) the adapter's obligation is **translation into the domain's own entity vocabulary**: a wrapper that merely re-shapes has left the foreign model in charge of the domain's types.

### B4. Services

The domain's outward blocks: facades over external systems and the domain's own composable blocks, exposing **ports** (named slots, callbacks, configured policies) for the root to fill. When a service needs a sibling block inside itself, the graded order applies: a slot port the root fills is the designed form; mounting the sibling block directly - a sibling unit's, or a peer domain's block at its runtime-composition surface, never past it - is inadvisable and needs a justification. The justification test is the indirection rule: name the decision the root would make at the port hop; if there is none, the port is ceremony and the mounting is honest. Never re-author the sibling concern from its use-cases - that re-owns it, and is the actual violation.

---

## Phase C - Expose and wire

### C1. Define the surfaces

The consumable surface re-exports exactly what crosses the boundary: use-case functions, channels, and the vocabulary that travels with them. Services and adapters stay off it; services go on the runtime-composition surface the root reaches. Split a surface whenever one target would conflate two consumer types (a client-facing and a server-facing entry, so server-only vocabulary never rides into a client bundle). Prefer explicit named re-exports, so the surface stays a deliberate contract.

### C2. Wire at the root - and only there

The route file, request handler, or CLI command instantiates services, fills their ports, subscribes channels, and decides which combination this run uses. The root's license is breadth across domains with depth held at each surface.

The root's imperative shell **sequences**: it names and orders owned surfaces and the host's own primitives (mount lifecycles, SDK boot, the awaiting and catching that boot genuinely needs). It never **chews**: no decision a domain should own, no owned-vocabulary literal. When a line decides something or spells a shared-namespace string, relocate it to the owner and call the surface the owner exposes.

### C3. Cross-domain reaction (if the feature reacts to another domain)

The producer updates its channel; the consumer subscribes through the producer's surface; when the consumer must trigger the producer back, it calls the producer's published use-case. Direct typed references everywhere - no string-keyed dispatch.

If the reaction closes a loop, the two cycle gates apply: the loop must contain a **change-gated** channel (equality-gated delivery, tight equality, never value-retaining replay), and a loop that stays hot after inputs settle is a logic bug the architecture makes observable. Check the gate exists before wiring the loop.

### C4. Failure paths

Outcomes the feature can give meaning to are typed branches on its channels - no separate error path, no branch privileged as "the error". An outcome the domain cannot handle converts back to the host's own terms at the shell, inside whatever scope the root established; the feature's domains never model it.

---

## Phase D - The gate (do not skip)

This is the step that converts the constraints into enforcement; it is where the brittleness is held.

### D1. Run the machine checks

The lint plugin ([support/js](./support/js)) must be quiet on the new code: layer boundaries, surface reaches, inner-layer async and try/catch, mutable surface bindings, ambient-declaration placement, vocabulary literals at the root. The machine is the first line of defense for every rule it can check; reviewer attention starts where the machine stops. How hard the gate bites is the project's alignment grade (the spec's Grades of alignment): adopting reports and compares against the accepted baseline, aligned errors on violations, justified errors on ungrounded deviations as well - and the per-change reading, no new findings in touched files, holds at every grade. Separately, the reachability pass lists exports with no consumer: each is dead surface to trim, or capability deliberately ahead of demand to keep - review items.

### D2. Verify blast radius equals diff

The operational definition of whether the architecture is holding. Did any file *outside* the touched domains change without an intended contract change? Then a boundary leaked - find it before merging.

### D3. Record the maintenance hooks

New domains and new cross-domain edges go to the scheduled ontology review; new shared-namespace identifiers to the vocabulary registry; any new cross-domain loop to the cycle-audit list. These are the obligations the architecture does not trigger on its own.

---

## Decision aids (consolidated)

**Which layer?** What does it depend on? Plain values only - Entity. Entities plus supplied ports - Use-Case. Wraps a genuinely mismatched external shape - Adapter. Outward block or facade exposing ports - Service.

**Hook or block?** Owns nothing and returns a pure value over published state - hook, consumed directly. Owns state, encodes policy, or authors shared markup - block, composed once by the root.

**Wrapper or not?** The indirection rule: the hop must become the home of a decision (an invariant, a shape translation, a composition authority). A raw setter whose full typed input space is legal *is* the published operation; a narrower operation exists only as an invariant's home. A wrapper holding no rule is ceremony.

**Port or mount?** Name the decision the root makes at the port hop. A real decision (which variant, which combination) - port. No decision - the port is ceremony; mount the block at its composition surface and record the justification.

**Glue or domain logic, at the root?** Names and orders owned surfaces and host primitives - glue, allowed in the shell. Decides an owner's semantics or re-spells an owned literal - relocate to the owner.

**Where does this effect go?** An effect is a write; it is legal where its target is owned. Own local state - the owning layer, freely. The outside world - the outer layers, where its shape is bound. Another domain's anything - never; call the owner's published operation.

---

## Pre-merge checklist

- [ ] Feature stated in one sentence; nouns, verbs, and effects mapped to layers (A1).
- [ ] Placement decided by imports; lens, coordinator, or consumer call made (A2).
- [ ] Cross-cutting parts decided: hook or block (A3).
- [ ] Every new shared-namespace identifier given an owner before first use (A4).
- [ ] Built inside-out; entities unit-tested (B).
- [ ] Adapters only at real shape mismatches; foreign shapes translated into owned vocabulary (B3).
- [ ] Sibling composition by slot port, or a mounting justified by the indirection rule (B4).
- [ ] Surfaces curated and named; services on the composition surface only (C1).
- [ ] Wired at the root; the shell sequences and never chews (C2).
- [ ] Reactions by typed reference through surfaces; any loop change-gated (C3).
- [ ] Machine checks quiet; blast radius equals diff; maintenance hooks recorded (D).

---

## Worked example

Feature: a text filter over the current list.

- **A1.** "When the user types in the search box, the list shows only items whose label matches, producing a filtered list." Nouns: a match rule, a query string (state). Verb: filter. Effects: none.
- **A2.** It filters a list the feature already owns and needs no other feature's data - it stays inside the feature domain.
- **A3.** Two parts, two verdicts. The *match predicate* owns nothing - a hook, consumed directly. The *search box* (input, debounce, clear affordance, highlighting) becomes policy the moment a second list wants the same behavior - a block. With one consumer it stays a local component, revisited on the second.
- **A4.** No new shared-namespace identifiers; the query never leaves the domain.
- **B1.** Entity: `matches(query, label)` - pure, unit-tested.
- **B2.** Use-case: `filteredItems(items, query)` - composes `matches` over reactive accessors received as parameters. The query signal lives here; its setter is the domain writing its own state.
- **B3.** No adapter - nothing throwing, async, or imperative crosses a boundary.
- **B4.** Service only if A3 said "block": a `SearchBox` exposing a query port and a clear callback, owning the debounce policy internally.
- **C1.** The consumable surface exports `filteredItems`; the block, if built, goes on the composition surface. `matches` stays internal.
- **C2.** The route composes the block, passes the list, renders the filtered accessor; the wiring reads top to bottom.
- **C3.** No cross-domain reaction, no loop to gate.
- **D.** Lint quiet; the diff touches one domain and the route that composes it; nothing new for the maintenance hooks.
