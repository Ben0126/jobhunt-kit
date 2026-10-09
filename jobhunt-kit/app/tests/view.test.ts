// 介面用的檢查結果和履歷預覽（/api/check、/view/<代號>）。
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Folder } from "../src/folder.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

function serve(): { dir: string; s: Running; base: string } {
  const dir = copyFixture();
  dirs.push(dir);
  const s = startServer({ folder: new Folder(dir) });
  stops.push(s.stop);
  return { dir, s, base: `http://127.0.0.1:${s.port}` };
}

async function cookieFrom(base: string, token: string): Promise<string> {
  const r = await fetch(`${base}/api/check`, { headers: { "x-jobhunt-token": token } });
  expect(r.status).toBe(200);
  const c = r.headers.get("set-cookie") || "";
  expect(c).toContain("HttpOnly");
  expect(c).toContain("SameSite=Strict");
  return c.split(";")[0];
}

test("/api/check：要通行碼；回傳每份履歷和 104 的檢查結果；不寫檔", async () => {
  const { dir, s, base } = serve();
  expect((await fetch(`${base}/api/check`)).status).toBe(401);
  const before = readFileSync(join(dir, "checks", "261008-01.md"), "utf-8");
  const r: any = await (await fetch(`${base}/api/check`, { headers: { "x-jobhunt-token": s.token } })).json();
  expect(r.items.map((i: any) => [i.id, i.company, i.hasTarget, i.hasHtml])).toEqual([["261008-01", "宏遠精密股份有限公司", true, true]]);
  expect(r.items[0].problems[0]).toMatchObject({ where: "履歷檔", message: "還有佔位字「OO」，要換成真的內容" });
  expect(r.general.blocks[0]).toMatchObject({ name: "中文自傳", limit: 4000, pasted: true });
  expect(r.general.blocks[0].text).not.toContain("來源");
  expect(readFileSync(join(dir, "checks", "261008-01.md"), "utf-8")).toBe(before);
});

test("/view：沒有 cookie 不給看；有 cookie 給看，履歷裡的程式不能跑，只能被自己框住", async () => {
  const { s, base } = serve();
  const no = await fetch(`${base}/view/261008-01`);
  expect(no.status).toBe(401);
  const cookie = await cookieFrom(base, s.token);
  const r = await fetch(`${base}/view/261008-01`, { headers: { cookie } });
  expect(r.status).toBe(200);
  const html = await r.text();
  expect(html).toContain("李欣怡");
  const csp = r.headers.get("content-security-policy") || "";
  expect(csp).toMatch(/script-src 'nonce-[^']+'/);
  expect(csp).not.toContain("unsafe-inline'; script"); // inline scripts in the file don't run
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  expect(html).not.toContain("window.print()");
  // wrong token in cookie
  expect((await fetch(`${base}/view/261008-01`, { headers: { cookie: `jh${s.port}=nope` } })).status).toBe(401);
});

test("/view?print=1：加上帶 nonce 的列印程式；找不到的履歷回 404；路徑把戲不行", async () => {
  const { s, base } = serve();
  const cookie = await cookieFrom(base, s.token);
  const r = await fetch(`${base}/view/261008-01?print=1`, { headers: { cookie } });
  const nonce = /'nonce-([^']+)'/.exec(r.headers.get("content-security-policy") || "")![1];
  const html = await r.text();
  expect(html).toContain(`<script nonce="${nonce}">`);
  expect(html).toContain("window.print()");
  expect(html.indexOf("window.print()")).toBeLessThan(html.toLowerCase().lastIndexOf("</body>"));
  expect((await fetch(`${base}/view/nope`, { headers: { cookie } })).status).toBe(404);
  for (const bad of ["..%2Fresume", "..%5Cresume", "%2E%2E%2FAGENTS", ".hidden", "%E0%A4%A"])
    expect((await fetch(`${base}/view/${bad}`, { headers: { cookie } })).status).toBe(404);
});

