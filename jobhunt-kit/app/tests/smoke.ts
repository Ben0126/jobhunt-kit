// 冒煙測試：對「打包好的執行檔」跑，不是對原始碼跑。
//   bun tests/smoke.ts <執行檔路徑> [測試資料夾，預設 tests/fixture]
//   bun tests/smoke.ts <執行檔路徑> --us [測試資料夾，預設美國版 workspace-us]   ← 美國版：程式輸出要全英文
// 步驟：複製測試資料夾 → 把執行檔放進去 → --no-open 啟動 → 從 lock 檔讀埠和通行碼 →
//       read 讀 Word 舊履歷 → /api/ping → 改一筆狀態 → 確認進度表真的改了 → 履歷存一份 → 第二次啟動要導向第一份 → 關掉。
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const usMode = argv.includes("--us");
const ev = argv.indexOf("--expect-version"); // release.yml: the compiled program must report the tag it was built for
const expectVersion = ev >= 0 ? argv[ev + 1] : null;
const posArgs = argv.filter((a, i) => a !== "--us" && !(ev >= 0 && (i === ev || i === ev + 1)));
const bin = posArgs[0] && resolve(posArgs[0]);
const fixture = resolve(posArgs[1] ?? (usMode ? join(import.meta.dir, "..", "..", "jobhunt", "scaffold", "workspace-us") : join(import.meta.dir, "fixture")));
if (!bin || !existsSync(bin)) {
  console.error("usage: bun tests/smoke.ts <binary> [--us] [fixture-folder]");
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

// `jobhunt --version` prints one word: the version baked in at build time (dev for a local build).
async function checkVersion(exe: string) {
  const v = await runToEnd([exe, "--version"], 20000);
  const word = v.out.trim();
  check(v.code === 0 && /^(dev|\d+\.\d+(\.\d+)?)$/.test(word), "`--version` prints one version word, exit 0", `exit=${v.code} out=${word}`);
  if (expectVersion != null) check(word === expectVersion, `\`--version\` equals the release tag (${expectVersion})`, `got ${word}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CJK = /[　-〿㐀-䶿一-鿿＀-￯]/;

// 美國版：複製 workspace-us 當作使用者資料夾，所有程式輸出和介面頁面都不可以出現中文。
async function runUs() {
  console.log(`binary:  ${bin} (${(Bun.file(bin!).size / 1048576).toFixed(1)} MB)`);
  console.log(`fixture: ${fixture} (US mode)`);

  // 1) 資料夾不被認得、但路徑裡有 -us 段（像 job-hunt-us）：用英文說明，exit 1
  const notFolder = join(work, "job-hunt-us", "not-a-folder");
  mkdirSync(notFolder, { recursive: true });
  const nf = await runToEnd([placeBinary(notFolder), "--no-open"], 20000);
  check(nf.code === 1 && !CJK.test(nf.out) && nf.out.trim().length > 0, "unrecognised folder with -us in the path → English, exit 1", `exit=${nf.code}`);

  // 2) check：新資料夾沒有履歷，應該 exit 0、英文
  const folder = join(work, "job-hunt-us", "folder with space");
  cpSync(fixture, folder, { recursive: true });
  const exe = placeBinary(folder);
  await checkVersion(exe);
  const ck = await runToEnd([exe, "check"], 30000);
  check(ck.code === 0 && ck.out.includes("Program check") && !CJK.test(ck.out), "`check` in a fresh US folder → English, exit 0", `exit=${ck.code}`);
  const ck2 = await runToEnd([exe, "check", "no-such-job"], 30000);
  check(ck2.code === 2 && !CJK.test(ck2.out), "`check <unknown id>` → English, exit 2", `exit=${ck2.code}`);

  // 3) 正式啟動：介面頁面和主控台訊息都不含中文
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
  check(ping.status === 200, "/api/ping with token");
  const home = await fetch(`${base}/`);
  const html = await home.text();
  // the language switch says 中文 on the English page on purpose (the way to the Chinese page; tests/p6_ui.test.ts)
  const page = html.replace(/<button[^>]*id="lang-switch"[^>]*>[^<]*<\/button>/, "");
  check(home.status === 200 && html.includes('lang="en"') && !CJK.test(page) && page !== html, "UI page is English, no CJK besides the 中文 switch");
  const js = await (await fetch(`${base}/app.js`)).text();
  check(js.includes("x-jobhunt-token"), "UI script embedded in the binary");
  const board: any = await (await fetch(`${base}/api/applications`, { headers: H })).json();
  check(Array.isArray(board.rows), "board API answers", `${board.rows?.length} rows`);
  const cr = await fetch(`${base}/api/check`, { headers: H });
  const crText = await cr.text();
  check(cr.status === 200 && !CJK.test(crText), "/api/check JSON has no CJK");

  // 第二次啟動：導向第一份
  const second = await runToEnd([exe, "--no-open"], 20000);
  check(second.code === 0 && !CJK.test(second.out) && second.out.includes(String(lock.port)), "second launch reuses the running one, English", `exit=${second.code}`);

  app.kill();
  await app.exited;
  const out = await new Response(app.stdout).text();
  check(out.includes(`127.0.0.1:${lock.port}`) && !CJK.test(out), "console message English with URL", out.split(/\r?\n/)[0]);
}

try {
  if (usMode) {
    await runUs();
    throw null;
  }
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
  await checkVersion(exe);
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

  // read 指令：讀 inbox 裡的 Word 舊履歷（另一套工具打包的測試檔），只印不存；資料夾外面的不讀
  mkdirSync(join(folder, "inbox"), { recursive: true });
  copyFileSync(join(import.meta.dir, "fixture-docx", "範例舊履歷.docx"), join(folder, "inbox", "範例舊履歷.docx"));
  const filesBefore = readdirSync(folder, { recursive: true }).length;
  const rd = await runToEnd([exe, "read", join("inbox", "範例舊履歷.docx")], 30000);
  check(
    rd.code === 0 && rd.out.startsWith("＝＝ 範例舊履歷.docx 的文字") && rd.out.includes("範例科技大學") && rd.out.includes("[已遮住身分證字號]") && !rd.out.includes("A123456789"),
    "`read inbox/<file>.docx` prints the text with the ID masked, exit 0",
    `exit=${rd.code}`,
  );
  check(readdirSync(folder, { recursive: true }).length === filesBefore, "`read` writes nothing");
  const rd2 = await runToEnd([exe, "read", join(work, "not-a-folder", "x.docx")], 30000);
  check(rd2.code === 2 && rd2.out.includes("資料夾外面"), "`read` outside the folder → exit 2", `exit=${rd2.code}`);
  // --dir 指到別的資料夾（也有 AGENTS.md）：執行檔不接受，read 和 check 都一樣（這兩個指令 AI 跑的時候不會跳詢問）
  const other = join(work, "other-project");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "AGENTS.md"), "# another project\n");
  copyFileSync(join(import.meta.dir, "fixture-docx", "範例舊履歷.docx"), join(other, "private.docx"));
  for (const args of [["read", "--dir", other, "private.docx"], ["read", `--dir=${other}`, "private.docx"], ["read", "--folder", other, "private.docx"], ["check", "--dir", other]]) {
    const r = await runToEnd([exe, ...args], 30000);
    check(r.code === 2 && r.out.includes("--dir") && !r.out.includes("範例科技大學"), `\`${args[0]} ${args[1].split("=")[0]} <other folder>\` refused by the compiled program, exit 2`, `exit=${r.code}`);
  }
  check(!existsSync(join(other, "checks")), "`check --dir <other folder>` wrote nothing there");

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

  // 履歷頁的補充資料，和「我投了這份，存一份」（先預覽、確定才存、不會蓋掉）
  const ri: any = await (await fetch(`${base}/api/resume-info`, { headers: H })).json();
  check(Array.isArray(ri.drafts) && ri.drafts.length > 0 && typeof ri.items === "object", "/api/resume-info lists unconfirmed stories", `${ri.drafts?.length} drafts`);
  if (firstHtml) {
    const submittedDir = join(folder, "submitted");
    const before = existsSync(submittedDir) ? readdirSync(submittedDir).sort() : [];
    const pv: any = await (await fetch(`${base}/api/archive/preview`, { method: "POST", headers: H, body: JSON.stringify({ id: firstHtml.id }) })).json();
    const afterPreview = existsSync(submittedDir) ? readdirSync(submittedDir).sort() : [];
    check(typeof pv.to === "string" && pv.to.startsWith("submitted/") && JSON.stringify(afterPreview) === JSON.stringify(before), "archive preview writes nothing", pv.to ?? pv.error);
    const ar = await fetch(`${base}/api/archive`, { method: "POST", headers: H, body: JSON.stringify({ id: firstHtml.id, to: pv.to, version: pv.version }) });
    const savedPath = join(folder, ...String(pv.to).split("/"));
    check(
      ar.status === 200 && existsSync(savedPath) && readFileSync(savedPath).equals(readFileSync(join(folder, "resumes", `${firstHtml.id}.html`))),
      "archive copies the resume into submitted/", String(pv.to),
    );
    check(readFileSync(csv, "utf-8").includes(String(pv.to)), "archive records resume_file in applications.csv");
    const again = await fetch(`${base}/api/archive`, { method: "POST", headers: H, body: JSON.stringify({ id: firstHtml.id, to: pv.to, version: ((await ar.json()) as any).board?.version }) });
    check(again.status === 409, "second archive refused (never overwrites)", `status ${again.status}`);
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
  if (e !== null) check(false, "smoke run", String(e));
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
