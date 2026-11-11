"use client"

import { useState, useTransition } from "react"
import { Shield, Key, Save, Loader2, Info, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { saveOzonSettings, syncOzonOrders, testOzonSettings } from "@/app/actions"
import { useRouter } from "next/navigation"

interface OzonSettingsFormProps {
    initialSettings: {
        ozon_client_id?: string
        ozon_api_key?: string
        last_ozon_sync_time?: string
    }
}

export function OzonSettingsForm({ initialSettings }: OzonSettingsFormProps) {
    const [isPending, startTransition] = useTransition()
    const [isSyncing, setIsSyncing] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const router = useRouter()

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            try {
                const res = await saveOzonSettings(formData)
                if (res?.success) {
                    toast.success(res.message || "Ozon ayarları başarıyla kaydedildi!")
                    router.refresh()
                } else if (res?.error) {
                    toast.error(res.error)
                }
            } catch (error) {
                console.error(error)
                toast.error("Ayarlar kaydedilirken bir hata oluştu.")
            }
        })
    }

    const handleTest = async (e: React.MouseEvent) => {
        e.preventDefault()
        const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement | null
        if (!form) return

        const formData = new FormData(form)
        setIsTesting(true)
        try {
            const res = await testOzonSettings(formData)
            if (res.success) {
                toast.success(res.message || "Ozon API bağlantısı başarılı! Anahtar ve Client ID onaylandı.")
            } else {
                toast.error(res.error || "Ozon API bağlantısı başarısız.")
            }
        } catch (e: any) {
            toast.error("Bağlantı testi sırasında hata: " + e.message)
        } finally {
            setIsTesting(false)
        }
    }

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await syncOzonOrders(true)
            if (res.success) {
                toast.success(res.message || "Ozon siparişleri eşitlendi!")
                router.refresh()
            } else if (res.error) {
                toast.error(res.error)
            } else if (res.skipped) {
                toast.info("Eşitleme limiti: Birkaç dakika sonra tekrar deneyin.")
            }
        } catch (e) {
            toast.error("Senkronizasyon sırasında bir hata oluştu.")
        } finally {
            setIsSyncing(false)
        }
    }

    const lastSyncDate = initialSettings.last_ozon_sync_time
        ? new Date(parseInt(initialSettings.last_ozon_sync_time)).toLocaleString("tr-TR")
        : null

    return (
        <div className="space-y-6">
            <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/50 p-6 rounded-xl border border-blue-100 dark:bg-slate-900/20 dark:border-slate-800">
                <div className="col-span-2 flex items-start gap-3 p-3 bg-white/70 dark:bg-slate-900/50 rounded-lg text-xs text-blue-900 dark:text-blue-300 border border-blue-100 dark:border-slate-800 mb-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                    <div>
                        <p className="font-bold mb-1">Ozon Seller (seller.ozon.ru) Entegrasyonu</p>
                        <p>
                            Ozon satıcı panelinizde (<strong>Настройки ➔ API клюchi</strong>) oluşturduğunuz <strong>Client ID</strong> ve <strong>API Anahtarını</strong> giriniz. 
                            Kaydettikten sonra sistem her dakika arka planda Ozon&apos;daki yeni paketleme ve kargo bekleyen siparişleri otomatik olarak panele aktaracaktır.
                        </p>
                    </div>
                </div>

                <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Ozon Client ID <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <Shield className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            name="ozon_client_id"
                            defaultValue={initialSettings.ozon_client_id || "2903436"}
                            placeholder="Örn: 2903436"
                            required
                            className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                        />
                    </div>
                </div>

                <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Ozon API Anahtarı (API Key) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            name="ozon_api_key"
                            type="text"
                            defaultValue={initialSettings.ozon_api_key || ""}
                            placeholder="Ozon'dan oluşturulan API anahtarını buraya yapıştırın"
                            required
                            className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800 font-mono"
                        />
                    </div>
                </div>

                {lastSyncDate && (
                    <div className="col-span-2 text-xs text-slate-500 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span>Son otomatik senkronizasyon: <strong>{lastSyncDate}</strong></span>
                    </div>
                )}

                <div className="col-span-2 flex flex-wrap items-center justify-between gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={isTesting || isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium transition shadow-xs"
                        >
                            {isTesting ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Shield className="w-4 h-4 text-blue-600" />}
                            Bağlantıyı Test Et
                        </button>

                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={isSyncing || isPending}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded-lg text-sm font-medium transition shadow-xs"
                        >
                            <RefreshCw className={`w-4 h-4 text-blue-700 ${isSyncing ? "animate-spin" : ""}`} />
                            Şimdi Senkronize Et
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isPending || isSyncing}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition shadow-sm"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Ayarları Kaydet
                    </button>
                </div>
            </form>
        </div>
    )
}
