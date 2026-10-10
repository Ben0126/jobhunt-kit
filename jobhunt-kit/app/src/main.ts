// 入口：沒有參數 → 打開介面；`check` → 命令列檢查；`read <檔案>` → 印出 Word 舊履歷的文字（給 AI 讀，不存檔）。
// 開發時：bun src/main.ts --dir <求職資料夾> [--no-open]
import { dirname } from "node:path";
import { cliTextFor } from "./cli.text.ts";
import { dirFlagRefused, looksLikeJobhuntFolder, resolveDataDir } from "./folder.ts";
import { launch } from "./launch.ts";
import { type Language, readMarketSync } from "./market.ts";

const argv = process.argv.slice(2);
const command = argv.find((a, i) => !a.startsWith("-") && !/^--(dir|folder)$/.test(argv[i - 1] ?? ""));

/** The language of the folder's jobhunt.yaml; a folder the program does not recognise gets the Taiwan (Chinese) wording. */
const langOf = (dir: string | null): Language => (dir && looksLikeJobhuntFolder(dir) ? readMarketSync(dir).language : "zh-TW");

function waitForEnter(lang: Language) {
  // Double-clicked on Windows: keep the window open long enough to read the message.
  if (process.stdin.isTTY) {
    try {
      prompt(cliTextFor(lang).pressEnter);
    } catch {}
  }
}

async function main(): Promise<number> {
  if (dirFlagRefused(command, argv)) {
    console.log(cliTextFor(langOf(dirname(process.execPath))).dirRefused(command!));
    return 2;
  }
  const dir = resolveDataDir(argv);
  const T = cliTextFor(langOf(dir));

  if (command === "check") {
    const { runCheck } = await import("./check.ts");
    return runCheck(argv, dir);
  }
  if (command === "read") {
    const { runRead } = await import("./docx.ts");
    return runRead(argv, dir);
  }
  // Opening the UI keeps the program running: a mistyped flag (--help, or --104 without "check") must not do that,
  // or the AI's command never returns.
  const unknown = argv.filter((a, i) => a.startsWith("-") && !/^--(?:dir|folder)(?:=.*)?$/.test(a) && a !== "--no-open" && !/^-psn_/.test(a) && !/^--(dir|folder)$/.test(argv[i - 1] ?? ""));
  if (command || unknown.length) {
    console.log(T.unknownCommand(command ?? unknown.join(" ")));
    console.log(T.usage(dir !== null && langOf(dir) === "en" && readMarketSync(dir).market === "us"));
    return 2;
  }
  if (!dir) {
    console.log(T.devNeedsDir);
    return 2;
  }

  const result = await launch(dir, { open: !argv.includes("--no-open") });
  if (result.kind === "not-folder") {
    waitForEnter("zh-TW"); // the folder is not recognised: launch() printed the Chinese wording
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
