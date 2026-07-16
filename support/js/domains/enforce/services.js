// The runtime-composition surface of enforce: the plugin's composition root crosses it to mount the rules, and the crossing is what names the domain.
// The map is declared here instead of forwarded, because this surface publishes services it owns (SURFACE.2): the rule objects arrive as use-case implementations, and this declaration is the service seam the root consumes.
import { rules as implementations } from './enforce.use-cases.js';

export const rules = implementations;
