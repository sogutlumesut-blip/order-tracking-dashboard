
"use client"

import { useState, useTransition } from "react"
import { Globe, Key, Save, Loader2, Info } from "lucide-react"
import { toast } from "sonner"
import { savePrintMarktSettings } from "@/app/actions"

interface PrintMarktSettingsFormProps {
    initialSettings: {
        pm_url?: string
        pm_key?: string
    }
}

export function PrintMarktSettingsForm({ initialSettings }: PrintMarktSettingsFormProps) {
    const [isPending, startTransition] = useTransition()

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            try {
                const res = await savePrintMarktSettings(formData)
                if (res?.success) {
                    toast.success(res.message)
                } else if (res?.error) {
                    toast.error(res.error)
                }
            } catch (error) {
                console.error(error)
                toast.error("Ayarlar kaydedilirken bir hata oluştu.")
            }
        })
    }

    return (
        <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-orange-50/50 p-6 rounded-xl border border-orange-100">
            <div className="col-span-2 flex items-start gap-3 p-3 bg-white/50 rounded-lg text-xs text-orange-800 border border-orange-100 mb-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold mb-1">Özel API Entegrasyonu</p>
                    <p>WooCommerce dışındaki sitelerinizden (www.printmarkt.co gibi) sipariş çekmek için sitenizin API URL ve Key bilgilerini giriniz. Sistem bu adresten siparişleri JSON formatında çekmeye çalışacaktır.</p>
                </div>
            </div>

            <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">API Endpoint URL <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="pm_url"
                        defaultValue={initialSettings.pm_url || ''}
                        placeholder="https://www.printmarkt.co/api/orders"
                        required
                        className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                </div>
            </div>

            <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">API Key / Secret <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="pm_key"
                        type="password"
                        defaultValue={initialSettings.pm_key || ''}
                        placeholder="Özel API Anahtarınız"
                        required
                        className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                </div>
            </div>

            <div className="col-span-2 flex justify-end">
                <button
                    disabled={isPending}
                    type="submit"
                    className="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-orange-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isPending ? "Kaydediliyor..." : "Bağlantıyı Kaydet"}
                </button>
            </div>
        </form>
    )
}
