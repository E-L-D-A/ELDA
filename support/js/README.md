# @elda/oxlint-plugin

ELDA's architecture rules as an [oxlint](https://oxc.rs) plugin. Authored against the ESLint-v9 plugin API that oxlint adopted, so the same plugin runs under ESLint too. It composes into a project's existing lint config and pass - it is not a separate linter.

Each rule cites the ELDA constraint it enforces by its grouped ID (see [../../README.md](../../README.md), "Constraints").

## Rules

| Rule | Enforces | What it flags |
|---|---|---|
| `imports` | LAYER.1, SURFACE.2, SURFACE.3, SURFACE.7, ROOT.1, ROOT.6, ROOT.7 | An inner layer importing an outer one (aliased or relative); a peer reaching into another domain's layer instead of a surface; a reach into a nested subdomain from outside its parent; a subdomain referencing its parent; a parent reaching past its direct children or composing a child from an inner layer; a surface re-bundling a peer or foreign domain; a services file re-exporting anything but services onto the runtime-composition surface; a composition root reaching a layer's internals or a nested subdomain, or taking a binding that *lands* off the services row once its barrels are followed; core importing domain code. One case grades down: a peer *service* importing another domain's `services` surface itself is OWNER.5 mounting, reported by `no-service-coupling` instead. |
| `no-surface-declarations` | SURFACE.2, OWNER.2 | A value declared on a surface file (a function, a `const`, a default export) rather than re-exported from the layer file that owns it. A surface curates and holds no rank, so a binding declared there has no layer and no owner, and every geometry rule bails on it: that makes a barrel the cheapest laundering path in the system, since wrapping a use-case in a locally-declared function silences every reach through it. `export { foo }` over an imported `foo` keeps its module request and stays curation; types and interfaces are vocabulary and pass. |
| `no-self-surface` | LAYER.1, SURFACE.3 | A file importing its own (sub)domain's surface - the barrel or a named surface - from inside it. A surface is a domain's face to its *consumers*, and a domain is not a consumer of itself. This is `no-surface-declarations` seen from the taking side, and it is the sharper of the two: the consumable surface legally carries use-cases, so an `entities` or `use-cases` file that imports its own barrel takes an outer-layer binding through a rankless hop, and LAYER.1 - reading the specifier, which names a surface - passes it. The landing walk leaves the gap open too, since it grades flows landing *below* the consumer's rank while this inversion lands above. Import the file that owns the binding. |
| `no-layer-branches` | LAYER.7 | A layer-named directory (`entities/`, `use-cases/`, ...) - a horizontal bucket; and a layer-suffixed directory (`layouts.services/`) - the same bucket wearing a file's name, an undeclared subdomain dodging subdomain discipline. The analyzers still recognize both legacy layouts, so this rule is a migrating codebase's fix-list. It also flags a **unit directory** that has come to hold two readings at once: `back-nav/` holding only `back-nav.*` files is a transparent grouping node whose files stay units of the enclosing subdomain, and a surface, a bare layer file, a second unit or a nested directory inside it makes the directory declare a concern of its own, which is a subdomain. Both readings would then apply and neither would be true, so whatever is not part of the unit reports. |
| `no-diagonal-reach` (+ `no-diagonal-reach-gate`) | SURFACE.5 | A value reference whose binding *lands* below the consumer's own rank across any name. One check, graded by whose contract the landing crossed, through three tri-state options (`'error' \| 'warn' \| 'off'`): `withinSubdomain` (no surface crossed at all, a sibling unit; default `warn`), `acrossSubdomains` (a surface the domain itself declared, at any nesting depth; default `warn`), `acrossDomains` (a foreign owner's surface; default `error`). The gradient is one of ownership regime, so it reads the same at every depth: the levels between a deep importer and its target are the importer's own ancestors, and how far a value laundered rides each finding as the landed-via chain instead of grading it. The lint host binds one level per rule ID, so the mapping is realized as a preset-managed pair sharing one implementation and one option map: `no-diagonal-reach` (configured `warn`) reports the classes mapped `warn`, `no-diagonal-reach-gate` (configured `error`) reports the classes mapped `error` - a partition, nothing reports twice, and the pair travels together. The walk (`flow.js`) follows every import name by name to its landing: surfaces are transparent (rank-less curation, so a barrel cannot launder a diagonal), while a rank-bearing file is a terminus - a named re-export there *adopts* the binding at that file's own rank, the spec's legal seam, and the adopting file's own edges are judged per-file. Equal-rank crossings keep their own semantics (the use-case and entity rows cross freely; the outer rows are the OWNER.5 laterals); within one subdomain the bare layer files are the shared base and the bare `services` composer is exempt; type-only imports are vocabulary references and pass. Fix by renaming the target into the consuming unit, promoting it to the bare layer file, or adopting it at the consuming unit's own matching rank. |
| `no-async-inner` | LAYER.4 | `async` functions, `await`, `for await`, and `try`/`catch` inside `entities/` or `use-cases/`; those shapes are wrapped at Adapters into channel-conforming values. |
| `no-mutable-surface` | CHANNEL.4 | `export let` / `export var` (directly, or exporting a top-level `let` by name) anywhere in domain code: a live mutable binding shared by reference is shared state, never published state. |
| `ambient-ownership` | OWNER.2 | A `.d.ts` outside `src/domains/`: ambient declarations are vocabulary and co-locate with their owning domain. |
| `no-service-coupling` | OWNER.5 | A service unit importing or re-exporting a different service unit of its own subdomain, or mounting a peer domain's block at its runtime-composition surface (the diagrams' red "inadvisable" arrows at the Services row); compose at the root via a slot port, or lift the shared logic into a use-case. A unit is the files sharing one name, so two names at one subdomain root are two units; type-only imports are vocabulary references and pass; the subdomain's own composer (the bare `services` file) is exempt for the units it owns. |
| `no-adapter-coupling` | OWNER.5 | An adapter unit importing or re-exporting a different adapter unit (the diagrams' red "inadvisable" arrows at the Adapters row); let the layer above compose the two bindings, or co-locate them into one unit (a shared name). Same unit semantics as `no-service-coupling`. |
| `no-penetration` | SURFACE.1, SURFACE.4 | `export *` (the surface stops being a deliberate named contract) and `import * as` (opaque consumption blinds the unconsumed-export review signal). |
| `no-deep-side-effects` | SURFACE.5 | A side-effect-only import reaching past its unit inside a domain; co-located unit assembly and root-level effect composition stay free. |
| `vocab-gate` | OWNER.2, ROOT.2 | Literal-keyed shared-namespace writes (`setAttribute`, `setItem`, `setProperty`, `dataset` assignments) at the composition root; route them through the owner's binding surface. |

## Dependency diagram (`elda-viz`)

The package also ships a CLI that renders an app's real dependency graph as the ELDA-Layers diagram: each domain a box with its subdomain columns, every file sorted into its layer x subdomain cell, the composition root as the top strip, and an arrow per reference. The rules and the diagram read one shared module (`model.js`) for path classification and reference verdicts, so every arrow carries the linter's own judgment: a violation draws solid red, an OWNER.5 mounting draws dashed red (the diagrams' "inadvisable" arrows), a type-only reference draws as a weak dash, an edge that closes a reference cycle draws violet, and a legal dependency stays grey. An edge that looks wrong on the diagram while staying grey is the review signal for a rule that does not exist yet.

```
elda-viz [appDir] [--port N] [--out file.html] [--no-open]
```

`appDir` is the app workspace holding `src/` and defaults to the working directory; the tool reads its options from the app's `.oxlintrc.json` when it configures `elda/imports`. The default mode serves a live page at `localhost:5813`, rescanning and re-rendering on every change under `src/`; `--out` writes a self-contained HTML snapshot instead. Hovering a file traces its edges (blue outgoing, green incoming), clicking pins the trace, and every path in the issues drawer opens the file in the editor.

Clicking a domain's title **folds** it: the box gives up its unit columns and keeps its rows, so each rank draws one aggregate chip standing for every file it holds, and the two bands keep their places (the composer cap above the cake, the shared base below it). Every reference crossing a folded boundary bundles into one arrow that carries the count, paints as the worst verdict among the references it holds, and lists them on hover. The rank geometry survives the fold, which is the point: an equal-rank crossing still runs along its row and a diagonal still reads as one, because a reference's meaning is the rank it crosses. Fold every domain but the one under review, and a large tree reads at the scale you are working at; **fold all** in the bottom bar, beside the domain list it acts on, is where reading a tree you did not write begins.

The **reach** toggle turns that trace into the transitive closure: everything the file pulls in, everything that breaks when it changes, faded by hop distance, with both counts on the hover. It walks the edges the board is drawing, so a hidden block or a filtered class leaves the walk exactly as it leaves the picture, and the reach you read is the reach of the graph in front of you.

The drawer lists every verdict, every unresolved specifier, every file the classifier could not place, and every file **unreachable from any composition root**. Reachability is the closure of the roots over the reference graph, so an unreachable file is one that ships to nobody: dead weight, or a capability deliberately ahead of its demand. The spec reads that as a review signal rather than a fault (a domain may expose more than its consumers currently require), so it counts in the header beside the violations and gates nothing.

### The landed-flow pass

Alongside the per-reference verdicts, every scan expands where each binding actually lands: an import is followed name by name through barrels and named surfaces to the file that owns or adopts it, so a barrel import fans out only to the bindings the consumer really takes, and a rank-bearing file's named re-export ends the walk as an adoption at its own rank (the spec's re-ownership section). The walk is `flow.js`, the same one the `no-diagonal-reach` family enforces with - the linter is this logic's primary consumer, and the diagram is its projection. On top of the shared walk the scan inherits each authored hop's verdict along the chain, judges clean-hop landings with the geometry verdicts (`landedVerdict`, the OWNER.5 laterals), and marks a fresh verdict as **laundered** in the issues drawer with the hop chain and the landed names. With surfaces expunged (the default view), the drawn arrows are these landed flows.

## Usage

Add the plugin and rules to your existing `.oxlintrc.json` (or `eslint.config.js`); they run in your existing pass, alongside your own rules:

```json
{
  "jsPlugins": ["@elda/oxlint-plugin"],
  "rules": {
    "elda/imports": "warn",
    "elda/no-surface-declarations": "warn",
    "elda/no-self-surface": "warn",
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

| Preset | Invariants (`imports`, `no-surface-declarations`, `no-self-surface`, `no-layer-branches`, `no-async-inner`, `no-mutable-surface`, `ambient-ownership`) | Graded smells (`no-service-coupling`, `no-adapter-coupling`, `no-penetration`, `no-deep-side-effects`, `vocab-gate`) | Diagonal class map (`acrossDomains` / `acrossSubdomains` / `withinSubdomain`) | Holds |
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

The package ships `adopting.json`, `aligned.json`, and `justified.json`, generated from the plugin's own `configs` by `npm run presets`; a preset is never hand-edited, because a hand-copied gate drifts silently in the direction of a rule it never turns on.

Whatever the wiring, verify the gate bites once: author one deliberate violation of an error-tier rule and confirm it reports as `error` with a non-zero exit. A rule that is registered but absent from the config is indistinguishable from a clean tree, and so is a severity the host quietly degraded.

**ESLint** (flat config) spreads the preset object:

```js
import elda from '@elda/oxlint-plugin';

export default [
  elda.configs.aligned,
];
```

## Conventions and options

The ELDA conventions are baked in: `domains/` as the domain root, and inside it directories express concerns while layer membership rides file names. A plain-named directory is a nested subdomain (a full domain: siblings are peers, it is invisible outside its parent, and its parent composes it), and nesting is unbounded, since every rule reads a chain's *relationships* and never its depth.

A file name reads right to left as `<name>.<layer>.<marker>…`: the layer is the rightmost dot-segment naming one (`entities`, `use-cases`, `adapters`, `services`), everything left of it is the unit's name, and everything right of it is markers. A marker is a colouring orthogonal to the layer axis - a runtime context (`.server`), a build convention (`.css` for a vanilla-extract module), a tooling suffix (`.stories`, `.spec`) - and there may be any number of them under any name, because the model does not enumerate them. It must not: an enumerated list fails *open*, so a marker the list has not been told about leaves the layer unmatched, silently demotes a layer file to a rankless surface, and takes every layer rule off it. Reading right to left is also what keeps `services.adapters.css.ts` decidable (unit `services`, layer `adapters`, marker `.css`), where reading left to right would take `services` for the layer and lose the file.

A unit - one concern-part - is the files sharing one name: `back-nav.adapters.tsx` and `back-nav.adapters.css` are one unit, and two names are two units. At a subdomain's root, `index` is the consumable barrel, the `services` file doubles as the runtime-composition surface, and any other plain name is a named surface. Both legacy layouts - bare layer directories and layer-suffixed unit directories (`back-nav.adapters/`) - are recognized by every analyzer and flagged by `no-layer-branches`. `.d.ts` belongs to a domain.

A unit may take a directory of its own. `back-nav/` holding `back-nav.entities.ts`, `back-nav.use-cases.ts` and `back-nav.services.tsx` is a **unit directory**: transparent, carrying no boundary, its files still units of the enclosing subdomain, reading that subdomain's shared base like any other unit. A subdomain of twenty flat files can be read at a glance for the price of nothing, and only declaring a boundary costs what a boundary costs.

The files keep their name inside their own directory because a transparent node states nothing, so the file has to carry its whole identity - and the bare form is taken in any case, since `back-nav/entities.ts` already names the shared base of the *subdomain* `back-nav`. That gives the two shapes one rename between them: drop the repeated prefix and add a surface, and the grouping node becomes a declared subdomain under the full ruleset; restore the prefix and delete the surface, and it goes back to being a folder. The directory never moves, and the relative imports inside it do not change.

The reading holds while the directory holds only that unit. A surface, a bare layer file, a second unit or a nested directory inside it makes the directory state a concern of its own, and a directory that states a concern is a subdomain - so both readings would apply and neither would be true. `no-layer-branches` reports the mixture.

One decidability note: a specifier's trailing plain segment does not say which thing it names, since `#/checkout/payment` is either a named surface of `checkout` or the `payment` subdomain's barrel. The filesystem does say, so the rules resolve a specifier to the file it means before judging it, and each reference is read once as that file. A specifier that resolves to no file keeps the shape-only reading, which accepts the reference when either meaning is legal, so a broken path never manufactures a finding - and a composition root's landing walk reports that same unresolvable path in its own right, so the silence is covered.

Four things vary per project, supplied as rule options (shown with their defaults):

```json
{
  "rules": {
    "elda/imports": ["warn", { "domainAlias": "#", "appAlias": "@", "compositionRoot": "routes", "core": "core" }]
  }
}
```

- `domainAlias` - import prefix that resolves to `src/domains` (`#/<domain>/…`).
- `appAlias` - import prefix that resolves to `src` (so `@/domains/<domain>/…` is also a domain import).
- `compositionRoot` - the directory holding composition roots (TanStack `routes/`, server handlers, …). A string or a list: an app composes at several entries, and each is a root under the full ROOT ruleset.
- `core` - the directory holding dependency-free core (ROOT.6). A string or a list, and an app may declare none. Naming a core buys no enforcement, since ROOT.6 is a property rather than a place: a module referencing no domain satisfies it wherever it lives, and one referencing a domain is a domain, a declared root, or a conduit laundering the reach. The declaration tells the informer which box to draw.

`elda/no-service-coupling` and `elda/no-adapter-coupling` read `domainAlias`/`appAlias`; `elda/no-self-surface`, `elda/no-surface-declarations`, and `elda/no-deep-side-effects` read the same options as `imports`; `elda/vocab-gate` reads `compositionRoot`. The `no-diagonal-reach` pair reads all of them plus its class map (`acrossDomains`/`acrossSubdomains`/`withinSubdomain`, each `'error' | 'warn' | 'off'`; defaults `error`/`warn`/`warn`) - set the same map on both entries of the pair.

## Scope: what stays outside a per-file linter

Every rule is decidable from one file plus the files its specifiers resolve to. Three of them read the module graph through `flow.js` (mtime-cached, so a lint pass parses each conduit at most once): the `no-diagonal-reach` family and a composition root's `imports` follow each reference's landings name by name, and `no-self-surface` needs only the resolution. All of them fall back to the shape-only judgment for a specifier that resolves to no file. Two ELDA checks live outside the linter by construction:

- **`surface ⊆ consumers` (SURFACE.4)** is whole-project reachability from the runtime roots; it belongs to [knip](https://knip.dev) (entries = composition roots + server + tooling) and runs as a separate advisory pass, because an unconsumed export is a review signal rather than a violation.
- **The Gate-1 cycle audit (CHANNEL.5)** - every cross-domain reference cycle encloses a settling element - is a whole-graph property, and its finding half is now machine-held: the scan closes the landed value flows into strongly connected components ([graph.js](./graph.js)) and reports every reference cycle, graded by the widest boundary it crosses, with the cross-domain class as Gate 1's own subject. A cycle built of legal edges is invisible to every per-file rule, because no file in it is at fault. Whether a given cycle settles is a value-level property no static pass decides, so the cycle reports and the reviewer names the settling element that encloses it (META.3). The pass informs and does not gate: `elda-viz` counts the cycles, paints the edges that close each one, raises a whole cycle from the drawer, and the selftest holds the pass to a deliberate cycle in the fixture ([../TODO.md](../TODO.md)).

`no-mutable-surface` likewise checks only the decidable slice of CHANNEL.4 (a live mutable binding on a module edge); whether a producer mutates an object after publishing it needs type- and flow-information a per-file linter does not have, and stays with review.

## Proving the gate bites

```
npm test          # regenerate the presets, then assert every rule fires
npm run selftest  # the assertion on its own; --list prints what each rule reported
```

A lint host runs a plugin's rules in a sandbox and swallows what they throw, so a rule that crashes reports nothing, and a rule that reports nothing looks exactly like a clean tree. The same silence covers a rule missing from a preset, a helper written and never wired, and an identifier used and never imported. Each of those has shipped here, and each read as alignment.

`fixture/` is a small app carrying one deliberate breach per rule, named for what it breaches. `selftest.mjs` runs the rules against it outside any host, so a throw propagates instead of vanishing, and a rule that stops firing on its own violation fails the check. Add the fixture breach in the same change as the rule; a rule with no fixture case is a rule nothing is watching.

## Status

oxlint's JS plugin host is **alpha**. The rules use only standard ESTree visitors (`ImportDeclaration`, `AwaitExpression`, `CallExpression`, `Program`, …) and no type information, so they sit well within the supported surface, but expect some churn until the host stabilizes.
