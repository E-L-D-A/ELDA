// The filesystem read boundary for an app's file tree: it derives the app's elda options, resolves its areas to what sits on disk, walks those areas, and classifies each file's kind, so the graph assembly (scan.js) starts from a gathered list of files without touching the filesystem itself.
// The tree declares almost nothing the build and the structure do not already record: specifier aliases come from the resolver's own config (tsconfig/jsconfig `paths`, package.json `imports`), and the ownership forest and the shared floors are discovered from the shape of the tree, with the layer grammar as the only reserved spelling. The one remaining declaration is the composition roots, read from the app's `.oxlintrc.json`, because which entries an app composes at is a claim nothing else records.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { OPTION_DEFAULTS, inArea, isDataPath, layerOf, norm, stripExt } from '../axioms/model.js';
import { CODE_RE } from './parse.js';

// A stylesheet is code (SURFACE.6) and draws in its layer x subdomain cell; everything that is neither a module nor a stylesheet is pure data, read as the complement (isDataPath) so that no extension the tool has never met classifies as a rankless surface.
export const STYLE_RE = /\.(css|scss|sass|less)$/i;
export const isAsset = (p) => isDataPath(p);

// ---------------------------------------------------------------------------
// Tolerant config reading. The config family (tsconfig, jsconfig, .oxlintrc, package.json) allows comments and trailing commas; both are stripped before parsing.
// The walk tracks string state, because tsconfig path globs put `/*` inside string literals and a text-blind strip would eat from there to the next `*/`.

