# @elda/oxlint-plugin

ELDA's architecture rules as an [oxlint](https://oxc.rs) plugin. Authored against the ESLint-v9 plugin API that oxlint adopted, so the same plugin runs under ESLint too. It composes into a project's existing lint config and pass - it is not a separate linter.

## Features

- 🧱 **Architecture as a lint rule.** Layers, surfaces, ownership and channels, checked right in the lint pass.
- 🕸️ **Graph-aware.** Dependencies are followed to where they really land, so an indirection cannot obscure a dependency.
- 🗺️ **Your live dependency graph as a diagram.** Interactive, with every arrow coloured by the rules that lint your code.
- 🎯 **Every finding cites its constraint.** The rule it broke, and the fix, at the site.
- 🔁 **Cycle detection.** Finds import cycles a file-by-file linter cannot.
- 🔍 **Reach.** What a module needs and what breaks when it changes, in one hover.
- 🪗 **Fold.** Collapse a domain to one column, adjust the graph to the scale you work at.
- ⚡ **Live hot reload.** The diagram redraws as you refactor: fix a violation, watch its arrow go.
- 📸 **Snapshot** the whole graph as one self-contained HTML file.
- 🎚️ **Grades** - `adopting`, `aligned`, `justified`: pick the gate your project can hold today.

Each rule cites an ELDA constraint it enforces by its grouped ID (see [../../README.md](../../README.md), "Constraints").

## Usage

Add the plugin and rules to your existing `.oxlintrc.json` (or `eslint.config.js`); they run in your existing pass, alongside your own rules:

```json
{
  "jsPlugins": ["@elda/oxlint-plugin"],
  "rules": {
    "elda/imports": "warn",
    "elda/no-surface-declarations": "warn",
    "elda/no-self-surface": "warn",
    "elda/no-diagonal-reach": ["warn", { "acrossDomains": "warn", "acrossSubdomains": "warn", "withinSubdomain": "warn" }],
    "elda/no-async-inner": "warn",
    "elda/no-mutable-surface": "warn",
    "elda/no-entity-state": "warn",
    "elda/ambient-ownership": "warn",
    "elda/no-service-coupling": "warn",
    "elda/no-adapter-coupling": "warn",
    "elda/no-dishonest-placement": "warn",
    "elda/no-penetration": "warn",
    "elda/no-deep-side-effects": "warn",
    "elda/vocab-gate": "warn"
  }
}
```

## Rules

