# @elda/oxlint-plugin

ELDA's architecture rules as an [oxlint](https://oxc.rs) plugin. Authored against the ESLint-v9 plugin API that oxlint adopted, so the same plugin runs under ESLint too. It composes into a project's existing lint config and pass - it is not a separate linter.

The rules cite the ELDA constraint they enforce (see [../../README.md](../../README.md)).

## Rules

| Rule | Enforces |
|---|---|
| `elda/imports` | The hard layer + surface invariants in one rule: inner never imports outer (constraint 1), pure core imports no domain (10), the consumable surface (barrel) carries use-cases + vocabulary and never re-exports `services/` or `adapters/` (15), a cross-domain reference goes through that surface and not into internals (15), a barrel does not re-bundle another domain's surface (16), composition roots reach a domain's barrel + services surface only (24). Resolves `#/`-aliased **and** relative imports alike, so layer direction holds regardless of import style. A plugin reads the importing file's own domain/layer/role at lint time, so there is **no per-domain config to generate**. |
| `elda/no-service-coupling` | A service must not invoke a service in a *different unit* - constraint 14's Tier-2 "inadvisable" edge, scoped to units by constraint 25. A unit is a directory: the files co-located in it (a flat `Thing.ext` cluster, or a self-segregated `Thing/` folder of parts) are one service and import each other freely. Warn-level, and separately togglable from the structural invariants above. |
| `elda/no-async-inner` | No `async`/`await`/`try-catch` in `entities/` or `use-cases/` (constraint 7 + the Outcome model). |
| `elda/vocab-gate` | No shared-namespace writes with literal keys (`setAttribute('data-x', …)`, `dataset.x =`, `setItem`, `setProperty`) at the composition root (constraint 20 / playbook C3). |
| `elda/ambient-ownership` | A `.d.ts` outside `domains/` is an un-owned ambient-type catch-all - the type-layer `shared/` column (constraint 16). |

Imports classify by what the target *is*, not only where it sits. A **pure-data asset** (`.png`, `.woff`, `.mp4`, …) is vocabulary, so it classifies as an Entity and never reads as a service or an up-layer import. A **stylesheet** (`.css`, `.scss`, …) is code, classified by the directory it occupies like any module. Side-effect imports are never blanket-exempted: a cross-domain `import '#/other/services/x.css'` still trips constraint 15.

## Usage

Add the plugin and rules to your existing `.oxlintrc.json` (or `eslint.config.js`); they run in your existing pass, alongside your own rules:

```json
{
  "jsPlugins": ["@elda/oxlint-plugin"],
  "rules": {
    "elda/imports": "warn",
    "elda/no-service-coupling": "warn",
    "elda/no-async-inner": "warn",
    "elda/vocab-gate": "warn",
    "elda/ambient-ownership": "warn"
  }
}
```

## Preset

To skip listing every rule, extend the recommended preset. It tiers the structural invariants to `error` and the advisory smells to `warn`:

| Tier | Rules | Severity |
|---|---|---|
| Structural invariants | `imports`, `no-async-inner`, `ambient-ownership` | `error` |
| Advisory smells | `no-service-coupling`, `vocab-gate` | `warn` |

**oxlint** extends a config file by path - its `extends` is file-based and does not resolve a package name - so point at the shipped `recommended.json`:

```json
{
  "extends": ["./node_modules/@elda/oxlint-plugin/recommended.json"]
}
```

In a workspace that hoists dependencies, point at wherever the package resolves (e.g. `../../node_modules/@elda/oxlint-plugin/recommended.json`).

**ESLint** (flat config) spreads the standard preset object:

```js
import elda from '@elda/oxlint-plugin';

export default [
  elda.configs.recommended,
];
```

## Conventions and options

The ELDA conventions are baked in: the four layer names, `domains/` as the domain root, and `.d.ts`-belongs-to-a-domain. Only three things vary per project, supplied as rule options (shown with their defaults):

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

`elda/no-service-coupling` reads `domainAlias`/`appAlias`; `elda/vocab-gate` reads `compositionRoot`.

## Scope: reachability stays in knip

Every rule here is file-local - decidable from one file plus its import specifiers, which is what lets a per-file linter host it.
The one ELDA check that is **not** here is "the public surface carries no unconsumed members" (`surface ⊆ consumers`): that is whole-project reachability from the runtime roots, which a per-file linter structurally cannot do, so it belongs to [knip](https://knip.dev) (entries = composition roots + server + tooling, never the barrels).
It is also a Tier-2 *signal* (an unconsumed export is dead surface, or a capability exposed ahead of demand), so it runs as a separate advisory pass rather than a blocking rule.

## Status

oxlint's JS plugin host is **alpha**. The rules use only standard ESTree visitors (`ImportDeclaration`, `AwaitExpression`, `CallExpression`, …) and no type information, so they sit well within the supported surface, but expect some churn until the host stabilizes.
