import Link from "next/link";

export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Gizlilik Politikası (Privacy Policy)</h1>
            <div className="prose prose-slate max-w-none space-y-6">
                <section>
                    <h2 className="text-xl font-semibold">1. Giriş</h2>
                    <p>Bu Gizlilik Politikası, servislerimizi kullanırken bilgilerinizin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">2. Etsy Veri Erişimi</h2>
                    <p>Uygulamamız, Etsy mağazanızı bağladığınızda aşağıdaki verilere erişir:</p>
                    <ul className="list-disc pl-6">
                        <li>Etsy sipariş bilgileri (sipariş içerikleri, müşteri isimleri, teslimat adresleri)</li>
                        <li>Mağaza bilgileri</li>
                        <li>İşlem kayıtları</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">3. Veri Kullanımı</h2>
                    <p>Etsy'den erişilen veriler <strong>yalnızca sipariş takip ve yönetim süreçleriniz için</strong> kullanılmaktadır. Bu veriler üçüncü şahıslarla paylaşılmaz veya reklam amaçlı kullanılmaz.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">4. Veri Güvenliği</h2>
                    <p>Etsy erişim anahtarlarınız (tokens) veritabanımızda şifrelenmiş olarak saklanmaktadır.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">5. Veri Silme ve Kullanıcı Hakları</h2>
                    <p>Verilerinizin silinmesini talep etmek için <Link href="/data-deletion" className="text-blue-600 hover:underline">Veri Silme</Link> sayfamızı ziyaret edebilir veya bize e-posta yoluyla ulaşabilirsiniz.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">6. İletişim</h2>
                    <p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>
                </section>
            </div>
            <div className="mt-12 pt-8 border-t">
                <Link href="/" className="text-slate-500 hover:text-slate-900 transition-colors">
                    Ana Sayfaya Dön
                </Link>
            </div>
        </div>
    );
}
