# ELDA
Event-Layer-Domain Architecture

![General scheme](./ELDA-General.svg)

![Layer map](./ELDA-Layers.svg)

---

## Core idea

ELDA combines **layered Clean Architecture** with **Event-Driven Design** using **Domain-Driven Design** as the organizational boundary.

Each product concern lives in its own **Domain**. Domains communicate exclusively through **event streams**. Within a domain, code is strictly stratified into four layers with one-way dependency rules.

---

## Domain structure

Every domain contains exactly four layers, stacked top-to-bottom:

| Layer | Color | Responsibility | Concrete examples |
|---|---|---|---|
| **Services** | blue | External interface to the domain: what the outside world can call | UI system, API client, storage driver, platform SDK |
| **Adapters** | green | Bindings between layers or between the domain and its environment | UI bindings, request interceptors, interface adapters, presenters |
| **Use-Cases** | red | Business/application logic: processes, watchers, pipelines | Feature workflows, data transformations, event handlers |
| **Entities** | yellow | Pure, framework-free domain invariants | UX rules, data constraints, network policy |

### Layer dependency rules

- **Information flows downward**: Services → Adapters → Use-Cases → Entities
- **Awareness flows upward**: Entities define interfaces for Services to implement; Entities do not import Services
- **Activity progresses top-to-bottom** through all layers for any given request
- Inner layers (Entities, Use-Cases) **must not import** outer layers (Adapters, Services)
- Dashed dependency lines = weak/optional coupling; red dashed = inadvisable, avoid

### Crossing layers

The downward edges (Services → Adapters → Use-Cases → Entities) are both control flow and source dependency: a request enters at a Service, calls down through the layers, and imports point the same way. The upward edges are control flow only, an inner layer invoking something an outer layer provides, and on those edges the source dependency is inverted.

Inversion here is not a DI container or a service locator. It means: **an inner layer declares what it needs as parameters, and the layer above supplies them.** A use-case that needs the current route takes it as an argument; the adapter that wires the router hands it down. A use-case that needs to navigate takes a `navigate` callback; the adapter supplies the concrete one. The "port" is usually just the parameter list, a structural contract, and earns a named interface only when the contract is large enough to be worth naming. The supplying happens by ordinary composition: the outer layer calls the inner one within its own scope and passes its values down. There is no separate wiring framework, because the composition is the wiring.

Corollary, the **relocation rule**: if an inner layer finds itself needing an *outer layer's module* (a use-case importing a service, an entity importing an adapter), that is not a dependency to invert, it is misplaced logic. Split it. The pure part, a function of plain values, moves inward to where its dependencies actually are; the binding part, which reads the outer module and feeds the pure part, moves outward to the Adapters layer, whose defined job is exactly this binding. After the split nothing imports upward, because the inner part now depends only on values and on ambient mechanism.

This generalizes the rule already stated for the Entities↔Services edge ("Entities define interfaces for Services to implement; Entities do not import Services") to every layer boundary.

### Cross-cutting systems

A rendering framework, a styling system, a platform SDK, a router: these span every column and belong to no single domain. Classify each by what it delivers.

- **Mechanism** is behavior with no state of its own: reactive primitives, JSX, `requestAnimationFrame`, a scheduler. Ambient. Allowed in every layer except pure core, which is dependency-free by definition. Not wrapped, not routed through anything. A framework signal inside a use-case is local state and is fine.
- **State, and call-outs**, are values that are application state, or operations that mutate the outside world: the platform SDK's viewport and keyboard signals, storage reads and writes, request/response over the network. When these come in a shape that doesn't match the domain's, they cross the boundary by being wrapped: a Service as the facade over the raw API, an Adapter where the API is async, event-driven, or throwing (wrapped into a generator and a domain-shaped value). Inner layers receive the wrapped value as a parameter; they never import the raw API or the Service module.
- **Vocabulary** is names and shapes, no behavior or state: a styling token scale, a design system's primitives, a wire protocol's types. A shared-library contract, not a domain. Domain code may reference its *stable contract* (a token name, a type) but not its *implementation* (a utility-class string is implementation). Where the reference is allowed tracks what it is: a type belongs in pure core or anywhere above; a presentation token belongs in Adapters and up, never in Entities.

