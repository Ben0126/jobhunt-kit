// 大頭照：只存在程式自己的資料夾（不在求職資料夾），瀏覽器裁好送來，伺服器再清一次 metadata；放進預覽、列印和 Word。
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS, unzipEntry, zipEntries } from "../src/docx.ts";
import { Folder } from "../src/folder.ts";
import { cleanJpeg, photoFile } from "../src/photo.ts";
import { startServer, type Running } from "../src/server.ts";
import { cleanup, copyFixture } from "./helpers.ts";

const dirs: string[] = [];
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  dirs.splice(0).forEach(cleanup);
});

/** A JPEG-shaped file: not a decodable picture, but it has the segments a phone photo has (EXIF with GPS, JFIF, comment). */
function fakeJpeg(w = 70, h = 90, withExif = true): Uint8Array {
  const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  const enc = (s: string) => [...new TextEncoder().encode(s)];
  return Uint8Array.from([
    0xff, 0xd8,
    ...(withExif ? seg(0xe1, [...enc("Exif"), 0, 0, ...enc("GPSLatitude=25.03N")]) : []),
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0]),
    ...seg(0xfe, enc("shot with my phone")),
    ...seg(0xdb, [0, ...new Array(64).fill(1)]),
    ...seg(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    1, 2, 3, 4, 0xff, 0xd9,
  ]);
}
const asUrl = (b: Uint8Array) => `data:image/jpeg;base64,${Buffer.from(b).toString("base64")}`;
const has = (b: Uint8Array, text: string) => Buffer.from(b).includes(text);

function serve() {
  const dir = copyFixture();
  const data = mkdtempSync(join(tmpdir(), "jobhunt-data-"));
  dirs.push(dir, data);
  // a photo block like the Chinese templates have
  const h = join(dir, "resumes", "261008-01.html");
  writeFileSync(h, readFileSync(h, "utf-8").replace("</header>", `<div class="photo" id="photo-slot"><img src="photo.jpg" alt="大頭照"></div></header>`));
  const s: Running = startServer({ folder: new Folder(dir), dataDir: data });
  stops.push(s.stop);
  const base = `http://127.0.0.1:${s.port}`;
  const H = { "x-jobhunt-token": s.token, "content-type": "application/json" };
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const cookie = async () => ((await fetch(`${base}/api/check`, { headers: H })).headers.get("set-cookie") || "").split(";")[0];
  return { dir, data, s, base, H, post, cookie };
}

