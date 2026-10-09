import { expect, test } from "bun:test";
import { ensureColumn, parseCsv, rowToObject, serializeCsv } from "../src/csv.ts";

test("讀寫來回不改任何一個字（引號、逗號、換行、中文）", () => {
  const text = 'a,b,c\n1,"x, y","say ""hi"""\n2,"多行\n內容",中文\n';
  expect(serializeCsv(parseCsv(text))).toBe(text);
  const d = parseCsv(text);
  expect(d.rows[0]).toEqual(["1", "x, y", 'say "hi"']);
  expect(d.rows[1][1]).toBe("多行\n內容");
});

test("保留 BOM 和 CRLF；沒有 BOM 就不加", () => {
  const withBom = "\ufeffa,b\r\n1,2\r\n";
  const d = parseCsv(withBom);
  expect(d.bom).toBe(true);
  expect(d.eol).toBe("\r\n");
  expect(d.header).toEqual(["a", "b"]);
  expect(serializeCsv(d)).toBe(withBom);
  expect(serializeCsv(parseCsv("a,b\n1,2\n")).charCodeAt(0)).not.toBe(0xfeff);
});

test("只有標題列、沒有結尾換行也能讀", () => {
  const d = parseCsv("a,b,c");
  expect(d.header).toEqual(["a", "b", "c"]);
  expect(d.rows).toEqual([]);
  expect(serializeCsv(d)).toBe("a,b,c");
  d.rows.push(["1", "2", "3"]);
  expect(serializeCsv(d)).toBe("a,b,c\n1,2,3\n");
});

test("欄位不夠的列補空白；多出來的格子保留", () => {
  const d = parseCsv("a,b,c\n1\n1,2,3,4\n");
  expect(d.rows[0]).toEqual(["1", "", ""]);
  expect(d.rows[1]).toEqual(["1", "2", "3", "4"]);
  expect(serializeCsv(d)).toBe("a,b,c\n1,,\n1,2,3,4\n");
});

test("空白行略過；一格空值的列不會被當成空白行", () => {
  const d = parseCsv("a\n\n\"\"\nx\n");
  expect(d.rows).toEqual([[""], ["x"]]);
});

test("缺欄位時加在最後面，不動原本的順序；多出來的格子不會被套上新欄名", () => {
  const d = parseCsv("b,a,mine\n1,2,3,extra\n");
  const i = ensureColumn(d, "link");
  expect(i).toBe(3);
  expect(d.header).toEqual(["b", "a", "mine", "link"]);
  expect(d.rows[0]).toEqual(["1", "2", "3", "", "extra"]);
  expect(ensureColumn(d, "a")).toBe(1);
  expect(rowToObject(d.header, d.rows[0])).toEqual({ b: "1", a: "2", mine: "3", link: "" });
});
