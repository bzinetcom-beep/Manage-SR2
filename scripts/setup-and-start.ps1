# ================================================================
#  SRMS4 - One-Click Setup and Launch Script
# ================================================================

param(
    [switch]$SkipBrowser,
    [switch]$DevMode
)

$ErrorActionPreference = "Stop"

$LogFile = Join-Path (Get-Location).Path "srms4-startup.log"

# -- Helpers --

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$ts] [$Level] $Message" -Encoding UTF8
    switch ($Level) {
        "ERROR"   { Write-Host "  [ERROR] $Message" -ForegroundColor Red }
        "WARN"    { Write-Host "  [WARN]  $Message" -ForegroundColor Yellow }
        "SUCCESS" { Write-Host "  [OK]    $Message" -ForegroundColor Green }
        "STEP"    { Write-Host ""; Write-Host "=== $Message ===" -ForegroundColor Cyan }
        default   { Write-Host "  [INFO]  $Message" -ForegroundColor Gray }
    }
}

function Find-Psql {
    # 1) Try PATH
    $inPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($inPath) { return $inPath.Source }

    # 2) Try Windows registry (standard PostgreSQL installer)
    $regPaths = @(
        "HKLM:\SOFTWARE\PostgreSQL\Installations\postgresql-64-17",
        "HKLM:\SOFTWARE\PostgreSQL\Installations\postgresql-64-16",
        "HKLM:\SOFTWARE\PostgreSQL\Installations\postgresql-64-15",
        "HKLM:\SOFTWARE\PostgreSQL\Installations\postgresql-64-14",
        "HKLM:\SOFTWARE\PostgreSQL\Installations\postgresql-64-13",
        "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations\postgresql-64-17",
        "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations\postgresql-64-16",
        "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations\postgresql-64-15",
        "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations\postgresql-64-14",
        "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations\postgresql-64-13"
    )
    foreach ($reg in $regPaths) {
        try {
            $base = (Get-ItemProperty -Path $reg -ErrorAction Stop).BaseDirectory
            if ($base) {
                $candidate = Join-Path $base "bin\psql.exe"
                if (Test-Path $candidate) { return $candidate }
            }
        } catch { }
    }

    # 3) Try common install directories
    $drives = @("C", "D", "E")
    $versions = @("17", "16", "15", "14", "13")
    foreach ($drv in $drives) {
        foreach ($v in $versions) {
            $candidate = "${drv}:\Program Files\PostgreSQL\${v}\bin\psql.exe"
            if (Test-Path $candidate) { return $candidate }
            $candidate = "${drv}:\PostgreSQL\${v}\bin\psql.exe"
            if (Test-Path $candidate) { return $candidate }
        }
    }

    # 4) Deep search Program Files
    foreach ($drv in $drives) {
        $pf = "${drv}:\Program Files"
        if (Test-Path $pf) {
            $found = Get-ChildItem -Path $pf -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue -Depth 4 | Select-Object -First 1
            if ($found) { return $found.FullName }
        }
    }

    return $null
}

# ================================================================
# Resolve project root directory
# ================================================================

if ($PSScriptRoot -and $PSScriptRoot -ne "") {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
} else {
    $ProjectRoot = (Get-Location).Path
}

# Verify package.json exists, try parent if not
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    $alt = Split-Path -Parent $ProjectRoot
    if (Test-Path (Join-Path $alt "package.json")) {
        $ProjectRoot = $alt
    }
}

Set-Location $ProjectRoot
$LogFile = Join-Path $ProjectRoot "srms4-startup.log"
$EnvFile = Join-Path $ProjectRoot ".env"
Write-Log "Project root: $ProjectRoot"

# ================================================================
# STEP 1: Check Prerequisites
# ================================================================

Write-Host ""
Write-Host "  =============================================" -ForegroundColor DarkCyan
Write-Host "  SRMS4 - Soldier Resource Management System"  -ForegroundColor DarkCyan
Write-Host "  Starting automatic setup..."                   -ForegroundColor DarkCyan
Write-Host "  =============================================" -ForegroundColor DarkCyan
Write-Host ""

Write-Log "Checking prerequisites" "STEP"