function stripJsonNoise(s) {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < s.length) {
    const c = s[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += s[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '}' || s[j] === ']') {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}
const parseLoose = (p) => {
  try {
    return JSON.parse(stripJsonNoise(readFileSync(p, 'utf8')));
  } catch {
    return null;
  }
};
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Aliases, derived from the resolver's own config. The build already resolves specifiers with tsconfig/jsconfig `paths` (or package.json `imports`), so that file owns the alias vocabulary; re-declaring it here would be a second owner that can drift.
// The `extends` chain is followed and the nearest `paths` wins whole (tsconfig replaces, never merges), anchored at the declaring config's `baseUrl` or, absent one, its own directory.

function resolveExtends(fromDir, spec) {
  const candidates = spec.startsWith('.')
    ? [join(fromDir, spec), join(fromDir, `${spec}.json`), join(fromDir, spec, 'tsconfig.json')]
    : [fromDir, dirname(fromDir), dirname(dirname(fromDir))].flatMap((d) => [
        join(d, 'node_modules', spec),
        join(d, 'node_modules', `${spec}.json`),
        join(d, 'node_modules', spec, 'tsconfig.json'),
      ]);
  return candidates.find(isFile) ?? null;
}

function pathsFrom(configPath, seen = new Set()) {
  const key = norm(configPath);
  if (seen.has(key)) return null;
  seen.add(key);
  const cfg = parseLoose(configPath);
  if (!cfg) return null;
  const co = cfg.compilerOptions ?? {};
  if (co.paths) return { paths: co.paths, anchor: join(dirname(configPath), co.baseUrl ?? '.') };
  for (const e of Array.isArray(cfg.extends) ? cfg.extends : cfg.extends ? [cfg.extends] : []) {
    const next = resolveExtends(dirname(configPath), e);
    const hit = next && pathsFrom(next, seen);
    if (hit) return hit;
  }
  return null;
}

// Wildcard pairs (`#/*` -> `./src/domains/*`) become alias -> app-root-relative directory; exact-file patterns carry no tree and are skipped. package.json `imports` entries fill only aliases tsconfig did not claim.
function deriveAliases(appDir) {
  const out = {};
  const config = ['tsconfig.json', 'jsconfig.json'].map((f) => join(appDir, f)).find(isFile);
  const hit = config && pathsFrom(config);
  if (hit) {
    for (const [pattern, targets] of Object.entries(hit.paths)) {
      if (!pattern.endsWith('/*')) continue;
      const target = (Array.isArray(targets) ? targets : [targets]).find(
        (t) => typeof t === 'string' && t.endsWith('/*'),
      );
      if (!target) continue;
      const dir = norm(relative(appDir, join(hit.anchor, target.slice(0, -2))));
      if (dir && !dir.startsWith('..')) out[pattern.slice(0, -2)] = dir;
    }
  }
  const pkg = parseLoose(join(appDir, 'package.json'));
  for (const [pattern, target] of Object.entries(pkg?.imports ?? {})) {
    if (!pattern.endsWith('*') || typeof target !== 'string' || !target.endsWith('*')) continue;
    const key = pattern.slice(0, -1).replace(/\/$/, '');
    if (!key || key in out) continue;
    const dir = norm(relative(appDir, join(appDir, target.slice(0, -1))));
    if (dir && !dir.startsWith('..')) out[key] = dir.replace(/\/$/, '');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ignore reading. Build output can spell layer-looking names (a bundler emits chunks named after their source modules), and the tree already declares its scratch once, in .gitignore; discovery respects that declaration instead of inventing an ignore vocabulary of its own.
// The subset understood: plain names match any segment, patterns with '/' anchor at the declaring file's directory and cover the subtree, '*' spans within a segment, a leading '**/' floats the rest. Negations and the rarer glob forms are skipped, which can only widen the scan, never hide a finding.

const matchSeg = (pat, seg) =>
  pat.includes('*')
    ? new RegExp(`^${pat.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`).test(seg)
    : pat === seg;

function matchPath(pat, path) {
  const floated = pat.startsWith('**/');
  const ps = (floated ? pat.slice(3) : pat).split('/');
  const xs = path.split('/');
  const alignFrom = (start) =>
    ps.length <= xs.length - start && ps.every((p, i) => matchSeg(p, xs[start + i]));
  if (!floated) return alignFrom(0);
  for (let s = 0; s + ps.length <= xs.length; s++) if (alignFrom(s)) return true;
  return false;
}

function gitignoreMatcher(appDir) {
  const sources = [];
  let dir = appDir;
  for (let up = 0; up < 6; up++) {
    const gi = join(dir, '.gitignore');
    if (isFile(gi)) {
      const prefix = norm(relative(dir, appDir));
      const lines = readFileSync(gi, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
      sources.push({ prefix, lines });
    }
    if (existsSync(join(dir, '.git'))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return (relPath) => {
    for (const { prefix, lines } of sources) {
      const full = prefix ? `${prefix}/${relPath}` : relPath;
      for (const raw of lines) {
        const pat = norm(raw).replace(/\/+$/, '').replace(/^\//, '');
        if (!pat) continue;
        if (pat.includes('/')) {
          if (matchPath(pat, full)) return true;
        } else if (full.split('/').some((seg) => matchSeg(pat, seg))) return true;
      }
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// Structure discovery. The layer grammar is the only reserved spelling, so shape is the whole claim: a directory layered at its own crown is a floor (a shared core), and the directory whose children are the domain trees is the ownership forest. No directory name means anything.

const isLayerDirName = (n) => {
  const hit = layerOf(n);
  return !!hit && hit.name === '';
};
const isLayerFileName = (n) => CODE_RE.test(n) && !!layerOf(stripExt(n));
const entriesOf = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};
const crowned = (dir) =>
  entriesOf(dir).some((e) => (e.isDirectory() ? isLayerDirName(e.name) : isLayerFileName(e.name)));

function bearsGrammar(dir, depth = 6) {
  if (depth < 0) return false;
  for (const e of entriesOf(dir)) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (e.isDirectory()) {
      if (isLayerDirName(e.name) || bearsGrammar(join(dir, e.name), depth - 1)) return true;
    } else if (isLayerFileName(e.name)) return true;
  }
  return false;
}

// An alias that targets the forest is the strongest signal - it is the ownership spelling the code already uses - so alias targets are tried first. A target that is an ancestor of another candidate is the wrapper spelling and drops; one survivor is the forest, more than one is a real ambiguity the tool refuses to guess at.
function forestFromAliases(appDir, aliases) {
  const candidates = Object.values(aliases)
    .filter((d, i, all) => all.indexOf(d) === i)
    .map((d) => ({ d, abs: join(appDir, d) }))
    .filter(({ abs }) => isDir(abs) && !crowned(abs) && bearsGrammar(abs));
  const keep = candidates.filter(
    ({ d }) => !candidates.some((o) => o.d !== d && norm(o.d).startsWith(`${norm(d)}/`)),
  );
  if (keep.length === 1) return keep[0].d;
  if (keep.length > 1)
    console.warn(
      `elda: more than one alias targets a domain tree (${keep.map((k) => k.d).join(', ')}); none is taken as the ownership forest.`,
    );
  return null;
}

// Shape-first discovery, for trees whose resolver declares no ownership alias. Walking down from the app root: two or more domain trees side by side make their parent the forest; one domain tree beside a floor is the forest with its floor; a lone domain tree with nothing beside it is a wrapper to descend through. Crowned children of the forest itself are domains (a vertically sliced domain carries bare layer files at its crown), so the forest's own level contributes no floors.
function discoverAreas(appDir, excluded) {
  const rel = (abs) => norm(relative(appDir, abs));
  const floors = [];
  let dir = appDir;
  for (let depth = 0; depth < 6; depth++) {
    const kids = entriesOf(dir).filter((e) => e.isDirectory() && !excluded(e.name, rel(join(dir, e.name))));
    const abs = (e) => join(dir, e.name);
    const fl = kids.filter((e) => crowned(abs(e)));
    const br = kids.filter((e) => !crowned(abs(e)) && bearsGrammar(abs(e)));
    if (br.length >= 2) {
      const stray = entriesOf(dir).some(
        (e) => !e.isDirectory() && CODE_RE.test(e.name) && !excluded(e.name, rel(join(dir, e.name))),
      );
      if (stray || dir === appDir) {
        console.warn(
          `elda: the ownership forest is ambiguous at '${rel(dir) || '.'}' (${br.map((e) => e.name).join(', ')}); declare a resolver alias targeting the domain tree.`,
        );
        return { forest: null, floors };
      }
      return { forest: rel(dir), floors };
    }
    if (br.length === 1) {
      floors.push(...fl.map((e) => rel(abs(e))));
      if (fl.length >= 1) return { forest: rel(abs(br[0])), floors };
      dir = abs(br[0]);
      continue;
    }
    floors.push(...fl.map((e) => rel(abs(e))));
    return { forest: null, floors };
  }
  return { forest: null, floors };
}

// Floors beside an alias-named forest: the crowned directories on the path from the app root down to the forest's parent, the same siblings shape-first discovery collects on its way down.
function floorsBeside(appDir, forest, excluded) {
  const floors = [];
  const segs = norm(forest).split('/');
  let dir = appDir;
  for (let i = 0; i < segs.length; i++) {
    for (const e of entriesOf(dir)) {
      const relPath = norm(relative(appDir, join(dir, e.name)));
      if (!e.isDirectory() || relPath === norm(forest) || segs.slice(0, i + 1).join('/') === relPath) continue;
      if (excluded(e.name, relPath)) continue;
      if (crowned(join(dir, e.name))) floors.push(relPath);
    }
    dir = join(dir, segs[i]);
  }
  return floors;
}

// ---------------------------------------------------------------------------
// Project options, derived per app root. `compositionRoot` is read from the `elda/imports` entry of the app's .oxlintrc.json - the one declaration - and `ignorePatterns` bounds the scan the same way it bounds the lint.
export function readOptions(appDir) {
  const rcPath = join(appDir, '.oxlintrc.json');
  const rc = existsSync(rcPath) ? parseLoose(rcPath) : null;
  if (existsSync(rcPath) && !rc) console.warn(`Could not parse ${rcPath}; using default elda options.`);
  const ruleEntry = rc?.rules?.['elda/imports'];
  const declared = Array.isArray(ruleEntry) && typeof ruleEntry[1] === 'object' ? ruleEntry[1] : {};
  const compositionRoot = declared.compositionRoot ?? OPTION_DEFAULTS.compositionRoot;
  const ignore = (Array.isArray(rc?.ignorePatterns) ? rc.ignorePatterns : []).map((p) =>
    norm(p).replace(/\/\*+$/, ''),
  );
  const gitignored = gitignoreMatcher(appDir);
  const excluded = (name, relPath) =>
    name.startsWith('.') ||
    name === 'node_modules' ||
    inArea(relPath, compositionRoot) ||
    ignore.some((p) => inArea(relPath, p)) ||
    gitignored(relPath);
  const aliases = deriveAliases(appDir);
  const aliased = forestFromAliases(appDir, aliases);
  const { forest, floors } = aliased
    ? { forest: aliased, floors: floorsBeside(appDir, aliased, excluded) }
    : discoverAreas(appDir, excluded);
  const ownershipAlias =
    forest == null ? null : (Object.keys(aliases).find((a) => norm(aliases[a]) === norm(forest)) ?? null);
  return { aliases, ownershipAlias, ownershipDir: forest, compositionRoot, core: floors };
}

// A declared area, resolved to the thing on disk that holds it: a directory, or a single module where the area names one, since a build config is a composition root that lives as one file.
// An entry resolving to nothing is omitted - an app with no server simply draws no server bar.
// Roots communicate only by serialization (ROOT.5), so each scans as its own block feeding the shared domains.
function areaTargets(appDir, areas) {
  const out = [];
  for (const a of (Array.isArray(areas) ? areas : [areas]).filter(Boolean)) {
    const hit = join(appDir, a);
    if (!existsSync(hit)) continue;
    const label = norm(hit).slice(norm(appDir).length + 1);
    out.push(statSync(hit).isDirectory() ? { key: a, label, dir: hit } : { key: a, label, file: hit });
  }
  return out;
}

export function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Every file in the app's scanned areas, classified into code, style, or asset, with the composition root that stamps it.
// The ownership directory scans as the domain tree; each composition root scans its directory or its single module and stamps every file with its root key, so the diagram draws one bar per root; each discovered core scans as its own shared block.
export function gatherFiles(appDir, { ownershipDir, compositionRoot, core }) {
  const roots = areaTargets(appDir, compositionRoot);
  const areas = [
    ...(ownershipDir ? [{ dir: join(appDir, ownershipDir) }] : []),
    ...roots.map((r) => ({ root: r.key, dir: r.dir, file: r.file })),
    ...areaTargets(appDir, core).map((c) => ({ dir: c.dir, file: c.file })),
  ];
  const found = [];
  // A directory declaring no areas still renders: the root itself scans as one area, so any codebase draws its files and edges, classified or unsorted, without conforming first.
  const declared = areas.filter((a) => (a.dir ?? a.file) && existsSync(a.dir ?? a.file));
  if (!declared.length) areas.push({ dir: appDir });
  for (const area of areas) {
    const target = area.dir ?? area.file;
    if (!target || !existsSync(target)) continue;
    for (const abs of area.file ? [area.file] : walk(area.dir)) {
      const path = norm(abs.slice(appDir.length + 1));
      const kind = CODE_RE.test(path) ? 'code' : STYLE_RE.test(path) ? 'style' : isAsset(path) ? 'asset' : null;
      if (kind) found.push({ path, kind, root: area.root });
    }
  }
  return { found, roots };
}
