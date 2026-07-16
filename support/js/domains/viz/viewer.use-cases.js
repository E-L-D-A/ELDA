// Assembly of the viewer page: how the shell entities and the module sources become one live page or one self-contained snapshot.
// A live page needs only the shell, because its modules load from their real URLs and resolve their plain `./<name>.js` sibling references natively.
// A snapshot inlines every module as a data: URL, and a data: URL is no base for a relative specifier, so a sibling reference inside an inlined module fails URL resolution before the import map is consulted.
// The failed specifier then reaches the map as its raw './<name>.js' string, and no key can meet it there: the map's own './'-shaped keys are absolutized against the page's base when the map is parsed, so the lookup holds a raw string on one side and full URLs on the other.
// Bare names are the one specifier form the map matches literally, so each inlined module's sibling references are re-pointed at bare `@viewer/<name>` names and the map carries every name to its data: URL; the rewrite exists only inside the snapshot's payloads, and the files on disk keep their plain relative form.
// The entry keeps its real specifier even in the snapshot: it sits in the page's own script, whose base is real, so its resolved URL meets the map's one URL-shaped key where both normalize against the same base.
// Pure: sources and a graph in, HTML out. The filesystem stays in services.js.

import { styles } from './viewer.entities.css.js';
import { html } from './viewer.entities.html.js';
import { ENTRY, template } from './viewer.entities.template.js';

export const livePage = () => html(styles, null, template);

// The marker in the shared base (entities.js) that a snapshot replaces with the scanned graph, so the page boots with its data inlined and asks no server.
const DATA_RE = /\/\*\s*__DATA__\s*\*\/\s*null/;
const injectGraph = (src, graph) => src.replace(DATA_RE, JSON.stringify(graph));

const dataUrl = (src) => `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;

const toBare = (src) => src.replace(/(['"])\.\/([\w.-]+)\.js\1/g, '$1@viewer/$2$1');

export function snapshotPage(names, sourceOf, graph) {
  const imports = {};
  for (const name of names) {
    let src = sourceOf(name);
    if (name === 'entities') src = injectGraph(src, graph);
    imports[name === 'services' ? ENTRY : `@viewer/${name}`] = dataUrl(toBare(src));
  }
  return html(styles, { imports }, template);
}
