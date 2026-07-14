"use client"

import { useState, useTransition } from "react"
import { Shield, Key, Save, Loader2, Info, Trash2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { saveWayfairSettings, wipeWayfairOrders, syncWayfairOrders } from "@/app/actions"
import { useRouter } from "next/navigation"

interface WayfairSettingsFormProps {
    initialSettings: {
        wf_client_id?: string
        wf_client_secret?: string
        wf_mode?: string
    }
}

export function WayfairSettingsForm({ initialSettings }: WayfairSettingsFormProps) {
    const [isPending, startTransition] = useTransition()
    const [isSyncing, setIsSyncing] = useState(false)
    const router = useRouter()

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            try {
                const res = await saveWayfairSettings(formData)
                if (res?.success) {
                    toast.success(res.message)
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

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await syncWayfairOrders(true)
            if (res.success) {
                toast.success(res.message || "Wayfair siparişleri eşitlendi!")
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

    return (
        <div className="space-y-6">
            <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-purple-50/50 p-6 rounded-xl border border-purple-100 dark:bg-slate-900/20 dark:border-slate-800">
                <div className="col-span-2 flex items-start gap-3 p-3 bg-white/50 dark:bg-slate-900/50 rounded-lg text-xs text-purple-900 dark:text-purple-300 border border-purple-100 dark:border-slate-800 mb-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold mb-1">Wayfair API Entegrasyonu</p>
                        <p>Wayfair Developer Portal üzerinden aldığınız Sandbox veya Production Client ID ve Client Secret bilgilerini girerek entegrasyonu başlatın. Siparişler otomatik olarak arka planda veya manuel olarak eşitlenecektir.</p>
                    </div>
                </div>

                <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">API Çalışma Modu</label>
                    <select
                        name="wf_mode"
                        defaultValue={initialSettings.wf_mode || 'sandbox'}
                        className="w-full p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    >
                        <option value="sandbox">Sandbox (Test / Geliştirme)</option>
                        <option value="production">Production (Canlı Mağaza)</option>
                    </select>
                </div>

                <div className="col-span-2">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Client ID <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <Shield className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            name="wf_client_id"
                            defaultValue={initialSettings.wf_client_id || ''}
                            placeholder="Wayfair Application Client ID"
                            required
                            className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                        />
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Client Secret <span className="text-red-500">*</span></label>
                    <div className="relative">
                        <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            name="wf_client_secret"
                            type="password"
                            defaultValue={initialSettings.wf_client_secret || ''}
                            placeholder="Wayfair Application Client Secret"
                            required
                            className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                        />
                    </div>
                </div>

                <div className="col-span-2 flex justify-end mt-4">
                    <button
                        disabled={isPending}
                        type="submit"
                        className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isPending ? "Kaydediliyor..." : "Ayarları Kaydet"}
                    </button>
                </div>
            </form>

            {initialSettings.wf_client_id && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-4 items-center">
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Wayfair Eylemleri</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Siparişleri şimdi manuel olarak eşitleyebilir veya veritabanındaki Wayfair siparişlerini temizleyebilirsiniz.</p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={async () => {
                                if (confirm("Tüm Wayfair siparişlerini silmek istediğinize emin misiniz?")) {
                                    startTransition(async () => {
                                        const res = await wipeWayfairOrders()
                                        if (res.success) {
                                            toast.success(res.message)
                                            router.refresh()
                                        } else {
                                            toast.error(res.error || "Temizleme başarısız.")
                                        }
                                    })
                                }
                            }}
                            disabled={isPending || isSyncing}
                            className="text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 px-4 py-2 rounded-lg font-bold transition-colors shadow-sm disabled:opacity-50 text-sm flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Siparişleri Temizle
                        </button>

                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={isPending || isSyncing}
                            className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-4 py-2 rounded-lg font-bold transition-colors shadow-sm disabled:opacity-50 text-sm flex items-center gap-2"
                        >
                            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {isSyncing ? "Eşitleniyor..." : "Şimdi Eşitle"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
