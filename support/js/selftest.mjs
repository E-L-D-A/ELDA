// Prove the gate bites: run every rule over the fixture tree and require each one to fire.
//
// A lint host runs a plugin's rules in a sandbox and swallows what they throw, so a rule that
// crashes reports nothing - and a rule that reports nothing is indistinguishable from a clean
// tree. The same silence covers a rule missing from a preset, a helper that was written but
// never wired, and an identifier that was used but never imported. Each of those has shipped
// here at least once, and each looked exactly like alignment.
//
// So the rules are exercised directly, outside any host: a throw propagates, and a rule that
// stops firing on its own fixture violation fails this check. `fixture/` holds one deliberate
// breach per rule, named for what it breaches.
//
//   node selftest.mjs          assert every rule fires
//   node selftest.mjs --list   print what each rule reported
import { readdirSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';

import plugin from './index.js';
import { norm } from './model.js';
import { buildGraph } from './scan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = norm(join(HERE, 'fixture'));
const OPTIONS = { domainAlias: '#', appAlias: '@', compositionRoot: 'routes', core: 'core' };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield norm(full);
  }
}

// A minimal ESTree host: build the rule's visitors, then walk the parsed program and call them.
// The visitor set is exactly what the real host calls, so this exercises the shipped code path.
function run(rule, file, code) {
  const reports = [];
  const visitors = rule.create({
    filename: file,
    options: [OPTIONS],
    report: (r) => reports.push(String(r.message ?? '')),
  });
  const ast = parseSync(file, code).program;
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (typeof node.type === 'string' && visitors[node.type]) visitors[node.type](node);
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) for (const el of v) visit(el);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(ast);
  return reports;
}

const files = [...walk(FIXTURE)].filter((f) => /\.(tsx?|jsx?)$/.test(f));
const fired = new Map(Object.keys(plugin.rules).map((id) => [id, []]));
const threw = [];

for (const [id, rule] of Object.entries(plugin.rules)) {
  for (const file of files) {
    let out;
    try {
      out = run(rule, file, readFileSync(file, 'utf8'));
    } catch (e) {
      threw.push(`${id} threw on ${file.slice(FIXTURE.length + 1)}: ${e.message}`);
      continue;
    }
    for (const msg of out) fired.get(id).push({ file: file.slice(FIXTURE.length + 1), msg });
  }
}

const list = process.argv.includes('--list');
const silent = [...fired].filter(([, hits]) => hits.length === 0).map(([id]) => id);

for (const [id, hits] of fired) {
  const mark = hits.length ? 'fires' : 'SILENT';
  console.log(`${mark.padStart(6)}  ${id.padEnd(26)} ${hits.length}`);
  if (list) for (const h of hits) console.log(`          ${h.file}\n            ${h.msg.slice(0, 120)}`);
}

// ---------------------------------------------------------------------------
// The whole-graph pass, held to the same bar.
//
// The fixture's two `cycle` units close a reference cycle across two domains, and every edge in it
// is legal read on its own: an equal-rank use-case crossing through a public surface, which is what
// a surface is for. No file in the cycle is at fault, so no per-file rule can see it, and the cycle
// is what the graph pass exists to catch.
//
// Both halves of that claim are checked here. A silent pass is the same failure as a silent rule,
// and a per-file rule reporting on a cycle file would mean the finding is decidable from one file
// after all, leaving the pass unproven on its own fixture.
const CYCLE = ['src/domains/cart/cycle.use-cases.ts', 'src/domains/orders/cycle.use-cases.ts'];

const graph = buildGraph(FIXTURE);
const gated = graph.cycles.filter((c) => c.gate);
const inCycle = new Set(gated.flatMap((c) => c.files.map((id) => graph.files[id].path)));
const unseen = CYCLE.filter((p) => !inCycle.has(p));
const decidable = [...fired].flatMap(([id, hits]) => hits.filter((h) => CYCLE.includes(h.file)).map((h) => `${id} on ${h.file}`));

console.log(`${(gated.length ? 'fires' : 'SILENT').padStart(6)}  ${'cycles (graph pass)'.padEnd(26)} ${graph.cycles.length}`);
if (list) {
  for (const c of graph.cycles) {
    console.log(`          ${c.scope}${c.gate ? ' (Gate 1)' : ''}`);
    for (const id of c.files) console.log(`            ${graph.files[id].path}`);
  }
}

if (threw.length) {
  console.error(`\n${threw.length} rule(s) THREW - a host would have swallowed this and reported a clean tree:`);
  for (const t of threw) console.error(`  ${t}`);
}
if (silent.length) {
  console.error(`\n${silent.length} rule(s) SILENT on the fixture: ${silent.join(', ')}`);
  console.error('Either the rule is broken, or its fixture violation is missing. Both are failures.');
}
if (unseen.length) {
  console.error(`\nThe graph pass missed the fixture's cross-domain cycle: ${unseen.join(', ')}`);
  console.error('Either the pass is broken, or the cycle was broken by an edit. Both are failures.');
}
if (decidable.length) {
  console.error(`\nA per-file rule reports on the cycle, so it no longer proves the graph pass: ${decidable.join(', ')}`);
  console.error('The cycle must be legal edge by edge; give the rule its own fixture violation and restore this one.');
}
if (threw.length || silent.length || unseen.length || decidable.length) process.exit(1);
console.log(`\nAll ${fired.size} rules fire on the fixture, and the graph pass holds its cycle.`);