**The wrapping trigger is shape mismatch, not externality.** When an external system's API is already domain-shaped (reactive accessors, value-returning hooks, pure callbacks, idempotent on import), it is consumed directly as a use-case from another library; no wrapping is needed and no Adapter is in the chain. Domain code that orchestrates such APIs, deriving state or encoding policies over them, is itself a use-case composing use-cases. The Adapter layer is triggered specifically by shape mismatch with the domain: imperative interfaces, throwing APIs, async-callback or Promise-based control flow, mutable global state, request/response over the network. The structural Adapter pattern (an object converting interface A to interface B) appears at many layers; what places code in the ELDA Adapters layer is whether it crosses a shape boundary with the environment, not whether it converts an interface.

**Cross-cutting concerns are absorbed into composition blocks exposed by services; the runtime is the only context where cross-cutting composition is unrestricted.** Every other layer has shape, direction, and generalization constraints that prevent it from cleanly composing across domains. A cross-cutting concern (a navigation policy, a theme application, a localization rendering, a loading shell) cannot escape its owning domain as a free-floating hook, component, or helper that consumers call wherever they need it; doing so re-introduces cross-cutting at a layer that does not permit it. The way a cross-cutting domain expresses its concerns is by exposing **composition blocks** (services) that absorb the concern internally. Other domains contribute data and behavior contracts; the cross-cutting domain provides the blocks that render those contracts with the concern applied. The runtime composes feature data into cross-cutting blocks. This is the only place in the architecture where cross-domain composition has free reign, and it is the place ELDA reserves for it.

