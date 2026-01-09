"use client"

import { loginAction } from "../actions"
import { useFormStatus } from "react-dom"
import { AlertCircle } from "lucide-react"
import { useState } from "react"

function LoginButton() {
    const { pending } = useFormStatus()
    return (
        <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
            {pending ? "Giriş Yapılıyor..." : "Giriş Yap"}
        </button>
    )
}

import { useRouter } from "next/navigation"

// ... imports ...

// ... imports ...
import { db } from "@/lib/prisma"

export default async function LoginPage() {
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

    return <LoginForm debugInfo={debugInfo} />
}

function LoginForm({ debugInfo }: { debugInfo: any }) {
    const [error, setError] = useState<string | null>(null)
    const router = useRouter()


    async function clientAction(formData: FormData) {
        try {
            const res = await loginAction(formData)
            if (res?.error) {
                setError(res.error)
            } else if (res?.success) {
                // Hard refresh to ensure clean state
                window.location.href = "/"
            }
        } catch (e: any) {
            console.error(e)
            setError(`Giriş yapılırken bir hata oluştu: ${e.message || JSON.stringify(e)}`)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-gray-900">OMS Giriş (Debug)</h1>
                    <p className="text-gray-500">Sipariş Yönetim Sistemine Hoşgeldiniz</p>
                    <div className="text-xs font-mono text-left bg-gray-100 p-2 rounded mt-2 overflow-auto max-h-20">
                        DB Status: {debugInfo.status}<br />
                        Connected: {debugInfo.db ? 'YES' : 'NO'}<br />
                        Error: {debugInfo.err}
                    </div>
                </div>

                <form action={clientAction} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Kullanıcı Adı</label>
                        <input
                            name="username"
                            type="text"
                            required
                            className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="Örn: admin"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Şifre</label>
                        <input
                            name="password"
                            type="password"
                            required
                            className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="••••••"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}

                    <LoginButton />
                </form>

                <div className="pt-4 border-t text-center text-xs text-gray-400">
                    Varsayılan: admin / admin
                </div>
                <div className="text-center text-sm">
                    <a href="/register" className="text-blue-600 hover:underline">
                        Personel Kaydı Oluştur
                    </a>
                </div>
            </div>
        </div>
    )
}
