# DKM Takip — Windows Server 7/24 Ofis Worker Ajanı Kurulum Betiği
# Kullanım: PowerShell'i "Yönetici olarak çalıştır" ile açıp bu betiği çalıştırın:
#   powershell -ExecutionPolicy Bypass -File .\dkm-demo\windows-server-agent\install-windows-service.ps1

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  DKM TAKIP — WINDOWS SERVER 7/24 OFIS AJANI KURULUMU" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

# 1. Node.js kontrolü
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "HATA: Node.js kurulu değil!" -ForegroundColor Red
    Write-Host "Lütfen https://nodejs.org adresinden Node.js 24 LTS indirip kurun, ardından bu betiği tekrar çalıştırın." -ForegroundColor Cyan
    exit 1
}
$nodeVer = (& node -v).Trim()
Write-Host "[OK] Node.js bulundu: $nodeVer ($($nodeCmd.Source))" -ForegroundColor Green

# 2. Proje dizini
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Write-Host "[OK] Proje klasörü: $RepoRoot" -ForegroundColor Green

# 3. Kullanıcıdan gerçek Windows Server yollarını al
$CloudUrl = Read-Host "Bulut Panel Adresi [https://dkmtakip.online]"
if ([string]::IsNullOrWhiteSpace($CloudUrl)) { $CloudUrl = "https://dkmtakip.online" }

$AgentToken = Read-Host "DKM_AGENT_TOKEN (dkmtakip.online/admin/settings sayfasından kopyalayın)"
if ([string]::IsNullOrWhiteSpace($AgentToken)) {
    Write-Host "HATA: DKM_AGENT_TOKEN boş bırakılamaz!" -ForegroundColor Red
    exit 1
}

$ServerPath = Read-Host "Tasarım Arşivi Yerel Yolu (örn. D:\DKM\Katalog Baskı)"
if (-not (Test-Path $ServerPath -PathType Container)) {
    Write-Host "UYARI: '$ServerPath' klasörü şu an bulunamadı! Yine de devam edilsin mi? (E/H)" -ForegroundColor Yellow
    $ans = Read-Host
    if ($ans -notmatch "^[EeYy]") { exit 1 }
}

$OutPath = Read-Host "Onaylı Baskı Çıktı Klasörü [C:\DKM_OFFICE_OUT]"
if ([string]::IsNullOrWhiteSpace($OutPath)) { $OutPath = "C:\DKM_OFFICE_OUT" }
New-Item -ItemType Directory -Force -Path $OutPath | Out-Null

# 4. Bağımlılıkları kontrol et (sharp vb.)
if (-not (Test-Path (Join-Path $RepoRoot "node_modules\sharp"))) {
    Write-Host "[...] npm bağımlılıkları kuruluyor (ilk seferde 1-2 dk sürebilir)..." -ForegroundColor Cyan
    Push-Location $RepoRoot
    npm ci --omit=dev
    Pop-Location
}

# 5. Başlatıcı .cmd dosyası oluştur (çevre değişkenlerini ve log yönlendirmesini güvenli tutar)
$RunnerCmd = Join-Path $OutPath "run-dkm-office-agent.cmd"
$LogFile = Join-Path $OutPath "office-agent.log"
$NodeExe = $nodeCmd.Source
$AgentScript = Join-Path $RepoRoot "dkm-demo\src\cli\office-agent.ts"

$cmdContent = @"
@echo off
chcp 65001 >nul
cd /d "$RepoRoot"
set "DKM_CLOUD_URL=$CloudUrl"
set "DKM_AGENT_TOKEN=$AgentToken"
set "DKM_SERVER_PATH=$ServerPath"
set "DKM_OFFICE_OUT=$OutPath"
"$NodeExe" "$AgentScript" >> "$LogFile" 2>&1
"@

[System.IO.File]::WriteAllText($RunnerCmd, $cmdContent, (New-Object System.Text.UTF8Encoding($false)))

# 6. Windows Görev Zamanlayıcı (7/24 Sistem Başlangıcında Otomatik Başlatma + Çökme Halinde Yeniden Başlatma)
$TaskName = "DKM-Takip-Office-Agent"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$RunnerCmd`"" -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 0) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "DKM Takip 7/24 Ofis Tasarım & Baskı Ajanı" | Out-Null

# 7. Servisi hemen başlat
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  KURULUM TAMAMLANDI! (7/24 ARKA PLAN SERVİSİ AKTİF)" -ForegroundColor Green
Write-Host "  Görev Adı    : $TaskName" -ForegroundColor Green
Write-Host "  Tasarım Yolu : $ServerPath (Salt Okunur)" -ForegroundColor Green
Write-Host "  Baskı Çıktı  : $OutPath\PRINT_READY" -ForegroundColor Green
Write-Host "  Log Dosyası  : $LogFile" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "Şimdi https://dkmtakip.online/admin/settings sayfasını yenileyip '🟢 Çevrimiçi' durumunu kontrol edin." -ForegroundColor Cyan
Write-Host "Ayrıca Windows Server Ağ Klasörü Yolu kutusuna '$ServerPath' yazıp Kaydet'e basın." -ForegroundColor Cyan
