import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIXTURE = join(import.meta.dir, "fixture");

/** A fresh copy of the test folder in a temp dir (the fixture itself is never touched). */
export function copyFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "jobhunt-test-"));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

export function emptyTemp(): string {
  return mkdtempSync(join(tmpdir(), "jobhunt-test-"));
}

export function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

export const csvPath = (dir: string) => join(dir, "data", "applications.csv");
export const readCsv = (dir: string) => readFileSync(csvPath(dir), "utf-8");
export const writeCsv = (dir: string, text: string) => writeFileSync(csvPath(dir), text);