The same shape recurs between domains. A domain's only sanctioned cross-domain channels are its two surfaces, API and Events, via Streams and Generators. A domain whose Service can be imported by another domain's code has skipped this: it failed to put its producers behind a surface. The fix is on the producer side (expose the value as a Stream, or the operation as a Generator), not on the consumer side (a runtime wall around someone else's internals).

### Domain surface

Each domain exposes two perpendicular interfaces:

- **API** (left side): callable input surface; how other code invokes this domain
- **Events** (right side): observable output surface; what this domain emits when state changes

Code outside the domain interacts exclusively through these two surfaces.

#### The API-Event surface

Each domain's two interfaces, API and Events, are realized as a single **public surface**: a named target consumers reference, in whatever form the host language and module system provide. The concrete mechanism (a barrel module, a `pub` export, a public package interface, several split entry targets where build output requires them) is a language-and-tooling concern; the discipline that follows is architectural:

- Consumers reference the public surface by name. They do not reach past it into the domain's internal modules, files, or directory tree.
- The public surface is the contract. Re-organizing internals leaves consumers untouched.
- The internal layer structure (Services / Adapters / Use-Cases / Entities) is private to the domain. Whether each layer is a subdirectory, a file, or a class is implementation.

This sharpens the Composition root rule: a cross-domain reference is the domain identifier, and any reference that reaches past the public surface name is a deep reach and a smell.

Internal files use concrete names that describe their contents. ELDA's architectural vocabulary (Stream, Generator, Service, Vocabulary) belongs in this document, while filenames stay in the engineer-canonical register. The public surface mediates between the two registers, so consumers see named exports and can ignore the internal layout that produced them.

### Composition root

A Service is the input surface a layer above the layer cake reaches into. That layer is the **runtime composition root**: the entry point the host runtime instantiates directly. In a router-driven UI app the root is the route tree (`__root.tsx`, layout routes, leaf routes); in a request-driven server it is the request handlers; in a CLI it is the entry command. Everything else - other services, adapters, use-cases - is *composed by* the root, not invoking each other.

Service consumption is **composition, not invocation**. The composition root wires services together: it instantiates them, supplies their ports (slot content, callback parameters, configured policies), and decides which combination this run uses. A service does not import and mount another service. Doing so inverts the composition direction (the inner service dictates what its parent looks like) and bypasses the root's authority over what gets wired. If a service needs another service's content inside itself, it accepts a named slot port and lets the composition root pass that content in.

The rule applies to **service ↔ service** specifically. A service consuming a use-case is fine - use-cases are behavioral hooks the service implements its logic with, not composition surfaces. Tooling outside the production surface (dev panels, instrumentation, scaffolds) lives outside this rule by design: its job is to inspect or perturb the running app, which presupposes a position the production composition wouldn't give it.

This rule and the cross-domain rule act on different axes and do not collide. **Cross-domain communication** still flows only through Streams and Generators (the API/Events surfaces above); cross-domain *Service imports between domain internals* are still the failure case the "Cross-cutting systems" section names. A composition root, by contrast, sits outside any domain's internals and is allowed to reach into multiple domains - that is precisely its job. A route file that composes this domain's services and that domain's use-cases is doing composition, not violating a carve-out.

Practical signal: in a source dependency graph, every service file should appear as a *target* of imports only from composition-root files and from sibling layers within its own domain (its adapters, use-cases, entities). It should not appear as a target of imports from any other service, in or out of its domain.

### Vocabulary

Vocabulary in the cross-cutting classification (design tokens, type aliases, wire schemas) is *owned by one domain*: the one that emits it. Other domains do not re-declare, re-bundle, or hold their own manifest of the same vocabulary; consumption flows through the owner's public surface.

Where the vocabulary is reactive (a current theme identifier, a current locale), the public surface carries it through whatever the host runtime provides for runtime-supplied values: a context handle, a request scope, a dependency-injected binding. Consumers receive values through that channel.

Where the vocabulary's static representation must exist before runtime composition (compile-time style emission, schemas consumed by code generators), the static module lives with the owner. Consumers reference the owner's wire-level identifiers, names that are part of the contract, through whatever channel does not require importing the owner's module: a string reference, a name lookup, a code-generation pipeline output.

The principle does not mandate a specific runtime channel. It mandates that consumers do not re-declare vocabulary they don't own, and that the owner remains the single point of emission.

---

## Domain ontology

Domain boundaries are drawn, not discovered. They are decisions about how to partition the problem space, and those decisions evolve as understanding matures. There is no single correct partition.

The useful mental model is a **Venn diagram**. Each domain is a set. Code exists somewhere on the diagram - inside one circle, at the edge of a circle, or at the intersection of two or more circles. The position of a piece of code on the diagram is determined by its dependencies: what it imports tells you which circles it gravitates toward.

This reframes the classification question. "Which domain does this belong to?" becomes "where on the diagram does this sit?" The second question is always answerable from the code itself. The first requires judging essence, which is often impossible early in a project.

As understanding matures, boundaries sharpen. Code migrates toward the circle it most belongs to, and the diagram changes shape. This is expected and healthy - not a sign the original structure was wrong.

---

## Inter-domain communication

Domains interact via the **Pipe-Event-Stream** pattern. Direct cross-domain calls are inadvisable.

```
Producer Domain                     Consumer Domain
─────────────────                   ─────────────────
Use-Cases
  │  update
  ▼
Streams ──────── notify ──────────▶ Use-Cases
                                      │  call
                                      ▼
Use-Cases ◀────── trigger ────────── Generators
```

- **Producer** domain's Use-Cases update a **Stream** (an observable/subject)
- The stream **notifies** the Consumer domain's Use-Cases
- Consumer Use-Cases **call** their own **Generators** (reactive sources)
- Generators **trigger** Producer Use-Cases, completing the cycle

**Streams and Generators are runtime-agnostic abstractions.** ELDA defines them by direction: a Stream pushes values to subscribers; a Generator delivers values when pulled. The architecture does not mandate a concrete mechanism. A given runtime picks primitives that fit the shape, and the same architecture can run across different runtimes that each implement these in their own idiom. The architectural rule is that domains communicate through these channels exclusively; the primitive choice is a runtime concern.

**The data shape passing through a channel is orthogonal to its direction.** A Stream or Generator may carry event-shaped values (discrete emissions, no notion of current value, missed emissions are lost without explicit replay) or state-shaped values (always a current value, late subscribers see it, intermediate updates are aggregated). Both shapes fit both ELDA roles. Channel shape is an implementation decision governed by what consumers need from the channel (replay semantics, behavior for late subscribers, memory of past emissions), not by the ELDA category. Two channels carrying different shapes can both be Streams (or both Generators) at the architectural level; the category names the direction, not the storage model.

A domain is **Active** when it initiates the cycle (Producer role) and **Passive** when it reacts (Consumer role). The same domain can play both roles in different interactions.

### Domain tiers

The inter-domain stream graph must be a **DAG** - no domain may be both upstream and downstream in the same causal chain. To make this structurally explicit, domains are arranged into tiers. Stream subscriptions only flow downward across tiers:

```
Feature domains          top      - product-specific; consume from all tiers below
Orphan intersections     second   - named by relationship; consumed by feature domains
Transport / Storage      terminal - consumed by all; consume nothing above themselves
Pure core                bottom   - dependency-free; consumed by everything
```

Feature domains at the same tier must also form a DAG among themselves - no two peer feature domains may subscribe to each other's streams in a cycle.

When coordination between same-tier domains is unavoidable, the prescribed solution is a **Mediator** use-case that explicitly owns the coordination. This makes the cross-domain dependency visible and locates the termination condition in one place.

### Cycle enforcement

Tier rules are written constraints, not compiler-enforced ones. Runtime enforcement is provided by the **event-exchange interface** - the single infrastructure layer all stream emissions and generator triggers pass through.

Each stream emission carries a **causal set**: the set of stream IDs already in its propagation chain. Before the event-exchange interface delivers a notification to a generator, it checks whether the target stream is already in the causal set. If it is, the trigger is dropped. If it is not, the target stream ID is added to the causal set and propagation continues.

This check is implemented once in the event-exchange interface and applies automatically to every domain in the system. No per-domain cycle-detection code is needed.

---

## Full application structure

A complete ELDA application is built from several columns of domains/subdomains, each with the same four-layer stack:

### Feature domain
The product-specific vertical slice. One per product feature (e.g. `home`, `profile`, `faq`).

| Layer | Feature-domain slot |
|---|---|
| Services | UI (system): viewport, platform, SDK |
| Adapters | UI (bindings): component-level wiring |
| Use-Cases | B-Logic (watchers): reactive logic, event subscriptions |
| Entities | Pure UX rule invariants |

### Orphan intersections

Code at the intersection of two domains forms an **orphan** - a module named by its relationship between its parent domains, not by a concept it represents.

`home+profile` is an orphan at the intersection of the `home` and `profile` domains. It has no owner. Both parent domains consume from it. It does not consume from either parent.

Naming by relationship removes the pressure to understand something before classifying it. When the concept behind an intersection becomes clear - when you can say what the orphan *is* rather than what it *intersects* - it earns a name and becomes a full domain. Until that point it remains honest about its nature.

Orphan rules:
- Named by the domains it intersects: `a+b`, not by a concept
- Consumed by its parent domains; does not consume from them
- Sits below feature domains in the tier hierarchy; may consume from terminal subdomains and pure core
- Carries only the ELDA layers it actually needs; a minimal orphan may be just an Entities layer and accumulates further layers as it grows

Promotion signals:
- You can describe what the orphan *is*, not only what it intersects
- It starts consuming from a domain outside its declared intersection
- It accumulates all four layers with substantial content in each

A three-way intersection (`a+b+c`) almost always signals a hidden domain that has not yet been named, not a legitimate three-way orphan.

### Pure core

Pure code - code with no imports and no side effects - has no domain gravity. It sits at the center of the Venn diagram, belonging equally to all circles. It lives in a flat **core** layer at the bottom of the tier hierarchy, consumed by everything and depending on nothing.

Core contains only dependency-free code: type definitions, branded types, pure transformation functions, base interfaces with no domain-specific semantics. Any code with an import belongs somewhere in the tiers above.

### Transport subdomain
Owns all transport concerns. Feature domains call into it; it never imports feature domains.

| Layer | Transport slot |
|---|---|
| Services | API client + proto definitions |
| Adapters | Interceptors |
| Use-Cases | B-Logic (validators) |
| Entities | Network rules (retry, timeout, auth policy) |

### Storage subdomain
Owns all persistence and caching concerns.

| Layer | Storage slot |
|---|---|
| Services | Storage (persist + cache) |
| Adapters | Interface (bindings) |
| Use-Cases | B-Logic (CRUDs) |
| Entities | Data storage rules |

### Subdomains
Three cross-cutting concerns that span all columns:

- **UI subdomain**: everything visual, component framework, rendering
- **Network subdomain**: transport, protocol, request lifecycle
- **Data subdomain**: persistence, caching, serialization

---

## Concurrency model

`async`/`await` and raw Promise chains are banned from all userland code. The async/await model splits a codebase into two mutually incompatible function kinds: callers and callees must agree on the same kind to interoperate, and this agreement propagates transitively through the entire call graph. The result is two separate, non-composable camps.

Instead, every asynchronous operation is treated as a **single-value stream** and wrapped in a generator before it enters any domain layer. This wrapping is the responsibility of the **Adapters layer**, which is already the designated boundary for external integrations. Use-Cases and Entities receive only generator protocol and never a raw Promise.

Practical rule: if a platform API or third-party library returns a Promise, wrap it in a generator at the Adapters layer and advance it with a `yield` inside the domain.

This keeps all domain code one consistent kind. Generators compose freely with other generators, call stacks stay coherent end-to-end, and the subscription graph remains statically traceable by reference without runtime inspection.

---

## Outcome model

ELDA has no error model because it does not classify exceptions as a distinct category. All code paths - successful, failed, partial, or any other - are branches in logic. A network timeout, a validation failure, and a successful response are all values emitted by the same stream; the consumer decides what each branch means.

Exception-throwing code is treated as impure for the same reason as async code: it breaks the uniform value-producing contract of generators. Any library or platform API that throws must be wrapped at the Adapters layer into a generator that yields a typed branch value instead.

Rules:
- No `try`/`catch` inside Use-Cases or Entities
- No separate error channels alongside normal value channels
- All outcomes flow through the same Streams/Generators infrastructure as typed values
- Branch handling is enforced by the type system on the emitted value shape

The "errors as values" pattern (Rust's `Result`, Haskell's `Either`) approximates this but still treats one branch as semantically wrong. ELDA takes no position on which branches are positive or negative - that is domain logic, expressed as branch values in the stream.

This model depends on the type system to be fully enforceable. Exhaustive union checking (TypeScript discriminated unions, Rust `match`) ensures all branches are handled at compile time. Without that guarantee, the enforcement burden shifts to code review and convention.

---

## State model

State is always local to the domain, layer, or entity where it originates. There is no global state construct. Domains do not share mutable references.

State that must cross a domain boundary is not shared - it is published. The producing domain emits values through a Stream; consuming domains subscribe to that stream. The consumer holds a subscription reference, not a reference to the producer's internal state.

This distinction prevents three categories of problems that global state introduces:

- **Write contention**: no two domains compete for write access to the same mutable location.
- **Implicit reflow**: no consumer is silently re-evaluated when a distant producer mutates.
- **Stale snapshots**: the stream delivers the current value at subscription time and every subsequent update; there is no cached copy to go out of date.

Framework-level reactive primitives (RxJS BehaviorSubjects, SolidJS signals) are permitted as implementation tools. They belong at the layer where the state originates. A signal inside a Use-Case is local state; if its value needs to cross a domain boundary, it is wrapped in a Stream and exposed through the domain's Events surface.

---

## Advised design patterns

| Layer | Pattern | Purpose |
|---|---|---|
| Services | **Facade** | Simplified interface over an external system (platform SDK, storage driver, API client) |
| Services | **Factory** | Produces service instances; accommodates platform-specific variants |
| Adapters | **Adapter** | Converts an external interface to the domain-expected shape |
| Adapters | **Decorator** | Adds cross-cutting behavior (retry, auth, logging) without changing the adapted interface |
| Adapters | **Proxy** | Controls or defers access to an expensive external resource |
| Use-Cases | **Command** | Encapsulates a use-case invocation as an executable object; enables queuing and undo |
| Use-Cases | **Mediator** | Coordinates same-tier inter-domain interaction from a single explicit termination point |
| Use-Cases | **Chain of Responsibility** | Passes a request along a handler pipeline; each handler decides to process or forward |
| Entities | **Strategy** | An interchangeable domain rule expressed as a swappable algorithm |
| Entities | **Composite** | Composes simple rules into arbitrarily deep rule trees |
| Entities | **Specification** | A named, composable domain predicate; combinable with AND / OR / NOT |
| Entities | **Value Object** | An immutable object defined by its value, not identity; structurally enforces a domain invariant |

---

## Brittleness as a property

ELDA optimizes for composability, refactor-friendliness, and locality of change at the cost of robustness against discipline lapses. The structural payoff (general logic at the composition root, system concerns at adapters, business logic at use-cases and entities, no leakage sideways) is held in place by every boundary being respected at every cross-domain touch. A single cross-domain deep import, a single cross-cutting hook exposed past its owning domain, a single service composing another service, and the local-scope-of-change property degrades from that point outward.

This trade-off is deliberate. Architectures that prioritize malleability over rigor (Flux / Redux, Entity-Component-System, layered MVC) accept locality compromises so that an individual contributor's slip does not cascade through the structure. ELDA accepts the opposite: tighter structural payoff when the constraints hold, sharper degradation when they break. The grep tests written into the constraints (no deep imports past a public surface, no cross-cutting hooks at consumer sites, no service-to-service composition) function as scout signals, not enforcement; the architecture relies on reviewers and tooling to hold the line at the boundaries.

Choose accordingly. ELDA fits codebases where the cost of structural drift is high (multi-year products, multi-team handoffs, systems that must remain navigable as they grow), where reviewers and tooling can be relied on to catch the slips at PR time, and where the team values the property of "a change has the scope its diff says it has" enough to keep the discipline. It is the wrong fit for prototypes that prioritize speed of one-off experiments, codebases without an enforcement culture at the boundaries, or teams that prefer architectures absorbing discipline lapses gracefully over those rewarding rigor.

Future iterations of this specification may harden the brittleness with automated enforcement (lint rules over the grep tests, type-system constraints on cross-domain imports, structural validation in CI). The current edition states the rules; tooling that mechanizes them is downstream work.

---

## Constraints summary

1. Inner layers never import outer layers within a domain.
2. Domains communicate exclusively through Streams/Generators.
3. Each domain exposes exactly one API surface and one Events surface.
4. Orphan intersections are named by their parent domains (`a+b`); they are consumed by their parents and do not consume from them.
5. Transport and Storage subdomains are consumed by feature domains and orphans; they do not consume upward.
6. Streams and Generators are direct typed references; string-keyed dispatch is not permitted.
7. `async`/`await` and Promise chains are not permitted in userland code; async operations are wrapped as single-value streams at the Adapters layer.
8. The inter-domain stream subscription graph must be a DAG; stream subscriptions flow downward across tiers (Feature → Orphans → Terminal → Core).
9. The event-exchange interface tracks a causal set per emission and drops any trigger that would re-enter a stream already in that set.
10. Pure core contains only dependency-free code; any code with an import belongs in a domain, orphan, or subdomain above it.
11. Upward layer edges are dependency-inverted: an inner layer declares its needs as parameters; the adjacent outer layer supplies them by composition. No DI container or service locator.
12. An inner layer needing an outer layer's module is misplaced logic, not a dependency to invert: split it, pure part inward, binding part to Adapters.
13. Cross-cutting systems are mechanism (ambient; all layers but pure core), state-and-call-outs (wrapped at Services/Adapters, passed inward as values), or vocabulary (shared-library contract referenced by name; presentation vocabulary never in Entities).
14. Services are composed by the runtime composition root, not invoked by other services. A service ↔ service direct import inverts composition direction and is a smell; the consuming service should accept a named slot port and let the composition root supply the contents. Use-cases consumed by services are exempt (they are behavioral hooks, not composition surfaces). Production-path code only; dev tooling lives outside the rule.
15. Each domain exposes its public surface as a single named target; consumers reference only that target. References that reach past the public surface into a domain's internal structure are forbidden.
16. Vocabulary (design tokens, type aliases, wire schemas) is owned by one domain. Other domains do not re-declare, re-bundle, or hold their own manifest of the same vocabulary; consumption flows through the owner's public surface.
17. The Adapter layer is triggered by shape mismatch between an external system and the domain (imperative interfaces, throwing APIs, async-callback or Promise-based control flow, mutable global state, request/response over the network), not by externality alone. External APIs that are already domain-shaped (use-case-shaped) are consumed directly and orchestrated as use-cases composing other use-cases.
18. Cross-cutting concerns are absorbed into composition blocks exposed by services. Cross-cutting logic does not escape its owning domain as a free-floating hook, component, or helper; consumers receive blocks that have the concern already applied. The runtime composition root is the only context that may compose blocks from multiple domains freely; every other layer is constrained against cross-domain composition.
