// 畫面檔案的靜態檢查（真正的瀏覽器操作在冒煙測試和手動 Playwright 檢查裡）。
import { expect, test } from "bun:test";
import { join } from "node:path";

const ui = (f: string) => Bun.file(join(import.meta.dir, "..", "ui", f)).text();

test("hidden 屬性一定要藏得住（回歸：.add-form 的 display:grid 曾經蓋過 hidden，新增表單一打開就露出來）", async () => {
  const css = await ui("style.css");
  expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test("符合 CSP：沒有內嵌 script、style 屬性、onclick 這類屬性", async () => {
  const html = await ui("index.html");
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
  expect(html).not.toMatch(/\sstyle=/i);
  expect(html).not.toMatch(/\son[a-z]+=/i);
  expect(html).not.toMatch(/<style/i);
});

test("畫面程式不用 innerHTML（資料一律當文字放，防止公司名稱裡的程式碼被執行）", async () => {
  const js = await ui("app.js");
  expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("畫面文字不出現技術用語", async () => {
  const html = (await ui("index.html")).replace(/<[^>]+>/g, " ");
  const js = (await ui("app.js")).match(/(["'`])(?:(?!\1).)*[一-鿿](?:(?!\1).)*\1/g)?.join("\n") ?? "";
  for (const word of ["YAML", "CSV", "JSON", "target", "slug", "token", "API", "job_id"]) {
    expect(html).not.toContain(word);
    expect(js).not.toContain(word);
  }
});
