// @elda/oxlint-plugin - ELDA architecture rules as an oxlint plugin (ESLint-v9-compatible API,
// so the same plugin runs under ESLint too). Add to a project's existing config:
//
//   { "jsPlugins": ["@elda/oxlint-plugin"],
//     "rules": { "elda/imports": "warn", "elda/no-service-coupling": "warn",
//                "elda/no-async-inner": "warn", "elda/vocab-gate": "warn",
//                "elda/ambient-ownership": "warn" } }
//
// or extend the shipped preset (see README): structural invariants as errors, smells as warnings.
// Rules cite the ELDA constraint they enforce (ELDA/README.md). The conventions are baked in (layers,
// domains/, .d.ts ownership); only `domainAlias` / `appAlias` / `compositionRoot` vary per project and
// come from rule options, defaulting to the common `#` / `@` / `routes`.

const LAYERS = ['entities', 'use-cases', 'adapters', 'services'];
const LAYER_RANK = { entities: 0, 'use-cases': 1, adapters: 2, services: 3 };

const norm = (p) => String(p ?? '').replace(/\\/g, '/');
const filenameOf = (context) => norm(context.filename ?? (context.getFilename && context.getFilename()) ?? '');

function options(context) {
  const o = (context.options && context.options[0]) || {};
  return {
    domainAlias: o.domainAlias ?? '#',
    appAlias: o.appAlias ?? '@',
    compositionRoot: o.compositionRoot ?? 'routes',
  };
}

