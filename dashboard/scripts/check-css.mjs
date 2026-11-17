// Fails the build if styles.css has unbalanced braces. An unclosed block can silently swallow every rule after it
// (a browser just treats them as part of the open block), and nothing else notices.
import { readFileSync } from "node:fs";

const file = new URL("../src/styles.css", import.meta.url);
const css = readFileSync(file, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")        // comments
  .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""'); // strings (and with them, data: URLs)

let depth = 0, line = 1, opened = 0;
for (const ch of css) {
  if (ch === "\n") line += 1;
  if (ch === "{") { depth += 1; opened += 1; }
  if (ch === "}") { depth -= 1; if (depth < 0) { console.error(`styles.css: an extra "}" near line ${line} (after comment removal)`); process.exit(1); } }
}
if (depth !== 0) { console.error(`styles.css: ${depth} block${depth === 1 ? " is" : "s are"} never closed.`); process.exit(1); }
console.log(`styles.css: ${opened} blocks, all closed.`);
