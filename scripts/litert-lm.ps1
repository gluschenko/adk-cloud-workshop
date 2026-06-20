$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$localCli = Join-Path $repoRoot '.venv\Scripts\litert-lm.exe'

if (Test-Path $localCli) {
  & $localCli @args
  exit $LASTEXITCODE
}

$globalCli = Get-Command litert-lm -ErrorAction SilentlyContinue
if ($globalCli) {
  & $globalCli.Source @args
  exit $LASTEXITCODE
}

Write-Error "LiteRT-LM CLI was not found. Run 'npm run gemma:setup' first, then retry this command."
exit 1
