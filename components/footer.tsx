import Link from "next/link";

export function Footer() {
    return (
        <footer className="py-4 border-t bg-white dark:bg-[#020617] transition-colors duration-300">
            <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-4 text-[10px] md:text-xs text-slate-500">
                <div className="flex flex-col md:flex-row justify-between w-full items-center gap-4">
                    <p>&copy; {new Date().getFullYear()} Sipariş Takip Sistemi. Tüm hakları saklıdır.</p>
                    <div className="flex gap-4">
                        <Link href="/privacy-policy" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/terms-of-service" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                            Terms of Service
                        </Link>
                        <Link href="/data-deletion" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                            Data Deletion
                        </Link>
                    </div>
                </div>
                <div className="text-center opacity-60 max-w-2xl border-t pt-4 w-full">
                    The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
                </div>
            </div>
        </footer>
    );
}
