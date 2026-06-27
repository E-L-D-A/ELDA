// @elda/oxlint-plugin - ELDA architecture rules as an oxlint plugin (ESLint-v9-compatible API,
// so the same plugin runs under ESLint too). Add to a project's existing config:
//
//   { "jsPlugins": ["@elda/oxlint-plugin"],
//     "rules": { "elda/imports": "warn", "elda/no-async-inner": "warn",
//                "elda/vocab-gate": "warn", "elda/ambient-ownership": "warn" } }
//
// Rules cite the ELDA constraint they enforce (ELDA/README.md). The conventions are
// baked in (layers, domains/, .d.ts ownership); only `domainAlias` / `appAlias` / `compositionRoot`
// vary per project and come from rule options, defaulting to the common `#` / `@` / `routes`.

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
  return { domain: segs[0], second: segs[1] ?? null, layer: LAYERS.includes(segs[1]) ? segs[1] : null, depth: segs.length };
}

// elda/imports - R1 (inner never imports outer), R2/constraint-15 (cross-domain only via the
// barrel), R3/constraint-24 (composition roots reach the barrel + services surface only), and
// constraint-10 (pure core imports no domain). One rule because a plugin can read the importing
// file's own role, which static no-restricted-imports cannot - so no per-domain config generation.
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
    const role = fileRole(filenameOf(context), compositionRoot);
    if (role.kind === 'other') return {};

    const check = (node, spec) => {
      const t = parseSpec(spec, domainAlias, appAlias);
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
      // role.kind === 'domain'
      if (t.domain === role.domain) {
        if (t.layer && LAYER_RANK[t.layer] > LAYER_RANK[role.layer]) {
          context.report({ node, message: `ELDA constraint 1: ${role.layer} (inner) must not import the outer layer ${t.layer}.` });
        }
      } else if (t.depth !== 1) {
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
    'no-async-inner': noAsyncInner,
    'vocab-gate': vocabGate,
    'ambient-ownership': ambientOwnership,
  },
};

export default plugin;
