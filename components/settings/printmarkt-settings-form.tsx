
"use client"

import { useState, useTransition } from "react"
import { Globe, Key, Save, Loader2, Info, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { savePrintMarktSettings, wipePrintMarktOrders } from "@/app/actions"
import { useRouter } from "next/navigation"

interface PrintMarktSettingsFormProps {
    initialSettings: {
        pm_url?: string
        pm_key?: string
    }
}

export function PrintMarktSettingsForm({ initialSettings }: PrintMarktSettingsFormProps) {
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const handleSubmit = async (formData: FormData) => {
        let url = formData.get("pm_url") as string
        if (url && !url.startsWith("http")) {
            url = "https://" + url;
            formData.set("pm_url", url);
        }

        startTransition(async () => {
            try {
                const res = await savePrintMarktSettings(formData)
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
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
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
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div className="col-span-2 bg-orange-50 dark:bg-slate-900/50 p-4 rounded-lg border border-orange-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-orange-950 dark:text-slate-300 mb-1">PrintMarkt Webhook URL (Otomatik Sipariş Bildirimi İçin)</label>
                <div className="relative">
                    <input
                        readOnly
                        value={typeof window !== "undefined" ? `${window.location.origin}/api/webhook/printmarkt` : ""}
                        onClick={(e) => {
                            (e.target as HTMLInputElement).select();
                            navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                            toast.success("Webhook URL kopyalandı!");
                        }}
                        className="w-full p-2 text-xs border border-orange-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-mono outline-none cursor-pointer"
                    />
                </div>
                <p className="text-[10px] text-orange-700/80 dark:text-slate-400 mt-1.5">
                    * Siparişlerin bu panele **anında ve otomatik** düşmesi için bu URL'i PrintMarkt bayi panelinizdeki Webhook ayarlarına eklemeniz gerekir. (Kutunun üzerine tıklayarak kopyalayabilirsiniz)
                </p>
            </div>

            <div className="col-span-2 flex justify-between items-center mt-4">
                <button
                    type="button"
                    onClick={async () => {
                        if (confirm("DİKKAT! Tüm PrintMarkt siparişleri silinecektir. Silinen siparişler panelden kaldırılacak ve tekrar API'dan çekilmesi için sayfayı yenilemeniz gerekecektir. Devam etmek istiyor musunuz?")) {
                            startTransition(async () => {
                                try {
                                    const res = await wipePrintMarktOrders()
                                    if (res?.success) {
                                        toast.success(res.message)
                                        router.refresh()
                                    } else {
                                        toast.error(res?.error || "Silme işlemi başarısız oldu.")
                                    }
                                } catch (e) {
                                    toast.error("Silme işlemi sırasında hata!")
                                }
                            })
                        }
                    }}
                    disabled={isPending}
                    className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg font-bold transition-colors shadow-sm disabled:opacity-50 text-sm flex items-center gap-2"
                >
                    <Trash2 className="w-4 h-4" />
                    PrintMarkt Siparişlerini Temizle
                </button>

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
