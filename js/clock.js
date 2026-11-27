// The game's clock: real time plus a debug offset (device preference, never
// saved in the save). Everything that reads "now" for the rules goes through
// here, so the debug menu can skip time forward.

let offset = 0;

export const now = () => Date.now() + offset;
export const getOffset = () => offset;
export function setOffset(ms) { offset = Math.max(0, Number(ms) || 0); }
