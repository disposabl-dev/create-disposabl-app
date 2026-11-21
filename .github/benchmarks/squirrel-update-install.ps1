$ErrorActionPreference = 'Stop'
$install = Join-Path $env:LOCALAPPDATA 'desktop'
if (Test-Path $install) { throw 'Refusing to overwrite an existing installation' }
Set-Content (Join-Path $env:RUNNER_TEMP 'squirrel-fixture-owned.txt') 'created by this job'
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
$setup = (Get-ChildItem dist/release/*Setup.exe).FullName
Assert-FixtureSignature $setup
$timer = [Diagnostics.Stopwatch]::StartNew()
$proc = Start-Process $setup -ArgumentList '--silent' -PassThru
if (!$proc.WaitForExit(120000)) { Stop-Process -Id $proc.Id -Force; throw 'Initial Setup timed out' }
if ($proc.ExitCode -ne 0) { throw "Initial Setup failed: $($proc.ExitCode)" }
$app = Join-Path $install 'app-1.42.1/desktop.exe'
if (!(Test-Path $app)) { throw "Initial installed executable missing: $app" }
Assert-FixtureSignature $app
Stop-TestDesktop
$run = Start-Process $app -PassThru
Start-Sleep -Seconds 8
$run.Refresh()
if ($run.HasExited) { throw "Initial application exited: $($run.ExitCode)" }
$observed = (Get-CimInstance Win32_Process -Filter "ProcessId = $($run.Id)").ExecutablePath
$version = (Get-Item $observed).VersionInfo.FileVersion
if ($observed -ne $app -or $version -notlike '1.42.1*') { throw "Wrong initial application version/path: $version $observed" }
Stop-Process -Id $run.Id -Force -ErrorAction SilentlyContinue
Stop-TestDesktop
$timer.Stop()
"Initial install and launch: $($timer.Elapsed.TotalSeconds) s; FileVersion $version; $observed" | Tee-Object -FilePath (Join-Path $env:RUNNER_TEMP 'squirrel-update-result.txt')
