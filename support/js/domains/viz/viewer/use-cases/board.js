// ---------------------------------------------------------------------------
// The board's derived state - what one render pass computed and every reader takes from here: the chip map keyed by file id, the drawn edge list, the cycle-closing edge set, the reach adjacency both ways, and the folded-domain aggregates.
// The render service commits here and the readers call the accessors, so no live mutable binding crosses the module boundary (CHANNEL.4).
// The two slots are the composer's ports: it fills them with the rebuild pipeline and the pin application it composes, so a handler anywhere below asks the board and never a service.

let _chips = new Map();
let _drawn = [];
let _cycleClosers = new Set();
let _adjOut = new Map();
let _adjIn = new Map();
let _compactRep = new Map();
let _compactFiles = new Map();

export const chips = () => _chips;
export const drawn = () => _drawn;
export const cycleClosers = () => _cycleClosers;
export const adjOut = () => _adjOut;
export const adjIn = () => _adjIn;
export const compactRep = () => _compactRep;
export const compactFiles = () => _compactFiles;

// One commit per render pass: the pass hands over whichever pieces it rebuilt, and everything it names replaces the previous reading whole.
export const commit = (derived) => {
  if (derived.chips) _chips = derived.chips;
  if (derived.drawn) _drawn = derived.drawn;
  if (derived.cycleClosers) _cycleClosers = derived.cycleClosers;
  if (derived.adjOut) _adjOut = derived.adjOut;
  if (derived.adjIn) _adjIn = derived.adjIn;
  if (derived.compactRep) _compactRep = derived.compactRep;
  if (derived.compactFiles) _compactFiles = derived.compactFiles;
};

let _rebuild = () => {};
export const onRebuild = (fn) => {
  _rebuild = fn;
};
export const rebuild = () => _rebuild();

let _applyPin = () => {};
export const onApplyPin = (fn) => {
  _applyPin = fn;
};
export const applyPin = () => _applyPin();
