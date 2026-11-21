$ErrorActionPreference = 'Stop'
$install = Join-Path $env:LOCALAPPDATA 'desktop'
if (!(Test-Path (Join-Path $env:RUNNER_TEMP 'squirrel-fixture-owned.txt'))) { throw 'Initial fixture was not installed' }
function Assert-FixtureSignature([string]$path) {
  if (!$env:SQUIRREL_TEST_THUMBPRINT) { return }
  $signature = Get-AuthenticodeSignature $path
  if (!$signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $env:SQUIRREL_TEST_THUMBPRINT -or $signature.Status -in @('HashMismatch', 'NotSigned')) {
    throw "Fixture signature missing, mismatched, or invalid for $path : $($signature.Status)"
  }
  Write-Host "Fixture signer matched for $path; Windows chain status: $($signature.Status)"
}
function Stop-TestDesktop {
  Get-CimInstance Win32_Process -Filter "Name = 'desktop.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($install + [IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
Assert-FixtureSignature (Get-ChildItem dist/release/*Setup.exe).FullName
$feed = (Resolve-Path 'dist/update/production/win32/x64').Path
$archive = (Get-ChildItem "$feed/*-full.nupkg").Name
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$url = "http://127.0.0.1:$port/"
$log = Join-Path $env:RUNNER_TEMP 'squirrel-update-feed.log'
$server = Start-Process (Get-Command python).Source -ArgumentList @('-m','http.server',"$port",'--bind','127.0.0.1','--directory',('"{0}"' -f $feed)) -RedirectStandardOutput (Join-Path $env:RUNNER_TEMP 'squirrel-update-feed-stdout.log') -RedirectStandardError $log -PassThru
try {
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    try { $null = Invoke-WebRequest ($url + 'RELEASES') -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Milliseconds 500 }
  }
  if (!$ready) { throw 'Local feed did not start' }
  $updater = Join-Path $install 'Update.exe'
  if (!(Test-Path $updater)) { throw 'Installed Squirrel Update.exe missing' }
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $update = Start-Process $updater -ArgumentList @('--update', $url, '--silent') -PassThru
  if (!$update.WaitForExit(120000)) { Stop-Process -Id $update.Id -Force; throw 'Squirrel update timed out' }
  if ($update.ExitCode -ne 0) { throw "Squirrel update failed: $($update.ExitCode)" }
  $app = Join-Path $install 'app-1.42.2/desktop.exe'
  if (!(Test-Path $app)) { throw "Updated executable missing: $app" }
  Assert-FixtureSignature $app
  Stop-TestDesktop
  $run = Start-Process $app -PassThru
  Start-Sleep -Seconds 8
  $run.Refresh()
  if ($run.HasExited) { throw "Updated application exited: $($run.ExitCode)" }
  $observed = (Get-CimInstance Win32_Process -Filter "ProcessId = $($run.Id)").ExecutablePath
  $version = (Get-Item $observed).VersionInfo.FileVersion
  if ($observed -ne $app -or $version -notlike '1.42.2*') { throw "Wrong updated application version/path: $version $observed" }
  Stop-Process -Id $run.Id -Force -ErrorAction SilentlyContinue
  Stop-TestDesktop
  $timer.Stop()
  $access = Get-Content $log -Raw
  if (!$access.Contains('GET /RELEASES') -or !$access.Contains("GET /$archive")) { throw 'Local feed did not record both RELEASES and full-package requests' }
  "Local Squirrel update and launch: $($timer.Elapsed.TotalSeconds) s; FileVersion $version; $observed" | Tee-Object -FilePath (Join-Path $env:RUNNER_TEMP 'squirrel-update-result.txt') -Append
} finally {
  if (!$server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
