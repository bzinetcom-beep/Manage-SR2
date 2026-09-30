# =============================================================================
#  SRMS — Windows Setup Wizard (self-healing / خودترمیم)
# -----------------------------------------------------------------------------
#  نصب چند-کلیکی سامانه مدیریت منابع سرباز روی ویندوز.
#
#  اصول طراحی:
#   1) هیچ خطایی باعث «لغو نصب» نمی‌شود؛ هر مرحله در صورت خطا وارد مسیر
#      ترمیم (Heal) می‌شود و تا ۳ بار تلاش می‌کند.
#   2) همه‌ی مراحل آفلاین قابل انجام‌اند: اگر اینترنت نبود، از Node/PostgreSQL
#      موجود یا از PostgreSQL داخلی (embedded PGlite) استفاده می‌شود.
#   3) همه‌ی رخدادها در فایل لاگ نوشته می‌شوند تا پشتیبانی بتواند بررسی کند.
#
#  اجرا:  double-click  installer\SRMS-Setup-Wizard.bat
# =============================================================================

param(
  [string]$Root = "",
  [string]$Log = "",
  [int]$PreferredPort = 3000
)

$ErrorActionPreference = "Continue"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
if (-not $Log)  { $Log  = Join-Path $Root "srms-install.log" }

$Script:Issues   = New-Object System.Collections.Generic.List[string]
$Script:Actions  = New-Object System.Collections.Generic.List[string]

function Write-Log([string]$level, [string]$text) {
  $line = "{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $level, $text
  try { Add-Content -Path $Log -Value $line -Encoding UTF8 } catch { }
}

function Write-Title([string]$text) {
  Write-Host ""
  Write-Host "  ============================================================" -ForegroundColor Cyan
  Write-Host "   $text" -ForegroundColor Cyan
  Write-Host "  ============================================================" -ForegroundColor Cyan
  Write-Log "INFO" "--- $text ---"
}

function Write-Step([int]$n, [string]$text) {
  Write-Host ""
  Write-Host ("  [{0}/9] {1}" -f $n, $text) -ForegroundColor White
  Write-Log "STEP" ("{0}/9 {1}" -f $n, $text)
}

function Write-Ok([string]$text)   { Write-Host "        OK    $text" -ForegroundColor Green; Write-Log "OK" $text }
function Write-Info([string]$text) { Write-Host "        ..    $text" -ForegroundColor Gray;  Write-Log "INFO" $text }
function Write-Warn2([string]$text) {
  Write-Host "        WARN  $text" -ForegroundColor Yellow
  Write-Log "WARN" $text
  $Script:Issues.Add($text)
}
function Write-Fail([string]$text) {
  Write-Host "        ERR   $text" -ForegroundColor Red
  Write-Log "ERR" $text
  $Script:Issues.Add($text)
}

<#
  اجرای یک مرحله با قابلیت خودترمیم.
  $Action : کار اصلی
  $Heal   : تابع ترمیم؛ ورودی = شماره تلاش
  هیچ‌وقت exception به بیرون پرتاب نمی‌شود.
#>
function Invoke-HealingStep {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$Action,
    [scriptblock]$Heal,
    [int]$Max = 3
  )
  for ($attempt = 1; $attempt -le $Max; $attempt++) {
    try {
      $result = & $Action $attempt
      if ($null -ne $result -and $result -eq $false) { throw "step returned false" }
      if ($attempt -gt 1) {
        $Script:Actions.Add("$Name → repaired on attempt $attempt")
        Write-Ok "$Name (repaired, attempt $attempt)"
      } else {
        Write-Ok $Name
      }
      return $true
    } catch {
      $msg = $_.Exception.Message
      Write-Log "ERR" "$Name failed (attempt $attempt): $msg"
      if ($attempt -ge $Max) {
        Write-Warn2 "$Name could not be completed automatically: $msg"
        return $false
      }
      Write-Host "        !!    $Name failed — attempting automatic repair ($attempt/$Max)…" -ForegroundColor Yellow
      if ($Heal) {
        try { & $Heal $attempt } catch {
          Write-Log "WARN" ("heal for {0} failed: {1}" -f $Name, $_.Exception.Message)
        }
      }
      Start-Sleep -Milliseconds 400
    }
  }
  return $false
}