// Where does the current file sit in the ELDA structure?
function fileRole(filename, compositionRoot) {
  const m = filename.match(/\/domains\/([^/]+)\/(entities|use-cases|adapters|services)\//);
  if (m) return { kind: 'domain', domain: m[1], layer: m[2] };
  const barrel = filename.match(/\/domains\/([^/]+)\/index\.[tj]sx?$/);
  if (barrel) return { kind: 'barrel', domain: barrel[1] };
  if (new RegExp(`/${compositionRoot}/`).test(filename)) return { kind: 'composition-root' };
  if (/\/core\//.test(filename)) return { kind: 'core' };
  return { kind: 'other' };
}

// Parse a `#/...` or `@/domains/...` import specifier into the domain it targets, or null for
// anything that isn't a cross-surface alias import (relative paths, bare packages, `@/core`, ...).
function parseSpec(spec, domainAlias, appAlias) {
  if (typeof spec !== 'string') return null;
  let rest = null;
  if (spec.startsWith(domainAlias + '/')) rest = spec.slice(domainAlias.length + 1);
  else if (spec.startsWith(appAlias + '/domains/')) rest = spec.slice((appAlias + '/domains/').length);
  if (rest == null) return null;
  const segs = rest.split('/').filter(Boolean);
  if (segs.length === 0) return null;
  return { domain: segs[0], second: segs[1] ?? null, layer: LAYERS.includes(segs[1]) ? segs[1] : null, depth: segs.length, path: segs.slice(1).join('/') };
}

// Resolve a relative import (`./x`, `../x`) against the importing file's path, then read off the same
// { domain, layer, depth } shape parseSpec yields - so the layer + cross-domain rules apply to
// relative imports too, not only `#/`-aliased ones. Returns null when it resolves outside domains/.
function posixResolve(dir, spec) {
  const out = [];
  for (const p of (dir + '/' + spec).split('/')) {
    if (p === '' || p === '.') continue;
    else if (p === '..') out.pop();
    else out.push(p);
  }
  return '/' + out.join('/');
}

function relativeTarget(filename, spec) {
  if (typeof spec !== 'string' || !(spec.startsWith('./') || spec.startsWith('../'))) return null;
  const resolved = posixResolve(filename.slice(0, filename.lastIndexOf('/')), spec);
  const m = resolved.match(/\/domains\/(.+)$/);
  if (!m) return null;
  const segs = m[1].split('/').filter(Boolean);
  if (segs.length === 0) return null;
  return { domain: segs[0], second: segs[1] ?? null, layer: LAYERS.includes(segs[1]) ? segs[1] : null, depth: segs.length, path: segs.slice(1).join('/') };
}

// Pure-data assets (images, fonts, media) carry no behaviour, structure, or side-effect; importing
// one yields a value. That is vocabulary, so they classify as `entities` (rank 0): importable from any
// layer, never a service, still surface-gated across domains by constraint 15. Stylesheets are
// deliberately NOT here - CSS/SCSS/etc. are code (they compose through ports like headless UI, scope
// to a boundary like shadow DOM, and layer internally like BEM), so they classify by directory like
// any module and every rule applies to them.
const DATA_RE = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)(\?.*)?$/i;

function targetOf(filename, spec, domainAlias, appAlias) {
  const t = parseSpec(spec, domainAlias, appAlias) ?? relativeTarget(filename, spec);
  if (t && typeof spec === 'string' && DATA_RE.test(spec)) t.layer = 'entities';
  return t;
}

// elda/imports - the hard, decidable layer + surface invariants (Tier-1):
//   constraint 1  an inner layer never imports an outer one (via alias AND relative paths);
//   constraint 10 pure core depends on nothing in any domain;
//   constraint 15 the consumable surface (barrel) carries use-cases + vocabulary and not services/
//                 adapters, and a cross-domain reference goes through it, not into internals;
//   constraint 16 a barrel does not re-bundle another domain's surface;
//   constraint 24 composition roots reach the barrel or the services surface only.
// One rule because a plugin reads the importing file's own role, which static no-restricted-imports
// cannot. The "inadvisable" service<->service smell is a separate warn-level rule (no-service-coupling).
const imports = {
  meta: {
    schema: [{
      type: 'object',
      properties: {
        domainAlias: { type: 'string' },
        appAlias: { type: 'string' },
        compositionRoot: { type: 'string' },
      },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { domainAlias, appAlias, compositionRoot } = options(context);
    const filename = filenameOf(context);
    const role = fileRole(filename, compositionRoot);
    if (role.kind === 'other') return {};

    const check = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      if (!t) return;

      if (role.kind === 'core') {
        context.report({ node, message: 'ELDA constraint 10: pure core depends on nothing in any domain.' });
        return;
      }
      if (role.kind === 'composition-root') {
        if (t.depth !== 1 && t.second !== 'services') {
          context.report({ node, message: `ELDA constraint 24: composition roots consume a domain's published surface (its barrel or services), not its ${t.layer ?? 'internals'}.` });
        }
        return;
      }
      if (role.kind === 'barrel') {
        // The bare-barrel surface is the consumable one - use-cases + vocabulary (entities). Services
        // and adapters are the composition surface, reached only at `<domain>/services` by the
        // composition root (constraint 15). Re-exporting another domain re-bundles its vocabulary
        // (constraint 16).
        if (t.domain !== role.domain) {
          context.report({ node, message: `ELDA constraint 16: a domain barrel must not re-bundle another domain's surface (${domainAlias}/${t.domain}); reference foreign vocabulary at the point of use, not by republishing it.` });
        } else if (t.layer === 'services' || t.layer === 'adapters') {
          context.report({ node, message: `ELDA constraint 15: the consumable surface (barrel) carries use-cases + vocabulary; '${t.layer}' belongs to the runtime-composition surface (${domainAlias}/${role.domain}/services), reached only by the composition root.` });
        }
        return;
      }
      // role.kind === 'domain'
      if (t.domain === role.domain) {
        if (t.layer && LAYER_RANK[t.layer] > LAYER_RANK[role.layer]) {
          context.report({ node, message: `ELDA constraint 1: ${role.layer} (inner) must not import the outer layer ${t.layer}.` });
        }
      } else if (t.depth !== 1) {
        // Cross-domain reference must use the public barrel, not reach into internals. The bare
        // barrel (depth 1 = the consumable use-cases + vocabulary surface) is allowed.
        context.report({ node, message: `ELDA constraint 15: reference domain '${t.domain}' through its public surface (${domainAlias}/${t.domain}), not its internals.` });
      }
    };

    return {
      ImportDeclaration: (node) => node.source && check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => node.source && check(node, node.source.value),
      ImportExpression: (node) => node.source && node.source.type === 'Literal' && check(node, node.source.value),
    };
  },
};

// elda/no-service-coupling - constraint 14 as a Tier-2 "inadvisable dependency" (the red arrows in
// ELDA-Layers): a service should not invoke a sibling service. Compose them at the runtime root via a
// named port, or lift the shared behaviour into a use-case. Warn-level - a smell, not a hard breach -
// and separately togglable from the structural invariants in elda/imports.
const noServiceCoupling = {
  create(context) {
    const { domainAlias, appAlias } = options(context);
    const filename = filenameOf(context);
    const m = filename.match(/\/domains\/([^/]+)\/(services\/.*)$/);
    if (!m) return {};
    const domain = m[1];
    // A unit is a directory. Files co-located in the same directory - a flat `X.tsx` + `X.css` cluster
    // or a self-segregated `X/ui.tsx` + `X/helpers.ts` folder - are one unit and import each other
    // freely; co-location is ELDA's core structure. The smell is a service invoking a *different*
    // service unit. To draw a boundary between two services, give each its own directory.
    const dir = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(0, i); };
    const importerDir = dir(m[2]);
    const flag = (node, spec) => {
      const t = targetOf(filename, spec, domainAlias, appAlias);
      if (!t || t.domain !== domain || t.layer !== 'services' || t.depth <= 1) return;
      if (dir(t.path) === importerDir) return; // same directory = same unit, co-located imports are free
      context.report({ node, message: `ELDA constraint 14 (inadvisable): service unit '${importerDir}' invokes a different service unit '${dir(t.path)}' in '${domain}'; supply it as a named port from the composition root, or lift the shared logic into a use-case.` });
    };
    return {
      ImportDeclaration: (node) => node.source && flag(node, node.source.value),
      ImportExpression: (node) => node.source && node.source.type === 'Literal' && flag(node, node.source.value),
    };
  },
};

// elda/no-async-inner - constraint 7 + the Outcome model: async / await / try-catch stay out of the
// inner layers (wrapped at adapters as generators; outcomes are typed branch values).
const noAsyncInner = {
  create(context) {
    if (!/\/domains\/[^/]+\/(entities|use-cases)\//.test(filenameOf(context))) return {};
    const reportAsync = (node) => node.async && context.report({ node, message: 'ELDA constraint 7: async functions are not permitted in entities/use-cases.' });
    return {
      AwaitExpression: (node) => context.report({ node, message: 'ELDA constraint 7: await is not permitted in entities/use-cases; wrap async at the adapters layer.' }),
      ForOfStatement: (node) => node.await && context.report({ node, message: 'ELDA constraint 7: for-await is not permitted in entities/use-cases.' }),
      TryStatement: (node) => context.report({ node, message: 'ELDA (Outcome model): try/catch is not permitted in entities/use-cases; outcomes flow as typed branch values.' }),
      FunctionDeclaration: reportAsync,
      FunctionExpression: reportAsync,
      ArrowFunctionExpression: reportAsync,
    };
  },
};

// elda/vocab-gate - constraint 20 / playbook C3: shared-namespace writes with literal keys at the
// integration surface (the composition root) introduce out-of-band vocabulary.
const vocabGate = {
  meta: {
    schema: [{
      type: 'object',
      properties: { compositionRoot: { type: 'string' } },
      additionalProperties: false,
    }],
  },
  create(context) {
    const { compositionRoot } = options(context);
    if (!new RegExp(`/${compositionRoot}/`).test(filenameOf(context))) return {};
    const isStr = (n) => n && n.type === 'Literal' && typeof n.value === 'string';
    return {
      CallExpression(node) {
        const c = node.callee;
        if (c && c.type === 'MemberExpression' && c.property && c.property.type === 'Identifier') {
          const m = c.property.name;
          if ((m === 'setAttribute' || m === 'setItem' || m === 'setProperty') && isStr(node.arguments && node.arguments[0])) {
            context.report({ node, message: `ELDA constraint 20: shared-namespace write ${m}('${node.arguments[0].value}', ...) at the integration surface; route it through the owner's binding surface (playbook C3).` });
          }
        }
      },
      AssignmentExpression(node) {
        const l = node.left;
        if (l && l.type === 'MemberExpression' && l.object && l.object.type === 'MemberExpression' && l.object.property && l.object.property.name === 'dataset') {
          context.report({ node, message: 'ELDA constraint 20: dataset write at the integration surface; identity vocabulary belongs to its owner (playbook C3).' });
        }
      },
    };
  },
};

// elda/ambient-ownership - constraint 16: ambient declarations are vocabulary, owned by a domain.
// A .d.ts outside src/domains/ is an un-owned catch-all (the type-layer `shared/` column).
const ambientOwnership = {
  create(context) {
    const f = filenameOf(context);
    if (!(f.endsWith('.d.ts') && !f.includes('/domains/'))) return {};
    return {
      Program: (node) => context.report({ node, message: 'ELDA constraint 16: ambient declarations belong co-located in the owning domain (src/domains/<x>/), not a root or shared .d.ts catch-all.' }),
    };
  },
};

const plugin = {
  meta: { name: 'elda' },
  rules: {
    'imports': imports,
    'no-service-coupling': noServiceCoupling,
    'no-async-inner': noAsyncInner,
    'vocab-gate': vocabGate,
    'ambient-ownership': ambientOwnership,
  },
};

// Preset for ESLint flat-config consumers: `extends: [eldaPlugin.configs.recommended]`. oxlint's
// `extends` is file-based and does not read a plugin's `configs`, so oxlint users extend the shipped
// `recommended.json` by path instead (see README). Both encode the same tiering: structural
// invariants as errors, the inadvisable / integration smells as warnings.
plugin.configs = {
  recommended: {
    plugins: { elda: plugin },
    rules: {
      'elda/imports': 'error',
      'elda/no-async-inner': 'error',
      'elda/ambient-ownership': 'error',
      'elda/no-service-coupling': 'warn',
      'elda/vocab-gate': 'warn',
    },
  },
};

export default plugin;
