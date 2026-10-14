// Installing the AI rules for the chosen mode (US, Taiwan, both) in the one-for-all kit (docs/plan-dual-market.zh-TW.md).
//
// The kit carries three rule sets in .kit/us, .kit/tw and .kit/both, each the AGENTS.md, playbooks and skills that were
// tested for that case. Claude Code and Codex only read the top-level AGENTS.md by themselves, so instead of telling the
// AI "go and read another file" the program copies the chosen set into place: AGENTS.md, playbooks/, .claude/skills/ and
// .agents/skills/ (Codex). Run by `jobhunt mode us|tw|both` (the AI may run it, pre-approved like check and read) and by
// the start screen of the app.
//
// - Only ever adds markets: a folder set to "both" cannot go back to one, and "us" cannot become "tw" (owner decision
//   2026-10-14). Nothing the person wrote is touched: resume.yaml, 104/ and profiles/ are created only when missing.
// - Every path written is a fixed name under the folder; anything that is a link instead of a plain file or folder stops it.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliTextFor } from "./cli.text.ts";
import { readMarketSync } from "./market.ts";
import { cleanMarkets, modeText, readModeSync, withLanguage, type MarketId } from "./mode.ts";

export type ModeName = "us" | "tw" | "both";

export const modeName = (markets: MarketId[]): ModeName => (markets.includes("us") && markets.includes("tw") ? "both" : markets.includes("us") ? "us" : "tw");
export const marketsOf = (name: ModeName): MarketId[] => (name === "both" ? ["us", "tw"] : [name]);

export class KitError extends Error {
  constructor(readonly code: "noKit" | "narrow" | "notPlain" | "bad", readonly detail = "") {
    super(code);
  }
}

/** Is this folder the one-for-all kit (it carries the rule sets)? */
export const isOneKit = (root: string) => existsSync(join(root, ".kit", "us", "AGENTS.md")) && existsSync(join(root, ".kit", "tw", "AGENTS.md"));

/** A path we are about to write must not be (or sit under) a link: the copy must land in this folder and nowhere else. */
function plain(root: string, rel: string, kind: "file" | "dir"): void {
  const parts = rel.split("/");
  let p = root;
  for (let i = 0; i < parts.length; i++) {
    p = join(p, parts[i]);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      return; // absent from here down
    }
    const last = i === parts.length - 1;
    if (st.isSymbolicLink() || (!last && !st.isDirectory()) || (last && (kind === "file" ? !st.isFile() : !st.isDirectory())))
      throw new KitError("notPlain", parts.slice(0, i + 1).join("/"));
  }
}

function writeAtomic(root: string, rel: string, data: Buffer | string): void {
  plain(root, rel, "file");
  const to = join(root, ...rel.split("/"));
  mkdirSync(join(to, ".."), { recursive: true });
  const tmp = `${to}.tmp-install`;
  writeFileSync(tmp, data);
  renameSync(tmp, to);
}

/** Every file under `dir`, as forward-slash paths relative to it. */
function filesUnder(dir: string, base = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(join(dir, e.name), `${base}${e.name}/`) : e.isFile() ? [`${base}${e.name}`] : [],
  );
}

/** Replace the whole content of a kit-owned folder (playbooks/, .claude/skills/, .agents/skills/) by `from`'s. */
function replaceDir(root: string, rel: string, from: string): number {
  plain(root, rel, "dir");
  const to = join(root, ...rel.split("/"));
  rmSync(to, { recursive: true, force: true });
  let n = 0;
  for (const f of filesUnder(from)) {
    writeAtomic(root, `${rel}/${f}`, readFileSync(join(from, ...f.split("/"))));
    n++;
  }
  mkdirSync(to, { recursive: true });
  return n;
}

export type Installed = { mode: ModeName; markets: MarketId[]; files: number; created: string[] };

