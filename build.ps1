# Сборка расширения из src/ для Chrome и Firefox.
# Результат: dist/chrome, dist/firefox (для загрузки распакованного расширения)
# и архивы dist/gazeta-ext.zip, dist/gazeta-ext-firefox.zip.
# Запуск: powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$root = $PSScriptRoot
$src = Join-Path $root "src"
$dist = Join-Path $root "dist"
$utf8 = New-Object System.Text.UTF8Encoding($false) # без BOM

# отличия манифестов: в Chrome фон — service worker, в Firefox — обычные скрипты
function Set-Browser($m, $browser) {
  if ($browser -eq "chrome") {
    $m | Add-Member background ([ordered]@{ service_worker = "background.js" })
  } else {
    $m | Add-Member background ([ordered]@{ scripts = @("pool.js", "background.js") })
    $m.permissions += "downloads"
    $m | Add-Member browser_specific_settings ([ordered]@{
      gecko = [ordered]@{
        id = "gazeta@shurand.local"
        strict_min_version = "115.0"
        data_collection_permissions = [ordered]@{ required = @("none") }
      }
    })
  }
}

# zip со слешами «/» в путях: Compress-Archive в PowerShell 5 пишет «\», и Firefox такой архив не принимает
# Архив собирается во временный файл и подменяет старый; если старый занят (открыт в браузере
# или архиваторе) — только предупреждение, папки для распакованного расширения всё равно обновлены.
function New-Zip($dir, $zipPath, $prefix) {
  $tmp = "$zipPath.tmp"
  if (Test-Path $tmp) { Remove-Item $tmp }
  $zip = [System.IO.Compression.ZipFile]::Open($tmp, "Create")
  try {
    foreach ($f in Get-ChildItem $dir -Recurse -File) {
      $name = $prefix + $f.FullName.Substring($dir.Length + 1).Replace("\", "/")
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $name)
    }
  } finally {
    $zip.Dispose()
  }
  try {
    Move-Item $tmp $zipPath -Force
  } catch {
    Remove-Item $tmp
    Write-Warning "Не удалось обновить $zipPath — файл занят другой программой. Закройте её и запустите сборку ещё раз."
  }
}

New-Item -ItemType Directory $dist -Force | Out-Null

foreach ($browser in "chrome", "firefox") {
  $out = Join-Path $dist $browser
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  Copy-Item $src $out -Recurse
  $m = [IO.File]::ReadAllText((Join-Path $src "manifest.json"), $utf8) | ConvertFrom-Json
  Set-Browser $m $browser
  [IO.File]::WriteAllText((Join-Path $out "manifest.json"), ($m | ConvertTo-Json -Depth 10), $utf8)
}

# в архиве для Chrome файлы лежат в папке gazeta-ext/, для Firefox — в корне (так требует AMO)
New-Zip (Join-Path $dist "chrome") (Join-Path $dist "gazeta-ext.zip") "gazeta-ext/"
New-Zip (Join-Path $dist "firefox") (Join-Path $dist "gazeta-ext-firefox.zip") ""
Write-Host "Готово: $dist"
