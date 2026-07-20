// ---------------------------------------------------------------------------
// The page's own condition, drawn where the board would be: the first-load wait, the fault that stopped a render, the server that stopped answering, and the scan that found nothing.
// One panel owns the board-replacing states so they can never stack, and the banner in the header carries the conditions that do not stop the board - a derivation notice, a failed rescan - while the last good diagram stays readable.
// The wording lives in the axioms (NOTICE); this service only assembles states from it, and every message travels through the element builder, so a diagnosis quoting a path or a stack renders as the characters it holds.

import { NOTICE, emptyBody } from "../axioms/index.js";
import { $, h } from "../harnesses/dom.js";

const card = (cls, ...children) => {
  const panel = $("notice");
  panel.className = cls;
  panel.replaceChildren(h("div", { class: "notice-card" }, ...children));
  panel.hidden = false;
};

export const hideNotice = () => {
  $("notice").hidden = true;
};

// The board is gone and only a reload asks again from scratch, so the one control offered is exactly that.
const reloadButton = () => h("button", { class: "notice-btn", onclick: () => location.reload() }, NOTICE.reload);

// A render that threw is the viewer's own bug: the board below is not to be trusted, the stack is the report, and saying so beats a distorted page claiming to be a diagram.
export function showFatal(error) {
  const stack = (error && (error.stack ?? error.message)) || String(error);
  card(
    "fatal",
    h("h2", {}, NOTICE.fatalTitle),
    h("p", {}, NOTICE.fatalBody),
    h("details", {}, h("summary", {}, NOTICE.fatalDetail), h("pre", {}, stack)),
    reloadButton(),
  );
}

// Nothing on the board yet and no server to ask: the stream keeps retrying on its own, so the panel says what the dot in the header means and offers the impatient path.
export function showUnreachable() {
  card(
    "fatal",
    h("h2", {}, NOTICE.unreachableTitle),
    h("p", {}, NOTICE.unreachableBody),
    reloadButton(),
  );
}

// A scan that found nothing is an answer about the environment, so the panel carries the scan's own diagnoses and the remedy instead of an empty board.
export function showEmpty(app, reasons) {
  card(
    "empty",
    h("h2", {}, NOTICE.emptyTitle),
    h("p", {}, emptyBody(app)),
    reasons.length ? h("ul", {}, ...reasons.map((r) => h("li", {}, r))) : null,
    h("p", { class: "notice-hint" }, NOTICE.emptyHint),
  );
}

// Conditions that narrow the picture without stopping it, shown while the board stays up; an empty list takes the banner down.
export function renderBanner(items) {
  const banner = $("banner");
  banner.replaceChildren(...items.map((m) => h("div", { class: "banner-line" }, m)));
  banner.hidden = items.length === 0;
}