function Test-Command([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Get-FreePort([int]$start) {
  for ($p = $start; $p -lt ($start + 80); $p++) {
    $busy = $false
    try {
      $c = New-Object Net.Sockets.TcpClient
      $iar = $c.BeginConnect("127.0.0.1", $p, $null, $null)
      if ($iar.AsyncWaitHandle.WaitOne(250) -and $c.Connected) { $busy = $true }
      $c.Close()
    } catch { }
    if (-not $busy) { return $p }
  }
  return $start
}

# =============================================================================
Write-Title "SRMS Setup Wizard  |  نصاب سامانه مدیریت منابع سرباز"
Write-Host "  Project : $Root"
Write-Host "  Log     : $Log"
Write-Host ""
Write-Host "  این نصاب، برنامه را روی همین کامپیوتر نصب و اجرا می‌کند." -ForegroundColor Gray
Write-Host "  در صورت بروز خطا، خودش تلاش به رفع مشکل می‌کند و نصب را لغو نمی‌کند." -ForegroundColor Gray

# -----------------------------------------------------------------------------
# [1/9] بررسی فایل‌های پروژه
# -----------------------------------------------------------------------------
Write-Step 1 "Checking project files / بررسی فایل‌های پروژه"
Invoke-HealingStep -Name "project files" -Max 2 -Action {
  param($a)
  if (-not (Test-Path (Join-Path $Root "package.json"))) { throw "package.json not found" }
  if (-not (Test-Path (Join-Path $Root "src")))          { throw "src folder not found" }
} -Heal {
  param($a)
  # ترمیم: اگر پوشه ناقص بود، از آخرین پکیج ZIP موجود در کنار پروژه بازسازی می‌کنیم
  $zip = Get-ChildItem -Path $Root -Filter "*.zip" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($zip) {
    Write-Info "restoring from $($zip.Name)"
    try { Expand-Archive -Path $zip.FullName -DestinationPath $Root -Force } catch { }
  } else {
    Write-Warn2 "project files incomplete and no recovery package found"
  }
}

# -----------------------------------------------------------------------------
# [2/9] Node.js
# -----------------------------------------------------------------------------
Write-Step 2 "Checking Node.js / بررسی Node.js"
$nodeExe = $null
Invoke-HealingStep -Name "Node.js runtime" -Action {
  param($a)
  $script:nodeExe = $null
  if (Test-Command "node") {
    $script:nodeExe = "node"
  } else {
    foreach ($p in @(
      "$env:ProgramFiles\nodejs\node.exe",
      "${env:ProgramFiles(x86)}\nodejs\node.exe",
      "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
      "$Root\tools\node\node.exe",
      "$env:APPDATA\nvm\current\node.exe"
    )) {
      if (Test-Path $p) { $script:nodeExe = $p; break }
    }
  }
  if (-not $script:nodeExe) { throw "Node.js not found" }
  $v = & $script:nodeExe --version 2>$null
  if (-not $v) { throw "node --version failed" }
  Write-Host "        Node  $v"
} -Heal {
  param($a)
  Write-Info "trying automatic Node.js installation (attempt $a)…"
  $installed = $false

  # 1) نصاب آفلاین همراه بسته
  $redist = Get-ChildItem -Path (Join-Path $Root "installer\redist") -Filter "node-*.msi" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($redist) {
    Write-Info "installing bundled $($redist.Name)"
    try {
      Start-Process msiexec.exe -ArgumentList "/i", "`"$($redist.FullName)`"", "/qn", "/norestart" -Wait -PassThru | Out-Null
      $installed = $true
    } catch { }
  }

  # 2) winget
  if (-not $installed -and (Test-Command "winget")) {
    Write-Info "installing via winget…"
    try {
      Start-Process winget -ArgumentList "install","--id","OpenJS.NodeJS.LTS","-e","--silent","--accept-package-agreements","--accept-source-agreements" -Wait -PassThru | Out-Null
      $installed = $true
    } catch { }
  }

  # 3) chocolatey
  if (-not $installed -and (Test-Command "choco")) {
    Write-Info "installing via chocolatey…"
    try {
      Start-Process choco -ArgumentList "install","nodejs-lts","-y","--no-progress" -Wait -PassThru | Out-Null
      $installed = $true
    } catch { }
  }

  # 4) دانلود مستقیم MSI از سایت Node
  if (-not $installed) {
    $arch = "x64"
    try { if (${env:PROCESSOR_ARCHITECTURE} -like "*ARM*") { $arch = "arm64" } } catch { }
    $url = "https://nodejs.org/dist/v22.14.0/node-v22.14.0-$arch.msi"
    $msi = Join-Path $env:TEMP "srms-node-installer.msi"
    Write-Info "downloading Node.js installer…"
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 300
      Start-Process msiexec.exe -ArgumentList "/i", "`"$msi`"", "/qn", "/norestart" -Wait -PassThru | Out-Null
      $installed = $true
    } catch { }
  }

  # 5) نوسازی PATH تا نصب جدید دیده شود
  try {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
  } catch { }

  if (-not $installed) {
    Write-Warn2 "Node.js could not be installed automatically. Install LTS from https://nodejs.org then run the wizard again."
  }
}

if (-not $script:nodeExe) { $script:nodeExe = "node" }
$env:SRMS_NODE = $script:nodeExe

# -----------------------------------------------------------------------------
# [3/9] پایگاه‌داده PostgreSQL
# -----------------------------------------------------------------------------
Write-Step 3 "Checking PostgreSQL / بررسی پایگاه‌داده"
$dbUrl = $null
$dbMode = "unknown"

function Test-DbUrl([string]$url) {
  try {
    $probe = Join-Path $Root "scripts\db-probe.mjs"
    $code = "const {Client}=require('pg');const c=new Client({connectionString:process.argv[1]});c.connect().then(()=>c.query('select 1')).then(()=>{console.log('OK');return c.end()}).catch(e=>{console.error('ERR',e.message);process.exit(1)})"
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $code -Encoding UTF8
    $out = & node $tmp.FullName $url 2>&1
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return ("$out" -match "OK")
  } catch { return $false }
}

Invoke-HealingStep -Name "PostgreSQL" -Action {
  param($a)
  $script:dbUrl = $null
  $script:dbMode = "unknown"

  # 1) از .env موجود
  $envFile = Join-Path $Root ".env"
  if (Test-Path $envFile) {
    $m = Select-String -Path $envFile -Pattern "^DATABASE_URL=(.+)$" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) {
      $candidate = $m.Matches[0].Groups[1].Value.Trim()
      if (Test-DbUrl $candidate) {
        $script:dbUrl = $candidate
        $script:dbMode = "existing (.env)"
        return
      }
    }
  }

  # 2) PostgreSQL نصب‌شده روی سیستم
  $psql = $null
  if (Test-Command "psql") { $psql = "psql" }
  else {
    $cand = Get-ChildItem -Path "$env:ProgramFiles\PostgreSQL" -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cand) { $psql = $cand.FullName }
  }
  if ($psql) {
    $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "postgresql*" -and $_.Status -ne "Running" } | Select-Object -First 1
    if ($svc) {
      Write-Info "starting service $($svc.Name)…"
      try { Start-Service $svc.Name -ErrorAction Stop } catch { try { & net start $svc.Name 2>$null | Out-Null } catch { } }
    }
    $port = 5432
    try {
      $conf = Get-ChildItem -Path "$env:ProgramFiles\PostgreSQL" -Filter "postgresql.conf" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($conf) {
        $line = (Select-String -Path $conf.FullName -Pattern "^#?port\s*=\s*(\d+)" | Select-Object -First 1)
        if ($line) { $port = [int]$line.Matches[0].Groups[1].Value }
      }
    } catch { }
    $urls = @(
      "postgresql://postgres:postgres@127.0.0.1:$port/app_db",
      "postgresql://postgres:postgres@127.0.0.1:$port/postgres",
      "postgresql://postgres:admin@127.0.0.1:$port/postgres",
      "postgresql://postgres@127.0.0.1:$port/postgres"
    )
    foreach ($u in $urls) {
      if (Test-DbUrl $u) {
        $script:dbUrl = $u
        $script:dbMode = "local PostgreSQL :$port"
        return
      }
    }
  }

  # 3) fallback آفلاین: PostgreSQL داخلی (embedded)
  throw "no usable PostgreSQL detected"
} -Heal {
  param($a)
  Write-Info "falling back to the built-in (embedded) PostgreSQL…"
  try {
    & node -e "console.log('node-ok')" | Out-Null
    $pkg = Join-Path $Root "package.json"
    if (Test-Path $pkg) {
      $already = Select-String -Path $pkg -Pattern "pglite-socket" -Quiet
      if (-not $already) {
        Write-Info "adding embedded database engine (offline, no server install needed)…"
        & npm install --no-audit --no-fund --save "@electric-sql/pglite@^0.2.17" "@electric-sql/pglite-socket@^0.0.9" 2>&1 | Out-Null
      }
    }
    $script:dbUrl = "postgresql://embedded@127.0.0.1:55432/srms"
    $script:dbMode = "embedded PGlite (auto-started with the app)"
    $Script:Actions.Add("database → embedded PGlite fallback")
  } catch {
    Write-Warn2 "embedded database could not be prepared: $($_.Exception.Message)"
  }
}

