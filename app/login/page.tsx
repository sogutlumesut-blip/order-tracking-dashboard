
import { db } from "@/lib/prisma"
import { loginAction } from "./actions"
import { SubmitButton } from "./submit-button"
import Link from "next/link"

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
    // Server-Side Debug Checks
    let debugInfo = { status: 'init', db: false, err: '' }
    try {
        await db.user.count()
        debugInfo.db = true
        debugInfo.status = 'connected'
    } catch (e: any) {
        debugInfo.err = e.message
        debugInfo.status = 'failed'
    }

    const errorMap: Record<string, string> = {
        "Kullanici_Bulunamadi": "Kullanıcı adı sistemde kayıtlı değil.",
        "Hatali_Sifre": "Girdiğiniz şifre yanlış.",
        "Onay_Bekliyor": "Hesabınız yönetici onayı bekliyor.",
        "Sunucu_Hatasi": "Sunucuda bir sorun oluştu."
    }

    const errorMessage = searchParams.error ? (errorMap[searchParams.error] || "Giriş yapılamadı.") : null

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 relative z-50">
            <div className="max-w-md w-full flex flex-col gap-6">
                <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold text-slate-900">DKM SİPARİŞ PANELİ</h1>
                    </div>

                    <form action={loginAction} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Kullanıcı Adı</label>
                            <input
                                name="username"
                                type="text"
                                required
                                className="w-full p-3 border rounded-lg bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="Örn: admin"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Şifre</label>
                            <input
                                name="password"
                                type="password"
                                required
                                className="w-full p-3 border rounded-lg bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                placeholder="••••••"
                            />
                        </div>

                        {errorMessage && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                <span>⚠️ {errorMessage}</span>
                            </div>
                        )}

                        <SubmitButton />

                    </form>
                </div>

                {/* Etsy Approval Links */}
                <div className="text-center space-y-4">
                    <div className="flex justify-center gap-4 text-xs text-slate-500 font-medium">
                        <Link href="/privacy-policy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link>
                        <span className="text-slate-300">|</span>
                        <Link href="/terms-of-service" className="hover:text-blue-600 transition-colors">Terms of Service</Link>
                        <span className="text-slate-300">|</span>
                        <Link href="/data-deletion" className="hover:text-blue-600 transition-colors">Data Deletion</Link>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed px-4 opacity-75">
                        The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
                    </p>
                </div>
            </div>
        </div>
    )
}
