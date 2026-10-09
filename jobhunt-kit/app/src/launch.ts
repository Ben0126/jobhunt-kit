// 點兩下之後做的事：找資料夾 → 只開一份（lock 檔）→ 開伺服器 → 打開瀏覽器。
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Folder, looksLikeJobhuntFolder } from "./folder.ts";
import { APP_ID, startServer, type Running } from "./server.ts";

export type Lock = { port: number; token: string; pid: number; started: string };

export function readLock(path: string): Lock | null {
  try {
    const l = JSON.parse(readFileSync(path, "utf-8"));
    // Anything else is not ours (or was edited): the token goes into a URL handed to `cmd /c start`, where a "&"
    // would start another command, so only the exact shape the app writes is accepted.
    if (Number.isInteger(l?.port) && l.port >= 1 && l.port <= 65535 && typeof l?.token === "string" && /^[0-9a-f]{48}$/.test(l.token))
      return l;
  } catch {}
  return null;
}

export function lockUrl(l: Lock): string {
  return `http://127.0.0.1:${l.port}/?t=${l.token}`;
}

/** Is the app described by this lock still answering? */
export async function lockAlive(l: Lock): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${l.port}/api/ping`, {
      headers: { "x-jobhunt-token": l.token },
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return false;
    const j: any = await r.json();
    return j?.app === APP_ID;
  } catch {
    return false;
  }
}

export function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") Bun.spawn(["cmd", "/c", "start", "", url], { windowsHide: true, stdout: "ignore", stderr: "ignore" });
    else if (process.platform === "darwin") Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
    else Bun.spawn(["xdg-open", url], { stdout: "ignore", stderr: "ignore" });
  } catch {}
}

export type LaunchResult =
  | { kind: "not-folder"; dir: string }
  | { kind: "already-running"; url: string }
  | { kind: "started"; running: Running; stop: () => void };

export async function launch(dir: string, opts: { open: boolean; print?: (s: string) => void }): Promise<LaunchResult> {
  const print = opts.print ?? ((s: string) => console.log(s));
  if (!looksLikeJobhuntFolder(dir)) {
    print("這個資料夾看起來不是求職資料夾，所以沒有打開介面。");
    print(`程式現在在：${dir}`);
    print("請把這個程式放進你的求職資料夾（裡面有「開始使用.md」和 AGENTS.md 的那個資料夾），再點兩下打開。");
    print("如果你是在 .zip 壓縮檔裡面直接點的：要先把整個壓縮檔解壓縮，再到解壓縮出來的資料夾裡點兩下。");
    return { kind: "not-folder", dir };
  }
  const folder = new Folder(dir);
  const lockPath = folder.lockPath;

  const existing = readLock(lockPath);
  if (existing && (await lockAlive(existing))) {
    const url = lockUrl(existing);
    if (opts.open) openBrowser(url);
    print("介面已經開著了，幫你在瀏覽器再打開一次。");
    print(url);
    return { kind: "already-running", url };
  }

  const running = startServer({ folder });
  mkdirSync(dirname(lockPath), { recursive: true });
  const lock: Lock = { port: running.port, token: running.token, pid: process.pid, started: new Date().toISOString() };
  writeFileSync(lockPath, JSON.stringify(lock));

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      const cur = readLock(lockPath);
      if (cur && cur.token === running.token) unlinkSync(lockPath);
    } catch {}
    running.stop();
  };

  if (opts.open) {
    openBrowser(running.url);
    print("介面已經在瀏覽器打開。用完再關掉這個視窗。");
  } else print("介面已經準備好，請用瀏覽器打開下面的網址。用完再關掉這個視窗。");
  print(running.url);
  return { kind: "started", running, stop };
}
