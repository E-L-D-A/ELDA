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
    "elda/no-axiom-state": "warn",
    "elda/ambient-ownership": "warn",
    "elda/no-service-coupling": "warn",
    "elda/no-harness-coupling": "warn",
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
| `no-surface-declarations` | [SURFACE.2][surface], [OWNER.2][owner] | A value declared on a surface file (a function, a `const`, a default export) rather than re-exported from the layer file that owns it. A surface curates and holds no layer of its own, so a binding declared there has no layer and no owner, and every geometry rule bails on it: that makes a barrel the cheapest laundering path in the system, since wrapping a flow in a locally-declared function silences every reference through it. `export { foo }` over an imported `foo` keeps its module request and stays curation; types and interfaces are vocabulary and pass. A core file carrying a surface is judged the same way, and a whole domain living in one file reports with its own remedy: the layer suffix its contents hold, or extraction into layer files behind the surface. |
| `no-self-surface` | [LAYER.1][layer], [SURFACE.3][surface] | A file importing its own (sub)domain's surface - the barrel or a named surface - from inside it. A surface is a domain's face to its *consumers*, and a domain is not a consumer of itself. This is `no-surface-declarations` seen from the taking side, and it is the sharper of the two: the consumable surface legally carries flows, so an `axioms` or `flows` file that imports its own barrel takes an outer-layer binding through a hop that carries no layer, and LAYER.1 - reading the specifier, which names a surface - passes it. The landing walk leaves the gap open too, since it grades landings *below* the consumer's layer while this inversion lands above. Import the file that owns the binding. |
| `no-diagonal-reach` (+ `no-diagonal-reach-gate`) | [SURFACE.5][surface] | A value reference whose binding *lands* below the consumer's own layer across any name. One check, graded by whose contract the landing crossed, through three tri-state options (`'error' \| 'warn' \| 'off'`): `withinSubdomain` (no surface crossed at all, a sibling unit; default `warn`), `acrossSubdomains` (a surface the domain itself declared, at any nesting depth; default `warn`), `acrossDomains` (a foreign owner's surface; default `error`). The gradient is one of ownership regime, so it reads the same at every depth: the levels between a deep importer and its target are the importer's own ancestors, and how far a value laundered rides each finding as the landed-via chain instead of grading it. The lint host binds one level per rule ID, so the mapping is realized as a preset-managed pair sharing one implementation and one option map: `no-diagonal-reach` (configured `warn`) reports the classes mapped `warn`, `no-diagonal-reach-gate` (configured `error`) reports the classes mapped `error` - a partition, nothing reports twice, and the pair travels together. The walk (`core/services/walk.js`) follows every import name by name to its landing: surfaces are transparent (curation without a layer, so a barrel cannot launder a diagonal), while a layer-bearing file is a terminus - a named re-export there *adopts* the binding at that file's own layer, the spec's legal seam, and the adopting file's own edges are judged per-file. Equal-layer crossings keep their own semantics (the flow and axiom rows cross freely; the outer rows are the OWNER.5 laterals); within one subdomain the bare layer files are the shared base and the bare `services` composer is exempt; type-only imports are vocabulary references and pass. Fix by renaming the target into the consuming unit, promoting it to the bare layer file, or adopting it at the consuming unit's own matching layer. |
| `no-async-inner` | [LAYER.4][layer] | `async` functions, `await`, `for await`, and `try`/`catch` inside `axioms/` or `flows/`; those shapes are wrapped at Harnesses into channel-conforming values. |
| `no-axiom-state` | [LAYER.4][layer] | A module-level `let`/`var` in an axioms file, exported or private behind an accessor: axioms hold pure domain invariants and own no state, so a mutable binding there is state in the one layer that holds only invariants. The decidable slice is the binding itself; whether a `const` collection is mutated stays with review, the same split `no-mutable-surface` declares. |
| `no-mutable-surface` | [CHANNEL.4][channel] | `export let` / `export var` (directly, or exporting a top-level `let` by name) anywhere in domain code: a live mutable binding shared by reference is shared state, never published state. |
| `ambient-ownership` | [OWNER.2][owner] | A `.d.ts` outside the ownership tree and every declared core: ambient declarations are vocabulary and co-locate with their owning domain. |
| `no-service-coupling` | [OWNER.5][owner] | A service unit importing or re-exporting a different service unit of its own subdomain, or mounting a peer domain's block at its runtime-composition surface (the diagrams' red "inadvisable" arrows at the Services row); compose at the root via a slot port, or lift the shared logic into a flow. A unit is the files sharing one name, so two names at one subdomain root are two units; type-only imports are vocabulary references and pass; the subdomain's own composer (the bare `services` file) is exempt for the units it owns. |
| `no-harness-coupling` | [OWNER.5][owner] | An harness unit importing or re-exporting a different harness unit (the diagrams' red "inadvisable" arrows at the Harnesses row); let the layer above compose the two bindings, or co-locate them into one unit (a shared name). Same unit semantics as `no-service-coupling`. |
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

`appDir` is the app workspace - the directory carrying the `.oxlintrc.json` that declares the app's composition roots, with everything else derived from the resolver config and the tree's shape - and defaults to the working directory. The default mode serves a live page at `localhost:5813`; `--out` writes a self-contained HTML snapshot instead.

Each domain draws as a box: its subdomains grouped into columns, every file in its layer x unit cell, each composition root a strip across the top, the bare composer capping its (sub)domain as a band and the bare axioms file underlying it as the shared base. A discovered core draws as a domain block of its own, first on the board and tagged *shared*, since core modules are domains at the bottom of the sharedness order; a whole domain living in one file draws as its surface over an obscured cake until its contents earn layer files, and a file whose tree claim the graph contradicts draws in its claimed cell with a dashed outline. Every arrow carries the linter's own judgment: a violation draws solid red, an OWNER.5 mounting dashed red (the diagrams' "inadvisable" arrows), an edge closing a reference cycle violet, a type-only reference a weak dash, and a legal dependency stays grey. An arrow that looks wrong while it stays grey is the review signal for a rule that does not exist yet.

