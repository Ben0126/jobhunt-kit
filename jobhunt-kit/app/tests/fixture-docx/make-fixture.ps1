# 用 .NET 的 System.IO.Compression（不是測試裡自己寫的 ZIP 工具）把 parts/ 打包成「範例舊履歷.docx」。
# 目的：讀 Word 的程式不能只對自己寫出來的檔案測試。內容全部虛構。
# 重做：在這個資料夾執行  powershell -ExecutionPolicy Bypass -File make-fixture.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$parts = Join-Path $here "parts"
$out = Join-Path $here "範例舊履歷.docx"
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out }

# [Content_Types].xml 要放第一個（Word 的習慣）；其他照路徑排，結果每次一樣。
$names = @("[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml", "word/header1.xml", "word/footer1.xml")

$fs = [System.IO.File]::Open($out, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($name in $names) {
    $src = Join-Path $parts ($name -replace "/", "\")
    $bytes = [System.IO.File]::ReadAllBytes($src)
    $level = if ($name -eq "_rels/.rels") { [System.IO.Compression.CompressionLevel]::NoCompression } else { [System.IO.Compression.CompressionLevel]::Optimal }
    $entry = $zip.CreateEntry($name, $level)
    $entry.LastWriteTime = [DateTimeOffset]::new(2026, 10, 9, 0, 0, 0, [TimeSpan]::Zero)
    $s = $entry.Open()
    $s.Write($bytes, 0, $bytes.Length)
    $s.Dispose()
  }
} finally {
  $zip.Dispose()
  $fs.Dispose()
}
Write-Output "wrote $out ($((Get-Item -LiteralPath $out).Length) bytes)"
