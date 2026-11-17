"use client"

import { useState } from "react"
import { Shield, Key, Save, Loader2, Info, RefreshCw, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { saveFaireSettings, syncFaireOrders, testFaireSettings } from "@/app/actions"
import { useRouter } from "next/navigation"

interface FaireSettingsFormProps {
    initialSettings: {
        faire_api_token?: string
        last_faire_sync_time?: string
    }
}

export function FaireSettingsForm({ initialSettings }: FaireSettingsFormProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const router = useRouter()

    const handleSubmit = async (formData: FormData) => {
        setIsSaving(true)
        try {
            const res = await saveFaireSettings(formData)
            if (res?.success) {
                toast.success(res.message || "Faire ayarları başarıyla kaydedildi!")
                router.refresh()
            } else if (res?.error) {
                toast.error(res.error)
            }
        } catch (error) {
            console.error(error)
            toast.error("Ayarlar kaydedilirken bir hata oluştu.")
        } finally {
            setIsSaving(false)
        }
    }

    const handleTest = async (e: React.MouseEvent) => {
        e.preventDefault()
        const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement | null
        if (!form) return

        const formData = new FormData(form)
        setIsTesting(true)
        try {
            const res = await testFaireSettings(formData)
            if (res.success) {
                toast.success(res.message || "Faire API bağlantısı başarılı! API Token doğrulandı.")
            } else {
                toast.error(res.error || "Faire API bağlantısı başarısız.")
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
            const res = await syncFaireOrders(true)
            if (res.success) {
                toast.success(res.message || "Faire siparişleri eşitlendi!")
                router.refresh()
            } else if (res.error) {
                toast.error(res.error)
            } else if (res.skipped) {
                toast.info("Eşitleme limiti: Birkaç saniye sonra tekrar deneyin.")
            }
        } catch (e) {
            toast.error("Senkronizasyon sırasında bir hata oluştu.")
        } finally {
            setIsSyncing(false)
        }
    }

    const lastSyncDate = initialSettings.last_faire_sync_time
        ? new Date(parseInt(initialSettings.last_faire_sync_time)).toLocaleString("tr-TR")
        : null

    return (
        <div className="space-y-6">
            <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-emerald-50/40 p-6 rounded-xl border border-emerald-100 dark:bg-slate-900/20 dark:border-slate-800">
                <div className="col-span-2 flex items-start gap-3 p-3 bg-white/80 dark:bg-slate-900/50 rounded-lg text-xs text-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-slate-800 mb-1">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
                    <div>
                        <p className="font-bold mb-1">Faire (faire.com) Brand Entegrasyonu</p>
                        <p className="mb-1.5">
                            Faire Brand Portalınızda (<strong>Settings &gt; Integrations &gt; API</strong>) bulunan <strong>API Access Token</strong> bilginizi giriniz.
                        </p>
                        <p className="font-semibold text-emerald-800 dark:text-emerald-400">
                            ✨ Faire&apos;den gelen tüm siparişler otomatik olarak doğrudan <u>Bekliyor (PrintMarkt)</u> sütununa aktarılır.
                        </p>
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Faire API Erişim Anahtarı (X-FAIRE-ACCESS-TOKEN) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            name="faire_api_token"
                            type="text"
                            defaultValue={initialSettings.faire_api_token || ""}
                            placeholder="Faire API Access Token yapıştırın..."
                            required
                            className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800 font-mono"
                        />
                    </div>
                </div>

                {lastSyncDate && (
                    <div className="col-span-2 text-xs text-slate-500 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Son senkronizasyon: <strong>{lastSyncDate}</strong></span>
                    </div>
                )}

                <div className="col-span-2 flex flex-wrap items-center justify-between gap-4 pt-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={isTesting || isSaving}
                            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium transition shadow-xs"
                        >
                            {isTesting ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> : <Shield className="w-4 h-4 text-emerald-600" />}
                            Bağlantıyı Test Et
                        </button>

                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={isSyncing || isSaving}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-300 rounded-lg text-sm font-medium transition shadow-xs"
                        >
                            <RefreshCw className={`w-4 h-4 text-emerald-700 ${isSyncing ? "animate-spin" : ""}`} />
                            Şimdi Senkronize Et
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving || isSyncing}
                        className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-bold transition shadow-sm"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Ayarları Kaydet
                    </button>
                </div>
            </form>
        </div>
    )
}