| Rule | Enforces | What it flags |
|---|---|---|
| `imports` | [LAYER.1][layer], [SURFACE.2][surface], [SURFACE.3][surface], [SURFACE.7][surface], [ROOT.1][root], [ROOT.6][root], [ROOT.7][root] | An inner layer importing an outer one (aliased or relative); a peer reaching into another domain's layer instead of a surface; a reach into a nested subdomain from outside its parent; a subdomain referencing its parent; a parent reaching past its direct children or composing a child from an inner layer; a surface re-bundling a peer or foreign domain; a services file re-exporting anything but services onto the runtime-composition surface; a composition root reaching a layer's internals or a nested subdomain, or taking a binding that *lands* off the services row once its barrels are followed; core importing domain code. One case grades down: a peer *service* importing another domain's `services` surface itself is OWNER.5 mounting, reported by `no-service-coupling` instead. |
| `no-surface-declarations` | [SURFACE.2][surface], [OWNER.2][owner] | A value declared on a surface file (a function, a `const`, a default export) rather than re-exported from the layer file that owns it. A surface curates and holds no rank, so a binding declared there has no layer and no owner, and every geometry rule bails on it: that makes a barrel the cheapest laundering path in the system, since wrapping a use-case in a locally-declared function silences every reach through it. `export { foo }` over an imported `foo` keeps its module request and stays curation; types and interfaces are vocabulary and pass. A core file carrying a surface is judged the same way, and a whole domain living in one file reports with its own remedy: the layer suffix its contents hold, or extraction into layer files behind the surface. |
| `no-self-surface` | [LAYER.1][layer], [SURFACE.3][surface] | A file importing its own (sub)domain's surface - the barrel or a named surface - from inside it. A surface is a domain's face to its *consumers*, and a domain is not a consumer of itself. This is `no-surface-declarations` seen from the taking side, and it is the sharper of the two: the consumable surface legally carries use-cases, so an `entities` or `use-cases` file that imports its own barrel takes an outer-layer binding through a rankless hop, and LAYER.1 - reading the specifier, which names a surface - passes it. The landing walk leaves the gap open too, since it grades flows landing *below* the consumer's rank while this inversion lands above. Import the file that owns the binding. |
| `no-diagonal-reach` (+ `no-diagonal-reach-gate`) | [SURFACE.5][surface] | A value reference whose binding *lands* below the consumer's own rank across any name. One check, graded by whose contract the landing crossed, through three tri-state options (`'error' \| 'warn' \| 'off'`): `withinSubdomain` (no surface crossed at all, a sibling unit; default `warn`), `acrossSubdomains` (a surface the domain itself declared, at any nesting depth; default `warn`), `acrossDomains` (a foreign owner's surface; default `error`). The gradient is one of ownership regime, so it reads the same at every depth: the levels between a deep importer and its target are the importer's own ancestors, and how far a value laundered rides each finding as the landed-via chain instead of grading it. The lint host binds one level per rule ID, so the mapping is realized as a preset-managed pair sharing one implementation and one option map: `no-diagonal-reach` (configured `warn`) reports the classes mapped `warn`, `no-diagonal-reach-gate` (configured `error`) reports the classes mapped `error` - a partition, nothing reports twice, and the pair travels together. The walk (`core/flow.services.js`) follows every import name by name to its landing: surfaces are transparent (rank-less curation, so a barrel cannot launder a diagonal), while a rank-bearing file is a terminus - a named re-export there *adopts* the binding at that file's own rank, the spec's legal seam, and the adopting file's own edges are judged per-file. Equal-rank crossings keep their own semantics (the use-case and entity rows cross freely; the outer rows are the OWNER.5 laterals); within one subdomain the bare layer files are the shared base and the bare `services` composer is exempt; type-only imports are vocabulary references and pass. Fix by renaming the target into the consuming unit, promoting it to the bare layer file, or adopting it at the consuming unit's own matching rank. |
| `no-async-inner` | [LAYER.4][layer] | `async` functions, `await`, `for await`, and `try`/`catch` inside `entities/` or `use-cases/`; those shapes are wrapped at Adapters into channel-conforming values. |
| `no-entity-state` | [LAYER.4][layer] | A module-level `let`/`var` in an entities file, exported or private behind an accessor: entities hold pure domain invariants and own no state, so a mutable binding there is state at the pure rank. The decidable slice is the binding itself; whether a `const` collection is mutated stays with review, the same split `no-mutable-surface` declares. |
| `no-mutable-surface` | [CHANNEL.4][channel] | `export let` / `export var` (directly, or exporting a top-level `let` by name) anywhere in domain code: a live mutable binding shared by reference is shared state, never published state. |
| `ambient-ownership` | [OWNER.2][owner] | A `.d.ts` outside the ownership tree and every declared core: ambient declarations are vocabulary and co-locate with their owning domain. |
| `no-service-coupling` | [OWNER.5][owner] | A service unit importing or re-exporting a different service unit of its own subdomain, or mounting a peer domain's block at its runtime-composition surface (the diagrams' red "inadvisable" arrows at the Services row); compose at the root via a slot port, or lift the shared logic into a use-case. A unit is the files sharing one name, so two names at one subdomain root are two units; type-only imports are vocabulary references and pass; the subdomain's own composer (the bare `services` file) is exempt for the units it owns. |
| `no-adapter-coupling` | [OWNER.5][owner] | An adapter unit importing or re-exporting a different adapter unit (the diagrams' red "inadvisable" arrows at the Adapters row); let the layer above compose the two bindings, or co-locate them into one unit (a shared name). Same unit semantics as `no-service-coupling`. |
| `no-dishonest-placement` | The thesis: placement is a claim the graph adjudicates | The tree and the graph disagree about what a file is: its name and location claim one role, while its imports and its consumers read it as another. The file keeps its claimed role for every other rule - judged as its author reads it, so one disagreement never cascades through re-homed neighbours - and the disagreement itself reports once, stating what the tree says, what the imports say, and the remedy that fits: rename, move, or let an import name the owner, since an aliased specifier attributes ownership in one spelling. A core claim is adjudicated on core's own properties - ROOT.6 dependency-freedom, then sharedness - and a lone-owner verdict is concluded only when every consumer sits inside the one domain, because roots compose core and core composes itself. |
| `no-penetration` | [SURFACE.1][surface], [SURFACE.4][surface] | `export *` (the surface stops being a deliberate named contract) and `import * as` (opaque consumption blinds the unconsumed-export review signal). |
| `no-deep-side-effects` | [SURFACE.5][surface] | A side-effect-only import reaching past its unit inside a domain; co-located unit assembly and root-level effect composition stay free. |
| `vocab-gate` | [OWNER.2][owner], [ROOT.2][root] | Literal-keyed shared-namespace writes (`setAttribute`, `setItem`, `setProperty`, `dataset` assignments) at the composition root; route them through the owner's binding surface. |

[layer]: ../../README.md#layer---within-a-domain
[channel]: ../../README.md#channel---between-domains
[surface]: ../../README.md#surface---the-domain-boundary
[owner]: ../../README.md#owner---ownership-and-vocabulary
[root]: ../../README.md#root---composition-roots

## Dependency diagram (`elda-viz`)

The package also ships a CLI that renders an app's real dependency graph as the ELDA-Layers diagram. The rules and the diagram read one shared core - the path model, the graph classification, and the reference verdicts - so the linter and the board judge every edge identically, and the picture is the ruleset with its arrows drawn.

```
elda-viz [appDir] [--port N] [--out file.html] [--no-open]
```

`appDir` is the app workspace - the directory carrying the `.oxlintrc.json` that declares the app's aliases, ownership tree, roots, and cores - and defaults to the working directory. The default mode serves a live page at `localhost:5813`; `--out` writes a self-contained HTML snapshot instead.

Each domain draws as a box: its subdomains grouped into columns, every file in its layer x unit cell, each composition root a strip across the top, the bare composer capping its (sub)domain as a band and the bare entities file underlying it as the shared base. A declared core area draws as a domain block of its own, first on the board and tagged *shared*, since core modules are domains at the bottom of the sharedness order; a whole domain living in one file draws as its surface over an obscured cake until its contents earn layer files, and a file whose tree claim the graph contradicts draws in its claimed cell with a dashed outline. Every arrow carries the linter's own judgment: a violation draws solid red, an OWNER.5 mounting dashed red (the diagrams' "inadvisable" arrows), an edge closing a reference cycle violet, a type-only reference a weak dash, and a legal dependency stays grey. An arrow that looks wrong while it stays grey is the review signal for a rule that does not exist yet.

