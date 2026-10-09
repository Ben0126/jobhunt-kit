// 打包成單一執行檔（網頁檔案已經用 import ... with { type: "text" } 包進去，不需要另外帶檔案）。
//   bun build.ts                 → 只打包這台電腦的版本
//   bun build.ts --target win    → 指定平台：win / mac-arm64 / mac-x64 / all
// Mac 版請在 Mac 上打包並簽章（見 .github/workflows/app.yml）。
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const TARGETS: Record<string, { bun: string; out: string }> = {
  win: { bun: "bun-windows-x64", out: "jobhunt.exe" },
  "mac-arm64": { bun: "bun-darwin-arm64", out: "jobhunt-mac-arm64" },
  "mac-x64": { bun: "bun-darwin-x64", out: "jobhunt-mac-x64" },
};

function current(): string {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  throw new Error(`這個平台不支援打包：${process.platform}`);
}

const i = process.argv.indexOf("--target");
const want = i >= 0 ? process.argv[i + 1] : current();
const names = want === "all" ? Object.keys(TARGETS) : [want];

const root = import.meta.dir;
mkdirSync(join(root, "dist"), { recursive: true });
let failed = false;
for (const name of names) {
  const t = TARGETS[name];
  if (!t) throw new Error(`不認得的平台：${name}（可以用 ${Object.keys(TARGETS).join(" / ")} / all）`);
  const outfile = join(root, "dist", t.out);
  const args = ["build", "--compile", `--target=${t.bun}`, "--minify", "--sourcemap=none", join(root, "src", "main.ts"), "--outfile", outfile];
  console.log(`> bun ${args.join(" ")}`);
  const p = Bun.spawnSync([process.execPath, ...args], { stdout: "inherit", stderr: "inherit", cwd: root });
  if (p.exitCode !== 0) failed = true;
  else console.log(`  → ${outfile} (${(Bun.file(outfile).size / 1048576).toFixed(1)} MB)`);
}
process.exit(failed ? 1 : 0);
