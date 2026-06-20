$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'

function Find-Python {
  if ($env:PYTHON -and (Test-Path $env:PYTHON) -and (Test-Python $env:PYTHON)) {
    return $env:PYTHON
  }

  $codexPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
  if ((Test-Path $codexPython) -and (Test-Python $codexPython)) {
    return $codexPython
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python -and (Test-Python $python.Source)) {
    return $python.Source
  }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py -and (Test-Python $py.Source -UseLauncher)) {
    return $py.Source
  }

  throw 'Python 3.10+ was not found. Install Python from python.org or set PYTHON to python.exe.'
}

function Test-Python {
  param(
    [string] $PythonPath,
    [switch] $UseLauncher
  )

  try {
    $output = if ($UseLauncher) {
      & $PythonPath -3 --version 2>&1
    } else {
      & $PythonPath --version 2>&1
    }
    if ($output -match 'Unable to create process|Access is denied|not recognized') {
      return $false
    }
    if ($UseLauncher) {
      & $PythonPath -3 --version *> $null
    } else {
      & $PythonPath --version *> $null
    }
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

if ((Test-Path $venvPython) -and -not (Test-Python $venvPython)) {
  Write-Host '[gemma:setup] existing .venv is broken; recreating it'
  Remove-Item -Recurse -Force (Join-Path $repoRoot '.venv')
}

if (-not (Test-Path $venvPython)) {
  $python = Find-Python
  Write-Host "[gemma:setup] creating .venv with $python"
  if ((Split-Path -Leaf $python) -eq 'py.exe') {
    & $python -3 -m venv (Join-Path $repoRoot '.venv')
  } else {
    & $python -m venv (Join-Path $repoRoot '.venv')
  }
}

Write-Host '[gemma:setup] installing/upgrading litert-lm'
& $venvPython -m pip install --upgrade pip litert-lm

Write-Host '[gemma:setup] done'