Hovering a file traces its edges (blue for what it depends on, green for what depends on it), clicking pins the trace, a middle-click banishes a file to its domain's shelf, and the bottom bar hides whole blocks. The **reach** toggle turns that trace into the transitive closure: everything the file pulls in, everything that breaks when it changes, faded by hop distance, with both counts on the hover. It walks the edges the board is drawing, so the reach you read is the reach of the graph in front of you.

Clicking a domain's title **folds** it: the box gives up its unit columns and keeps its rows, so each layer draws one aggregate chip standing for every file it holds, and the two bands keep their places. Every reference crossing a folded boundary bundles into one arrow carrying the count and the worst verdict among them, and listing them on hover. The layer geometry survives the fold, which is the point: an equal-layer crossing still runs along its row and a diagonal still reads as one, because a reference's meaning is the layer it crosses. **Fold all** sits in the bottom bar beside the domain list it acts on, and folding everything but the domain under review is where reading a tree you did not write begins.

The drawer lists every verdict, every laundered finding, every contested placement, every surface owning unextracted declarations, every reference cycle, every slicing-pressure cluster (imports climbing the layer order between siblings) and every re-slice recommendation (legal downward imports crossing into siblings toward the shared base, drawn in their own colour - the two halves of the spec's re-slice indicator), every unresolved specifier, every file the classifier could not place, and every file **unreachable from any composition root**. Reachability is the closure of the roots over the reference graph, so an unreachable file is one that ships to nobody: dead weight, or a capability deliberately ahead of its demand. The spec reads that as a review signal rather than a fault, so it counts in the header beside the violations and gates nothing. Clicking a finding pins it on the board and opens the domain it is folded into; clicking its path opens the file in the editor.

The served page rescans on every change under `src/` and swaps the graph in place, keeping the pin, the folds, the drawer and the scroll where they were. A dropped connection comes back on its own, and a restarted CLI is caught up on reconnect, since it rescanned the tree while nothing was listening; clicking the ELDA mark asks for that reconnection at once. The page reloads outright only when the viewer it is running has itself changed, which the server stamps and the page notices, so an edit to the viewer - its shell or any of its modules - reaches every open page and nothing else costs you your place.

### The landings pass

The walk behind those landings is `core/services/walk.js`: an import is followed name by name through barrels and named surfaces to the file that owns or adopts it, so a barrel import fans out only to the bindings the consumer really takes, and a layer-bearing file's named re-export ends the walk as an adoption at its own layer (the spec's re-ownership section). It is the same walk the `no-diagonal-reach` family enforces with - the linter is this logic's primary consumer, and the diagram is its projection. On top of the shared walk the scan inherits each authored hop's verdict along the chain, judges clean-hop landings with the geometry verdicts (`landedVerdict`, the OWNER.5 laterals), and marks a fresh verdict as **laundered** in the issues drawer with the hop chain and the landed names. With surfaces expunged (the default view), the drawn arrows are these landings.

## Presets by grade

The spec grades a project by which rule registers its gate holds ([README](../../README.md), "Grades of alignment"). The plugin ships a preset per machine-holdable state; the governed grade is operator practice on top of these (the reachability pass and the scheduled audits under Scope below).

