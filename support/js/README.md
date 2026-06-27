# @elda/oxlint-plugin

ELDA's architecture rules as an [oxlint](https://oxc.rs) plugin. Authored against the ESLint-v9
plugin API that oxlint adopted, so the same plugin runs under ESLint too. It composes into a
project's existing lint config and pass - it is not a separate linter.

The rules cite the ELDA constraint they enforce (see [../../README.md](../../README.md)).

## Rules

| Rule | Enforces |
|---|---|
| `elda/imports` | Layer + domain boundaries in one rule: inner never imports outer (constraint 1), pure core imports no domain (10), cross-domain only through the public surface (15), composition roots reach a domain's barrel + services surface only (24). A plugin reads the importing file's own domain/layer/role at lint time, so there is **no per-domain config to generate**. |
| `elda/no-async-inner` | No `async`/`await`/`try-catch` in `entities/` or `use-cases/` (constraint 7 + the Outcome model). |
| `elda/vocab-gate` | No shared-namespace writes with literal keys (`setAttribute('data-x', …)`, `dataset.x =`, `setItem`, `setProperty`) at the composition root (constraint 20 / playbook C3). |
| `elda/ambient-ownership` | A `.d.ts` outside `domains/` is an un-owned ambient-type catch-all - the type-layer `shared/` column (constraint 16). |

## Usage

Add the plugin and rules to your existing `.oxlintrc.json` (or `eslint.config.js`); they run in
your existing pass, alongside your own rules:

```json
{
  "jsPlugins": ["@elda/oxlint-plugin"],
  "rules": {
    "elda/imports": "warn",
    "elda/no-async-inner": "warn",
    "elda/vocab-gate": "warn",
    "elda/ambient-ownership": "warn"
  }
}
```

## Conventions and options

The ELDA conventions are baked in: the four layer names, `domains/` as the domain root, and
`.d.ts`-belongs-to-a-domain. Only three things vary per project, supplied as rule options (shown
with their defaults):

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

`elda/vocab-gate` accepts the same `compositionRoot` option.

## Status

oxlint's JS plugin host is **alpha**. The rules use only standard ESTree visitors
(`ImportDeclaration`, `AwaitExpression`, `CallExpression`, …) and no type information, so they sit
well within the supported surface, but expect some churn until the host stabilizes.