if (-not $dbUrl) {
  $dbUrl = "postgresql://postgres:postgres@127.0.0.1:5432/app_db"
  $dbMode = "default (unverified)"
  Write-Warn2 "database could not be verified — using default connection string."
}

# -----------------------------------------------------------------------------
# [4/9] تنظیمات نصب (پوشه داده، پورت، مسیر پشتیبان)
# -----------------------------------------------------------------------------
Write-Step 4 "Writing configuration / نوشتن تنظیمات"
$DataDir   = Join-Path $Root "data"
$BackupDir = Join-Path $Root "backups"
foreach ($d in @($DataDir, $BackupDir, (Join-Path $Root "logs"))) {
  try { New-Item -ItemType Directory -Path $d -Force | Out-Null } catch { Write-Warn2 "could not create folder $d" }
}

Invoke-HealingStep -Name "configuration (.env)" -Action {
  param($a)
  $envFile = Join-Path $Root ".env"
  $lines = @(
    "# SRMS configuration (generated by the setup wizard)",
    "DATABASE_URL=$dbUrl",
    "SRMS_BACKUP_DIR=$BackupDir",
    "SRMS_PORT=$PreferredPort",
    "NODE_ENV=production",
    "NEXT_TELEMETRY_DISABLED=1"
  )
  Set-Content -Path $envFile -Value $lines -Encoding UTF8
  if (-not (Test-Path $envFile)) { throw ".env was not written" }

  # درایوِ کانفیگ drizzle همیشه با همان DATABASE_URL هم‌گام می‌شود
  $drizzle = @{
    dialect        = "postgresql"
    schema         = "./src/db/schema.ts"
    dbCredentials  = @{ url = $dbUrl }
  } | ConvertTo-Json -Depth 5
  Set-Content -Path (Join-Path $Root "drizzle.config.json") -Value $drizzle -Encoding UTF8
} -Heal {
  param($a)
  try {
    Set-Content -Path (Join-Path $Root ".env") -Value "DATABASE_URL=$dbUrl" -Encoding ASCII
  } catch { }
}

