// 冒煙測試：對「打包好的執行檔」跑，不是對原始碼跑。
//   bun tests/smoke.ts <執行檔路徑> [測試資料夾，預設 tests/fixture]
// 步驟：複製測試資料夾 → 把執行檔放進去 → --no-open 啟動 → 從 lock 檔讀埠和通行碼 →
//       /api/ping → 改一筆狀態 → 確認進度表真的改了 → 第二次啟動要導向第一份 → 關掉。
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const bin = process.argv[2] && resolve(process.argv[2]);
const fixture = resolve(process.argv[3] ?? join(import.meta.dir, "fixture"));
if (!bin || !existsSync(bin)) {
  console.error("usage: bun tests/smoke.ts <binary> [fixture-folder]");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "jobhunt-smoke-"));
const procs: ReturnType<typeof Bun.spawn>[] = [];
let failures = 0;

function check(ok: boolean, what: string, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function placeBinary(dir: string): string {
  const dest = join(dir, basename(bin!));
  copyFileSync(bin!, dest);
  if (process.platform !== "win32") chmodSync(dest, 0o755);
  return dest;
}

async function runToEnd(cmd: string[], timeoutMs: number): Promise<{ code: number | null; out: string }> {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  procs.push(p);
  const timer = setTimeout(() => p.kill(), timeoutMs);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { code, out: out + err };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  console.log(`binary:  ${bin} (${(Bun.file(bin).size / 1048576).toFixed(1)} MB)`);
  console.log(`fixture: ${fixture}`);

  // 1) 放在不是求職資料夾的地方：說明原因後結束
  const notFolder = join(work, "not-a-folder");
  cpSync(join(fixture, "data"), join(notFolder, "data"), { recursive: true });
  const nf = await runToEnd([placeBinary(notFolder), "--no-open"], 20000);
  check(nf.code === 1 && nf.out.includes("不是求職資料夾"), "not a job-hunt folder → explains and exits 1", `exit=${nf.code}`);

  // 2) check 指令：測試資料夾裡有佔位字「OO大學」，一定沒通過（結束碼 1），結果寫進 checks 檔，其他節不動
  const folder = join(work, "求職 資料夾");
  cpSync(fixture, folder, { recursive: true });
  const exe = placeBinary(folder);
  const checksFile = join(folder, "checks", "261008-01.md");
  const checksBefore = existsSync(checksFile) ? readFileSync(checksFile, "utf-8") : "";
  const ck = await runToEnd([exe, "check"], 30000);
  check(ck.code === 1 && ck.out.includes("程式檢查") && ck.out.includes("佔位字「OO」"), "`check` finds the placeholder, exit 1", `exit=${ck.code}`);
  const checksAfter = existsSync(checksFile) ? readFileSync(checksFile, "utf-8") : "";
  check(
    checksAfter.includes("## 程式檢查") && checksAfter.startsWith(checksBefore.trimEnd()),
    "check result written into the 程式檢查 section, other sections untouched",
  );
  const ck1 = await runToEnd([exe, "check", "261008-01"], 30000);
  check(ck1.code === 1 && ck1.out.includes("261008-01") && !ck1.out.includes("104 總履歷"), "`check <id>` checks only that job", `exit=${ck1.code}`);
  const ck2 = await runToEnd([exe, "check", "no-such-job"], 30000);
  check(ck2.code === 2 && ck2.out.includes("找不到這些職缺代號"), "`check <unknown id>` → exit 2", `exit=${ck2.code}`);
  const ck3 = await runToEnd([placeBinary(notFolder), "check"], 30000);
  check(ck3.code === 2 && ck3.out.includes("不是求職資料夾"), "`check` outside a job-hunt folder → exit 2", `exit=${ck3.code}`);

  // 3) 正式啟動
  const csv = join(folder, "data", "applications.csv");
  const csvBefore = readFileSync(csv, "utf-8");
  const app = Bun.spawn([exe, "--no-open"], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  procs.push(app);
  const lockPath = join(folder, ".jobhunt", "app.lock");
  let lock: { port: number; token: string } | null = null;
  for (let i = 0; i < 100 && !lock; i++) {
    try {
      lock = JSON.parse(readFileSync(lockPath, "utf-8"));
    } catch {
      await sleep(200);
    }
  }
  check(!!lock, "lock file written", lock ? `port ${lock.port}` : "no lock after 20s");
  if (!lock) throw new Error("app did not start");
  const base = `http://127.0.0.1:${lock.port}`;
  const H = { "x-jobhunt-token": lock.token, "content-type": "application/json" };

  const ping = await fetch(`${base}/api/ping`, { headers: H });
  const pj: any = await ping.json();
  check(ping.status === 200 && pj.app === "jobhunt", "/api/ping with token", JSON.stringify(pj));
  check((await fetch(`${base}/api/ping`)).status === 401, "/api/ping without token → 401");

  const home = await fetch(`${base}/`);
  const html = await home.text();
  check(home.status === 200 && html.includes("求職小幫手"), "UI page embedded in the binary");
  const js = await (await fetch(`${base}/app.js`)).text();
  check(js.includes("x-jobhunt-token"), "UI script embedded in the binary");

  const board: any = await (await fetch(`${base}/api/applications`, { headers: H })).json();
  const idx = board.rows.findIndex((r: any) => r.status === "todo");
  check(idx >= 0, "board lists rows", `${board.rows.length} rows`);
  const row = board.rows[idx];
  const upd = await fetch(`${base}/api/applications/update`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ index: idx, job_id: row.job_id, version: board.version, changes: { status: "applied" } }),
  });
  const uj: any = await upd.json();
  check(upd.status === 200 && uj.rows[idx].status === "applied", "status update via API", `${row.company} → applied`);
  const csvAfter = readFileSync(csv, "utf-8");
  const line = csvAfter.split(/\r?\n/).find((l) => l.startsWith(row.job_id + ","));
  check(csvAfter !== csvBefore && !!line && line.includes(",applied,"), "applications.csv changed on disk", line);
  check(csvAfter.split(/\r?\n/)[0] === csvBefore.split(/\r?\n/)[0], "CSV header unchanged");

  // 介面的檢查結果和履歷預覽
  const cr = await fetch(`${base}/api/check`, { headers: H });
  const cj: any = await cr.json();
  const cookie = (cr.headers.get("set-cookie") || "").split(";")[0];
  check(cr.status === 200 && Array.isArray(cj.items) && cj.items.length > 0, "/api/check returns results", `${cj.items?.length} items, ${cj.problems} problems`);
  const firstHtml = cj.items.find((i: any) => i.hasHtml);
  if (firstHtml) {
    const v = await fetch(`${base}/view/${encodeURIComponent(firstHtml.id)}?print=1`, { headers: { cookie } });
    const vh = await v.text();
    check(v.status === 200 && vh.includes("window.print()") && (v.headers.get("content-security-policy") || "").includes("nonce-"), "resume viewer serves the file with print script");
    check((await fetch(`${base}/view/${encodeURIComponent(firstHtml.id)}`)).status === 401, "resume viewer without cookie → 401");
  }

  // 4) 第二次啟動：導向第一份，自己結束
  const second = await runToEnd([exe, "--no-open"], 20000);
  check(second.code === 0 && second.out.includes("已經開著了") && second.out.includes(String(lock.port)), "second launch reuses the running one", `exit=${second.code}`);
  check((await fetch(`${base}/api/ping`, { headers: H })).status === 200, "first instance still running");

  app.kill();
  await app.exited;
  const out = await new Response(app.stdout).text();
  check(out.includes("用完再關掉這個視窗") && out.includes(`127.0.0.1:${lock.port}`), "console message in plain Chinese with URL", out.split(/\r?\n/)[0]);
} catch (e) {
  check(false, "smoke run", String(e));
} finally {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
  await sleep(300);
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {}
}

console.log(failures ? `\nSMOKE FAILED (${failures})` : "\nSMOKE PASSED");
process.exit(failures ? 1 : 0);