# -- Node.js --
Write-Log "Checking Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Log "Node.js not found! Install v18+ from https://nodejs.org" "ERROR"
    Read-Host "  Press Enter to exit"
    exit 1
}
$nodeVersion = (node --version 2>$null) -replace 'v',''
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Log "Node.js v$nodeVersion too old. Minimum v18 required." "ERROR"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Log "Node.js v$nodeVersion" "SUCCESS"

# -- npm --
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Log "npm not found!" "ERROR"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-Log "npm" "SUCCESS"

# -- PostgreSQL --
Write-Log "Searching for PostgreSQL..."
$psqlPath = Find-Psql

if (-not $psqlPath) {
    Write-Log "PostgreSQL not found! Install v13+ from https://www.postgresql.org/download/windows/" "ERROR"
    Write-Log "Searched: PATH, registry, C:\Program Files\PostgreSQL\*\bin\, D:\, deep scan" "ERROR"
    Read-Host "  Press Enter to exit"
    exit 1
}

$pgVersion = & $psqlPath --version 2>$null
Write-Log "PostgreSQL found at: $psqlPath" "SUCCESS"
Write-Log "Version: $pgVersion" "SUCCESS"

# -- Check PG service --
Write-Log "Checking PostgreSQL service..."
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" } | Select-Object -First 1
if (-not $pgService) {
    Write-Log "PostgreSQL service not running. Attempting to start..."
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pgService) {
        try {
            Start-Service $pgService.Name -ErrorAction Stop
            Start-Sleep -Seconds 3
            Write-Log "PostgreSQL service started" "SUCCESS"
        } catch {
            Write-Log "Cannot start PostgreSQL service: $_" "ERROR"
            Read-Host "  Press Enter to exit"
            exit 1
        }
    } else {
        # Try pg_ctl as fallback
        $pgBinDir = Split-Path -Parent $psqlPath
        $pgCtl = Join-Path $pgBinDir "pg_ctl.exe"
        if (Test-Path $pgCtl) {
            Write-Log "No Windows service found. Trying pg_ctl..."
            # Try to find data directory
            $dataDirs = @(
                "$env:APPDATA\PostgreSQL",
                "$env:ProgramFiles\PostgreSQL",
                "C:\ProgramData\PostgreSQL"
            )
            foreach ($dd in $dataDirs) {
                if (Test-Path $dd) {
                    $dataDir = Get-ChildItem -Path $dd -Filter "postgresql.conf" -Recurse -ErrorAction SilentlyContinue -Depth 4 | Select-Object -First 1
                    if ($dataDir) {
                        $dataPath = Split-Path -Parent $dataDir.FullName
                        & $pgCtl start -D $dataPath -l (Join-Path $dataPath "pg.log") 2>&1 | Out-Null
                        Start-Sleep -Seconds 3
                        break
                    }
                }
            }
        }
        # Re-check
        $testConn = & $psqlPath -h 127.0.0.1 -p 5432 -U postgres -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Log "PostgreSQL service not found and cannot connect." "ERROR"
            Read-Host "  Press Enter to exit"
            exit 1
        }
    }
} else {
    Write-Log "PostgreSQL service running: $($pgService.Name)" "SUCCESS"
}

# ================================================================
# STEP 2: Environment Setup
# ================================================================

Write-Log "Environment setup" "STEP"

if (-not (Test-Path $EnvFile)) {
    Write-Log "Creating .env file..."
    if (Test-Path (Join-Path $ProjectRoot ".env.template")) {
        Copy-Item (Join-Path $ProjectRoot ".env.template") $EnvFile
    } else {
        Set-Content -Path $EnvFile -Value "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/srms_db`nAUTH_SECRET=srms4-secret-$(Get-Random)" -Encoding UTF8
    }
    Write-Log ".env created" "SUCCESS"
} else {
    Write-Log ".env exists" "SUCCESS"
}

# ================================================================
# STEP 3: Database Setup
# ================================================================

Write-Log "Database setup" "STEP"

$envContent = Get-Content $EnvFile -Raw
$dbUrl = "postgresql://postgres:postgres@127.0.0.1:5432/srms_db"
if ($envContent -match 'DATABASE_URL=(.+)') {
    $dbUrl = $Matches[1].Trim()
}

