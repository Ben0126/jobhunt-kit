import { afterEach, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { Applications } from "../src/applications.ts";
import { Folder } from "../src/folder.ts";
import { launch, readLock } from "../src/launch.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture, emptyTemp, readCsv } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

function serve(today = "2026-10-09"): { dir: string; s: Running } {
  const dir = copyFixture();
  dirs.push(dir);
  const folder = new Folder(dir);
  const s = startServer({ folder, apps: new Applications(folder, () => today) });
  stops.push(s.stop);
  return { dir, s };
}

/** Raw HTTP/1.1 request so we control the Host header exactly. */
function raw(port: number, head: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, "127.0.0.1", () => sock.write(head));
    let out = "";
    sock.on("data", (d) => (out += d.toString("utf-8")));
    sock.on("end", () => resolve(out));
    sock.on("error", reject);
    setTimeout(() => {
      sock.destroy();
      resolve(out);
    }, 1500);
  });
}

const api = (s: Running, path: string, init: RequestInit = {}, token = s.token) =>
  fetch(`http://127.0.0.1:${s.port}${path}`, {
    ...init,
    headers: { "x-jobhunt-token": token, "content-type": "application/json", ...(init.headers || {}) },
  });

test("只聽 127.0.0.1，網址帶通行碼", () => {
  const { s } = serve();
  expect(s.url).toBe(`http://127.0.0.1:${s.port}/?t=${s.token}`);
  expect(s.token).toMatch(/^[0-9a-f]{48}$/);
});

test("沒有通行碼或通行碼不對：/api 一律 401", async () => {
  const { s } = serve();
  expect((await fetch(`http://127.0.0.1:${s.port}/api/ping`)).status).toBe(401);
  expect((await api(s, "/api/ping", {}, "wrong")).status).toBe(401);
  // one character off (never the real token: the old `+ "0"` WAS the real token whenever it already ended in 0)
  const offByOne = s.token.slice(0, -1) + (s.token.endsWith("0") ? "1" : "0");
  expect((await api(s, "/api/applications", {}, offByOne)).status).toBe(401);
  const r = await api(s, "/api/ping");
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, app: "jobhunt" });
});

test("Host 不是 127.0.0.1:<port> 或 localhost:<port> 一律拒絕（防 DNS rebinding）", async () => {
  const { s } = serve();
  const req = (host: string, path = "/api/ping") =>
    raw(s.port, `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nx-jobhunt-token: ${s.token}\r\nConnection: close\r\n\r\n`);
  expect(await req(`127.0.0.1:${s.port}`)).toStartWith("HTTP/1.1 200");
  expect(await req(`localhost:${s.port}`)).toStartWith("HTTP/1.1 200");
  for (const bad of ["evil.example", `evil.example:${s.port}`, "127.0.0.1", `127.0.0.1:${s.port + 1}`, `localhost.evil.example:${s.port}`])
    expect(await req(bad)).toStartWith("HTTP/1.1 403");
  expect(await req("evil.example", "/")).toStartWith("HTTP/1.1 403");
});

