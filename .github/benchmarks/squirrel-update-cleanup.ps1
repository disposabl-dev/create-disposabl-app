$install = Join-Path $env:LOCALAPPDATA 'desktop'
$marker = Join-Path $env:RUNNER_TEMP 'squirrel-fixture-owned.txt'
if (Test-Path $marker) {
  Get-CimInstance Win32_Process -Filter "Name = 'desktop.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install + [IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  $updater = Join-Path $install 'Update.exe'
  if (Test-Path $updater) {
    $uninstall = Start-Process $updater -ArgumentList '--uninstall','--silent' -PassThru
    if (!$uninstall.WaitForExit(60000)) { Stop-Process -Id $uninstall.Id -Force -ErrorAction SilentlyContinue }
  }
  if (Test-Path $install) { Remove-Item $install -Recurse -Force -ErrorAction SilentlyContinue }
  Remove-Item $marker -Force -ErrorAction SilentlyContinue
}
if ($env:SQUIRREL_TEST_THUMBPRINT) {
  Remove-Item ("Cert:\CurrentUser\My\" + $env:SQUIRREL_TEST_THUMBPRINT) -Force -ErrorAction SilentlyContinue
}
if ($env:SQUIRREL_TEST_PFX) { Remove-Item $env:SQUIRREL_TEST_PFX -Force -ErrorAction SilentlyContinue }
