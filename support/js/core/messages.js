// Every verdict the linter and the diagram phrase, gathered in one place.
// The rest of the model decides whether a reference is legal and gathers the pieces of the finding; this file only phrases it, so the wording is edited here and nowhere else.
// Each entry is a function of the already-computed pieces (a chain string, a layer name, a unit label), never of the model's own shapes, so there is no ELDA logic here to keep in sync - only prose.
// One rule id per line where it appears in the message, so a message's constraint is greppable.

// --- Undecidable references -------------------------------------------------

// A reach the analyzers cannot resolve to a file (imports / a composition root's dynamic import); `cites` is the invariant the reading role would have been judged against.
export const unjudged = (cites, spec, why) =>
  `ELDA ${cites} (unjudged): '${spec}' ${why}, so the file it names, and with it the layer and owner this reference carries, cannot be read - and no invariant can be checked on it. A reach that cannot be judged cannot be permitted: give it a specifier that resolves.`;

export const rootLandsOutside = (landed) =>
  `ELDA ROOT.1 (unjudged): this binding lands on '${landed}', a module outside every domain and outside every declared root, so the layer and owner it carries cannot be judged. Route the reach through a domain's surface, or move the module into the domain that owns it.`;

export const rootDynamicComputed = () =>
  `ELDA ROOT.1 (unjudged): a dynamic import with a computed specifier resolves nowhere the analyzers can follow, so the layer and owner it lands on cannot be judged. Give the import a statically-known specifier.`;

// --- The placement weld -------------------------------------------------------

// The two judges disagree: the tree places the file as one thing, the imports consume it as another.
// Placement is a claim the graph adjudicates (the thesis), so the disagreement itself is the finding; the caller supplies what the tree says, what the imports say, and the remedy that fits the specific mismatch, each as plain prose that stands without the documentation.
export const dishonestPlacement = (claimed, actual, remedy) =>
  `ELDA placement: the tree places this file as ${claimed}, yet ${actual}. ${remedy}`;

// --- LAYER ------------------------------------------------------------------

export const innerImportsOuter = (roleLayer, targetLayer) =>
  `ELDA LAYER.1: ${roleLayer} (inner) must not import the outer layer ${targetLayer}.`;

export const asyncFn = () => 'ELDA LAYER.4: async functions are not permitted in entities/use-cases.';
export const awaitExpr = () => 'ELDA LAYER.4: await is not permitted in entities/use-cases; wrap async at the adapters layer.';
export const forAwait = () => 'ELDA LAYER.4: for-await is not permitted in entities/use-cases.';
export const tryCatch = () => 'ELDA LAYER.4 (Outcome model): try/catch is not permitted in entities/use-cases; outcomes flow as typed branch values.';

// --- CHANNEL ----------------------------------------------------------------

export const mutableExportDecl = (kind) =>
  `ELDA CHANNEL.4: \`export ${kind}\` shares a live mutable binding by reference; publish a constant, an accessor, or a channel instead.`;

export const mutableExportNamed = (name) =>
  `ELDA CHANNEL.4: exporting the mutable binding '${name}' shares it live by reference; publish a constant, an accessor, or a channel instead.`;

// --- SURFACE ----------------------------------------------------------------

export const surfaceRebundles = (domainAlias, chain) =>
  `ELDA SURFACE.3: a domain's surface must not re-bundle a peer or foreign domain's surface (${domainAlias}/${chain}); reference foreign vocabulary at the point of use, not by republishing it.`;

export const surfaceCurateDirectChild = (child, chain) =>
  `ELDA SURFACE.7 / ROOT.7: curate the direct child '${child}'; '${chain}' is internal to it.`;

export const surfaceCarriesUseCases = (targetLayer, domainAlias, roleChain) =>
  `ELDA SURFACE.2: the consumable surface carries use-cases + vocabulary; '${targetLayer}' belongs to the runtime-composition surface (${domainAlias}/${roleChain}/services), reached only by its composer.`;

export const subPastServicesSurface = (child) =>
  `ELDA SURFACE.3: '${child}' is composed at its runtime-composition surface, never past it.`;

export const consumeSubThroughSurface = (child, targetLayer) =>
  `ELDA SURFACE.3: consume the subdomain '${child}' through its surface, never its ${targetLayer} files.`;

export const referencePeerThroughSurface = (sib, chain) =>
  `ELDA SURFACE.7: reference '${sib}' through its surface; '${chain}' is internal to it.`;

export const referenceSibPublicSurface = (sib, domainAlias, targetLayer) =>
  `ELDA SURFACE.3: reference '${sib}' through a public surface (${domainAlias}/${sib}, or a named surface entry), never its ${targetLayer} layer.`;

export const selfSurface = (own, face) =>
  `ELDA LAYER.1 / SURFACE.3: a surface is a domain's face to its consumers, and '${own}' is not a consumer of itself; this reference takes ${face} from inside. A surface holds no rank, so the binding arrives carrying no layer and LAYER.1 cannot be read on this reference at all: an inner layer reaches an outer one straight through the surface and no per-file rule sees it. Import the file that owns the binding.`;

export const surfaceDeclaration = (what) =>
  `ELDA SURFACE.2 / OWNER.2: a surface curates what the layers own and holds no rank of its own, so ${what} has no layer and no owner here, and no rule can judge where it sits. Declare it in the layer file that owns it, and re-export it from this surface.`;

