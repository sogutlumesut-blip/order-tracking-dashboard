# DKM Takip — Windows Server 7/24 Ofis Ajanı Kurulum Rehberi

Bu kurulum sayesinde ofisteki hiçbir Mac/PC açık kalmak zorunda olmaz; Windows Server üzerinden 7/24 yerel disk hızında otomatik taslak, indeksleme ve baskı TIFF üretimi çalışır.

## 1. Ön Gereksinim (Windows Server'da)
- **Node.js 24 LTS** kurulu olmalıdır: https://nodejs.org (indirin, Next → Next ile kurun).
- **Git** kurulu olmalıdır (veya projeyi klasör olarak kopyalayabilirsiniz).

## 2. Projeyi Windows Server'a İndirin
PowerShell'i **Yönetici olarak çalıştır (Run as Administrator)** ile açın:

```powershell
cd C:\
git clone https://github.com/sogutlumesut-blip/order-tracking-dashboard.git C:\dkm-agent
cd C:\dkm-agent
```

## 3. 7/24 Arka Plan Servisini Kurun
Aynı Yönetici PowerShell penceresinde tek komutu çalıştırın:

```powershell
powershell -ExecutionPolicy Bypass -File .\dkm-demo\windows-server-agent\install-windows-service.ps1
```

Kurulum size sırasıyla 4 bilgi soracaktır:
1. **Bulut Panel Adresi:** Enter'a basın (`https://dkmtakip.online`)
2. **DKM_AGENT_TOKEN:** `https://dkmtakip.online/admin/settings` sayfasındaki siyah kutuda yazan token'ı yapıştırın.
3. **Tasarım Arşivi Yerel Yolu:** Windows Server'daki gerçek disk yolunu yazın (örneğin `D:\DKM\Katalog Baskı`).
4. **Onaylı Baskı Çıktı Klasörü:** Onaylanan baskı TIFF'lerinin kaydedileceği klasör (örneğin `D:\DKM_BASKI_HAZIR` veya varsayılan `C:\DKM_OFFICE_OUT`).

## 4. Doğrulama
1. `https://dkmtakip.online/admin/settings` sayfasını yenileyin → **Ofis Ajanı Durumu: 🟢 Çevrimiçi (DKM-Ofis)** görünecektir.
2. **Windows Server Ağ Klasörü Yolu** kutusuna Windows Server'daki yerel yolu (örn. `D:\DKM\Katalog Baskı`) yazıp **Server ve Klasör Ayarlarını Kaydet** butonuna basın.
3. Mac'inizdeki eski Terminal penceresini artık tamamen kapatabilirsiniz!

## Logları İzleme ve Kaldırma
- Canlı logları görmek için: `Get-Content C:\DKM_OFFICE_OUT\office-agent.log -Wait -Tail 30`
- Servisi kaldırmak için: `powershell -ExecutionPolicy Bypass -File .\dkm-demo\windows-server-agent\uninstall-windows-service.ps1`