test("/view：檔案裡的程式和 onerror 這類屬性不會送出去，只留程式自己加的列印程式", async () => {
  const { dir, s, base } = serve();
  const h = join(dir, "resumes", "261008-01.html");
  writeFileSync(
    h,
    readFileSync(h, "utf-8").replace("</main>", `<img src="x.jpg" alt="a" onerror="alert(1)" onload='alert(2)'><SCRIPT>alert(3)</SCRIPT></main>`),
  );
  const cookie = await cookieFrom(base, s.token);
  const html = await (await fetch(`${base}/view/261008-01?print=1`, { headers: { cookie } })).text();
  expect(html).not.toMatch(/onerror|onload|alert\(/i);
  expect(html.match(/<script/gi)!.length).toBe(1);
  expect(html).toContain('<img src="x.jpg" alt="a">');
  expect(html).toContain("李欣怡");
});

test("/view：別的網站帶過來的請求不給看", async () => {
  const { s, base } = serve();
  const cookie = await cookieFrom(base, s.token);
  const r = await fetch(`${base}/view/261008-01`, { headers: { cookie, "sec-fetch-site": "cross-site" } });
  expect(r.status).toBe(403);
});

test("介面頁允許框住自己的預覽", async () => {
  const { base } = serve();
  const csp = (await fetch(`${base}/`)).headers.get("content-security-policy") || "";
  expect(csp).toContain("frame-src 'self'");
});

test("AI 在背景改了檔案，重新檢查就看得到", async () => {
  const { dir, s, base } = serve();
  const H = { "x-jobhunt-token": s.token };
  const p = join(dir, "resume.yaml");
  writeFileSync(p, readFileSync(p, "utf-8").replace("OO大學", "逢甲大學"));
  const h = join(dir, "resumes", "261008-01.html");
  writeFileSync(h, readFileSync(h, "utf-8").replace("OO大學", "逢甲大學"));
  const r: any = await (await fetch(`${base}/api/check`, { headers: H })).json();
  expect(r.items[0].problems).toEqual([]);
});

// ---------------------------------------------------------------- W4：安全審查找到的問題

test("回歸：履歷檔裡的 <meta http-equiv=refresh> 會被拿掉（列印分頁不能被帶去別的網站）", async () => {
  const { dir, s, base } = serve();
  const h = join(dir, "resumes", "261008-01.html");
  writeFileSync(h, readFileSync(h, "utf-8").replace("<head>", `<head><meta http-equiv="refresh" content="1;url=http://127.0.0.1:8765/landing"><META HTTP-EQUIV=Refresh CONTENT="0;url=x">`));
  const cookie = await cookieFrom(base, s.token);
  const html = await (await fetch(`${base}/view/261008-01?print=1`, { headers: { cookie } })).text();
  expect(html).not.toMatch(/http-equiv/i);
  expect(html).toContain('<meta charset="utf-8">');
});

test("回歸：介面和預覽都帶 Cross-Origin-Opener-Policy，列印分頁和介面分頁的連結會斷掉", async () => {
  const { s, base } = serve();
  expect((await fetch(`${base}/`)).headers.get("cross-origin-opener-policy")).toBe("same-origin");
  const cookie = await cookieFrom(base, s.token);
  const r = await fetch(`${base}/view/261008-01`, { headers: { cookie } });
  expect(r.headers.get("cross-origin-opener-policy")).toBe("same-origin");
});

test("回歸：拆 script 要拆到乾淨為止（<scr<script>ipt> 不會留下一個沒結尾的 <script）", async () => {
  const { dir, s, base } = serve();
  const h = join(dir, "resumes", "261008-01.html");
  const src = readFileSync(h, "utf-8");
  const at = src.lastIndexOf("</body>");
  for (const trick of [`<scr<script>ipt src="data:text/javascript,1" x="`, `<script src="data:text/javascript,1" x=`]) {
    writeFileSync(h, src.slice(0, at) + trick + src.slice(at));
    const cookie = await cookieFrom(base, s.token);
    const html = await (await fetch(`${base}/view/261008-01?print=1`, { headers: { cookie } })).text();
    expect(html.match(/<script/gi)!.length).toBe(1); // only the app's own print script
    expect(html).toMatch(/<script nonce="[^"]+">addEventListener/);
  }
});

test("回歸：預覽 cookie 不是 API 通行碼（cookie 外流也不能改進度表）", async () => {
  const { s, base } = serve();
  const cookie = await cookieFrom(base, s.token);
  const value = cookie.split("=")[1];
  expect(value).not.toBe(s.token);
  expect((await fetch(`${base}/api/applications`, { headers: { "x-jobhunt-token": value } })).status).toBe(401);
  expect((await fetch(`${base}/view/261008-01`, { headers: { cookie } })).status).toBe(200);
});

test("預覽藏起範本的黃色列印提醒（介面有自己的說明），列印分頁的標題帶公司名稱", async () => {
  const { s, base } = serve();
  const cookie = await cookieFrom(base, s.token);
  const html = await (await fetch(`${base}/view/261008-01?print=1`, { headers: { cookie } })).text();
  expect(html).toMatch(/\.print-tip\s*\{\s*display:\s*none\s*!important/);
  expect(html).toContain("<title>李欣怡_履歷_宏遠精密股份有限公司</title>");
});

test("拆 on* 屬性不會越跑越慢（很多標籤的檔案）", async () => {
  const { dir, s, base } = serve();
  const h = join(dir, "resumes", "261008-01.html");
  writeFileSync(h, readFileSync(h, "utf-8").replace("</main>", "<a ".repeat(40000) + "</main>"));
  const cookie = await cookieFrom(base, s.token);
  const t0 = performance.now();
  const r = await fetch(`${base}/view/261008-01`, { headers: { cookie } });
  expect(r.status).toBe(200);
  expect(performance.now() - t0).toBeLessThan(1500);
});