/** Install the rules for `markets` (see the file header). Throws KitError. */
export function installMode(root: string, wanted: MarketId[]): Installed {
  const markets = cleanMarkets(wanted);
  if (!markets.length) throw new KitError("bad");
  if (!isOneKit(root)) throw new KitError("noKit");
  const now = readModeSync(root);
  if (now.source === "mode" && !now.markets.every((m) => markets.includes(m))) throw new KitError("narrow", now.markets.join(","));
  const name = modeName(markets);
  const set = join(root, ".kit", name);
  if (!existsSync(join(set, "AGENTS.md"))) throw new KitError("noKit", name);

  let files = 0;
  const created: string[] = [];
  writeAtomic(root, "AGENTS.md", readFileSync(join(set, "AGENTS.md")));
  files++;
  files += replaceDir(root, "playbooks", join(set, "playbooks"));
  files += replaceDir(root, ".claude/skills", join(set, "skills"));
  files += replaceDir(root, ".agents/skills", join(set, "skills"));
  // the person's own files: only made when missing
  if (!existsSync(join(root, "resume.yaml")) && existsSync(join(set, "resume.yaml"))) {
    writeAtomic(root, "resume.yaml", readFileSync(join(set, "resume.yaml")));
    created.push("resume.yaml");
  }
  let dirs: string[] = [];
  try {
    dirs = JSON.parse(readFileSync(join(set, "set.json"), "utf-8")).dirs ?? [];
  } catch {}
  for (const d of dirs.filter((x) => /^[A-Za-z0-9_-]+$/.test(String(x)))) {
    plain(root, d, "dir");
    if (!existsSync(join(root, d))) {
      mkdirSync(join(root, d), { recursive: true });
      writeFileSync(join(root, d, ".gitkeep"), "");
      created.push(`${d}/`);
    }
  }
  writeAtomic(root, "me/mode.yaml", modeText(markets));
  return { mode: name, markets, files, created };
}

/** `jobhunt mode [us|tw|both]`: install the rules (the AI runs it after asking; pre-approved like check and read).
 * Exit codes: 0 installed (or, with no choice given, the current mode printed), 2 nothing changed. */
export function runMode(argv: string[], dir: string | null, print: (s: string) => void = (s) => console.log(s)): number {
  const T = cliTextFor(dir ? readMarketSync(dir).language : "en");
  if (!dir) {
    print(T.modeNoKit);
    return 2;
  }
  const args = argv.filter((a, i) => a !== "mode" && !a.startsWith("--") && !/^--(dir|folder)$/.test(argv[i - 1] ?? ""));
  const now = readModeSync(dir);
  if (!args.length) {
    print(now.set ? T.modeNow(T.modeNames[modeName(now.markets)]) : T.modeUnset);
    return 0;
  }
  const word = args[0].toLowerCase();
  if (args.length > 1 || !["us", "tw", "both"].includes(word)) {
    print(T.modeBad(args.join(" ")));
    return 2;
  }
  try {
    const r = installMode(dir, marketsOf(word as ModeName));
    // Taiwan only, chosen for the first time through the AI: the program's pages and check results in Chinese, as Taiwan's
    // rules are (the start screen sends the page language itself; the US and both are English first).
    if (r.mode === "tw" && !now.set && existsSync(join(dir, "jobhunt.yaml"))) {
      writeAtomic(dir, "jobhunt.yaml", withLanguage(readFileSync(join(dir, "jobhunt.yaml"), "utf-8"), "zh-TW"));
      print(cliTextFor("zh-TW").modeInstalled(cliTextFor("zh-TW").modeNames.tw));
      return 0;
    }
    print(T.modeInstalled(T.modeNames[r.mode]));
    return 0;
  } catch (e) {
    if (!(e instanceof KitError)) throw e;
    if (e.code === "noKit") print(T.modeNoKit);
    else if (e.code === "narrow") print(T.modeNarrow(T.modeNames[modeName(now.markets)]));
    else if (e.code === "notPlain") print(T.modeNotPlain(e.detail));
    else print(T.modeBad(args.join(" ")));
    return 2;
  }
}