$dbRegex = 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)'
if ($dbUrl -match $dbRegex) {
    $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]; $dbName = $Matches[5]
} else {
    Write-Log "Invalid DATABASE_URL in .env" "ERROR"; exit 1
}

Write-Log "Connecting: $dbUser@$dbHost`:$dbPort/$dbName"
$env:PGPASSWORD = $dbPass

# Test connection - suppress native errors
$testResult = $null
try {
    $testResult = & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d postgres -c "SELECT 1;" 2>&1 | Out-String
} catch { }

if ($LASTEXITCODE -ne 0 -or $testResult -match "FATAL|error") {
    Write-Log "Authentication failed with default password." "WARN"
    Write-Host ""
    Write-Host "  PostgreSQL needs a password." -ForegroundColor Yellow
    Write-Host "  (This is the password you set when installing PostgreSQL)" -ForegroundColor Yellow
    Write-Host ""

    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        $inputPass = Read-Host "  Enter PostgreSQL password for user '$dbUser' (attempt $attempt/$maxAttempts)"
        $env:PGPASSWORD = $inputPass

        $testResult = $null
        try {
            $testResult = & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d postgres -c "SELECT 1;" 2>&1 | Out-String
        } catch { }

        if ($LASTEXITCODE -eq 0 -and $testResult -notmatch "FATAL|error") {
            # Success! Update .env with correct password
            Write-Log "Password accepted!" "SUCCESS"
            $dbPass = $inputPass
            $newUrl = "postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}"

            # Read current .env and replace DATABASE_URL
            $envLines = Get-Content $EnvFile
            $newLines = @()
            $found = $false
            foreach ($line in $envLines) {
                if ($line -match '^DATABASE_URL=') {
                    $newLines += "DATABASE_URL=$newUrl"
                    $found = $true
                } else {
                    $newLines += $line
                }
            }
            if (-not $found) {
                $newLines = @("DATABASE_URL=$newUrl") + $newLines
            }
            Set-Content -Path $EnvFile -Value ($newLines -join "`n") -Encoding UTF8
            Write-Log ".env updated with correct password" "SUCCESS"
            break
        } else {
            Write-Host "  Wrong password. Try again." -ForegroundColor Red
        }

        if ($attempt -eq $maxAttempts) {
            Write-Log "Failed to authenticate after $maxAttempts attempts." "ERROR"
            Write-Host ""
            Write-Host "  Hint: The default PostgreSQL password might be:" -ForegroundColor Yellow
            Write-Host "    - postgres" -ForegroundColor Yellow
            Write-Host "    - (empty - press Enter)" -ForegroundColor Yellow
            Write-Host "    - The password you entered during PostgreSQL installation" -ForegroundColor Yellow
            Write-Host ""
            Read-Host "  Press Enter to exit"
            exit 1
        }
    }
}
Write-Log "PostgreSQL connection OK" "SUCCESS"

# Create database if not exists
Write-Log "Checking database '$dbName'..."
$dbExists = & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName';" 2>$null
if ($dbExists -ne "1") {
    Write-Log "Creating database '$dbName'..."
    & $psqlPath -h $dbHost -p $dbPort -U $dbUser -d postgres -c "CREATE DATABASE $dbName;" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Log "Failed to create database" "ERROR"; exit 1 }
    Write-Log "Database created" "SUCCESS"
} else {
    Write-Log "Database exists" "SUCCESS"
}

# ================================================================
# STEP 4: Install Dependencies
# ================================================================

Write-Log "Dependencies" "STEP"

$nodeModulesDir = Join-Path $ProjectRoot "node_modules"
$packageJson = Join-Path $ProjectRoot "package.json"

if (-not (Test-Path $packageJson)) {
    Write-Log "package.json not found at: $ProjectRoot" "ERROR"
    Read-Host "  Press Enter to exit"
    exit 1
}