Hovering a file traces its edges (blue for what it depends on, green for what depends on it), clicking pins the trace, a middle-click banishes a file to its domain's shelf, and the bottom bar hides whole blocks. The **reach** toggle turns that trace into the transitive closure: everything the file pulls in, everything that breaks when it changes, faded by hop distance, with both counts on the hover. It walks the edges the board is drawing, so the reach you read is the reach of the graph in front of you.

Clicking a domain's title **folds** it: the box gives up its unit columns and keeps its rows, so each rank draws one aggregate chip standing for every file it holds, and the two bands keep their places. Every reference crossing a folded boundary bundles into one arrow carrying the count and the worst verdict among them, and listing them on hover. The rank geometry survives the fold, which is the point: an equal-rank crossing still runs along its row and a diagonal still reads as one, because a reference's meaning is the rank it crosses. **Fold all** sits in the bottom bar beside the domain list it acts on, and folding everything but the domain under review is where reading a tree you did not write begins.

The drawer lists every verdict, every laundered finding, every contested placement, every surface owning unextracted declarations, every reference cycle, every slicing-pressure cluster (rank-climbing imports between sibling pieces, the spec's re-slice indicator), every unresolved specifier, every file the classifier could not place, and every file **unreachable from any composition root**. Reachability is the closure of the roots over the reference graph, so an unreachable file is one that ships to nobody: dead weight, or a capability deliberately ahead of its demand. The spec reads that as a review signal rather than a fault, so it counts in the header beside the violations and gates nothing. Clicking a finding pins it on the board and opens the domain it is folded into; clicking its path opens the file in the editor.

The served page rescans on every change under `src/` and swaps the graph in place, keeping the pin, the folds, the drawer and the scroll where they were. A dropped connection comes back on its own, and a restarted CLI is caught up on reconnect, since it rescanned the tree while nothing was listening; clicking the ELDA mark asks for that reconnection at once. The page reloads outright only when the viewer it is running has itself changed, which the server stamps and the page notices, so an edit to the viewer - its shell or any of its modules - reaches every open page and nothing else costs you your place.

### The landed-flow pass

The walk behind those flows is `core/flow.services.js`: an import is followed name by name through barrels and named surfaces to the file that owns or adopts it, so a barrel import fans out only to the bindings the consumer really takes, and a rank-bearing file's named re-export ends the walk as an adoption at its own rank (the spec's re-ownership section). It is the same walk the `no-diagonal-reach` family enforces with - the linter is this logic's primary consumer, and the diagram is its projection. On top of the shared walk the scan inherits each authored hop's verdict along the chain, judges clean-hop landings with the geometry verdicts (`landedVerdict`, the OWNER.5 laterals), and marks a fresh verdict as **laundered** in the issues drawer with the hop chain and the landed names. With surfaces expunged (the default view), the drawn arrows are these landed flows.

