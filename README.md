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

### Domain surface

Each domain exposes two perpendicular interfaces:

- **API** (left side): callable input surface; how other code invokes this domain
- **Events** (right side): observable output surface; what this domain emits when state changes

Code outside the domain interacts exclusively through these two surfaces.

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
