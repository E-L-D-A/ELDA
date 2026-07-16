// ---------------------------------------------------------------------------
// Interactions: delegated hover and pinning, grab panning, the tooltip.

import { getEditorLink } from "./entities.js";
import { edgeTip, endLabel } from "./edges.use-cases.js";
import { applyPin, blur, focus } from "./focus.use-cases.js";
import { place } from "./placement.use-cases.js";
import { compactFiles, drawn, render } from "./render.use-cases.js";
import {
  data,
  hiddenFiles,
  markSelection,
  pinnedCycle,
  pinnedPath,
  setPin,
  setPinCycle,
  setSelected,
  tooltip,
  wrap,
} from "./entities.js";

// Chip and edge pointer work arrives by delegation on the board, so a render rebinds nothing.
// The over/out pair also fires for child-to-child moves inside one chip, and relatedTarget filters those out.
wrap.addEventListener("pointerover", (e) => {
  if (e.target.classList.contains("hit")) {
    showTip(e, edgeTip(drawn()[Number(e.target.dataset.i)]));
    return;
  }
  const chip = e.target.closest(".chip");
  if (!chip || chip.contains(e.relatedTarget)) return;
  const f = data().files[Number(chip.dataset.id)];
  if (chip.classList.contains("ghost")) {
    showTip(e, `${f.path}\nhidden - click to restore`);
    return;
  }
  // Under a reach walk the counts are the point of the hover: how much this file pulls in, and how much breaks when it changes.
  const { out, inc, deep } = focus(f.id);
  // An aggregate stands for a whole rank of a folded domain, so its tip names the files it folded away.
  const held = compactFiles().get(f.id);
  const head = held
    ? [
        `${endLabel(f.id)} · ${held.length} file${held.length > 1 ? "s" : ""}`,
        ...held.slice(0, 10).map((x) => "  " + x.path),
        held.length > 10 ? `  + ${held.length - 10} more` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : f.path;
  // A contested, unreached, or binding-owning file carries its condition on the hover, so the chip's paint explains itself where the pointer already is.
  const notes = [
    f.dispute,
    f.unreached ? `unreached - ${f.unreached}` : null,
    f.owns?.length ? `owns ${f.owns.join(", ")} - contents no layer file carries yet` : null,
  ].filter(Boolean);
  const body = notes.length ? `${head}\n${notes.join("\n")}` : head;
  showTip(e, deep ? `${body}\ndepends on ${out.size} · depended on by ${inc.size}` : body);
});
wrap.addEventListener("pointerout", (e) => {
  if (e.target.classList.contains("hit")) {
    hideTip();
    return;
  }
  const chip = e.target.closest(".chip");
  if (!chip || chip.contains(e.relatedTarget)) return;
  blur(pinnedPath() === null && pinnedCycle() === null, true);
  hideTip();
});
wrap.addEventListener("pointermove", (e) => {
  if (tooltip.style.display === "block") moveTip(e);
});
wrap.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  e.stopPropagation();
  const f = data().files[Number(chip.dataset.id)];
  if (chip.classList.contains("ghost")) {
    hiddenFiles.delete(f.path);
    hideTip();
    render();
    return;
  }
  if (e.ctrlKey || e.altKey) {
    window.location.href = getEditorLink(f.path);
  }
  // A pin taken from the board is not a finding, so the drawer's selection lets go.
  setPinCycle(null);
  setSelected(null);
  setPin(pinnedPath() === f.path ? null : f.path);
  render();
});
// A file joins the hidden shelf with its pin cleared when it was the pinned one.
function banish(f) {
  hiddenFiles.add(f.path);
  if (pinnedPath() === f.path) {
    setPin(null);
    setSelected(null);
  }
}