Write-Host "        Database : $dbMode"
Write-Host "        Port     : $PreferredPort"

# -----------------------------------------------------------------------------
# [5/9] نصب پکیج‌ها
# -----------------------------------------------------------------------------
Write-Step 5 "Installing packages (this can take a few minutes) / نصب پکیج‌ها"
Invoke-HealingStep -Name "npm packages" -Max 4 -Action {
  param($a)
  if (-not (Test-Path (Join-Path $Root "node_modules\next"))) {
    $args = @("install", "--no-audit", "--no-fund", "--loglevel", "error")
    if ($a -ge 3) { $args += "--legacy-peer-deps" }
    $p = Start-Process -FilePath "npm" -ArgumentList ($args -join " ") -WorkingDirectory $Root -NoNewWindow -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "npm install exit code $($p.ExitCode)" }
  }
} -Heal {
  param($a)
  Write-Info "repairing npm state (attempt $a)…"
  switch ($a) {
    1 { try { & npm cache verify 2>$null | Out-Null } catch { } }
    2 {
      try {
        Remove-Item -Path (Join-Path $Root "node_modules") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $Root "package-lock.json") -Force -ErrorAction SilentlyContinue
      } catch { }
    }
    3 {
      # حالت آفلاین: اگر اینترنت نیست، از کش محلی استفاده می‌کنیم
      $p = Start-Process -FilePath "npm" -ArgumentList "install --offline --no-audit --no-fund" -WorkingDirectory $Root -NoNewWindow -Wait -PassThru
      Write-Log "INFO" "offline install exit $($p.ExitCode)"
    }
    default { Start-Sleep -Seconds 3 }
  }
}

