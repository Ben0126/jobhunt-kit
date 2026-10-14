// Smoke test of the one-for-all kit with a compiled program (release.yml runs it on the unzipped download too).
//   bun tests/smoke_one.ts <program> [kit folder]     (no kit folder: one is assembled with kitbuild.ts)
// A copy of the kit gets the program; then: `check` before a choice (exit 0), `mode` with no choice (exit 0, says nothing
// is chosen), `mode both` installs the rules (exit 0, AGENTS.md is the both set, playbooks/ and both skills folders there),
// `mode us` afterwards is refused (exit 2, nothing changed), `check` on the fresh folder (exit 0), the app starts and says
// both markets.
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { assembleKit } from "../kitbuild.ts";

const argv = process.argv.slice(2);
const ev = argv.indexOf("--expect-version");
const expectVersion = ev >= 0 ? argv[ev + 1] : null;
const pos = argv.filter((a, i) => !(ev >= 0 && (i === ev || i === ev + 1)));
const bin = pos[0] && resolve(pos[0]);
if (!bin || !existsSync(bin)) {
  console.error("usage: bun tests/smoke_one.ts <program> [kit folder] [--expect-version X]");
  process.exit(2);
}
const work = mkdtempSync(join(tmpdir(), "jobhunt-smoke1-"));
const dir = join(work, "job-hunt-kit");
if (pos[1]) cpSync(resolve(pos[1]), dir, { recursive: true });
else assembleKit(dir);
const exe = join(dir, basename(bin));
if (!existsSync(exe)) copyFileSync(bin, exe);
if (process.platform !== "win32") chmodSync(exe, 0o755);

let failures = 0;
const check = (ok: boolean, what: string, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};
async function run(args: string[], ms = 30000) {
  const p = Bun.spawn([exe, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const t = setTimeout(() => p.kill(), ms);
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(t);
  return { code, out: o + e };
}
const read = (rel: string) => readFileSync(join(dir, ...rel.split("/")), "utf-8");

try {
  const v = await run(["--version"]);
  check(v.code === 0, "--version", v.out.trim());
  if (expectVersion) check(v.out.trim() === expectVersion, `--version is ${expectVersion}`, v.out.trim());
  let r = await run(["check"]);
  check(r.code === 0, "check before a choice: exit 0", `exit=${r.code}`);
  r = await run(["mode"]);
  check(r.code === 0 && /does not know yet|還沒選/.test(r.out), "mode with no choice: says nothing is chosen", r.out.trim().slice(0, 80));
  r = await run(["mode", "both"]);
  check(r.code === 0, "mode both: exit 0", r.out.trim().slice(0, 80));
  check(read("AGENTS.md") === read(".kit/both/AGENTS.md"), "AGENTS.md is the both rule set");
  check(existsSync(join(dir, "playbooks", "taiwan.md")) && existsSync(join(dir, "playbooks", "fill-104.md")), "playbooks for both installed");
  check(readdirSync(join(dir, ".agents", "skills")).length > 0 && readdirSync(join(dir, ".claude", "skills")).length > 0, "skills installed for Claude Code and Codex");
  check(existsSync(join(dir, "resume.yaml")) && existsSync(join(dir, "104")) && existsSync(join(dir, "profiles")), "resume.yaml, 104/ and profiles/ made");
  const before = read("AGENTS.md");
  r = await run(["mode", "us"]);
  check(r.code === 2 && read("AGENTS.md") === before, "mode us afterwards: refused, nothing changed", `exit=${r.code}`);
  r = await run(["check"]);
  check(r.code === 0, "check on the fresh both folder: exit 0", `exit=${r.code} ${r.out.trim().slice(0, 120)}`);
  // the app starts and knows both markets
  const p = Bun.spawn([exe, "--no-open"], { cwd: dir, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  let lock: any = null;
  for (let i = 0; i < 100 && !lock; i++) {
    try {
      lock = JSON.parse(read(".jobhunt/app.lock"));
    } catch {
      await Bun.sleep(200);
    }
  }
  check(!!lock, "app started (lock file)");
  if (lock) {
    const info: any = await (await fetch(`http://127.0.0.1:${lock.port}/api/info`, { headers: { "x-jobhunt-token": lock.token } })).json();
    check(info.modeSet === true && JSON.stringify(info.markets) === '["us","tw"]', "app: both markets", JSON.stringify(info.markets));
  }
  p.kill();
  await p.exited;
} finally {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {}
}
console.log(failures ? `SMOKE (ONE KIT) FAILED: ${failures}` : "SMOKE (ONE KIT) PASSED");
process.exit(failures ? 1 : 0);
