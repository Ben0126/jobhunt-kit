// 入口：沒有參數 → 打開介面；`check` → 命令列檢查；`read <檔案>` → 印出 Word 舊履歷的文字（給 AI 讀，不存檔）；
// `update` → 一鍵更新（先列清單，`--yes` 才換檔，`--undo` 退回上一版）。
// 開發時：bun src/main.ts --dir <求職資料夾> [--no-open]
import { dirname } from "node:path";
import { cliTextFor } from "./cli.text.ts";
import { dirFlagRefused, isCompiledBinary, looksLikeJobhuntFolder, resolveDataDir } from "./folder.ts";
import { launch } from "./launch.ts";
import { type Language, readMarketSync, unrecognisedLanguage } from "./market.ts";
import { cleanupAfterUpdate } from "./selfupdate.ts";
import { VERSION } from "./version.ts";

const argv = process.argv.slice(2);
const command = argv.find((a, i) => !a.startsWith("-") && !/^--(dir|folder)$/.test(argv[i - 1] ?? ""));

/** The language of the folder's jobhunt.yaml; a folder the program does not recognise gets Chinese, or English when the path names the US kit. */
const langOf = (dir: string | null): Language => (dir && looksLikeJobhuntFolder(dir) ? readMarketSync(dir).language : unrecognisedLanguage(dir));

function waitForEnter(lang: Language) {
  // Double-clicked on Windows: keep the window open long enough to read the message.
  if (process.stdin.isTTY) {
    try {
      prompt(cliTextFor(lang).pressEnter);
    } catch {}
  }
}

async function main(): Promise<number> {
  // `jobhunt --version`: the version baked in at build time ("dev" for a build that was not given one).
  if (argv.length === 1 && argv[0] === "--version") {
    console.log(VERSION);
    return 0;
  }
  if (dirFlagRefused(command, argv)) {
    console.log(cliTextFor(langOf(dirname(process.execPath))).dirRefused(command!));
    return 2;
  }
  const dir = resolveDataDir(argv);
  const T = cliTextFor(langOf(dir));
  // A Windows update leaves the old program renamed aside (jobhunt.exe.old) until it stops running.
  if (isCompiledBinary()) cleanupAfterUpdate(dirname(process.execPath));

  if (command === "check") {
    const { runCheck } = await import("./check.ts");
    return runCheck(argv, dir);
  }
  if (command === "update") {
    const { runUpdate } = await import("./selfupdate.ts");
    return runUpdate(argv, dir, { version: VERSION });
  }
  if (command === "mode") {
    const { runMode } = await import("./kitinstall.ts");
    return runMode(argv, dir);
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
    console.log(T.usage(langOf(dir) === "en" && (!dir || !looksLikeJobhuntFolder(dir) || readMarketSync(dir).market === "us"))); // an unrecognised folder that speaks English is the US kit
    return 2;
  }
  if (!dir) {
    console.log(T.devNeedsDir);
    return 2;
  }

  const result = await launch(dir, { open: !argv.includes("--no-open") });
  if (result.kind === "not-folder") {
    waitForEnter(unrecognisedLanguage(dir)); // the folder is not recognised: same wording launch() printed
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