test("cleanJpeg：EXIF、JFIF、註解都拿掉，只留畫面；量得到寬高；不是 JPEG 就回 null", () => {
  const p = cleanJpeg(fakeJpeg())!;
  expect([p.width, p.height]).toEqual([70, 90]);
  expect(has(p.bytes, "GPSLatitude")).toBe(false);
  expect(has(p.bytes, "Exif")).toBe(false);
  expect(has(p.bytes, "JFIF")).toBe(false);
  expect(has(p.bytes, "my phone")).toBe(false);
  expect([p.bytes[0], p.bytes[1], p.bytes[p.bytes.length - 2], p.bytes[p.bytes.length - 1]]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
  expect(cleanJpeg(new TextEncoder().encode("GIF89a not a jpeg"))).toBeNull();
  expect(cleanJpeg(fakeJpeg().subarray(0, 40))).toBeNull(); // cut off
  expect(cleanJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
});

test("上傳照片：存在程式資料夾、不在求職資料夾；伺服器再清一次 EXIF", async () => {
  const { dir, data, base, H, post } = serve();
  expect(await (await fetch(`${base}/api/photo`, { headers: H })).json()).toEqual({ has: false, dataUrl: null });
  expect((await fetch(`${base}/api/photo`)).status).toBe(401);
  const r = await post("/api/photo", { image: asUrl(fakeJpeg()) });
  expect(r.status).toBe(200);
  const saved = photoFile(data, dir);
  expect(existsSync(saved)).toBe(true);
  expect(has(new Uint8Array(readFileSync(saved)), "GPSLatitude")).toBe(false);
  // nothing picture-like appeared anywhere inside the job folder (the AI can read that folder)
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  expect(walk(dir).filter((f) => /\.(jpe?g|png|heic)$/i.test(f))).toEqual([]);
  const got: any = await (await fetch(`${base}/api/photo`, { headers: H })).json();
  expect(got.has).toBe(true);
  expect(got.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect(((await (await post("/api/photo/delete", {})).json()) as any).has).toBe(false);
  expect(existsSync(saved)).toBe(false);
});

test("上傳照片：不是 JPEG、太大、格式不對都拒絕，不存檔", async () => {
  const { dir, data, post } = serve();
  const bad = [
    { image: "data:image/png;base64,iVBORw0KGgo=" },
    { image: "data:image/jpeg;base64," + Buffer.from("not a jpeg").toString("base64") },
    { image: "nonsense" },
    { image: 42 },
    {},
    { image: asUrl(new Uint8Array([...fakeJpeg(), ...new Uint8Array(2 * 1024 * 1024)])) },
  ];
  for (const b of bad) {
    const r = await post("/api/photo", b);
    expect(r.status).toBe(400);
    expect(typeof ((await r.json()) as any).error).toBe("string");
  }
  expect(existsSync(photoFile(data, dir))).toBe(false);
});

test("/view：有照片就把範本的 photo.jpg 換成那張（內嵌），沒有就維持隱藏照片格", async () => {
  const { base, post, cookie } = serve();
  const c = await cookie();
  const without = await (await fetch(`${base}/view/261008-01`, { headers: { cookie: c } })).text();
  expect(without).toContain("#photo-slot{display:none !important}");
  await post("/api/photo", { image: asUrl(fakeJpeg()) });
  const r = await fetch(`${base}/view/261008-01?print=1`, { headers: { cookie: c } });
  const html = await r.text();
  expect(html).toContain('<img src="data:image/jpeg;base64,');
  expect(html).not.toContain('src="photo.jpg"');
  expect(html).not.toContain("#photo-slot{display:none");
  expect(r.headers.get("content-security-policy")).toContain("img-src 'self' data:");
});

test("Word 檔：有照片時抬頭是兩格表格（姓名在左、照片在右）；沒照片或履歷沒有照片格就沒有", async () => {
  const { dir, base, post, cookie } = serve();
  const c = await cookie();
  const docx = async () => new Uint8Array(await (await fetch(`${base}/view/261008-01?format=docx`, { headers: { cookie: c } })).arrayBuffer());
  const part = (b: Uint8Array, n: string) => zipEntries(b).find((e) => e.name === n);
  const text = (b: Uint8Array, n: string) => new TextDecoder().decode(unzipEntry(b, part(b, n)!, { left: LIMITS.total }));
  let b = await docx();
  expect(part(b, "word/media/photo.jpg")).toBeUndefined();
  await post("/api/photo", { image: asUrl(fakeJpeg(70, 90)) });
  b = await docx();
  const img = part(b, "word/media/photo.jpg")!;
  expect(img).toBeDefined();
  expect(has(unzipEntry(b, img, { left: LIMITS.total }), "GPSLatitude")).toBe(false);
  const doc = text(b, "word/document.xml");
  expect(doc).toContain("<w:tbl>");
  expect(doc.indexOf("李欣怡")).toBeGreaterThan(doc.indexOf("<w:tbl>"));
  expect(doc.indexOf("李欣怡")).toBeLessThan(doc.indexOf("<w:drawing>"));
  expect(doc).toContain('r:embed="rId3"');
  expect(text(b, "word/_rels/document.xml.rels")).toContain('Target="media/photo.jpg"');
  expect(text(b, "[Content_Types].xml")).toContain('Extension="jpg"');
  // a resume file whose photo block was deleted (photo: false) stays without a photo even if one is saved
  const h = join(dir, "resumes", "261008-01.html");
  writeFileSync(h, readFileSync(h, "utf-8").replace(/<div class="photo"[\s\S]*?<\/div>/, ""));
  b = await docx();
  expect(part(b, "word/media/photo.jpg")).toBeUndefined();
  expect(text(b, "word/document.xml")).not.toContain("<w:tbl>");
});
