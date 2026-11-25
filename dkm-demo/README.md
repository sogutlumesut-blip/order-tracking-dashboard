# DKM Takip — Otomatik Taslak DEMO / TEST Ortamı

Bu dizin, canlı DKM Takip yazılımından **tamamen bağımsız** çalışan otomatik taslak demo ve test ortamını içerir.

## Güvenlik ve İzolasyon Kuralları
- **Git Branch:** `automation-draft-demo` (`main` branch'i değiştirilmemiştir).
- **Veritabanı:** Yalnızca yerel `DKM_DEMO/demo.sqlite` (SQLite) kullanılır. Canlı PostgreSQL ve canlı `.env` asla okunmaz.
- **WhatsApp:** Gerçek müşterilere mesaj gönderilmez; tüm gönderimler `DEMO_SIMULATED` olarak test tablosuna kaydedilir.
- **Baskı Klasörü:** Çıktılar yalnızca `DKM_DEMO/` altına yazılır; canlı baskı klasörlerine yazma kod düzeyinde engellenmiştir.
- **Tasarım Arşivi:** `DKM_DEMO/DESIGNS` yalnızca **salt okunur** açılır. Sonrasında yönetim panelinden Windows Server SMB paylaşımına salt okunur olarak yönlendirilebilir.
- **Canlı Geçiş:** Yönetim panelindeki "Canlı Sisteme Geçiş Yönetici Onay Kilidi" varsayılan olarak kilitlidir.

## Kurulum ve Başlatma Komutları

```bash
# 1. Demo ortamını kur (klasörler, .env.demo, SQLite DB, güvenli yönetici hesabı, 16 tasarım, 12 test siparişi)
npm run demo:setup

# 2. Demo sunucusunu ve worker'ı başlat (http://127.0.0.1:4100)
npm run demo:start

# İsteğe bağlı: 2 veya daha fazla worker ile başlat
npm run demo:start -- --workers=2
```

## Demo Yönetici Hesabı (Güvenli Oluşturma / Parola Sıfırlama)
Kod içinde sabit parola yoktur. `npm run demo:setup` ilk kurulumda rastgele güçlü bir parola üretip tek seferlik gösterir. İstediğiniz zaman yeni yönetici oluşturmak veya parolayı değiştirmek için:

```bash
# Etkileşimli (gizli parola girişi ile)
npm run demo:create-admin

# Veya ortam değişkenleriyle
DKM_ADMIN_USER=demo-admin DKM_ADMIN_PASSWORD="GucluParola123!" npm run demo:create-admin
```

## Diğer Komutlar

```bash
# Demo ortamını sıfırla (çıktıları siler, 12 test siparişini baştan yükler; DESIGNS klasörüne dokunmaz)
npm run demo:reset

# 15 senaryoluk otomatik test paketini çalıştır
npm run demo:test

# 10/30/50/100 siparişlik 1/2/4 worker performans testini çalıştır
npm run demo:perf

# Yeterli disk alanı olduğunda 5 GB veya 10 GB PSB akışlı performans testi
npm run demo:perf -- --large-gb=5
npm run demo:perf -- --large-gb=10
```
