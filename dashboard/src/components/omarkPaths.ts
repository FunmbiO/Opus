/** Shape data for the Opus O, shared by the SVG mark and the canvas orbit. Coordinates are in a 0..100 box. */
export const RING_FULL = [
  "M56 8C29 8 12 26 12 50C12 74 29 92 46 92C33 86 25 70 25 50C25 31 36 16 56 8Z",
  "M61 9C79 13 89 30 89 50C89 71 74 89 50 92C71 83 80 68 80 50C80 33 73 19 61 9Z",
];
export const RING_BOLD = [
  "M56 7C28 7 10 26 10 50C10 74 28 93 46 93C32 87 28 70 28 50C28 31 37 15 56 7Z",
  "M61 8C80 12 91 30 91 50C91 71 75 90 50 93C70 84 76 68 76 50C76 33 71 19 61 8Z",
];
/** Speed lines: [path, which gradient]. "a" runs ember to cream, "b" runs gold to cream. */
export const LINES_FULL: [string, "a" | "b"][] = [
  ["M0 55.6L70 58L0 59.4Z", "a"],
  ["M6 64.2L62 66.2L6 65.9Z", "b"],
  ["M31 71.4L54 72.6L31 72.9Z", "b"],
];
export const LINE_BOLD = "M0 54L74 58.5L0 62.5Z";
