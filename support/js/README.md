# @elda/oxlint-plugin

ELDA's architecture rules as an [oxlint](https://oxc.rs) plugin. Authored against the ESLint-v9 plugin API that oxlint adopted, so the same plugin runs under ESLint too. It composes into a project's existing lint config and pass - it is not a separate linter.

Each rule cites the ELDA constraint it enforces by its grouped ID (see [../../README.md](../../README.md), "Constraints").

## Rules

| Rule | Enforces | What it flags |
|---|---|---|
| `imports` | LAYER.1, SURFACE.2, SURFACE.3, SURFACE.7, ROOT.1, ROOT.6, ROOT.7 | An inner layer importing an outer one (aliased or relative); a peer reaching into another domain's layer instead of a surface; a reach into a nested slice from outside its parent; a slice referencing its parent; a parent reaching past its direct children or composing a child from an inner layer; a surface re-bundling a peer or foreign domain; a composition root reaching a layer's internals or a nested slice; core importing domain code. One case grades down: a peer *service* importing another domain's `services` surface itself is OWNER.5 mounting, reported by `no-service-coupling` instead. |
| `no-layer-branches` | LAYER.7 | A layer-named directory (`entities/`, `use-cases/`, ...) - a horizontal bucket; layer membership rides file names and directories express concerns. The analyzers still recognize the branch layout, so this rule is a migrating codebase's fix-list. |
| `no-async-inner` | LAYER.4 | `async` functions, `await`, `for await`, and `try`/`catch` inside `entities/` or `use-cases/`; those shapes are wrapped at Adapters into channel-conforming values. |
| `no-mutable-surface` | CHANNEL.4 | `export let` / `export var` (directly, or exporting a top-level `let` by name) anywhere in domain code: a live mutable binding shared by reference is shared state, never published state. |
| `ambient-ownership` | OWNER.2 | A `.d.ts` outside `src/domains/`: ambient declarations are vocabulary and co-locate with their owning domain. |
| `no-service-coupling` | OWNER.5 | A service unit importing a different service unit of its own domain, or mounting a peer domain's block at its runtime-composition surface (the diagrams' red "inadvisable" arrows at the Services row); compose at the root via a slot port, or lift the shared logic into a use-case. |
| `no-adapter-coupling` | OWNER.5 | An adapter unit importing a different adapter unit (the diagrams' red "inadvisable" arrows at the Adapters row); let the layer above compose the two bindings, or co-locate them into one unit. |
| `no-penetration` | SURFACE.1, SURFACE.4 | `export *` (the surface stops being a deliberate named contract) and `import * as` (opaque consumption blinds the unconsumed-export review signal). |
| `no-deep-side-effects` | SURFACE.5 | A side-effect-only import reaching past its unit inside a domain; co-located unit assembly and root-level effect composition stay free. |
| `vocab-gate` | OWNER.2, ROOT.2 | Literal-keyed shared-namespace writes (`setAttribute`, `setItem`, `setProperty`, `dataset` assignments) at the composition root; route them through the owner's binding surface. |

## Usage

Add the plugin and rules to your existing `.oxlintrc.json` (or `eslint.config.js`); they run in your existing pass, alongside your own rules:

```json
{
  "jsPlugins": ["@elda/oxlint-plugin"],
  "rules": {
    "elda/imports": "warn",
    "elda/no-async-inner": "warn",
    "elda/no-mutable-surface": "warn",
    "elda/ambient-ownership": "warn",
    "elda/no-service-coupling": "warn",
    "elda/no-adapter-coupling": "warn",
    "elda/no-penetration": "warn",
    "elda/no-deep-side-effects": "warn",
    "elda/vocab-gate": "warn"
  }
}
```

## Presets by grade

The spec grades a project by which rule registers its gate holds ([README](../../README.md), "Grades of alignment"). The plugin ships a preset per machine-holdable state; the governed grade is operator practice on top of these (the reachability pass and the scheduled audits under Scope below).

| Preset | Invariants (`imports`, `no-layer-branches`, `no-async-inner`, `no-mutable-surface`, `ambient-ownership`) | Graded smells (`no-service-coupling`, `no-adapter-coupling`, `no-penetration`, `no-deep-side-effects`, `vocab-gate`) | Holds |
|---|---|---|---|
| `adopting` | `warn` | `warn` | The migration posture: everything reports, the fix-list stays visible, and a change lands with no new findings in touched files. |
| `aligned` | `error` | `warn` | The aligned grade: violations gate at authoring time; smells stay visible for review. |
| `justified` | `error` | `error` | The justified grade: a deviation lands only as an inline suppression carrying its justification at the site. |

`vocab-gate` sits with the graded smells because its detector over-approximates - a literal-keyed write can be a genuinely local string - and at `justified` the confirmed-local cases take the same inline-suppression route.

A preset supplies the gate; the grade is read off the tree under it.

## Scoping down

Every rule is individually adoptable, and a rule switched off is a de-regulated seam: the map's guarantees end there, and the project's claim shrinks to match - "aligned over the import seams" is a coherent standing position, while the unqualified grade names mean the full ruleset. Ground the waiver the way any exemption is grounded: "this repo declares no ambient types, `ambient-ownership` is vacuous here" and "we accept the vocabulary seam unregulated" are both honest declarations, and the config itself is the declaration. The presets are the full-scope postures; a scoped-down config starts from one and switches rules off.

**oxlint** extends a config file by path - its `extends` is file-based and does not resolve a package name - so point at the shipped preset for the chosen grade:

```json
{
  "extends": ["./node_modules/@elda/oxlint-plugin/aligned.json"]
}
```

The package ships `adopting.json`, `aligned.json`, and `justified.json`. In a workspace that hoists dependencies, point at wherever the package resolves (e.g. `../../node_modules/@elda/oxlint-plugin/aligned.json`).

**ESLint** (flat config) spreads the preset object:

```js
import elda from '@elda/oxlint-plugin';

export default [
  elda.configs.aligned,
];
```

## Conventions and options

The ELDA conventions are baked in: `domains/` as the domain root, and inside it directories express concerns while layer membership rides file names. A plain-named directory is a nested slice (a full domain: siblings are peers, it is invisible outside its parent, and its parent composes it); a layer-suffixed directory (`back-nav.adapters/`) is a unit whose contents classify by the suffix; layer files are the bare reserved names (`entities.ts`, `use-cases.ts`, `adapters.tsx`, `services.tsx`) or a stem suffix (`cart-view.adapters.tsx`). At a slice root, `index` is the consumable barrel, the `services` leaf doubles as the runtime-composition surface, and any other file is a named surface. The legacy layer-directory layout is recognized by every analyzer and flagged by `no-layer-branches`. One decidability note: a bare reference like `#/checkout/payment` reads as either a named surface of `checkout` or the `payment` slice's barrel, and the rules accept a reference when either reading is legal, so the ambiguity never false-positives. `.d.ts` belongs to a domain. Only three things vary per project, supplied as rule options (shown with their defaults):

```json
{
  "rules": {
    "elda/imports": ["warn", { "domainAlias": "#", "appAlias": "@", "compositionRoot": "routes" }]
  }
}
```

- `domainAlias` - import prefix that resolves to `src/domains` (`#/<domain>/…`).
- `appAlias` - import prefix that resolves to `src` (so `@/domains/<domain>/…` is also a domain import).
- `compositionRoot` - the directory that holds composition roots (TanStack `routes/`, server handlers, …).

`elda/no-service-coupling` and `elda/no-adapter-coupling` read `domainAlias`/`appAlias`; `elda/no-deep-side-effects` reads `domainAlias`/`appAlias`/`compositionRoot`; `elda/vocab-gate` reads `compositionRoot`.

## Scope: what stays outside a per-file linter

Every rule here is file-local - decidable from one file plus its import specifiers, which is what lets a per-file linter host it. Two ELDA checks are out of scope by construction:

- **`surface ⊆ consumers` (SURFACE.4)** is whole-project reachability from the runtime roots; it belongs to [knip](https://knip.dev) (entries = composition roots + server + tooling) and runs as a separate advisory pass, because an unconsumed export is a review signal rather than a violation.
- **The Gate-1 cycle audit (CHANNEL.5)** - every cross-domain reference cycle encloses a settling element - is a whole-graph property. Until a graph pass exists it is a scheduled review item (META.3); the by-reference rule keeps every cycle discoverable by following references. The graph pass and its trigger are tracked in [../TODO.md](../TODO.md).

`no-mutable-surface` likewise checks only the decidable slice of CHANNEL.4 (a live mutable binding on a module edge); whether a producer mutates an object after publishing it needs type- and flow-information a per-file linter does not have, and stays with review.

## Status

oxlint's JS plugin host is **alpha**. The rules use only standard ESTree visitors (`ImportDeclaration`, `AwaitExpression`, `CallExpression`, `Program`, …) and no type information, so they sit well within the supported surface, but expect some churn until the host stabilizes.
