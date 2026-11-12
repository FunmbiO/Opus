import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { decrypt } from "../src/crypto.js";

/** npm run restore -- data/backups/opus-....db.enc   Writes data/restored.db. It never overwrites your live database. */
const f = process.argv[2];
if (!f || !existsSync(f)) { console.error("Usage: npm run restore -- <backup file>"); process.exit(1); }
writeFileSync("data/restored.db", decrypt(readFileSync(f)));
console.log("Wrote data/restored.db.\nTo use it: stop Opus, rename data/aide.db to aide.db.old, rename restored.db to aide.db, start Opus.");