test("別的網站送來的請求（Origin 不同、跨站）一律拒絕", async () => {
  const { s, dir } = serve();
  const before = readCsv(dir);
  const b = await (await api(s, "/api/applications")).json();
  const body = JSON.stringify({ index: 0, job_id: "261008-01", version: b.version, changes: { status: "oa" } });
  expect((await api(s, "/api/applications/update", { method: "POST", body, headers: { origin: "https://evil.example" } })).status).toBe(403);
  expect((await api(s, "/api/applications/update", { method: "POST", body, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
  expect((await api(s, "/api/applications/update", { method: "POST", body, headers: { "content-type": "text/plain" } })).status).toBe(415);
  expect(readCsv(dir)).toBe(before);
  const ok = await api(s, "/api/applications/update", { method: "POST", body, headers: { origin: `http://127.0.0.1:${s.port}` } });
  expect(ok.status).toBe(200);
  expect(readCsv(dir)).toContain("261008-01,宏遠精密股份有限公司,人資行政助理,,,targets/261008-01,oa,");
});

test("網頁檔案只有三個，有安全標頭；其他路徑（含跳出資料夾）都 404，不會讀到資料夾裡的檔案", async () => {
  const { s } = serve();
  const home = await fetch(`http://127.0.0.1:${s.port}/`);
  expect(home.status).toBe(200);
  expect(home.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(home.headers.get("referrer-policy")).toBe("no-referrer");
  expect(await home.text()).toContain("求職小幫手");
  expect((await fetch(`http://127.0.0.1:${s.port}/app.js`)).headers.get("content-type")).toContain("javascript");
  expect((await fetch(`http://127.0.0.1:${s.port}/style.css`)).status).toBe(200);
  for (const p of ["/AGENTS.md", "/resume.yaml", "/data/applications.csv", "/..%2fAGENTS.md", "/%2e%2e/%2e%2e/AGENTS.md", "/.jobhunt/app.lock"])
    expect((await fetch(`http://127.0.0.1:${s.port}${p}`)).status).toBe(404);
  const r = await raw(s.port, `GET /../../AGENTS.md HTTP/1.1\r\nHost: 127.0.0.1:${s.port}\r\nConnection: close\r\n\r\n`);
  expect(r).not.toContain("紅線");
});

test("API 全流程：新增 → 改狀態 → 版本過期被擋並附上最新資料 → 刪除", async () => {
  const { s, dir } = serve();
  let b = await (await api(s, "/api/applications")).json();
  expect(b.rows.length).toBe(4);
  let r = await api(s, "/api/applications/add", { method: "POST", body: JSON.stringify({ company: "台灣大哥大", role: "門市人員", version: b.version }) });
  expect(r.status).toBe(200);
  b = await r.json();
  expect(b.rows.at(-1)).toMatchObject({ company: "台灣大哥大", status: "todo" });

  r = await api(s, "/api/applications/add", { method: "POST", body: JSON.stringify({ company: "", role: "x", version: b.version }) });
  expect(r.status).toBe(400);
  expect((await r.json()).error).toBe("請填公司名稱。");

  const stale = b.version;
  r = await api(s, "/api/applications/update", { method: "POST", body: JSON.stringify({ index: 4, job_id: b.rows[4].job_id, version: b.version, changes: { status: "applied" } }) });
  b = await r.json();
  expect(b.rows[4]).toMatchObject({ status: "applied", applied_date: "2026-10-09" });

  r = await api(s, "/api/applications/update", { method: "POST", body: JSON.stringify({ index: 0, job_id: "261008-01", version: stale, changes: { notes: "x" } }) });
  expect(r.status).toBe(409);
  const conflict = await r.json();
  expect(conflict.error).toContain("剛剛被改過");
  expect(conflict.board.version).toBe(b.version);

  r = await api(s, "/api/applications/delete", { method: "POST", body: JSON.stringify({ index: 2, job_id: "261005-01", version: b.version }) });
  expect(r.status).toBe(403);
  r = await api(s, "/api/applications/delete", { method: "POST", body: JSON.stringify({ index: 4, job_id: b.rows[4].job_id, version: b.version }) });
  expect(r.status).toBe(200);
  expect(readCsv(dir)).not.toContain("台灣大哥大");
});

test("壞掉的請求不會讓伺服器掛掉", async () => {
  const { s } = serve();
  expect((await api(s, "/api/applications/update", { method: "POST", body: "{not json" })).status).toBe(400);
  expect((await api(s, "/api/applications/update", { method: "POST", body: "null" })).status).toBe(400);
  expect((await api(s, "/api/nope")).status).toBe(404);
  // 太大的內容：Bun 直接切斷連線（不一定回 413）。重點是被拒絕，而且伺服器還活著。
  const big = await api(s, "/api/applications/update", { method: "POST", body: "x".repeat(200_000) }).then((r) => r.status, () => "closed");
  expect([413, "closed"]).toContain(big);
  expect((await api(s, "/api/ping")).status).toBe(200);
});

// ---- 啟動、只開一份
test("不是求職資料夾（沒有 AGENTS.md）：說明原因，不開伺服器", async () => {
  const dir = emptyTemp();
  dirs.push(dir);
  const lines: string[] = [];
  const r = await launch(dir, { open: false, print: (s) => lines.push(s) });
  expect(r.kind).toBe("not-folder");
  expect(lines.join("\n")).toContain("不是求職資料夾");
  expect(existsSync(join(dir, ".jobhunt"))).toBe(false);
});

test("只開一份：第二次啟動直接用第一份；第一份關掉後 lock 檔被清掉；舊的 lock 檔不會擋住啟動", async () => {
  const dir = copyFixture();
  dirs.push(dir);
  const lines: string[] = [];
  const print = (s: string) => lines.push(s);
  const first = await launch(dir, { open: false, print });
  if (first.kind !== "started") throw new Error("first launch did not start");
  stops.push(first.stop);
  expect(lines[0]).toBe("介面已經準備好，請用瀏覽器打開下面的網址。用完再關掉這個視窗。");
  expect(lines[1]).toBe(first.running.url);
  const lock = readLock(join(dir, ".jobhunt", "app.lock"))!;
  expect(lock.port).toBe(first.running.port);
  expect(lock.token).toBe(first.running.token);

  const second = await launch(dir, { open: false, print });
  expect(second).toEqual({ kind: "already-running", url: first.running.url });

  first.stop();
  expect(existsSync(join(dir, ".jobhunt", "app.lock"))).toBe(false);

  // 當機留下的舊 lock 檔（埠已經沒人聽）→ 照常啟動
  await Bun.write(join(dir, ".jobhunt", "app.lock"), JSON.stringify({ port: first.running.port, token: "dead", pid: 1, started: "" }));
  const third = await launch(dir, { open: false, print });
  expect(third.kind).toBe("started");
  if (third.kind === "started") {
    stops.push(third.stop);
    expect(readLock(join(dir, ".jobhunt", "app.lock"))!.token).toBe(third.running.token);
  }
  rmSync(join(dir, ".jobhunt"), { recursive: true, force: true });
});

test("回歸：lock 檔的通行碼或埠號格式不對 → 當作沒有 lock（不把奇怪的字串交給 cmd）", () => {
  const dir = emptyTemp();
  dirs.push(dir);
  const p = join(dir, "app.lock");
  const write = (o: unknown) => Bun.write(p, JSON.stringify(o));
  return (async () => {
    await write({ port: 5000, token: "x&whoami", pid: 1, started: "" });
    expect(readLock(p)).toBeNull();
    await write({ port: 70000, token: "a".repeat(48), pid: 1, started: "" });
    expect(readLock(p)).toBeNull();
    await write({ port: 5000, token: "a".repeat(48), pid: 1, started: "" });
    expect(readLock(p)).not.toBeNull();
  })();
});