# -----------------------------------------------------------------------------
# [6/9] ساخت جدول‌های پایگاه‌داده
# -----------------------------------------------------------------------------
Write-Step 6 "Creating database schema / ساخت جدول‌های پایگاه‌داده"
Invoke-HealingStep -Name "database schema" -Action {
  param($a)
  $p = Start-Process -FilePath "npx" -ArgumentList "drizzle-kit push --force" -WorkingDirectory $Root -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "drizzle-kit push exit code $($p.ExitCode)" }
} -Heal {
  param($a)
  Write-Info "schema push failed — the application also self-creates its tables at first run (idempotent bootstrap)."
  # ترمیم: ساخت دستی جدول‌های حداقلی تا برنامه بتواند بالا بیاید
  $sql = @"
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS system_meta (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
"@
  try {
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $sql -Encoding UTF8
    $psql = "psql"
    if (-not (Test-Command "psql")) {
      $cand = Get-ChildItem -Path "$env:ProgramFiles\PostgreSQL" -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($cand) { $psql = $cand.FullName }
    }
    if (Test-Path $psql) {
      & $psql $dbUrl -f $tmp.FullName 2>$null | Out-Null
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  } catch { }
}

# -----------------------------------------------------------------------------
# [7/9] ساخت نسخه تولید (production build)
# -----------------------------------------------------------------------------
Write-Step 7 "Building the application (a few minutes) / ساخت نسخه اجرایی"
Invoke-HealingStep -Name "application build" -Max 4 -Action {
  param($a)
  if (Test-Path (Join-Path $Root ".next\BUILD_ID")) { return }
  $extra = ""
  if ($a -ge 2) { $extra = " --webpack" }
  $p = Start-Process -FilePath "npx" -ArgumentList "next build$extra" -WorkingDirectory $Root -NoNewWindow -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "next build exit code $($p.ExitCode)" }
} -Heal {
  param($a)
  Write-Info "repairing build (attempt $a)…"
  switch ($a) {
    1 {
      try {
        Remove-Item -Path (Join-Path $Root ".next") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $Root "node_modules\.cache") -Recurse -Force -ErrorAction SilentlyContinue
      } catch { }
    }
    2 {
      $env:NEXT_TELEMETRY_DISABLED = "1"
      $env:NODE_OPTIONS = "--max-old-space-size=4096"
      $env:ESLINT_NO_DEV_ERRORS = "true"
      $env:DISABLE_ESLINT_PLUGIN = "true"
      try {
        & node (Join-Path $Root "scripts\fix-turbopack-externals.mjs") 2>$null | Out-Null
      } catch { }
    }
    3 {
      # آخرین تلاش: نصب مجدد پکیج‌ها سپس ساخت
      try { & npm install --no-audit --no-fund --legacy-peer-deps 2>$null | Out-Null } catch { }
      try { Remove-Item -Path (Join-Path $Root ".next") -Recurse -Force -ErrorAction SilentlyContinue } catch { }
    }
    default { Start-Sleep -Seconds 2 }
  }
}

# -----------------------------------------------------------------------------
# [8/9] میانبرها، پشتیبان‌گیری خودکار و شروع خودکار
# -----------------------------------------------------------------------------
Write-Step 8 "Shortcuts, auto-backup & auto-start / میانبرها و پشتیبان‌گیری خودکار"

# 8-1 میانبر دسکتاپ
try {
  $ws = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath("Desktop")
  $lnk = $ws.CreateShortcut((Join-Path $desktop "SRMS.lnk"))
  $lnk.TargetPath = (Join-Path $Root "SRMS-Start.bat")
  $lnk.WorkingDirectory = $Root
  $lnk.Description = "SAMANE MODIRIAT MANABE SARBAZ"
  $lnk.Save()
  Write-Ok "desktop shortcut"
} catch {
  try {
    Copy-Item (Join-Path $Root "SRMS-Start.bat") (Join-Path ([Environment]::GetFolderPath("Desktop")) "SRMS-Start.bat") -Force
    Write-Ok "desktop shortcut (copied batch file)"
  } catch { Write-Warn2 "desktop shortcut could not be created" }
}

