# DKM Takip — Windows Server Ofis Ajanı Kaldırma Betiği (Yönetici olarak çalıştırın)
$TaskName = "DKM-Takip-Office-Agent"
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "✅ $TaskName servisi kaldırıldı. Tasarım arşivine dokunulmadı." -ForegroundColor Green
