// The resume photo. It is kept OUTSIDE the job-search folder (in the program's own data folder on this computer),
// because everything inside the folder is readable by the AI. Only this program touches it: it goes into the
// preview, the PDF print and the Word file, never into the folder and never to any AI.
//
// The browser crops and resizes the picture before it gets here (that also drops its EXIF: GPS position, camera,
// date). The server does not trust that: it accepts a JPEG only, throws away every metadata block and comment, and
// checks the size, so a file sent by anything else is cleaned the same way.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type Photo = { bytes: Uint8Array; width: number; height: number };

/** Where photos live: JOBHUNT_DATA_DIR (tests), else the usual per-user program data folder. Never inside a job folder. */
export function dataDir(): string {
  const env = process.env.JOBHUNT_DATA_DIR;
  if (env) return resolve(env);
  if (process.platform === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "jobhunt-kit");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "jobhunt-kit");
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "jobhunt-kit");
}

/** One photo per job folder: two people's folders on one computer never share a picture. */
export function photoFile(dir: string, folderRoot: string): string {
  const key = resolve(folderRoot);
  const id = createHash("sha256").update(process.platform === "win32" ? key.toLowerCase() : key).digest("hex").slice(0, 16);
  return join(dir, "photos", `${id}.jpg`);
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** The same JPEG with only the picture left (no APPn: EXIF, GPS, ICC, thumbnails; no comments), plus its size.
 * null when it is not a plain JPEG we can read. */
export function cleanJpeg(b: Uint8Array): Photo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const out: number[][] = [[0xff, 0xd8]];
  let i = 2;
  let width = 0;
  let height = 0;
  for (;;) {
    while (i < b.length && b[i] === 0xff && b[i + 1] === 0xff) i++; // fill bytes
    if (i + 4 > b.length || b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xd9) return null; // ended before any picture data
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    if (m === 0xda) {
      if (!width || !height) return null;
      const parts = [...out.map((x) => Uint8Array.from(x)), b.subarray(i)];
      const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        bytes.set(p, at);
        at += p.length;
      }
      return { bytes, width, height };
    }
    if (SOF.has(m)) {
      height = (b[i + 5] << 8) | b[i + 6];
      width = (b[i + 7] << 8) | b[i + 8];
    }
    const metadata = (m >= 0xe0 && m <= 0xef) || m === 0xfe;
    if (!metadata) out.push(Array.from(b.subarray(i, i + 2 + len)));
    i += 2 + len;
  }
}

/** "data:image/jpeg;base64,..." → the cleaned photo. Throws a short reason (shown to the person) when it can't be used. */
export function photoFromDataUrl(url: unknown): Photo {
  const m = typeof url === "string" ? /^data:image\/jpe?g;base64,([A-Za-z0-9+/=]+)$/.exec(url) : null;
  if (!m) throw new PhotoError("format");
  const raw = Buffer.from(m[1], "base64");
  if (raw.length > MAX_PHOTO_BYTES) throw new PhotoError("big");
  const p = cleanJpeg(raw);
  if (!p) throw new PhotoError("format");
  return p;
}

export class PhotoError extends Error {
  constructor(public kind: "format" | "big") {
    super(kind);
  }
}

export function loadPhoto(file: string): Photo | null {
  try {
    if (!existsSync(file)) return null;
    return cleanJpeg(new Uint8Array(readFileSync(file)));
  } catch {
    return null;
  }
}

export function savePhoto(file: string, p: Photo): void {
  mkdirSync(join(file, ".."), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, p.bytes);
  renameSync(tmp, file);
}

export function deletePhoto(file: string): void {
  rmSync(file, { force: true });
}

export const dataUrl = (p: Photo) => `data:image/jpeg;base64,${Buffer.from(p.bytes).toString("base64")}`;
