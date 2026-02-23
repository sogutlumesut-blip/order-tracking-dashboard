import Link from "next/link";

export default function DataDeletion() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-3xl font-bold mb-8">Veri Silme Talebi (Data Deletion)</h1>
            <div className="prose prose-slate max-w-none space-y-6">
                <section>
                    <h2 className="text-xl font-semibold">Verilerinizi Nasıl Silebilirsiniz?</h2>
                    <p>Etsy verilerinizin sistemimizden silinmesini istiyorsanız aşağıdaki adımları takip edebilirsiniz:</p>
                    <ol className="list-decimal pl-6 space-y-2">
                        <li><strong>Bağlantıyı Kesme:</strong> Ayarlar sayfasından Etsy mağazanızın bağlantısını kesebilirsiniz. Bu işlem, erişim anahtarlarınızı derhal silecek ve senkronizasyonu durduracaktır.</li>
                        <li><strong>E-posta ile Talep:</strong> Tüm geçmiş verilerinizin kalıcı olarak silinmesi için <strong>[E-posta Adresiniz]</strong> adresine "Etsy Veri Silme Talebi" konulu bir e-posta gönderebilirsiniz.</li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-xl font-semibold">Hangi Veriler Silinir?</h2>
                    <p>Talep etmeniz durumunda aşağıdaki veriler 30 gün içinde sistemimizden tamamen silinir:</p>
                    <ul className="list-disc pl-6">
                        <li>Etsy Mağaza bilgileri</li>
                        <li>Etsy üzerinden çekilen tüm sipariş ve müşteri verileri</li>
                        <li>Erişim ve yenileme anahtarları (Tokens)</li>
                    </ul>
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