## Presets by grade

The spec grades a project by which rule registers its gate holds ([README](../../README.md), "Grades of alignment"). The plugin ships a preset per machine-holdable state; the governed grade is operator practice on top of these (the reachability pass and the scheduled audits under Scope below).

| Preset | Invariants (`imports`, `no-surface-declarations`, `no-self-surface`, `no-async-inner`, `no-mutable-surface`, `no-entity-state`, `ambient-ownership`) | Graded smells (`no-service-coupling`, `no-adapter-coupling`, `no-dishonest-placement`, `no-penetration`, `no-deep-side-effects`, `vocab-gate`) | Diagonal class map (`acrossDomains` / `acrossSubdomains` / `withinSubdomain`) | Holds |
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

The ELDA conventions are baked in: the ownership alias's directory is the domain tree (`domains/` by default), and inside it directories express concerns while layer membership rides file names. A plain-named directory is a nested subdomain (a full domain: siblings are peers, it is invisible outside its parent, and its parent composes it), and nesting is unbounded, since every rule reads a chain's *relationships* and never its depth.

A file name reads right to left as `<name>.<layer>.<marker>…`: the layer is the rightmost dot-segment naming one (`entities`, `use-cases`, `adapters`, `services`), everything left of it is the unit's name, and everything right of it is markers. A marker is a colouring orthogonal to the layer axis - a runtime context (`.server`), a build convention (`.css` for a vanilla-extract module), a tooling suffix (`.stories`, `.spec`) - and there may be any number of them under any name, because the model does not enumerate them. It must not: an enumerated list fails *open*, so a marker the list has not been told about leaves the layer unmatched, silently demotes a layer file to a rankless surface, and takes every layer rule off it. Reading right to left is also what keeps `services.adapters.css.ts` decidable (unit `services`, layer `adapters`, marker `.css`), where reading left to right would take `services` for the layer and lose the file.

A unit - one concern-part - is the files sharing one name: `back-nav.adapters.tsx` and `back-nav.adapters.css` are one unit, and two names are two units. At a subdomain's root, `index` is the consumable barrel, the `services` file doubles as the runtime-composition surface, and any other plain name is a named surface. `.d.ts` belongs to a domain.

A unit may take a directory of its own. `back-nav/` holding `back-nav.entities.ts`, `back-nav.use-cases.ts` and `back-nav.services.tsx` is a **unit directory**: transparent, carrying no boundary, its files still units of the enclosing subdomain, reading that subdomain's shared base like any other unit. A subdomain of twenty flat files can be read at a glance for the price of nothing, and only declaring a boundary costs what a boundary costs.

The files keep their name inside their own directory because a transparent node states nothing, so the file has to carry its whole identity - and the bare form is taken in any case, since `back-nav/entities.ts` already names the shared base of the *subdomain* `back-nav`. That gives the two shapes one rename between them: drop the repeated prefix and add a surface, and the grouping node becomes a declared subdomain under the full ruleset; restore the prefix and delete the surface, and it goes back to being a folder. The directory never moves, and the relative imports inside it do not change.
One decidability note: a specifier's trailing plain segment does not say which thing it names, since `#/checkout/payment` is either a named surface of `checkout` or the `payment` subdomain's barrel. The filesystem does say, so the rules resolve a specifier to the file it means before judging it, and each reference is read once as that file. A specifier that resolves to no file keeps the shape-only reading, which accepts the reference when either meaning is legal, so a broken path never manufactures a finding - and a composition root's landing walk reports that same unresolvable path in its own right, so the silence is covered.

Four things vary per project, supplied as rule options (shown with their defaults). Every declared path is app-root-relative - the app root is the directory carrying the `.oxlintrc.json` - and no directory name is special on its own:

```json
{
  "rules": {
    "elda/imports": ["warn", { "aliases": { "#": "src/domains", "@": "src" }, "ownershipAlias": "#", "compositionRoot": "src/routes", "core": "src/core" }]
  }
}
```

