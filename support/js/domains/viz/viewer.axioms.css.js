export const styles = /* css */`
:root {
  color-scheme: dark;
  --bg: #0f1217;
  --fg: #e2e6ec;
  --muted: #8d96a4;
  --faint: #5c6572;
  --box: #161a20;
  --box-hi: #1b2028;
  --line: #262c36;
  --line-strong: #39414e;
  --dot: #1c222b;
  --services-bg: #24344d;
  --services-bd: #5b7fae;
  --harnesses-bg: #24402a;
  --harnesses-bd: #6fa05c;
  --flows-bg: #4a2b29;
  --flows-bd: #b06055;
  --axioms-bg: #464023;
  --axioms-bd: #b5a24e;
  --surface-bg: #2a2d33;
  --surface-bd: #7d8694;
  --root-bg: #24344d;
  --root-bd: #5b7fae;
  --ok: #77839a;
  --type: #515b6b;
  --bad: #e34f44;
  --smell: #c68118;
  --laundered: #e07b39;
  --cycle: #a06ce0;
  --lean: #62b0c4;
  --ships: #77839a;
  --hi-out: #3f8de0;
  --hi-in: #1ba46c;
  --accent: #3f8de0;
  --sans: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
  --shadow: 0 1px 2px rgb(0 0 0 / 0.45), 0 10px 28px -14px rgb(0 0 0 / 0.6);
  --drawer-w: 500px;
}
/* The open drawer covers the viewport's right strip, so programmatic scrolls (issue clicks) must treat that strip as off-screen. */
html:has(#issues.open) {
  scroll-padding-right: calc(var(--drawer-w) + 24px);
}
/* Scroll-padding alone only guides programmatic scrolls, so also reserve a matching strip of pannable space on the right; any file can then be panned out from behind the open drawer. */
html:has(#issues.open) #wrap {
  padding-right: calc(var(--drawer-w) + 24px);
}
* {
  box-sizing: border-box;
}
html {
  display: table;
  min-height: 100%;
}
body {
  display: table-cell;
  margin: 0;
  width: max-content;
  min-width: 100%;
  padding-bottom: 64px;
  background: var(--bg) radial-gradient(var(--dot) 1.2px, transparent 1.2px)
    0 0 / 24px 24px;
  color: var(--fg);
  font: 13px/1.45 var(--sans);
  user-select: none;
  cursor: grab;
}
header, #issues, #bottombar {
  cursor: default;
}
header {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 30;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  width: 100vw;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--box) 82%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
header .sep {
  align-self: center;
  position: relative;
  height: 30px;
  margin: -10px 0;
  margin-right: 2px;
  width: 1px;
  background: linear-gradient(
    0deg,
    transparent,
    var(--line),
    var(--line),
    transparent
  );
}
header h1 {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 650;
}
header h1 .brand {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--faint);
}
.counts {
  display: inline-flex;
  gap: 12px;
  color: var(--muted);
  font-size: 12px;
}
.counts .stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
/* A severity count is also the way into its section of the drawer, so a nonzero one reads as a control. */
.counts .stat.clickable {
  cursor: pointer;
}
.counts .stat.clickable:hover b {
  text-decoration: underline;
}
.counts .stat b {
  color: var(--fg);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.counts .stat .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--faint);
}
.counts .sev-zero {
  color: var(--faint);
}
.counts .sev-zero b {
  color: var(--muted);
}
.counts .sev-bad .dot {
  background: var(--bad);
}
.counts .sev-bad b {
  color: var(--bad);
}
.counts .sev-smell .dot {
  background: var(--smell);
}
/* The two judges disagree on the file: it draws where the tree claims it, and the dashed paint says the graph reads it elsewhere. */
.chip.disputed {
  outline: 2px dashed var(--smell) !important;
  outline-offset: -5px;
}
/* Nothing reaches the file, so it ghosts in its claimed place rather than vanishing into a box. */
.chip.unreached {
  opacity: 0.45;
}
.counts .sev-smell b {
  color: var(--smell);
}
.counts .sev-laundered .dot {
  background: var(--laundered);
}
.counts .sev-laundered b {
  color: var(--laundered);
}
.counts .sev-lean .dot {
  background: var(--lean);
}
.counts .sev-lean b {
  color: var(--lean);
}
/* A cycle is a property of the graph rather than a worse breach, so it takes a hue of its own outside the severity ramp. */
.counts .sev-cycle .dot {
  background: var(--cycle);
}
.counts .sev-cycle b {
  color: var(--cycle);
}
/* Unreachable is a review signal rather than a breach (SURFACE.4), so it reads as absence: a hollow dot, and none of the severity colours. */
.counts .sev-dead .dot {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--muted);
}
.counts .sev-dead b {
  color: var(--muted);
}
.bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 30;
}
.legend {
  display: flex;
  padding: 20px;
  gap: 12px;
  margin-left: auto;
  color: var(--muted);
  font-size: 11.5px;
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--box) 82%, transparent),
    transparent
  );
  pointer-events: none;
}
.legend .col {
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 12px;
}
.legend label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  cursor: pointer;
}
.legend label:hover {
  color: var(--fg);
}
/* The checkbox drives the filter through :has() and never shows; the swatch and the label text are the whole control. */
.legend input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
/* An off entry fades to say its edges are hidden, the swatch fading with it. */
.legend label:has(input:not(:checked)) {
  opacity: 0.35;
}
.legend i {
  display: inline-block;
  width: 22px;
  border-top: 2px solid var(--ok);
  border-radius: 2px;
}
.legend i.smell {
  border-top: 2px dashed var(--smell);
}
.legend i.violation {
  border-top: 2px solid var(--bad);
}
.legend i.laundered {
  border-top: 2px solid var(--laundered);
}
.legend i.cycle {
  border-top: 2px solid var(--cycle);
}
.legend i.lean {
  border-top: 2px solid var(--lean);
}
.legend i.ships {
  border-top: 2px dashed var(--ships);
}
.legend i.type {
  border-top: 2px dotted var(--type);
}
.legend i.in {
  border-top: 2px solid var(--hi-in);
}
.legend i.out {
  border-top: 2px solid var(--hi-out);
}
.toggles {
  display: inline-flex;
  gap: 6px;
}
header label, #bottombar label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 7px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--box-hi);
  font-size: 11.5px;
  cursor: pointer;
  user-select: none;
}
header label:hover, #bottombar label:hover {
  border-color: var(--line-strong);
}
header label:has(input:not(:checked)), #bottombar label.off {
  color: var(--muted);
  background: transparent;
}
label * {
  cursor: pointer;
  line-height: 0;
}
input[type="checkbox"] {
  appearance: none;
  width: 13px;
  height: 13px;
  margin: 0;
  flex: none;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: transparent;
  cursor: pointer;
}
input[type="checkbox"]:checked {
  border-color: var(--accent);
  background: var(--accent)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 5.4 4.1 7.5 8 3' fill='none' stroke='%23fff' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 9px 9px no-repeat;
}
input[type="checkbox"]:indeterminate {
  border-color: var(--accent);
  background: var(--accent)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2.6 5h4.8' fill='none' stroke='%23fff' stroke-width='1.7' stroke-linecap='round'/%3E%3C/svg%3E")
    center / 9px 9px no-repeat;
}
input[type="checkbox"]:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
  outline-offset: 1px;
}
#issues-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--box-hi);
  color: var(--fg);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  line-height: 0;
}
#issues-btn:hover {
  border-color: var(--line-strong);
}
#issue-count {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--line);
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
#issue-count.hot {
  background: color-mix(in srgb, var(--bad) 24%, transparent);
  color: #ee8d84;
}

/* ----------------------------------------- */
/*  Status Indicators with Pulsing Animation */
/* ----------------------------------------- */

#live {
  --indicator-size: 8px;
}

#live {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 10px;
  margin: -10px 0;
}

/* The indicator and the wordmark are one control: the state of the live link, and the click that rebuilds it.
    A served page can rebuild its link, while a snapshot has nothing to reconnect to and stays inert. */
#live-btn {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 10px;
  padding: 5px 9px;
  margin: -7px -9px;
  border-radius: 8px;
}
#live-btn.reconnectable {
  cursor: pointer;
}
#live-btn.reconnectable:hover {
  background: var(--box-hi);
}
#live .status-dot {
  width: var(--indicator-size);
  height: var(--indicator-size);
  border-radius: 50%;
  position: relative;
  background-color: var(--faint);
  margin-top: 1px;
}

#live .status-dot::before,
#live .status-dot::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  background: inherit;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.3;
}

#live .status-dot::after {
  animation-delay: 1s;
}

@keyframes indicator-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.5);
    opacity: 0;
  }
}

@keyframes indicator-pulse-bad {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

#live .status-dot.on {
  background-color: var(--hi-in);
}
#live .status-dot.on::before,
#live .status-dot.on::after {
  animation: indicator-pulse 2s infinite linear;
}
#live .status-dot.off {
  background-color: var(--bad);
}
#live .status-dot.off::before,
#live .status-dot.off::after {
  animation: indicator-pulse-bad 1s infinite linear;
}

#wrap {
  position: relative;
  padding: 24px 24px 20px;
  width: max-content;
  min-width: 100%;
}
body.panning, body.panning .chip {
  cursor: grabbing;
}
#edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}
#edges path.hit {
  pointer-events: stroke;
  stroke: transparent;
  stroke-width: 10;
  fill: none;
}
#edges path.edge {
  fill: none;
  stroke-linecap: round;
}
#edges path.ok {
  stroke: var(--ok);
  stroke-width: 1.1;
  opacity: 0.45;
}
/* A slicing lean is legal and load-bearing for the re-slice reading, so it sits above the ordinary dependency's fade without reaching the severity weights. */
#edges path.lean {
  stroke: var(--lean);
  stroke-width: 1.3;
  opacity: 0.85;
}
/* A declared embed ships files to another runtime as source: real dataflow, no binding, so it draws dashed in its own hue. */
#edges path.ships {
  stroke: var(--ships);
  stroke-width: 1.3;
  stroke-dasharray: 7 4;
  opacity: 0.1;
}
/* The declared entry is where the other runtime enters the shipped files, so its handoff draws solid above the fan. */
#edges path.ships.entry {
  stroke-dasharray: none;
  stroke-width: 1.6;
  opacity: 1;
}
#edges path.type {
  stroke: var(--type);
  stroke-width: 1;
  stroke-dasharray: 2 4;
  opacity: 0.6;
}
#edges path.smell {
  stroke: var(--smell);
  stroke-width: 1.6;
  stroke-dasharray: 7 5;
  opacity: 0.95;
}
#edges path.violation {
  stroke: var(--bad);
  stroke-width: 2;
  opacity: 1;
  filter: drop-shadow(
    0 0 3px color-mix(in srgb, var(--bad) 45%, transparent)
  );
}
/* A laundered finding is real in the graph yet invisible to any single reference, so it reads as its own severity rather than as a violation. */
#edges path.laundered {
  stroke: var(--laundered);
  stroke-width: 1.8;
  opacity: 1;
  filter: drop-shadow(
    0 0 3px color-mix(in srgb, var(--laundered) 40%, transparent)
  );
}
/* A bundled arrow carries every reference between two folded ranks, so its weight reads the count while its colour keeps the worst verdict among them. */
#edges path.edge.bundled {
  stroke-width: clamp(1.5px, calc(0.9px + var(--n, 1) * 0.3px), 4.5px);
}
/* An edge closing a reference cycle is legal where it stands, and the cycle it closes is the finding, so it paints as the cycle rather than as a breach of its own (CHANNEL.5). */
#edges path.cycle {
  stroke: var(--cycle);
  stroke-width: 1.8;
  opacity: 1;
  filter: drop-shadow(
    0 0 3px color-mix(in srgb, var(--cycle) 40%, transparent)
  );
}
/* A diagonal reference, the shape no ELDA row draws, reads at full strength and a touch brighter so it stands out from the orthogonal legal runs. */
#edges path.edge.diagonal {
  opacity: 1;
  filter: brightness(1.5);
}
/* The invisible hit path sits right after its edge, so hovering it lifts the arrow underneath the cursor a touch above its neighbours. */
#edges path.edge:has(+ .hit:hover) {
  opacity: 1;
  filter: brightness(1.45);
}
#edges.focused path.edge {
  opacity: 0.05;
  filter: none;
}
#edges.focused path.edge.hi-out {
  stroke: var(--hi-out);
  opacity: 1;
  stroke-width: 1.8;
  stroke-dasharray: none;
  filter: drop-shadow(
    0 0 4px color-mix(in srgb, var(--hi-out) 50%, transparent)
  );
}
#edges.focused path.edge.hi-in {
  stroke: var(--hi-in);
  opacity: 1;
  stroke-width: 1.8;
  stroke-dasharray: none;
  filter: drop-shadow(
    0 0 4px color-mix(in srgb, var(--hi-in) 50%, transparent)
  );
}
/* A reach walk raises a whole closure, so distance reads as fade: the first hop carries full strength, each further hop steps back, and the floor keeps the far side of a deep closure legible. */
#wrap.reach #edges path.edge.hi-out,
#wrap.reach #edges path.edge.hi-in {
  opacity: clamp(0.3, calc(1.08 - var(--hop, 1) * 0.16), 1);
}
#wrap.reach .chip.rel-out,
#wrap.reach .chip.rel-in {
  opacity: clamp(0.45, calc(1.1 - var(--hop, 1) * 0.13), 1);
}
/* A raised cycle has no direction to read: every file in it reaches every other, so its closing edges all light the same way. */
#edges.focused path.edge.hi-cycle {
  stroke: var(--cycle);
  opacity: 1;
  stroke-width: 2;
  stroke-dasharray: none;
  filter: drop-shadow(
    0 0 4px color-mix(in srgb, var(--cycle) 55%, transparent)
  );
}
/* Each legend swatch is a filter: turning it off drops that kind of edge, and the matching hit path with it, so the diagram narrows to the connections you asked to see. */
/* The in and out swatches gate the focus highlights, so their toggles read only while a file is focused. */
body:has(#leg-ok:not(:checked)) #edges path.ok {
  display: none;
}
body:has(#leg-ships:not(:checked)) #edges path.ships {
  display: none;
}
body:has(#leg-type:not(:checked)) #edges path.type {
  display: none;
}
body:has(#leg-in:not(:checked)) #edges path.hi-in {
  display: none;
}
body:has(#leg-out:not(:checked)) #edges path.hi-out {
  display: none;
}
body:has(#leg-violation:not(:checked)) #edges path.violation {
  display: none;
}
body:has(#leg-laundered:not(:checked)) #edges path.laundered {
  display: none;
}
body:has(#leg-cycle:not(:checked)) #edges path.cycle {
  display: none;
}
body:has(#leg-smell:not(:checked)) #edges path.smell {
  display: none;
}
body:has(#leg-lean:not(:checked)) #edges path.lean {
  display: none;
}

#root-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 28px;
}
.root-block {
  position: relative;
  align-self: stretch;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--root-bd) 45%, var(--line));
  background: color-mix(in srgb, var(--root-bg) 45%, var(--box));
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.root-block .bar-title {
  margin-right: 10px;
  font: 600 11.5px var(--mono);
  color: color-mix(in srgb, var(--root-bd) 55%, var(--fg));
}
.root-inner {
  position: sticky;
  left: 8px;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  width: max-content;
  max-width: calc(100vw - 64px);
}
.root-inner .hide-btn {
  position: static;
  margin-right: 6px;
}
#main {
  display: flex;
  align-items: flex-start;
}
#nondomains {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: flex-start;
  padding-right: 24px;
  margin-right: 24px;
  border-right: 1px dashed var(--line);
}
/* The column's own "display" outranks the "hidden" attribute, so restore the hide when nothing unclassified is left to show, dropping the empty gutter. */
#nondomains[hidden] {
  display: none;
}
#other-box {
  position: relative;
  border: 1px solid var(--line-strong);
  background: var(--box);
  border-radius: 12px;
  padding: 8px 30px 8px 12px;
  box-shadow: var(--shadow);
  font: 600 11.5px var(--mono);
  color: var(--muted);
}
/* A file the classifier could not place carries no layer and no owner, so no rule is read on it. The box says so: dashed, because nothing here is held. */
#other-box {
  border-style: dashed;
  border-color: var(--bad);
}
#other-box[hidden] {
  display: none;
}
.hide-btn {
  position: absolute;
  top: 4px;
  right: 5px;
  z-index: 25;
  border: 0;
  background: none;
  border-radius: 5px;
  color: var(--faint);
  font: 11px/1 var(--sans);
  padding: 3px 5px;
  cursor: pointer;
}
.hide-btn:hover {
  color: var(--fg);
  background: rgb(128 128 128 / 0.18);
}

#domains {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
  column-gap: 32px;
  row-gap: 0;
  justify-content: start;
}
.domain {
  display: grid;
  grid-row: 1 / -2;
  grid-template-rows: subgrid;
  border: 1px solid var(--line-strong);
  background: var(--box);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow);
}
/* Only a domain that holds hidden files spans into the shared shelf row, so the other boxes keep their height. */
.domain.has-hidden {
  grid-row: 1 / -1;
}
.domain.has-hidden > .grid {
  grid-row: 2 / -2;
}
.domain > .footer {
  grid-row: -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  padding: 6px 10px;
  border-top: 1px dashed var(--line);
  background: rgb(0 0 0 / 0.18);
}
.footer .flabel {
  appearance: none;
  border: 0;
  background: none;
  padding: 16px 0;
  margin: -16px 0;
  cursor: pointer;
  font: 700 9px var(--sans);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  margin-right: 4px;
}
.footer .flabel .act {
  display: none;
  color: var(--fg);
}
.footer .flabel:hover .idle {
  display: none;
}
.footer .flabel:hover .act {
  display: inline;
}
.chip.ghost {
  opacity: 0.45;
  border-style: dashed;
  box-shadow: none;
}
.chip.ghost:hover {
  opacity: 0.85;
  filter: none;
}
.chip .gsub {
  color: var(--muted);
  font-weight: 400;
  font-size: 10px;
}
.domain > h2 {
  grid-row: 1;
  position: relative;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  padding: 6px 26px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  background: linear-gradient(
    180deg,
    rgb(255 255 255 / 0.035),
    transparent
  );
}
/* A core block is the sharedness DAG's bottom, reached from every feature block, and its header says so. */
.domain.core > h2 {
  color: var(--axioms-bd);
}
.domain.core > h2::after {
  content: "shared";
  margin-left: 7px;
  font: 400 9px var(--sans);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
}
/* The caret says which way the title goes: down for a box holding its columns, right for one folded into a single one. */
.domain > h2::before {
  content: "◢";
  position: absolute;
  left: 9px;
  color: var(--faint);
  font-size: 9px;
}
.domain.folded > h2::before {
  content: "◤";
}
.domain > h2:hover::before {
  color: var(--fg);
}
/* An aggregate stands for every file of one rank, so it reads as a count rather than a name. */
.chip.agg {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.chip.agg .agg-n {
  margin-left: 4px;
  font-size: 10px;
  font-weight: 400;
  color: var(--muted);
}
.grid {
  grid-row: 2 / -1;
  display: grid;
  grid-template-rows: subgrid;
  gap: 16px 12px;
  padding: 12px 14px;
}
/* The card behind a named subdomain's subtree; spacer tracks push sibling cards apart while unit columns inside share the tighter base gap. */
/* Nesting is unbounded, so depth is read as light rather than as indentation: each level sits on its parent and lifts a little further off the page, which keeps a deep subdomain legible without stealing width from its columns. */
.subpanel {
  margin: -5px -6px -7px;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.02);
  border: 1px solid transparent;
}
.subpanel[data-depth="2"] {
  background: rgb(255 255 255 / 0.035);
  border-color: rgb(255 255 255 / 0.05);
}
.subpanel[data-depth="3"] {
  background: rgb(255 255 255 / 0.05);
  border-color: rgb(255 255 255 / 0.07);
}
.subpanel[data-depth="4"] {
  background: rgb(255 255 255 / 0.065);
  border-color: rgb(255 255 255 / 0.09);
}
/* The bare composer and the bare axioms file lift out of the cake: the composer caps the (sub)domain as its sub-composition-root, the axioms file underlies it as the shared base. */
.subroot, .subbase {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 3px 5px;
  border-radius: 8px;
  z-index: 1;
}
.subroot {
  margin: -2px -4px 3px;
  border: 1px solid color-mix(in srgb, var(--services-bd) 35%, var(--line));
  background: color-mix(in srgb, var(--services-bg) 22%, transparent);
}
.subbase {
  margin: 3px -4px -2px;
  border: 1px solid color-mix(in srgb, var(--axioms-bd) 35%, var(--line));
  background: color-mix(in srgb, var(--axioms-bg) 22%, transparent);
}
/* A lone composer or base fills the band's full width; several share it evenly. */
.subroot .chip, .subbase .chip {
  flex: 1;
  justify-content: center;
}
/* The domain-root composer and base span the whole box, one nesting level out from the subdomain bands, so they read a touch stronger. */
.subroot.domainwide {
  border-color: color-mix(in srgb, var(--services-bd) 55%, var(--line));
  background: color-mix(in srgb, var(--services-bg) 32%, transparent);
}
.subbase.domainwide {
  border-color: color-mix(in srgb, var(--axioms-bd) 55%, var(--line));
  background: color-mix(in srgb, var(--axioms-bg) 32%, transparent);
}
.rail {
  grid-column: 1;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--faint);
  text-align: center;
  padding: 4px 0;
}
.grouphead {
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  text-align: center;
  padding: 0 4px 3px;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.colhead {
  font-size: 10px;
  color: var(--muted);
  text-align: center;
  padding: 0 4px;
  white-space: nowrap;
}
.grouphead:hover, .colhead:hover {
  color: var(--fg);
}
/* The board's y-axis carries the layer order, so distinct concerns at one rank sit side by side the way the band chips do. */
.cell {
  padding: 6px;
  border-radius: 8px;
  min-width: 86px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: flex-start;
  align-content: flex-start;
}
/* Files sharing one label in a cell are one unit split across kinds, so they form their own little column, importer on top, and the arrow between them keeps reading downward. */
.unit-stack {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}
.cell.surface {
  background: color-mix(in srgb, var(--surface-bg) 45%, transparent);
}
.cell.services {
  background: color-mix(in srgb, var(--services-bg) 30%, transparent);
}
.cell.harnesses {
  background: color-mix(in srgb, var(--harnesses-bg) 30%, transparent);
}
.cell.flows {
  background: color-mix(in srgb, var(--flows-bg) 30%, transparent);
}
.cell.unsorted {
  background: color-mix(in srgb, var(--surface-bg) 26%, transparent);
}
.chip.unsorted {
  border-style: dashed;
  color: var(--muted);
}
.cell.axioms {
  background: color-mix(in srgb, var(--axioms-bg) 30%, transparent);
}
.cell:empty {
  background: none;
}
/* A loner core module's cake cell spans the layer rows its one file stands for; in the dataflow view the file itself sits inside it. */
.cell.cake {
  border: 1px dashed var(--line);
  justify-content: center;
}
/* The hatch marks unextracted contents: the surface file owns value bindings no layer file carries yet. A loner that only re-exports keeps a plain cake. */
.cell.cake.obscured {
  background: repeating-linear-gradient(
    -45deg,
    rgb(128 128 128 / 0.09) 0 6px,
    transparent 6px 13px
  );
}

.chip {
  position: relative;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  padding: 2.5px 8px;
  border-radius: 6px;
  border: 1.5px solid var(--surface-bd);
  background: var(--surface-bg);
  font: 500 11px/1.5 var(--sans);
  color: var(--fg);
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
  transition: outline-offset ease 100ms;
}
.chip:hover {
  filter: brightness(1.12);
}
.chip.services {
  background: var(--services-bg);
  border-color: var(--services-bd);
  outline-color: var(--services-bd);
}
.chip.harnesses {
  background: var(--harnesses-bg);
  border-color: var(--harnesses-bd);
  outline-color: var(--harnesses-bd);
}
.chip.flows {
  background: var(--flows-bg);
  border-color: var(--flows-bd);
  outline-color: var(--flows-bd);
}
.chip.axioms {
  background: var(--axioms-bg);
  border-color: var(--axioms-bd);
  outline-color: var(--axioms-bd);
}
.chip .badge {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.3);
  color: var(--muted);
}
.chip.pinned {
  outline-width: 4px;
  outline-style: solid;
  outline-offset: 2px;
}
.chip.dim {
  opacity: 0.22;
}
.chip.rel-out {
  outline: 2px solid var(--hi-out);
  outline-offset: 1px;
}
.chip.rel-in {
  outline: 2px solid var(--hi-in);
  outline-offset: 1px;
}
.chip.cycle-member {
  outline: 2px solid var(--cycle);
  outline-offset: 1px;
}
/* A chip that carries a finding wears a dot in the finding's worst severity, sitting on the chip's top-right corner; clicking it opens the drawer at that finding. */
.chip .finding-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--box);
  background: var(--muted);
  cursor: pointer;
}
.chip .finding-dot:hover {
  transform: scale(1.25);
}
.chip .finding-dot.sev-violation {
  background: var(--bad);
}
.chip .finding-dot.sev-cycle {
  background: var(--cycle);
}
.chip .finding-dot.sev-laundered {
  background: var(--laundered);
}
.chip .finding-dot.sev-smell {
  background: var(--smell);
}
.chip .finding-dot.sev-lean {
  background: var(--lean);
}
/* The review-signal tier is not a breach, so its dot reads as absence: hollow, none of the severity colours. */
.chip .finding-dot.sev-dead {
  background: var(--box);
  border-color: var(--muted);
}
.root-block .chip, #other-box .chip {
  margin: 2px 3px;
}

#issues {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: var(--drawer-w);
  z-index: 40;
  overflow-y: hidden;
  background: color-mix(in srgb, var(--box) 92%, transparent);
  backdrop-filter: blur(12px);
  border-left: 1px solid var(--line);
  box-shadow: -12px 0 32px rgb(0 0 0 / 0.4);
  transform: translateX(100%);
  transition: transform 0.15s;

  display: flex;
  flex-direction: column;
}
#issues.open {
  transform: none;
}
.drawer-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  background: inherit;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.drawer-head-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.issue-search {
  flex: 1;
  min-width: 0;
  appearance: none;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--box-hi);
  color: var(--fg);
  font: inherit;
  font-size: 11.5px;
}
.issue-search::placeholder {
  color: var(--faint);
}
.issue-search:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
  outline-offset: 1px;
}
.filter-clear {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--box-hi);
  color: var(--muted);
  font: inherit;
  font-size: 10.5px;
  padding: 3px 9px;
  border-radius: 999px;
  cursor: pointer;
}
.filter-clear:hover {
  color: var(--fg);
  border-color: var(--line-strong);
}
/* The domain facet: one chip per domain a finding sits in, the lit one scoping the list. A crowded set folds into a select instead of wrapping. */
.drawer-facet:empty {
  display: none;
}
.dom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.dom-chip {
  appearance: none;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}
.dom-chip:hover {
  border-color: var(--line-strong);
  color: var(--fg);
}
.dom-chip.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--fg);
}
.dom-select {
  appearance: none;
  width: 100%;
  padding: 4px 9px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: var(--box-hi);
  color: var(--fg);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.drawer-body {
  overflow-y: auto;
  padding: 0 14px 14px;
}
*::-webkit-scrollbar {
  background: color-mix(in srgb, var(--box) 82%, transparent);
  width: 10px;
  height: 10px;
}
*::-webkit-scrollbar-thumb {
  background: var(--line-strong);
  border-radius: 5px;
  border: 2px solid var(--box);
}
.drawer-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.drawer-close {
  border: 0;
  background: none;
  color: var(--muted);
  font: 12px/1 var(--sans);
  padding: 4px 6px;
  border-radius: 5px;
  cursor: pointer;
}
.drawer-close:hover {
  color: var(--fg);
  background: rgb(128 128 128 / 0.18);
}
.drawer-empty {
  margin-top: 28px;
  text-align: center;
  color: var(--faint);
  font-size: 12px;
}
/* A section hidden by the category scope or a facet that emptied it leaves no header behind. */
.issue-section.filtered {
  display: none;
}
#issues .item.filtered {
  display: none;
}
#issues h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 16px 0 8px;
  cursor: pointer;
}
#issues h3:hover {
  color: var(--fg);
}
/* The caret says whether the section is open or folded; folding keeps the header and drops its items. */
.sec-caret::before {
  content: "▾";
  display: inline-block;
  font-size: 9px;
  color: var(--faint);
}
.issue-section.collapsed .sec-caret::before {
  content: "▸";
}
.issue-section.collapsed .item {
  display: none;
}
.sec-count {
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--line);
  color: var(--muted);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 15px;
  font-variant-numeric: tabular-nums;
}
/* The item the board just jumped to pulses once so the eye catches where it landed in the list. */
@keyframes item-flash {
  0% {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--hi-out) 60%, transparent);
  }
  100% {
    box-shadow: 0 0 0 3px transparent;
  }
}
#issues .item.flash {
  animation: item-flash 1.2s ease-out;
}
#issues .item {
  padding: 7px 9px;
  padding-left: 16px;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  border: 1px solid var(--line);
  background: var(--box-hi);
  font: 11px/1.5 var(--mono);
}
#issues .item:hover {
  border-color: var(--line-strong);
  background: #202634;
}
/* The finding the board is currently showing, kept lit so the list and the diagram agree on what is being read. */
#issues .item.selected {
  border-color: var(--hi-out);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--hi-out) 16%, transparent);
}
#issues .item .msg {
  color: var(--muted);
  font-size: 10.5px;
  white-space: pre-wrap;
  margin-top: 3px;
}
#issues .item.violation {
  background: linear-gradient(110deg, var(--bad), transparent 6%), linear-gradient(var(--box-hi), var(--box-hi));
}
#issues .item.smell, #issues .item.pressure {
  background: linear-gradient(110deg, var(--smell), transparent 6%), linear-gradient(var(--box-hi), var(--box-hi));
}
#issues .item.laundered {
  background: linear-gradient(110deg, var(--laundered), transparent 6%), linear-gradient(var(--box-hi), var(--box-hi));
}
#issues .item.cycle {
  background: linear-gradient(110deg, var(--cycle), transparent 6%), linear-gradient(var(--box-hi), var(--box-hi));
}
#issues .item.cycle .files {
  margin-top: 2px;
}
#issues .unresolved.item {
  color: var(--muted);
}
/* An unreachable file is not a breach, so it carries no severity stripe; only its path is actionable. */
#issues .unreachable.item {
  color: var(--muted);
}
/* A recommendation lists legal imports, so it takes the lean hue instead of a severity stripe. */
#issues .item.recommendation {
  background: linear-gradient(110deg, var(--lean), transparent 6%), linear-gradient(var(--box-hi), var(--box-hi));
}
/* An owning surface is an observation, so it carries no stripe either; the lint rule holds the severity and the counts. */
#issues .unextracted.item {
  color: var(--muted);
}
/* The path inside a finding is the way into the file: it underlines on hover so it reads as the link it is, while the item around it keeps its own click. */
#issues .item a.path {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted var(--line-strong);
}
#issues .item a.path:hover {
  color: var(--fg);
  border-bottom-color: var(--fg);
}

#tooltip {
  position: fixed;
  z-index: 50;
  max-width: 480px;
  padding: 8px 10px;
  border-radius: 8px;
  pointer-events: none;
  background: rgb(11 14 19 / 0.95);
  border: 1px solid var(--line-strong);
  color: #dbe2ea;
  font: 11px/1.5 var(--mono);
  white-space: pre-wrap;
  display: none;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.55);
}
#tooltip .t-src {
  font-weight: 700;
  color: var(--fg);
}
#tooltip .t-row {
  margin-top: 2px;
}
#tooltip .t-spec {
  color: color-mix(in srgb, var(--hi-out) 55%, var(--fg));
}
#tooltip .t-kind {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgb(255 255 255 / 0.08);
  color: var(--muted);
  font-size: 9.5px;
}
#tooltip .t-names {
  color: color-mix(in srgb, var(--hi-in) 55%, var(--fg));
}
#tooltip .t-via, #tooltip .t-land {
  color: var(--muted);
}
#tooltip .t-verdict {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--line-strong);
  font: 11px/1.5 var(--sans);
  color: #c8cfd9;
  white-space: normal;
}
#tooltip .t-rule {
  font-family: var(--mono);
  font-weight: 700;
}
#tooltip .t-rule.violation {
  color: var(--bad);
}
#tooltip .t-rule.smell {
  color: var(--smell);
}

#bottombar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px 14px;
  background: color-mix(in srgb, var(--box) 82%, transparent);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--line);
  font-size: 11.5px;
}
#bottombar .bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
#bottombar .bar-label {
  color: var(--faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-right: 4px;
  min-width: 52px;
}
#bottombar .bar-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--box-hi);
  color: var(--fg);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
#bottombar .bar-btn:hover {
  border-color: var(--line-strong);
}
/* The hidden attribute hides at UA origin and any author display wins over it, so the display these blocks declare must re-yield to it explicitly. */
#notice[hidden],
#banner[hidden] {
  display: none;
}
/* The page-condition panel: it replaces the board while there is nothing trustworthy to draw, so it floats over the viewport rather than the document, which may be board-sized. */
#notice {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  cursor: default;
  user-select: text;
}
#notice.fatal {
  background: rgb(0 0 0 / 0.4);
}
#notice .notice-card {
  max-width: 560px;
  padding: 20px 26px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--box);
  box-shadow: var(--shadow);
}
#notice.fatal .notice-card {
  border-color: var(--bad);
}
#notice .notice-card h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
#notice .notice-card p {
  margin: 6px 0;
  color: var(--muted);
}
#notice .notice-card ul {
  margin: 6px 0;
  padding-left: 18px;
  color: var(--fg);
}
#notice .notice-card .notice-hint {
  color: var(--faint);
}
#notice .notice-card details {
  margin: 10px 0;
}
#notice .notice-card summary {
  color: var(--muted);
  cursor: pointer;
}
#notice .notice-card pre {
  max-height: 40vh;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font: 11px/1.5 var(--mono);
  white-space: pre-wrap;
}
.notice-btn {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--box-hi);
  color: var(--fg);
  font: inherit;
  cursor: pointer;
}
.notice-btn:hover {
  border-color: var(--accent);
}
#notice .spinner {
  width: 26px;
  height: 26px;
  margin: 0 auto 10px;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: notice-spin 0.9s linear infinite;
}
@keyframes notice-spin {
  to { transform: rotate(360deg); }
}
/* The header banner: conditions that narrow the picture without stopping it, riding the sticky header on its own full-width row. */
#banner {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0 2px;
  border-top: 1px solid var(--line);
}
#banner .banner-line {
  color: var(--smell);
  font-size: 12px;
}
`;