# 8-2 پشتیبان‌گیری خودکار روزانه (Task Scheduler)
try {
  $taskName = "SRMS Daily Backup"
  $action = "cmd /c cd /d `"$Root`" && node scripts\backup.mjs `"$BackupDir`" scheduled >> `"$Root\logs\backup.log`" 2>&1"
  & schtasks /Create /F /SC DAILY /ST 02:30 /TN $taskName /TR $action | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Ok "daily backup task registered (02:30)" }
  else { Write-Warn2 "backup task registration returned $LASTEXITCODE (app-internal scheduler still runs)" }
} catch {
  Write-Warn2 "backup task could not be registered: $($_.Exception.Message)"
}

# 8-3 قانون فایروال (نیاز به ادمین — در نبود آن رد می‌شود)
try {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdmin) {
    & netsh advfirewall firewall delete rule name="SRMS Web" | Out-Null
    & netsh advfirewall firewall add rule name="SRMS Web" dir=in action=allow protocol=TCP localport=$PreferredPort | Out-Null
    Write-Ok "firewall rule added (port $PreferredPort)"
  } else {
    Write-Info "not elevated — skipped firewall rule (access from other computers needs it)"
  }
} catch { Write-Info "firewall step skipped" }

# -----------------------------------------------------------------------------
# [9/9] اجرای سامانه و بررسی سلامت
# -----------------------------------------------------------------------------
Write-Step 9 "Starting SRMS / اجرای سامانه"
$port = Get-FreePort $PreferredPort
$health = $false
Invoke-HealingStep -Name "application start" -Max 3 -Action {
  param($a)
  $script:health = $false
  $env:PORT = "$port"
  $env:DATABASE_URL = $dbUrl
  $env:NODE_ENV = "production"
  $proc = Start-Process -FilePath "node" -ArgumentList "node_modules\next\dist\bin\next", "start", "-p", "$port" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  try { Set-Content -Path (Join-Path $Root "data\server.pid") -Value $proc.Id } catch { }
  Write-Log "INFO" "started pid=$($proc.Id) port=$port"

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 4
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $script:health = $true; break }
    } catch { }
  }
  if (-not $script:health) { throw "health check failed on port $port" }
} -Heal {
  param($a)
  Write-Info "repairing startup (attempt $a)…"
  try {
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$Root*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  } catch { }
  switch ($a) {
    1 { try { Remove-Item -Path (Join-Path $Root ".next\cache") -Recurse -Force -ErrorAction SilentlyContinue } catch { } }
    2 {
      $port = Get-FreePort ($port + 1)
      Write-Log "INFO" "switching to port $port"
    }
    default {
      try { & npm run build 2>$null | Out-Null } catch { }
    }
  }
}

# =============================================================================
Write-Title "Installation summary / خلاصه نصب"
if ($script:health) {
  Write-Host "  STATUS : SUCCESS" -ForegroundColor Green
  Write-Host ""
  Write-Host "  Application is running  →  http://localhost:$port" -ForegroundColor Green
  Write-Host "  Backup folder           →  $BackupDir"
  Write-Host "  Install log             →  $Log"
  Write-Host ""
  Write-Host "  برای اجرای بعدی:  SRMS-Start.bat  (یا میانبر دسکتاپ SRMS)" -ForegroundColor Gray
  Write-Host "  برای توسعه:        Start-Dev.bat" -ForegroundColor Gray
  Write-Host "  پشتیبان‌گیری:      صفحه «پشتیبان‌گیری و بازیابی» یا scripts\backup.mjs" -ForegroundColor Gray
} else {
  Write-Host "  STATUS : COMPLETED WITH WARNINGS" -ForegroundColor Yellow
  Write-Host "  Install log → $Log"
  Write-Host "  اجرای برنامه: SRMS-Start.bat  (اگر خطا دیدید، SRMS-Repair.bat را اجرا کنید)" -ForegroundColor Gray
}

if ($Script:Issues.Count -gt 0) {
  Write-Host ""
  Write-Host "  Warnings ($($Script:Issues.Count)):" -ForegroundColor Yellow
  foreach ($i in $Script:Issues) { Write-Host "   • $i" -ForegroundColor Yellow }
}
if ($Script:Actions.Count -gt 0) {
  Write-Host ""
  Write-Host "  Automatic repairs performed:" -ForegroundColor Cyan
  foreach ($a in $Script:Actions) { Write-Host "   ✔ $a" -ForegroundColor Cyan }
}

if ($script:health) {
  try { Start-Process "http://localhost:$port" } catch { }
}

Write-Host ""
Write-Log "INFO" "wizard finished"
exit 0
