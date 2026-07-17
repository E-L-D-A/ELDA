// Assembly of the viewer page: how the shell axioms and the module sources become one live page or one self-contained snapshot.
// A live page needs only the shell, because its modules load from their real URLs and resolve their plain `./<name>.js` sibling references natively.
// A snapshot inlines every module as a data: URL, and a data: URL is no base for a relative specifier, so a sibling reference inside an inlined module fails URL resolution before the import map is consulted.
// The failed specifier then reaches the map as its raw './<name>.js' string, and no key can meet it there: the map's own './'-shaped keys are absolutized against the page's base when the map is parsed, so the lookup holds a raw string on one side and full URLs on the other.
// Bare names are the one specifier form the map matches literally, so each inlined module's sibling references are re-pointed at bare `@viewer/<name>` names and the map carries every name to its data: URL; the rewrite exists only inside the snapshot's payloads, and the files on disk keep their plain relative form.
// The entry keeps its real specifier even in the snapshot: it sits in the page's own script, whose base is real, so its resolved URL meets the map's one URL-shaped key where both normalize against the same base.
// Pure: sources and a graph in, HTML out. The filesystem stays in services.js.

import { styles } from './viewer.axioms.css.js';
import { html } from './viewer.axioms.html.js';
import { template } from './viewer.axioms.template.js';

export const livePage = (entry) => html(styles, null, template(entry));

// The marker in the session state (flows/state.js) that a snapshot replaces with the scanned graph, so the page boots with its data inlined and asks no server.
const DATA_RE = /\/\*\s*__DATA__\s*\*\/\s*null/;
const injectGraph = (src, graph) => src.replace(DATA_RE, JSON.stringify(graph));

const dataUrl = (src) => `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;

// A module's relative specifier resolves against its own viewer-relative name, so a nested module's '../flows/state.js' and a sibling's './board.js' both land on the one bare name the map carries.
const resolveRel = (fromName, spec) => {
  const segs = fromName.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') segs.pop();
    else segs.push(part);
  }
  return segs.join('/');
};
const toBare = (src, name) =>
  src.replace(/(['"])(\.\.?\/[\w./-]+)\.js\1/g, (m, q, spec) => `${q}@viewer/${resolveRel(name, spec)}${q}`);

export function snapshotPage(names, sourceOf, graph, entry) {
  const imports = {};
  for (const name of names) {
    let src = sourceOf(name);
    if (name === 'flows/state') src = injectGraph(src, graph);
    imports[name === 'services/index' ? entry : `@viewer/${name}`] = dataUrl(toBare(src, name));
  }
  return html(styles, { imports }, template(entry));
}