// Middle-click banishes a domain file to its domain's hidden shelf, taking every edge that touches it along; the shelf chip's ordinary click brings it back.
// On a subdomain or column head, the same click banishes every file the head spans.
wrap.addEventListener("auxclick", (e) => {
  if (e.button !== 1) return;
  const head = e.target.closest(".grouphead, .colhead");
  const chip = e.target.closest(".chip");
  // An aggregate is a whole rank of a folded domain, so there is no one file behind it to banish.
  if (chip?.classList.contains("agg")) return;
  if (!head && !chip) return;
  e.preventDefault();
  if (head) {
    const { domain, sub, unit } = head.dataset;
    for (const f of data().files) {
      const p = place(f);
      if (p.area !== "domain" || p.domain !== domain || p.sub !== sub) continue;
      if (unit !== undefined && p.unit !== unit) continue;
      banish(f);
    }
  } else {
    const f = data().files[Number(chip.dataset.id)];
    if (chip.classList.contains("ghost")) hiddenFiles.delete(f.path);
    else {
      if (place(f).area !== "domain") return;
      banish(f);
    }
  }
  hideTip();
  render();
});
// Canceling the middle-button pointerdown keeps the browser's autoscroll mode off the hideable targets.
wrap.addEventListener("pointerdown", (e) => {
  if (e.button === 1 && e.target.closest(".chip, .grouphead, .colhead")) e.preventDefault();
});
document.body.addEventListener("click", () => {
  if (!suppressClick && (pinnedPath() !== null || pinnedCycle() !== null)) {
    setPin(null);
    setPinCycle(null);
    setSelected(null);
    applyPin();
    markSelection();
  }
});

// Grab panning: dragging the board scrolls the page on both axes, with momentum on release.
// Interactive elements keep their own pointer behavior, and a drag suppresses the click that would otherwise clear the pin.

const scroller = document.scrollingElement;
let pan = null,
  coast = 0,
  suppressClick = false;

document.addEventListener("pointerdown", (e) => {
  if (
    e.button !== 0 ||
    e.target.closest(".chip, button, input, label, a, header, #issues, #bottombar")
  )
    return;
  cancelAnimationFrame(coast);
  pan = {
    x: e.clientX,
    y: e.clientY,
    vx: 0,
    vy: 0,
    t: performance.now(),
    moved: false,
  };
});
addEventListener("pointermove", (e) => {
  if (!pan) return;
  const dx = e.clientX - pan.x,
    dy = e.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 4) return;
  if (!pan.moved) {
    pan.moved = true;
    document.body.classList.add("panning");
  }
  const now = performance.now(),
    dt = Math.max(now - pan.t, 1);
  pan.vx = 0.75 * ((dx / dt) * 16) + 0.25 * pan.vx;
  pan.vy = 0.75 * ((dy / dt) * 16) + 0.25 * pan.vy;
  scroller.scrollLeft -= dx;
  scroller.scrollTop -= dy;
  pan.x = e.clientX;
  pan.y = e.clientY;
  pan.t = now;
});
addEventListener("pointerup", () => {
  if (!pan) return;
  const { moved } = pan;
  let { vx, vy } = pan;
  pan = null;
  document.body.classList.remove("panning");
  if (!moved) return;
  suppressClick = true;
  setTimeout(() => {
    suppressClick = false;
  }, 0);
  const step = () => {
    vx *= 0.92;
    vy *= 0.92;
    if (Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4) return;
    scroller.scrollLeft -= vx;
    scroller.scrollTop -= vy;
    coast = requestAnimationFrame(step);
  };
  coast = requestAnimationFrame(step);
});
addEventListener("wheel", () => cancelAnimationFrame(coast), { passive: true });

// The tip content is a plain string for chips and a built element for edges.
function showTip(ev, content) {
  if (typeof content === "string") tooltip.textContent = content;
  else tooltip.replaceChildren(content);
  tooltip.style.display = "block";
  moveTip(ev);
}
function moveTip(ev) {
  const pad = 12;
  tooltip.style.left = Math.min(ev.clientX + pad, innerWidth - tooltip.offsetWidth - pad) + "px";
  tooltip.style.top = Math.min(ev.clientY + pad, innerHeight - tooltip.offsetHeight - pad) + "px";
}
function hideTip() {
  tooltip.style.display = "none";
}
