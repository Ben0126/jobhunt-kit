// 入口：沒有參數 → 打開介面；`check` → 命令列檢查。
// 開發時：bun src/main.ts --dir <求職資料夾> [--no-open]
import { resolveDataDir } from "./folder.ts";
import { launch } from "./launch.ts";

const argv = process.argv.slice(2);
const command = argv.find((a, i) => !a.startsWith("-") && !/^--(dir|folder)$/.test(argv[i - 1] ?? ""));

function waitForEnter() {
  // Double-clicked on Windows: keep the window open long enough to read the message.
  if (process.stdin.isTTY) {
    try {
      prompt("按 Enter 關閉這個視窗。");
    } catch {}
  }
}

async function main(): Promise<number> {
  const dir = resolveDataDir(argv);

  if (command === "check") {
    const { runCheck } = await import("./check.ts");
    return runCheck(argv, dir);
  }
  // Opening the UI keeps the program running: a mistyped flag (--help, or --104 without "check") must not do that,
  // or the AI's command never returns.
  const unknown = argv.filter((a, i) => a.startsWith("-") && !/^--(?:dir|folder)(?:=.*)?$/.test(a) && a !== "--no-open" && !/^-psn_/.test(a) && !/^--(dir|folder)$/.test(argv[i - 1] ?? ""));
  if (command || unknown.length) {
    console.log(`不認得「${command ?? unknown.join(" ")}」。`);
    console.log("用法：直接點兩下打開介面；檢查用「jobhunt check」（只查一份：check 職缺代號；只查 104 總履歷：check --104）。");
    return 2;
  }
  if (!dir) {
    console.log("開發模式要用 --dir 指定求職資料夾，例如：bun src/main.ts --dir ../jobhunt/scaffold/workspace-general");
    return 2;
  }

  const result = await launch(dir, { open: !argv.includes("--no-open") });
  if (result.kind === "not-folder") {
    waitForEnter();
    return 1;
  }
  if (result.kind === "already-running") return 0;

  const quit = () => {
    result.stop();
    process.exit(0);
  };
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  process.on("SIGHUP", quit);
  return -1; // keep running
}

const code = await main();
if (code >= 0) process.exit(code);
