// Tests the attachment reader on one PDF from your disk and prints exactly what happens.
// Usage: npm run readtest -- "C:\path\Paystub.pdf" [password]
import fs from "node:fs";
import { extract, PasswordRequired } from "../src/attachments.js";

const [file, password] = process.argv.slice(2);
if (!file) { console.log('Usage: npm run readtest -- "C:\\path\\Paystub.pdf" [password]'); process.exit(1); }
console.log("Node", process.version, process.platform, process.arch);
try {
  const r = await extract(file.split(/[\\/]/).pop()!, "application/pdf", fs.readFileSync(file), password);
  console.log("note:", r.note ?? "(none)");
  console.log("text chars:", r.text?.length ?? 0, "| page pictures:", r.images?.length ?? 0);
  if (r.text) console.log("--- first 300 chars ---\n" + r.text.slice(0, 300));
  if (r.images?.length) { const out = file + ".page1.png"; fs.writeFileSync(out, Buffer.from(r.images[0].data, "base64")); console.log("Saved page 1 picture to", out); }
} catch (e) {
  console.log(e instanceof PasswordRequired ? (e.wrong ? "RESULT: wrong password" : "RESULT: PDF is password protected. Add the password after the file path.") : "ERROR: " + ((e as Error).stack ?? e));
}
