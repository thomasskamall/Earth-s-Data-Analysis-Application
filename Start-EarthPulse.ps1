$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$backend = Join-Path $PSScriptRoot "backend"
$frontend = Join-Path $PSScriptRoot "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
$url = "http://localhost:5173"

function Test-Port([int]$port) {
    [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# Stop any old copy (for example from another folder) so this folder's version runs.
function Stop-Port([int]$port) {
    $ids = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 }
    foreach ($id in $ids) { & taskkill.exe /PID $id /T /F 2>$null | Out-Null }
    for ($i = 0; $i -lt 20 -and (Test-Port $port); $i++) { Start-Sleep -Milliseconds 250 }
}
if ((Test-Port 8000) -or (Test-Port 5173)) {
    Write-Host "Closing the old running copy of the app..."
    Stop-Port 8000
    Stop-Port 5173
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "Install Node.js LTS, then reopen PowerShell and run this launcher again."
}

# ---- One-time setup: reinstall only when the dependency lists change ----
if (-not (Test-Path $python)) {
    Write-Host "First run: creating the Python environment..."
    if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv (Join-Path $backend ".venv") }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { & python -m venv (Join-Path $backend ".venv") }
    else { throw "Install Python 3.12 or newer, then run this launcher again." }
    if ($LASTEXITCODE -ne 0) { throw "Python environment creation failed." }
}

$requirements = Join-Path $backend "requirements.txt"
$pyStamp = Join-Path $backend ".venv\.earthpulse-installed"
$pyHash = (Get-FileHash $requirements).Hash
if (-not (Test-Path $pyStamp) -or (Get-Content $pyStamp -Raw).Trim() -ne $pyHash) {
    Write-Host "Installing backend packages (only when they change)..."
    & $python -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed. Read the error above." }
    Set-Content $pyStamp $pyHash
}

$lock = Join-Path $frontend "package-lock.json"
if (-not (Test-Path $lock)) { $lock = Join-Path $frontend "package.json" }
$jsStamp = Join-Path $frontend "node_modules\.earthpulse-installed"
$jsHash = (Get-FileHash $lock).Hash
if (-not (Test-Path $jsStamp) -or (Get-Content $jsStamp -Raw).Trim() -ne $jsHash) {
    Write-Host "Installing frontend packages (only when they change)..."
    Push-Location $frontend
    try {
        & npm.cmd install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Frontend dependency installation failed." }
    } finally { Pop-Location }
    Set-Content $jsStamp $jsHash
}

# ---- Start both servers in minimized windows ----
$backendQuoted = $backend.Replace("'", "''")
$frontendQuoted = $frontend.Replace("'", "''")
$pythonQuoted = $python.Replace("'", "''")
if (-not (Test-Port 8000)) {
    $backendCommand = "`$Host.UI.RawUI.WindowTitle = 'Earth Data App - backend'; Set-Location '$backendQuoted'; & '$pythonQuoted' -m uvicorn app.main:app --port 8000"
    Start-Process powershell.exe -WindowStyle Minimized -ArgumentList @("-NoExit", "-Command", $backendCommand)
}
if (-not (Test-Port 5173)) {
    $frontendCommand = "`$Host.UI.RawUI.WindowTitle = 'Earth Data App - frontend'; Set-Location '$frontendQuoted'; npm.cmd run dev -- --port 5173 --strictPort"
    Start-Process powershell.exe -WindowStyle Minimized -ArgumentList @("-NoExit", "-Command", $frontendCommand)
}

Write-Host "Starting Earth's Data Analysis Application..."
for ($i = 0; $i -lt 60; $i++) {
    if ((Test-Port 8000) -and (Test-Port 5173)) { break }
    Start-Sleep -Milliseconds 500
}
Start-Process $url
Write-Host "The app is open in your browser. To stop it, close the two minimized Earth Data App windows."
