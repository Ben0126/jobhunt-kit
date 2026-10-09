// 入口的參數：打錯不能讓程式開著不結束（AI 用命令列呼叫時會卡住）。
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(cleanup));

async function run(...args: string[]): Promise<{ code: number | null; out: string; dir: string }> {
  const dir = copyFixture();
  dirs.push(dir);
  const p = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "main.ts"), "--dir", dir, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => p.kill(), 5000);
  const code = await p.exited;
  clearTimeout(timer);
  return { code: p.signalCode ? null : code, out: await new Response(p.stdout).text(), dir };
}

test("回歸：看不懂的參數（--help、少打 check 的 --104）→ 印出用法、結束碼 2，不會打開介面", async () => {
  for (const arg of ["--help", "--104", "-x"]) {
    const r = await run(arg, "--no-open");
    expect({ arg, code: r.code }).toEqual({ arg, code: 2 });
    expect(r.out).toContain("用法");
    expect(existsSync(join(r.dir, ".jobhunt", "app.lock"))).toBe(false);
  }
});