| Preset | Invariants (`imports`, `no-surface-declarations`, `no-self-surface`, `no-async-inner`, `no-mutable-surface`, `no-axiom-state`, `ambient-ownership`) | Graded smells (`no-service-coupling`, `no-harness-coupling`, `no-dishonest-placement`, `no-penetration`, `no-deep-side-effects`, `vocab-gate`) | Diagonal class map (`acrossDomains` / `acrossSubdomains` / `withinSubdomain`) | Holds |
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

A file name reads right to left as `<name>.<layer>.<marker>…`: the layer is the rightmost dot-segment naming one (`axioms`, `flows`, `harnesses`, `services`), everything left of it is the unit's name, and everything right of it is markers. A marker is a colouring orthogonal to the layer axis - a runtime context (`.server`), a build convention (`.css` for a vanilla-extract module), a tooling suffix (`.stories`, `.spec`) - and there may be any number of them under any name, because the model does not enumerate them. It must not: an enumerated list fails *open*, so a marker the list has not been told about leaves the layer unmatched, silently demotes a layer file to a surface with no layer at all, and takes every layer rule off it. Reading right to left is also what keeps `services.harnesses.css.ts` decidable (unit `services`, layer `harnesses`, marker `.css`), where reading left to right would take `services` for the layer and lose the file.

A dotted name whose segments include no layer token is a **failed layer claim** (`cart.entities.ts` after a rename, `widget.spec.ts`, `foo.controller.ts`), and it classifies as **unsorted**: held in the domain its directories place it in, drawn in the diagram's unsorted band below services, and judged by nothing - every rule declines it, and a reference into one carries no target to grade. A clean plain name stays a named surface, exactly as the spec reads it. The band is what lets any codebase render and run under the gate without conforming first: the classified subset is judged in full, the unsorted band is the migration worklist, and nothing masquerades as a surface it never claimed to be. A directory declaring no areas at all still scans - the root renders as it is, files and edges, so the diagram works on day zero.

A unit - one concern-part - is the files sharing one name: `back-nav.harnesses.tsx` and `back-nav.harnesses.css` are one unit, and two names are two units. At a subdomain's root, `index` is the consumable barrel, the `services` file doubles as the runtime-composition surface, and any other plain name is a named surface. `.d.ts` belongs to a domain.

A unit may take a directory of its own. `back-nav/` holding `back-nav.axioms.ts`, `back-nav.flows.ts` and `back-nav.services.tsx` is a **unit directory**: transparent, carrying no boundary, its files still units of the enclosing subdomain, reading that subdomain's shared base like any other unit. A subdomain of twenty flat files can be read at a glance for the price of nothing, and only declaring a boundary costs what a boundary costs.

The files keep their name inside their own directory because a transparent node states nothing, so the file has to carry its whole identity - and the bare form is taken in any case, since `back-nav/axioms.ts` already names the shared base of the *subdomain* `back-nav`. That gives the two shapes one rename between them: drop the repeated prefix and add a surface, and the grouping node becomes a declared subdomain under the full ruleset; restore the prefix and delete the surface, and it goes back to being a folder. The directory never moves, and the relative imports inside it do not change.
One decidability note: a specifier's trailing plain segment does not say which thing it names, since `#/checkout/payment` is either a named surface of `checkout` or the `payment` subdomain's barrel. The filesystem does say, so the rules resolve a specifier to the file it means before judging it, and each reference is read once as that file. A specifier that resolves to no file keeps the shape-only reading, which accepts the reference when either meaning is legal, so a broken path never manufactures a finding - and a composition root's landing walk reports that same unresolvable path in its own right, so the silence is covered.

One thing varies per project and is declared: which entries the app composes at, since neither the tree's shape nor the resolver records it. Everything else derives. The app root is the directory carrying the `.oxlintrc.json`, and every path is app-root-relative:

```json
{
  "rules": {
    "elda/imports": ["warn", { "compositionRoot": ["src/routes", "server", "vite.config.ts"] }]
  }
}
```

- `compositionRoot` - the directories or single modules holding composition roots (a route tree, server handlers, a build config). A string or a list: an app composes at several entries, and each is a root under the full ROOT ruleset.

The rest is read off what the project already declares elsewhere, so the same fact never has two owners:

