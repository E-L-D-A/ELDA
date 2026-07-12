# @elda/oxlint-plugin

ELDA's architecture rules as an [oxlint](https://oxc.rs) plugin. Authored against the ESLint-v9 plugin API that oxlint adopted, so the same plugin runs under ESLint too. It composes into a project's existing lint config and pass - it is not a separate linter.

Each rule cites the ELDA constraint it enforces by its grouped ID (see [../../README.md](../../README.md), "Constraints").

## Rules

| Rule | Enforces | What it flags |
|---|---|---|
| `imports` | LAYER.1, SURFACE.2, SURFACE.3, SURFACE.7, ROOT.1, ROOT.6, ROOT.7 | An inner layer importing an outer one (aliased or relative); a peer reaching into another domain's layer instead of a surface; a reach into a nested subdomain from outside its parent; a subdomain referencing its parent; a parent reaching past its direct children or composing a child from an inner layer; a surface re-bundling a peer or foreign domain; a composition root reaching a layer's internals or a nested subdomain; core importing domain code. One case grades down: a peer *service* importing another domain's `services` surface itself is OWNER.5 mounting, reported by `no-service-coupling` instead. |
| `no-layer-branches` | LAYER.7 | A layer-named directory (`entities/`, `use-cases/`, ...) - a horizontal bucket; and a layer-suffixed directory (`layouts.services/`) - the same bucket wearing a file's name, an undeclared subdomain dodging subdomain discipline. Layer membership rides file names, and a grouping directory is a subdomain. The analyzers still recognize both legacy layouts, so this rule is a migrating codebase's fix-list. |
| `no-diagonal-reach` (+ `no-diagonal-reach-gate`) | SURFACE.5 | A value reference whose binding *lands* below the consumer's own rank across any name. One check, graded by the width of the crossed boundary - severity grows with it - through three tri-state options (`'error' \| 'warn' \| 'off'`): `withinSubdomain` (sibling unit; default `warn`), `acrossSubdomains` (another subdomain of the same domain; default `warn`), `acrossDomains` (a foreign domain; default `error`). The lint host binds one level per rule ID, so the mapping is realized as a preset-managed pair sharing one implementation and one option map: `no-diagonal-reach` (configured `warn`) reports the classes mapped `warn`, `no-diagonal-reach-gate` (configured `error`) reports the classes mapped `error` - a partition, nothing reports twice, and the pair travels together. The walk (`flow.js`) follows every import name by name to its landing: surfaces are transparent (rank-less curation, so a barrel cannot launder a diagonal), while a rank-bearing file is a terminus - a named re-export there *adopts* the binding at that file's own rank, the spec's legal seam, and the adopting file's own edges are judged per-file. Equal-rank crossings keep their own semantics (the use-case and entity rows cross freely; the outer rows are the OWNER.5 laterals); within one subdomain the bare layer files are the shared base and the bare `services` composer is exempt; type-only imports are vocabulary references and pass. Fix by renaming the target into the consuming unit, promoting it to the bare layer file, or adopting it at the consuming unit's own matching rank. |
| `no-async-inner` | LAYER.4 | `async` functions, `await`, `for await`, and `try`/`catch` inside `entities/` or `use-cases/`; those shapes are wrapped at Adapters into channel-conforming values. |
| `no-mutable-surface` | CHANNEL.4 | `export let` / `export var` (directly, or exporting a top-level `let` by name) anywhere in domain code: a live mutable binding shared by reference is shared state, never published state. |
| `ambient-ownership` | OWNER.2 | A `.d.ts` outside `src/domains/`: ambient declarations are vocabulary and co-locate with their owning domain. |
| `no-service-coupling` | OWNER.5 | A service unit importing or re-exporting a different service unit of its own subdomain, or mounting a peer domain's block at its runtime-composition surface (the diagrams' red "inadvisable" arrows at the Services row); compose at the root via a slot port, or lift the shared logic into a use-case. A unit is the files sharing one name, so two names at one subdomain root are two units; type-only imports are vocabulary references and pass; the subdomain's own composer (the bare `services` file) is exempt for the units it owns. |
| `no-adapter-coupling` | OWNER.5 | An adapter unit importing or re-exporting a different adapter unit (the diagrams' red "inadvisable" arrows at the Adapters row); let the layer above compose the two bindings, or co-locate them into one unit (a shared name). Same unit semantics as `no-service-coupling`. |
| `no-penetration` | SURFACE.1, SURFACE.4 | `export *` (the surface stops being a deliberate named contract) and `import * as` (opaque consumption blinds the unconsumed-export review signal). |
| `no-deep-side-effects` | SURFACE.5 | A side-effect-only import reaching past its unit inside a domain; co-located unit assembly and root-level effect composition stay free. |
| `vocab-gate` | OWNER.2, ROOT.2 | Literal-keyed shared-namespace writes (`setAttribute`, `setItem`, `setProperty`, `dataset` assignments) at the composition root; route them through the owner's binding surface. |

## Dependency diagram (`elda-viz`)

The package also ships a CLI that renders an app's real dependency graph as the ELDA-Layers diagram: each domain a box with its subdomain columns, every file sorted into its layer x subdomain cell, the composition root as the top strip, and an arrow per reference. The rules and the diagram read one shared module (`model.js`) for path classification and reference verdicts, so every arrow carries the linter's own judgment: a violation draws solid red, an OWNER.5 mounting draws dashed red (the diagrams' "inadvisable" arrows), a type-only reference draws as a weak dash, and a legal dependency stays grey. An edge that looks wrong on the diagram while staying grey is the review signal for a rule that does not exist yet.

```
elda-viz [appDir] [--port N] [--out file.html] [--no-open]
```

`appDir` is the app workspace holding `src/` and defaults to the working directory; the tool reads `domainAlias` / `appAlias` / `compositionRoot` from the app's `.oxlintrc.json` when it configures `elda/imports`. The default mode serves a live page at `localhost:5813`, rescanning and re-rendering on every change under `src/`; `--out` writes a self-contained HTML snapshot instead. Hovering a file traces its edges (blue outgoing, green incoming), clicking pins the trace, and the issues drawer lists every verdict, every unresolved specifier, and every file the classifier could not place.

### The landed-flow pass

Alongside the per-reference verdicts, every scan expands where each binding actually lands: an import is followed name by name through barrels and named surfaces to the file that owns or adopts it, so a barrel import fans out only to the bindings the consumer really takes, and a rank-bearing file's named re-export ends the walk as an adoption at its own rank (the spec's re-ownership section). The walk is `flow.js`, the same one the `no-diagonal-reach` family enforces with - the linter is this logic's primary consumer, and the diagram is its projection. On top of the shared walk the scan inherits each authored hop's verdict along the chain, judges clean-hop landings with the geometry verdicts (`landedVerdict`, the OWNER.5 laterals), and marks a fresh verdict as **laundered** in the issues drawer with the hop chain and the landed names. With surfaces expunged (the default view), the drawn arrows are these landed flows.

## Usage

Add the plugin and rules to your existing `.oxlintrc.json` (or `eslint.config.js`); they run in your existing pass, alongside your own rules:

```json
{
  "jsPlugins": ["@elda/oxlint-plugin"],
  "rules": {
    "elda/imports": "warn",
    "elda/no-layer-branches": "warn",
    "elda/no-diagonal-reach": ["warn", { "acrossDomains": "warn", "acrossSubdomains": "warn", "withinSubdomain": "warn" }],
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

| Preset | Invariants (`imports`, `no-layer-branches`, `no-async-inner`, `no-mutable-surface`, `ambient-ownership`) | Graded smells (`no-service-coupling`, `no-adapter-coupling`, `no-penetration`, `no-deep-side-effects`, `vocab-gate`) | Diagonal class map (`acrossDomains` / `acrossSubdomains` / `withinSubdomain`) | Holds |
|---|---|---|---|---|
| `adopting` | `warn` | `warn` | `warn` / `warn` / `warn` | The migration posture: everything reports, the fix-list stays visible, and a change lands with no new findings in touched files. |
| `aligned` | `error` | `warn` | `error` / `warn` / `warn` | The aligned grade: violations gate at authoring time; smells stay visible for review. |
| `justified` | `error` | `error` | `error` / `error` / `error` | The justified grade: a deviation lands only as an inline suppression carrying its justification at the site. |

Every preset carries the `no-diagonal-reach` pair with the grade's class map mirrored on both entries; the two IDs project the map's halves, so the gradient holds within one config.

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

**Known oxlint limitation (alpha host):** `extends` loads the preset's `jsPlugins`, but the extended file's JS-plugin rule *severities* currently degrade to `warn` - an extended `aligned.json` reports every finding while gating none. Until the host fixes this, mirror the chosen preset's `rules` block inline in the consuming config; the preset files remain the canonical grade definitions, and the inline block is the gate's visible declaration. Verify the gate bites after wiring: author one deliberate violation and confirm it reports as `error` with a non-zero exit.

**ESLint** (flat config) spreads the preset object:

```js
import elda from '@elda/oxlint-plugin';

export default [
  elda.configs.aligned,
];
```

## Conventions and options

The ELDA conventions are baked in: `domains/` as the domain root, and inside it directories express concerns while layer membership rides file names. A plain-named directory is a nested subdomain (a full domain: siblings are peers, it is invisible outside its parent, and its parent composes it); layer files carry the bare reserved names (`entities.ts`, `use-cases.ts`, `adapters.tsx`, `services.tsx`) or a `<name>.<layer>` suffix (`cart-view.adapters.tsx`), and the runtime-context markers `.server` / `.client` plus the vanilla-extract `.css.ts` compound are seen through (`auth.services.server.ts` is a services file named `auth`). A unit - one concern-part - is the files sharing one name at a subdomain's root: `back-nav.adapters.tsx` and `back-nav.adapters.css` are one unit, and two names are two units. At a subdomain's root, `index` is the consumable barrel, the `services` file doubles as the runtime-composition surface, and any other file is a named surface. Both legacy layouts - bare layer directories and layer-suffixed unit directories (`back-nav.adapters/`) - are recognized by every analyzer and flagged by `no-layer-branches`. One decidability note: a bare reference like `#/checkout/payment` reads as either a named surface of `checkout` or the `payment` subdomain's barrel, and the rules accept a reference when either reading is legal, so the ambiguity never false-positives. `.d.ts` belongs to a domain. Only three things vary per project, supplied as rule options (shown with their defaults):

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

`elda/no-service-coupling` and `elda/no-adapter-coupling` read `domainAlias`/`appAlias`; `elda/no-deep-side-effects` reads `domainAlias`/`appAlias`/`compositionRoot`; `elda/vocab-gate` reads `compositionRoot`. The `no-diagonal-reach` pair reads all three plus its class map (`acrossDomains`/`acrossSubdomains`/`withinSubdomain`, each `'error' | 'warn' | 'off'`; defaults `error`/`warn`/`warn`) - set the same map on both entries of the pair.

## Scope: what stays outside a per-file linter

Every rule outside the `no-diagonal-reach` family is file-local - decidable from one file plus its import specifiers. The family is the graph-reading exception: it resolves each reference's landings by reading the imported modules through `flow.js` (mtime-cached, so a lint pass parses each conduit at most once), and falls back to the direct spec-classified judgment for a specifier that resolves to no file. Two ELDA checks live outside the linter by construction:

- **`surface ⊆ consumers` (SURFACE.4)** is whole-project reachability from the runtime roots; it belongs to [knip](https://knip.dev) (entries = composition roots + server + tooling) and runs as a separate advisory pass, because an unconsumed export is a review signal rather than a violation.
- **The Gate-1 cycle audit (CHANNEL.5)** - every cross-domain reference cycle encloses a settling element - is a whole-graph property. Until a dedicated pass exists it is a scheduled review item (META.3); the by-reference rule keeps every cycle discoverable by following references, and the `flow.js` resolved graph is the substrate the pass will ride ([../TODO.md](../TODO.md)).

`no-mutable-surface` likewise checks only the decidable slice of CHANNEL.4 (a live mutable binding on a module edge); whether a producer mutates an object after publishing it needs type- and flow-information a per-file linter does not have, and stays with review.

## Status

oxlint's JS plugin host is **alpha**. The rules use only standard ESTree visitors (`ImportDeclaration`, `AwaitExpression`, `CallExpression`, `Program`, …) and no type information, so they sit well within the supported surface, but expect some churn until the host stabilizes.
