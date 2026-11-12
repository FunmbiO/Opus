import { createInterface } from "node:readline";
import { AuthError, setPassword } from "../src/auth.js";

/** Sets or resets the dashboard password. Run it on the PC Opus lives on. It signs every device out. */
function ask(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Hide what is typed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => { if (s.includes(q)) process.stdout.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}
const a = await ask("New password (12+ characters): ");
const b = await ask("Again: ");
if (a !== b) { console.error("Those did not match."); process.exit(1); }
try { setPassword(a); console.log("Password set. Every device is signed out; sign in with the new one."); }
catch (e) { console.error(e instanceof AuthError ? e.message : e); process.exit(1); }
process.exit(0);