- **Aliases** come from the resolver's own config: `compilerOptions.paths` in the nearest `tsconfig.json` / `jsconfig.json` (the `extends` chain is followed; the nearest `paths` wins whole, anchored at its declaring config's `baseUrl` or directory), with package.json `imports` filling aliases tsconfig did not claim. The lint agrees with the bundler by construction, and a hand-copied map that could drift no longer exists.
- **The ownership tree** is discovered. An alias targeting a domain forest is the strongest signal - it is the ownership spelling the code already uses, its path remainder the domain chain (`#/env/inject.services` names `env` in one spelling) - and an alias target that is an ancestor of another candidate is the wrapper spelling, dropped. Without such an alias the shape decides, walking down from the app root: two or more domain trees side by side make their parent the forest, one domain tree beside a floor is the forest with its floor, and a lone tree with nothing beside it is a wrapper to descend through. Two forests with stray code between them is a real ambiguity, reported, never guessed at.
- **Cores** are the floors: directories layered at their own crown (bare layer rows or layer-suffixed files directly inside), sitting beside the forest or on the wrapper path above it. A floor's contents classify as top-level shared domains beside the feature domains, and the placement stays a claim like any other - adjudicated on core's own properties, dependency-freedom (ROOT.6) and sharedness, with the disagreement reported by `no-dishonest-placement`. A reference into core is judged directionally: reading at or below one's own layer is free, and the upward reference is an inversion. A shared directory that speaks no layer grammar at its crown claims nothing, and its files are classified by the graph alone.
- **The scan's bounds** are the declarations that already exist for other reasons: the config's `ignorePatterns` and the tree's `.gitignore` (build output can spell layer-looking chunk names, and the tree already declares its scratch there).

One claim lives in code rather than in the config: a serialization handoff is declared by the module that performs it, with a directive comment.

```js
// @elda-import:viewer/*
const viewerDir = join(dirname(fileURLToPath(import.meta.url)), 'viewer');
```

The directive is an import the language cannot spell: the module consumes the matched files as source (a shipped page, a worker bundle) and another runtime composes them, so no import statement can carry the reach. The pattern resolves against the module's own directory, and a trailing `/*` takes the whole subtree. Each match becomes an `embeds` edge: it grants reachability and draws as dataflow (the diagram's "serialized handoff"); it takes no reference judgment, since no binding crosses a runtime boundary (ROOT.5); and it attributes no ownership - each match keeps its own tree claim, and the shipped files' internal edges are judged like any other. The directive sits beside the code that reads the files, so moving or deleting that code moves or retires the claim with it; a directive whose pattern matches nothing warns as a stale claim.

Its companion `@elda-entry` names where the other runtime enters the shipped files. It annotates the next statement's string literal - the one specifier the shipped page really imports - so the value carries the claim and no comment-side copy can drift from it:

```js
// @elda-entry
const ENTRY = './viewer/services/index.js';
```

An entry sharpens its host's fan: reach then flows through the entry's own imports rather than through every shipped byte, the entry's handoff draws solid above the dashed fan, and a shipped file no entry composes surfaces as dead bundle weight - its bytes travel and nothing runs them - reported the way every unreached file is (SURFACE.4, a review signal). A host that declares no entry keeps the blanket fan. An entry naming a file the host's `@elda-import` does not ship warns as a stale claim.

`elda/no-service-coupling`, `elda/no-harness-coupling`, `elda/no-self-surface`, `elda/no-surface-declarations`, `elda/no-axiom-state`, and `elda/no-deep-side-effects` read the same options as `imports`; `elda/vocab-gate` reads `compositionRoot`. The `no-diagonal-reach` pair reads all of them plus its class map (`acrossDomains`/`acrossSubdomains`/`withinSubdomain`, each `'error' | 'warn' | 'off'`; defaults `error`/`warn`/`warn`) - set the same map on both entries of the pair.

## Scope: what stays outside a per-file linter

A rule judges the file in front of it against the app's one resolved graph: the same scan the diagram draws is built once per app and cached across the per-file passes, a file's role comes from surface ownership over the resolved edges reconciled with the tree's claim, and the walk (`core/services/walk.js`, mtime-cached, so a lint pass parses each conduit at most once) follows every reference's landings name by name. A file no graph holds falls back to the path reading, and a specifier that resolves to no file keeps the shape-only judgment. Two ELDA checks live outside the linter by construction:

- **`surface ⊆ consumers` (SURFACE.4)** is whole-project reachability from the runtime roots; it belongs to [knip](https://knip.dev) (entries = composition roots + server + tooling) and runs as a separate advisory pass, because an unconsumed export is a review signal rather than a violation.
- **The cycle audit (CHANNEL.5)** - every cross-domain reference cycle encloses a settling element - is a whole-graph property, and its finding half is machine-held: the scan closes the landed value flows into strongly connected components ([graph.js](./core/flows/graph.js)) and reports every reference cycle, graded by the widest boundary it crosses, with the cross-domain class as the gating subject. A cycle built of legal edges is invisible to every per-file rule, because no file in it is at fault. Whether a given cycle settles is a value-level property no static pass decides, so the cycle reports and the reviewer names the settling element that encloses it (META.3). The pass informs and does not gate: `elda-viz` counts the cycles, paints the edges that close each one, raises a whole cycle from the drawer, and the selftest holds the pass to a deliberate cycle in the fixture ([../TODO.md](../TODO.md)).

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
