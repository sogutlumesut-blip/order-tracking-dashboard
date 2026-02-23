import Link from "next/link";

export default function TermsOfService() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Kullanım Koşulları (Terms of Service)</h1>
            <div className="prose prose-slate max-w-none space-y-6">
                <section>
                    <h2 className="text-xl font-semibold">1. Hizmet Tanımı</h2>
                    <p>Bu uygulama, siparişlerinizi yönetmeniz için Etsy API'sini kullanarak sipariş verilerinizi senkronize eden bir araçtır.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">2. Sorumluluk Reddi</h2>
                    <p>Hizmetimiz "olduğu gibi" sunulmaktadır. Servis kesintileri veya Etsy API değişikliklerinden kaynaklanan durumlardan sorumlu tutulamaz.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">3. Hesap Güvenliği</h2>
                    <p>Hesap bilgilerinizin ve Etsy bağlantınızın güvenliğinden siz sorumlusunuz.</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">4. Değişiklikler</h2>
                    <p>Bu koşulları dilediğimiz zaman güncelleme hakkını saklı tutarız.</p>
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
