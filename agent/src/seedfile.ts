import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Personal setup lives in the seed/ folder, not in the code.
 * seed/NAME.json is yours and is never committed (see .gitignore).
 * seed/NAME.example.json is the template that ships with the repo and is used when yours is missing.
 */
const dir = fileURLToPath(new URL("../../seed/", import.meta.url));

export function seedJson<T>(name: string, fallback: T): T {
  for (const f of [`${name}.json`, `${name}.example.json`]) {
    const p = dir + f;
    if (!existsSync(p)) continue;
    try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch (e) { console.warn(`Could not read seed/${f}:`, e instanceof Error ? e.message : e); }
  }
  return fallback;
}
export const seedPath = (file: string) => dir + file;

export interface Profile {
  /** What Opus calls you. */
  name: string;
  /** One sentence about you, used in Opus's instructions. Optional. */
  about: string;
  /** Your business, if you run one. */
  business: string;
  /** Two or three sentences on what the business does and how inquiries arrive. */
  businessAbout: string;
}
const DEFAULT_PROFILE: Profile = { name: "the owner", about: "", business: "the business", businessAbout: "a small business that gets client inquiries by email." };
export const profile = (): Profile => ({ ...DEFAULT_PROFILE, ...seedJson<Partial<Profile>>("profile", {}) });
