// ---------------------------------------------------------------------------
// Boot, toggles, live reload.
// This is the entry module: it imports the others so their bodies evaluate, and its own body runs last, wiring the header and starting the first load once every definition is in place.
// interactions registers its handlers as a side effect and nothing takes its exports, so it is imported for effect; issues loads through render, which uses it.

import "./interactions.js";

import { drawEdges, updateStickyEdges } from "./edges.js";
import { applyPin } from "./focus.js";
import { render } from "./render.js";
import { $, INLINE, TOGGLES, data, loadPrefs, savePrefs, setData } from "./state.js";

for (const id of TOGGLES)
  $(id).addEventListener("change", () => {
    savePrefs();
    render();
  });

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawEdges();
    applyPin();
  }, 120);
});

// The composition-root chips are viewport-sticky, so horizontal scrolling moves them relative to the board; re-aim their arrows once per frame, in place.
let scrollRaf = 0;
addEventListener(
  "scroll",
  () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateStickyEdges();
    });
  },
  { passive: true },
);

// The indicator carries the state of the live link, and the control around it says how to get the link back.
const setLive = (on) => {
  const dot = $("live").querySelector(".status-dot");
  dot.classList.toggle("on", on);
  dot.classList.toggle("off", !on);
  $("live-btn").setAttribute(
    "title",
    on
      ? "Live reload: on - click to reconnect and refresh"
      : "Live reload: off - click to reconnect now, or wait for the retry",
  );
};

// The served page runs the markup and the script the server handed it, and the server stamps which one that was.
// A stamp that moves means this page is running code the server has replaced, and that is the one thing a reload is for; everything else the page can take from a fresh graph, keeping the pin, the folds, the drawer and the scroll where they were.
let viewerStamp = null;

async function load() {
  try {
    setData(INLINE ?? (await (await fetch("/data.json")).json()));
    if (!INLINE) {
      if (viewerStamp !== null && data.viewer !== viewerStamp) {
        location.reload();
        return;
      }
      viewerStamp = data.viewer ?? null;
    }
    $("app-name").textContent = data.app;
    document.title = `ELDA · ${data.app}`;
    loadPrefs();
    render();
  } catch (error) {
    // A failed fetch is the live indicator's business; a failed render is a viewer bug, and swallowing it leaves a half-drawn board with an empty drawer and no trace, which is the worst of the silences.
    console.error(error);
    if (!INLINE) setLive(false);
  }
}

// An EventSource retries a dropped connection on its own and keeps retrying while nothing answers, so the link itself comes back once the server does, and it always did.
// What never came back is the graph. A restarted server scans the tree afresh and then says nothing until the next file changes, so the page went on drawing the tree the dead process had sent it, and reloading by hand was the only way to catch up. A stream that opens a second time reads the graph again, which is what that hand reload was really for.
// A click on the indicator asks the same question at once, rather than on the next retry.
let stream = null;
let retryTimer = 0;
let backoff = 1000;
let opened = false;

function connect() {
  clearTimeout(retryTimer);
  stream?.close();
  stream = new EventSource("/events");
  stream.onopen = () => {
    backoff = 1000;
    setLive(true);
    if (opened) load();
    opened = true;
  };
  stream.onmessage = load;
  stream.onerror = () => {
    setLive(false);
    // A stream still in CONNECTING is retrying on its own, which is the ordinary case for a server that went away.
    // A closed one has given up for good - a response the browser refused, rather than a server that is merely absent - and only that needs a new stream.
    if (stream.readyState !== EventSource.CLOSED) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 10000);
  };
}

if (!INLINE) {
  $("live-btn").classList.add("reconnectable");
  $("live-btn").addEventListener("click", (ev) => {
    // The board's own click handler clears the pin, and reconnecting is no reason to lose it.
    ev.stopPropagation();
    backoff = 1000;
    connect();
  });
  connect();
}
// The entry module's body runs after every module it imports has evaluated, so by here every definition and every piece of state is in place; this starts the first load.
await load();
