// The host bindings: the document lookups every builder shares, and the element builder.
// This is the one place the viewer touches the document API outside its services, so everything below the adapters row stays pure.

export const $ = (id) => document.getElementById(id);
export const wrap = $("wrap"),
  svg = $("edges"),
  tooltip = $("tooltip");

// Element builder: `class` and `style` arrive as strings, any other key assigns an element property when one exists (checked, hidden, on* handlers) and an attribute otherwise.
// Child arrays flatten one level and nullish children drop, so callers can pass map results directly.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}
