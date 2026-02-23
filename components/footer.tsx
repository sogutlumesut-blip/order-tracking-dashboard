import Link from "next/link";

export function Footer() {
    return (
        <footer className="py-4 border-t bg-white dark:bg-[#020617] transition-colors duration-300">
            <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
                <p>&copy; {new Date().getFullYear()} Sipariş Takip Sistemi. Tüm hakları saklıdır.</p>
                <div className="flex gap-4">
                    <Link href="/privacy-policy" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                        Gizlilik Politikası
                    </Link>
                    <Link href="/terms-of-service" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                        Kullanım Koşulları
                    </Link>
                    <Link href="/data-deletion" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                        Veri Silme
                    </Link>
                </div>
            </div>
        </footer>
    );
}
