/**
 * `vite build --mode demo` makes the public, sample-data build for showing Opus on a website.
 * It has no server behind it, makes no network calls (see netFetch in api.ts) and contains nothing private.
 */
export const DEMO_BUILD = import.meta.env.MODE === "demo";

/** `?embed=1` is for living inside an iframe on another site: no opening animation, no install tip, a slimmer notice. */
export const EMBED = DEMO_BUILD && typeof location !== "undefined" && new URLSearchParams(location.search).get("embed") === "1";