if (-not (Test-Path $nodeModulesDir)) {
    Write-Log "Running npm install (first time, may take a few minutes)..."
    Write-Log "Working directory: $ProjectRoot"
    Set-Location $ProjectRoot

    # Run npm install with explicit working directory
    $proc = Start-Process -FilePath "npm" -ArgumentList "install" -WorkingDirectory $ProjectRoot -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        # Fallback: try with cmd /c
        Write-Log "Retrying with cmd..."
        & cmd /c "cd /d `"$ProjectRoot`" && npm install"
    }

    if (-not (Test-Path $nodeModulesDir)) {
        Write-Log "npm install failed - node_modules not created" "ERROR"
        Read-Host "  Press Enter to exit"
        exit 1
    }
    Write-Log "npm install complete" "SUCCESS"
} else {
    Write-Log "node_modules exists" "SUCCESS"
}

# ================================================================
# STEP 5: Apply Database Schema
# ================================================================

Write-Log "Database schema" "STEP"

Set-Location $ProjectRoot
Write-Log "Running drizzle-kit push..."
$drizzleOutput = & npx drizzle-kit push 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Log "drizzle-kit push returned: $drizzleOutput" "WARN"
} else {
    Write-Log "Schema applied" "SUCCESS"
}

# ================================================================
# STEP 6: Build or Dev
# ================================================================

$buildDir = Join-Path $ProjectRoot ".next"

if ($DevMode) {
    Write-Log "Starting dev server" "STEP"
    Set-Location $ProjectRoot
    if (-not $SkipBrowser) {
        Start-Job -ScriptBlock { Start-Sleep -Seconds 8; Start-Process "http://localhost:3000" } | Out-Null
    }
    Write-Host ""
    Write-Host "  Dev server: http://localhost:3000" -ForegroundColor Green
    Write-Host "  Login: admin / admin123" -ForegroundColor Green
    Write-Host "  Press Ctrl+C to stop" -ForegroundColor Green
    Write-Host ""
    & npm run dev
    exit 0
}

$fixExternals = Join-Path $ProjectRoot "scripts\fix-turbopack-externals.mjs"

function Invoke-Build {
    Write-Log "Building Next.js (may take 1-2 minutes)..."
    Set-Location $ProjectRoot
    $buildOutput = & npm run build 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Build failed!" "ERROR"
        Write-Log $buildOutput "ERROR"
        Read-Host "  Press Enter to exit"
        exit 1
    }
    Write-Log "Build complete" "SUCCESS"
}

if (-not (Test-Path $buildDir)) {
    Invoke-Build
} else {
    # A cached .next is only trustworthy if the Turbopack external modules
    # (.next\node_modules\<pkg>-<hash>) still resolve. On Windows those are
    # symlinks that silently fail to be created without Developer Mode, and a
    # .next produced on another machine references hashes that do not exist.
    # Symptom: "Failed to load external module pg-xxxxxxxx" at runtime.
    Set-Location $ProjectRoot
    & node $fixExternals --verify --quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Cached build is stale or incomplete - rebuilding" "WARN"
        Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
        Invoke-Build
    } else {
        Write-Log "Build cached" "SUCCESS"
    }
}

# Always (re)create the external module links before starting the server.
Set-Location $ProjectRoot
& node $fixExternals --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Log "External modules could not be linked - rebuilding from scratch" "WARN"
    Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
    Invoke-Build
    & node $fixExternals --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Turbopack externals still broken - retrying build with webpack" "WARN"
        Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
        & npx next build --webpack 2>&1 | Out-String | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Webpack build failed!" "ERROR"
            Read-Host "  Press Enter to exit"
            exit 1
        }
        Write-Log "Webpack build complete" "SUCCESS"
    }
}
Write-Log "External modules OK" "SUCCESS"

# ================================================================
# STEP 7: Start Production Server
# ================================================================

Write-Log "Starting server" "STEP"

Set-Location $ProjectRoot

if (-not $SkipBrowser) {
    Start-Job -ScriptBlock { Start-Sleep -Seconds 5; Start-Process "http://localhost:3000" } | Out-Null
}

Write-Host ""
Write-Host "  =============================================" -ForegroundColor Green
Write-Host "  SRMS4 is ready!"                                 -ForegroundColor Green
Write-Host "  URL:      http://localhost:3000"                  -ForegroundColor Green
Write-Host "  Username: admin"                                  -ForegroundColor Green
Write-Host "  Password: admin123"                               -ForegroundColor Green
Write-Host "  Close this window to stop"                        -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Green
Write-Host ""

& npm run start