export const diagonal = (from, targetUnit, targetLayer) =>
  `ELDA SURFACE.5: ${from} takes a value from '${targetUnit}' at ${targetLayer} - a diagonal reach across both name and rank. Rename the target into the consuming unit if it alone consumes it, promote it to the subdomain's bare ${targetLayer} file if the subdomain shares it, or cross at equal rank through this unit's own ${targetLayer} row.`;

export const landedDiagonal = (from, where, targetLayer) =>
  `ELDA SURFACE.5 (landed): ${from} takes a value landing in ${where} at ${targetLayer}, below its own rank - a diagonal no row of the diagram draws. Cross at equal rank: reference it from this unit's own ${targetLayer} row, and let its own column climb.`;

export const published = (what) =>
  `ELDA SURFACE.2 (published): the runtime-composition surface publishes the domain's services to its composition root, and this re-export forwards ${what} onto it instead. A use-case does not become a service by transiting a services file: consume it here and declare the service that owns it, or publish it on the consumable surface where it belongs.`;

// A side-effect-only import reaching past its unit; phrased once and read by both the plugin rule and the scan.
export const deepSideEffect = (spec) =>
  `ELDA SURFACE.5: side-effect import '${spec}' runs another module for effect with nothing named crossing the edge; co-locate it in the unit, compose it at the root, or import a named value.`;

export const importStarOpaque = () =>
  'ELDA SURFACE.4: `import * as` consumes a surface opaquely - every export looks used, blinding the unconsumed-export signal. Import the named symbols you use.';

export const exportStar = () =>
  'ELDA SURFACE.1: `export *` republishes whatever the module exports, so the surface is not a deliberate named contract. Re-export named symbols.';

// --- OWNER ------------------------------------------------------------------

export const lateralMountsChild = (layer, importerUnit, childChain) =>
  `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit}' mounts its child '${childChain}' at its runtime-composition surface; prefer a named slot port its composer fills, and justify the mounting where the port becomes ceremony.`;

export const lateralMountsPeer = (layer, importerUnit, peerChain) =>
  `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit}' mounts peer '${peerChain}' at its runtime-composition surface; prefer a named slot port its composer fills, and justify the mounting where the port becomes ceremony.`;

export const lateralReachesUnit = (layer, importerUnit, targetUnit, roleChain, remedy) =>
  `ELDA OWNER.5 (inadvisable): ${layer} unit '${importerUnit}' reaches a different ${layer} unit '${targetUnit}' in '${roleChain}'; ${remedy}`;

export const vocabWrite = (m, key) =>
  `ELDA OWNER.2 / ROOT.2: shared-namespace write ${m}('${key}', ...) at the integration surface; route it through the owner's binding surface.`;

export const vocabDataset = () =>
  'ELDA OWNER.2 / ROOT.2: dataset write at the integration surface; identity vocabulary belongs to its owner.';

export const ambientDecl = () =>
  'ELDA OWNER.2: ambient declarations belong co-located in the owning domain (src/domains/<x>/), not a root or shared .d.ts catch-all.';

// --- ROOT -------------------------------------------------------------------

export const coreDependsOnDomain = () => 'ELDA ROOT.6: pure core depends on nothing in any domain.';

export const rootComposesTopLevel = (chain, top) =>
  `ELDA ROOT.1 / SURFACE.7: composition roots compose top-level domains; '${chain}' is internal to '${top}', composed by its parent.`;

export const rootConsumesSurfaces = (targetLayer) =>
  `ELDA ROOT.1: composition roots consume a domain's published surfaces (its barrel, a named surface, or services), never its ${targetLayer} layer.`;

export const composesDirectChildren = (roleChain, chain) =>
  `ELDA ROOT.7: '${roleChain}' composes its direct children only; '${chain}' is composed by its own parent.`;

export const composingChildIsServices = (child, roleLayer) =>
  `ELDA ROOT.7: composing the subdomain '${child}' is services work; ${roleLayer} consumes it through its surface.`;

export const subReferencesParent = (parent) =>
  `ELDA ROOT.7: a subdomain never references its parent ('${parent}'); either unwrap the subdomain or extract its shared content into a sibling subdomain.`;

export const rootLanded = (chain, targetLayer) =>
  `ELDA ROOT.1 (landed): a composition root wires services; this binding lands on '${chain}' at ${targetLayer}. Consuming ${targetLayer} is a service's own work, so the reach marks a service smashed into the root: extract that service, publish it on the domain's runtime-composition surface, and mount it.`;

// A reference cycle over the landed value graph (the graph pass, graph.js); `domains` and `chains` are the distinct domains and subdomain chains it encloses, and a single-file component is a self-reference.
export const cycle = ({ domains, chains, componentLength, firstPath }) => {
  const where = domains.length > 1
    ? `across the domains ${domains.map((d) => `'${d}'`).join(' and ')}`
    : chains.length > 1
      ? `across the subdomains ${chains.map((c) => `'${c}'`).join(' and ')}`
      : `inside '${chains[0]}'`;
  const what = componentLength === 1
    ? `the file '${firstPath}' references itself`
    : `${componentLength} files close a reference cycle ${where}`;
  return `ELDA CHANNEL.5 (Gate 1): ${what}, and every reference in it carries a value synchronously. Enclose a settling element - a change-gated channel with a tight equality, which breaks the synchronous re-entry - or break the cycle by lifting the shared content into a subdomain both sides consume.`;
};
