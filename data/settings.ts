// Bu dosya, paneldeki açılır menü seçeneklerini yönetir.
// Burayı değiştirerek "Usta" yerine "Makine" veya başka bir şey yapabilirsiniz.

export const APP_CONFIG = {
    // "Atanan Kişi/Yer" başlığı
    assigneeLabel: "Atanan Sorumlu / Makine",

    // Atanacak kişilerin veya makinelerin listesi
    staffList: [
        "Ahmet Usta",
        "Mehmet Usta",
        "Ali Usta",
        "Baskı Makinesi 1",
        "Baskı Makinesi 2",
        "Paketleme Birimi"
    ],

    // Etiket listesi
    labels: [
        "Acil",
        "Hediye",
        "Yurtdışı",
        "Özel İstek",
        "Kurumsal",
        "Defolu",
        "Revizyon"
    ],

    // Firma Bilgileri (PDF Çıktısı için)
    companyLogo: "/logo.png", // Buraya logonuzun linkini yapıştırın
    companyName: "Duvar Kağıdı Dünyası",
    companyPhone: "+90 532 123 45 67",
    companyWeb: "www.duvarkagidi.com.tr"
}
