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
  --adapters-bg: #24402a;
  --adapters-bd: #6fa05c;
  --use-cases-bg: #4a2b29;
  --use-cases-bd: #b06055;
  --entities-bg: #464023;
  --entities-bd: #b5a24e;
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
.counts .sev-smell b {
  color: var(--smell);
}
.counts .sev-laundered .dot {
  background: var(--laundered);
}
.counts .sev-laundered b {
  color: var(--laundered);
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
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  margin-left: 6px;
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
/* The column's own "display" outranks the "hidden" attribute, so restore the hide when core and the roots leave nothing to show, dropping the empty gutter. */
#nondomains[hidden] {
  display: none;
}
#core-box, #other-box {
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
/* The bare composer and the bare entities file lift out of the cake: the composer caps the (sub)domain as its sub-composition-root, the entities file underlies it as the shared base. */
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
  border: 1px solid color-mix(in srgb, var(--entities-bd) 35%, var(--line));
  background: color-mix(in srgb, var(--entities-bg) 22%, transparent);
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
  border-color: color-mix(in srgb, var(--entities-bd) 55%, var(--line));
  background: color-mix(in srgb, var(--entities-bg) 32%, transparent);
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
.cell {
  padding: 6px;
  border-radius: 8px;
  min-width: 86px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
}
.cell.surface {
  background: color-mix(in srgb, var(--surface-bg) 45%, transparent);
}
.cell.services {
  background: color-mix(in srgb, var(--services-bg) 30%, transparent);
}
.cell.adapters {
  background: color-mix(in srgb, var(--adapters-bg) 30%, transparent);
}
.cell.use-cases {
  background: color-mix(in srgb, var(--use-cases-bg) 30%, transparent);
}
.cell.entities {
  background: color-mix(in srgb, var(--entities-bg) 30%, transparent);
}
.cell:empty {
  background: none;
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
}
.chip:hover {
  filter: brightness(1.12);
}
.chip.services {
  background: var(--services-bg);
  border-color: var(--services-bd);
  outline-color: var(--services-bd);
}
.chip.adapters {
  background: var(--adapters-bg);
  border-color: var(--adapters-bd);
  outline-color: var(--adapters-bd);
}
.chip.use-cases {
  background: var(--use-cases-bg);
  border-color: var(--use-cases-bd);
  outline-color: var(--use-cases-bd);
}
.chip.entities {
  background: var(--entities-bg);
  border-color: var(--entities-bd);
  outline-color: var(--entities-bd);
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
.root-block .chip, #core-box .chip, #other-box .chip {
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
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: inherit;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
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
#issues h3 {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 16px 0 8px;
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
#issues .item.smell {
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
`;