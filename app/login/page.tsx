
import { db } from "@/lib/prisma"
import { loginAction } from "./actions"
import { SubmitButton } from "./submit-button"

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
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-slate-900">OMS Giriş (Native)</h1>
                    <p className="text-slate-500">Sipariş Yönetim Sistemine Hoşgeldiniz</p>
                    <div className="text-xs font-mono text-left bg-slate-100 p-2 rounded mt-2 overflow-auto max-h-20">
                        DB Status: {debugInfo.status}<br />
                        Connected: {debugInfo.db ? 'YES' : 'NO'}<br />
                        Error: {debugInfo.err}
                    </div>
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

                <div className="pt-4 border-t text-center text-xs text-slate-400">
                    Varsayılan: admin / admin
                </div>
            </div>
        </div>
    )
}
