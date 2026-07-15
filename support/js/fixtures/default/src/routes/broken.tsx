// elda/imports (ROOT.1, unjudged): a specifier shaped like in-tree code that resolves to no file,
// and a dynamic import whose specifier is computed. Neither reach can be judged, and a reach that
// cannot be judged cannot be permitted.
import { missing } from '#/nope/gone';

const which = String(Math.random());

export async function load() {
  const mod = await import(which);
  return [missing, mod];
}
