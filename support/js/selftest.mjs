// Prove the gate bites: run every rule over the fixtures and require each one to fire where its breach lives, and only there.
//
// A lint host runs a plugin's rules in a sandbox and swallows what they throw, so a rule that
// crashes reports nothing - and a rule that reports nothing is indistinguishable from a clean
// tree. The same silence covers a rule missing from a preset, a helper that was written but
// never wired, and an identifier that was used but never imported. Each of those has shipped
// here at least once, and each looked exactly like alignment.
//
// So the rules are exercised directly, outside any host, over three fixtures:
//   fixtures/default        the per-rule bag - one deliberate breach per rule, most of them
//                           deliberately disconnected, which the graph reads as lone domains;
//   fixtures/fixture-broken a connected app whose breaches are all reachable from its root,
//                           which is what the graph-classified rules judge;
//   fixtures/fixture-app    a green app: every rule must stay silent on it, or the
//                           classification over-fires.
// Every rule must fire somewhere across the first two, the graph-classified rules must fire on
// the connected app specifically, and a throw anywhere propagates.
//
//   node selftest.mjs          assert the coverage
//   node selftest.mjs --list   print what each rule reported
import { readdirSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';

import { scanApp } from './domains/viz/services.js';
import plugin from './index.js';

// Path normalization is this root's own glue, kept here so the test consumes the tool only through its published services.
const norm = (p) => String(p ?? '').replace(/\\/g, '/');

const HERE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const BAG = norm(join(HERE, 'default'));
const BROKEN = norm(join(HERE, 'fixture-broken'));
const GREEN = norm(join(HERE, 'fixture-app'));
const OPTIONS = { aliases: { '#': 'src/domains', '@': 'src' }, ownershipAlias: '#', compositionRoot: 'src/routes', core: 'src/core' };

// The rules that classify through the resolved graph: each needs a reachable breach, so each is held to the connected fixture.
const GRAPH_RULES = [
  'imports',
  'no-surface-declarations',
  'no-self-surface',
  'no-diagonal-reach',
  'no-diagonal-reach-gate',
  'no-service-coupling',
  'no-harness-coupling',
  'no-dishonest-placement',
  'no-deep-side-effects',
  'no-async-inner',
  'no-mutable-surface',
];

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

const threw = [];
function runAll(dir) {
  const files = [...walk(dir)].filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const fired = new Map(Object.keys(plugin.rules).map((id) => [id, []]));
  for (const [id, rule] of Object.entries(plugin.rules)) {
    for (const file of files) {
      let out;
      try {
        out = run(rule, file, readFileSync(file, 'utf8'));
      } catch (e) {
        threw.push(`${id} threw on ${file.slice(dir.length + 1)}: ${e.message}`);
        continue;
      }
      for (const msg of out) fired.get(id).push({ file: file.slice(dir.length + 1), msg });
    }
  }
  return fired;
}

const bag = runAll(BAG);
const broken = runAll(BROKEN);
const green = runAll(GREEN);

const list = process.argv.includes('--list');
for (const id of Object.keys(plugin.rules)) {
  const b = bag.get(id).length;
  const c = broken.get(id).length;
  const mark = b + c ? 'fires' : 'SILENT';
  console.log(`${mark.padStart(6)}  ${id.padEnd(26)} bag ${String(b).padStart(2)}  broken ${String(c).padStart(2)}`);
  if (list) for (const h of [...bag.get(id), ...broken.get(id)]) console.log(`          ${h.file}\n            ${h.msg.slice(0, 120)}`);
}

const silent = Object.keys(plugin.rules).filter((id) => bag.get(id).length + broken.get(id).length === 0);
const unconnected = GRAPH_RULES.filter((id) => broken.get(id).length === 0);
const overFired = Object.keys(plugin.rules).flatMap((id) => green.get(id).map((h) => `${id}: ${h.file}: ${h.msg.slice(0, 100)}`));

// ---------------------------------------------------------------------------
// The whole-graph pass, held to the same bar.
//
// The bag's two `cycle` units close a reference cycle across two domains, and every edge in it
// is legal read on its own: an equal-rank flow crossing through a public surface, which is what
// a surface is for. No file in the cycle is at fault, so no per-file rule can see it, and the cycle
// is what the graph pass exists to catch.
//
// Both halves of that claim are checked here. A silent pass is the same failure as a silent rule,
// and a per-file rule reporting on a cycle file would mean the finding is decidable from one file
// after all, leaving the pass unproven on its own fixture.
const CYCLE = ['src/domains/cart/cycle.flows.ts', 'src/domains/orders/cycle.flows.ts'];

const graph = scanApp(BAG);
const gated = graph.cycles.filter((c) => c.gate);
const inCycle = new Set(gated.flatMap((c) => c.files.map((id) => graph.files[id].path)));
const unseen = CYCLE.filter((p) => !inCycle.has(p));
const decidable = [...bag].flatMap(([id, hits]) => hits.filter((h) => CYCLE.includes(h.file)).map((h) => `${id} on ${h.file}`));

console.log(`${(gated.length ? 'fires' : 'SILENT').padStart(6)}  ${'cycles (graph pass)'.padEnd(26)} ${graph.cycles.length}`);

// The slicing-pressure pass, held to the same bar: the broken app's core carries two rank-climbing imports between sibling pieces, and the pass must gather them into one scope.
const brokenGraph = scanApp(BROKEN);
const pressured = brokenGraph.pressure ?? [];
console.log(`${(pressured.length ? 'fires' : 'SILENT').padStart(6)}  ${'slicing pressure (graph)'.padEnd(26)} ${pressured.length}`);
// The lean reading, held to the same bar: the broken core's two flows pieces both read its axioms piece downward, and the pass must gather them into one recommendation.
const recommended = brokenGraph.recommendations ?? [];
console.log(`${(recommended.length ? 'fires' : 'SILENT').padStart(6)}  ${'slicing leans (graph)'.padEnd(26)} ${recommended.length}`);
// The embed reading, held to the same bar: the green app's receipt subtree is imported by nothing and shipped by the orders service through its `@elda-import:receipt/*` directive, so both receipt files must arrive as unjudged embeds edges, every green file must reach, and no dispute may appear.
// The declared entry sharpens the fan (`@elda-entry` marks './receipt/services'), so reach must flow through the entry's own imports and still cover the subtree.
const greenGraph = scanApp(GREEN);
const shipped = greenGraph.edges.filter((e) => e.kind === 'embeds');
const embedOk =
  shipped.length === 2 &&
  shipped.every((e) => e.verdict == null) &&
  shipped.some((e) => e.entry) &&
  greenGraph.files.every((f) => f.reachable) &&
  greenGraph.files.every((f) => !f.dispute);
console.log(`${(embedOk ? 'fires' : 'SILENT').padStart(6)}  ${'embeds reach (graph)'.padEnd(26)} ${shipped.length}`);
// The dead-bundle reading, held to the same bar: the broken app ships print/* with print/services as its entry, and the stale flow is shipped with no entry composing it - the pass must flag exactly that file, with the shipping host in the reason.
const deadBundle = brokenGraph.files.filter((f) => !f.reachable && /ships with/.test(f.unreached ?? ''));
const entryOk =
  deadBundle.length === 1 &&
  deadBundle[0].path === 'src/domains/orders/print/stale.flows.ts' &&
  brokenGraph.files.find((f) => f.path === 'src/domains/orders/print/services.ts')?.reachable === true;
console.log(`${(entryOk ? 'fires' : 'SILENT').padStart(6)}  ${'entry dead-bundle (graph)'.padEnd(26)} ${deadBundle.length}`);
if (list) {
  for (const c of graph.cycles) {
    console.log(`          ${c.scope}${c.gate ? ' (gating class)' : ''}`);
    for (const id of c.files) console.log(`            ${graph.files[id].path}`);
  }
}
console.log(`${(overFired.length ? ' OVER' : 'clean').padStart(6)}  ${'green app (all rules)'.padEnd(26)} ${overFired.length}`);

if (threw.length) {
  console.error(`\n${threw.length} rule(s) THREW - a host would have swallowed this and reported a clean tree:`);
  for (const t of threw) console.error(`  ${t}`);
}
if (silent.length) {
  console.error(`\n${silent.length} rule(s) SILENT on every fixture: ${silent.join(', ')}`);
  console.error('Either the rule is broken, or its fixture breach is missing. Both are failures.');
}
if (unconnected.length) {
  console.error(`\n${unconnected.length} graph-classified rule(s) silent on the connected app: ${unconnected.join(', ')}`);
  console.error('A graph-classified rule proves itself on a reachable breach; the bag cannot carry it.');
}
if (overFired.length) {
  console.error(`\nRules fired on the green app, so the classification over-fires:`);
  for (const h of overFired) console.error(`  ${h}`);
}
if (unseen.length) {
  console.error(`\nThe graph pass missed the bag's cross-domain cycle: ${unseen.join(', ')}`);
  console.error('Either the pass is broken, or the cycle was broken by an edit. Both are failures.');
}
if (!recommended.length) {
  console.error(`
The slicing-lean pass missed the broken core's downward imports onto its axioms piece.`);
  console.error('Either the pass is broken, or the fan was broken by an edit. Both are failures.');
}
if (!pressured.length) {
  console.error(`
The slicing-pressure pass missed the broken core's cluster of rank-climbing imports.`);
  console.error('Either the pass is broken, or the cluster was broken by an edit. Both are failures.');
}
if (decidable.length) {
  console.error(`\nA per-file rule reports on the cycle, so it no longer proves the graph pass: ${decidable.join(', ')}`);
  console.error('The cycle must be legal edge by edge; give the rule its own fixture breach and restore this one.');
}
if (!embedOk) {
  console.error(`\nThe embed pass failed on the green app: the \`@elda-import\` directive must reach both receipt files through the declared entry, stay unjudged, and dispute nothing.`);
  console.error('Either the pass is broken, or the directives or the receipt files were broken by an edit. Both are failures.');
}
if (!entryOk) {
  console.error(`\nThe entry pass failed on the broken app: the shipped-and-never-composed file must be exactly print/stale.flows.ts, with the shipping host named in its reason.`);
  console.error('Either the pass is broken, or the print fixture was broken by an edit. Both are failures.');
}
if (threw.length || silent.length || unconnected.length || overFired.length || unseen.length || decidable.length || !pressured.length || !recommended.length || !embedOk || !entryOk) process.exit(1);
console.log(`\nAll ${bag.size} rules fire on their fixtures, the graph-classified rules fire on the connected app, the green app stays silent, and the graph passes hold their cycle and their slicing cluster.`);