- `aliases` - every import alias the app's bundler resolves, mapped to its app-root-relative directory. Resolution needs all of them (the graph reads every edge); defaults to `{ "#": "domains" }`.
- `ownershipAlias` - the one alias whose specifiers *attribute ownership*: its path remainder is the domain chain, so `#/env/inject.services` names `env` as the owner in one spelling, and every other specifier form is anonymous travel. Its directory is the ownership tree the path claims are read from.
- `compositionRoot` - the directories or single modules holding composition roots (a route tree, server handlers, a build config). A string or a list: an app composes at several entries, and each is a root under the full ROOT ruleset.
- `core` - the directories holding dependency-free core (ROOT.6). A string or a list, and an app may declare none. A core area's contents classify as top-level shared domains beside the feature domains: a layer suffix carries rank, a loner file directly in the area is a whole domain in one file, and the declaration is a claim like any other placement - adjudicated on core's own properties, dependency-freedom and sharedness, with the disagreement reported by `no-dishonest-placement`. A reach into core is judged directionally: leaning at or below one's own rank is free, and the upward reach is an inversion.

`elda/no-service-coupling`, `elda/no-adapter-coupling`, `elda/no-self-surface`, `elda/no-surface-declarations`, `elda/no-entity-state`, and `elda/no-deep-side-effects` read the same options as `imports`; `elda/vocab-gate` reads `compositionRoot`. The `no-diagonal-reach` pair reads all of them plus its class map (`acrossDomains`/`acrossSubdomains`/`withinSubdomain`, each `'error' | 'warn' | 'off'`; defaults `error`/`warn`/`warn`) - set the same map on both entries of the pair.

## Scope: what stays outside a per-file linter

A rule judges the file in front of it against the app's one resolved graph: the same scan the diagram draws is built once per app and cached across the per-file passes, a file's role comes from surface ownership over the resolved edges reconciled with the tree's claim, and the walk (`core/flow.services.js`, mtime-cached, so a lint pass parses each conduit at most once) follows every reference's landings name by name. A file no graph holds falls back to the path reading, and a specifier that resolves to no file keeps the shape-only judgment. Two ELDA checks live outside the linter by construction:

- **`surface ⊆ consumers` (SURFACE.4)** is whole-project reachability from the runtime roots; it belongs to [knip](https://knip.dev) (entries = composition roots + server + tooling) and runs as a separate advisory pass, because an unconsumed export is a review signal rather than a violation.
- **The cycle audit (CHANNEL.5)** - every cross-domain reference cycle encloses a settling element - is a whole-graph property, and its finding half is machine-held: the scan closes the landed value flows into strongly connected components ([graph.use-cases.js](./core/graph.use-cases.js)) and reports every reference cycle, graded by the widest boundary it crosses, with the cross-domain class as the gating subject. A cycle built of legal edges is invisible to every per-file rule, because no file in it is at fault. Whether a given cycle settles is a value-level property no static pass decides, so the cycle reports and the reviewer names the settling element that encloses it (META.3). The pass informs and does not gate: `elda-viz` counts the cycles, paints the edges that close each one, raises a whole cycle from the drawer, and the selftest holds the pass to a deliberate cycle in the fixture ([../TODO.md](../TODO.md)).

`no-mutable-surface` likewise checks only the decidable slice of CHANNEL.4 (a live mutable binding on a module edge); whether a producer mutates an object after publishing it needs type- and flow-information a per-file linter does not have, and stays with review.

## Proving the gate bites

```
npm test          # regenerate the presets, then assert every rule fires
npm run selftest  # the assertion on its own; --list prints what each rule reported
```

A lint host runs a plugin's rules in a sandbox and swallows what they throw, so a rule that crashes reports nothing, and a rule that reports nothing looks exactly like a clean tree. The same silence covers a rule missing from a preset, a helper written and never wired, and an identifier used and never imported. Each of those has shipped here, and each read as alignment.

`fixtures/` holds three small apps. `default` carries one deliberate island breach per rule, named for what it breaches; `fixture-broken` is a connected app where every graph-classified rule fires on a breach a composition root reaches; `fixture-app` is fully aligned, and total silence on it is the precision gate. `selftest.mjs` runs the rules against all three outside any host, so a throw propagates instead of vanishing, and a rule that stops firing on its own violation - or fires on the aligned app - fails the check. Add the fixture breach in the same change as the rule; a rule with no fixture case is a rule nothing is watching.

## Status

oxlint's JS plugin host is **alpha**. The rules use only standard ESTree visitors (`ImportDeclaration`, `AwaitExpression`, `CallExpression`, `Program`, …) and no type information, so they sit well within the supported surface, but expect some churn until the host stabilizes.
