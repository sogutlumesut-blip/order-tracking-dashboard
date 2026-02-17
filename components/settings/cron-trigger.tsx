
"use client"

import { useState } from "react"
import { RefreshCw, Play, Clock } from "lucide-react"
import { toast } from "sonner"

export function CronTrigger() {
    const [loading, setLoading] = useState(false)

    const handleTrigger = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/cron/auto-complete")
            const data = await res.json()
            if (data.success) {
                toast.success(data.message)
            } else {
                toast.info(data.message || "İşlem tamamlandı")
            }
        } catch (e) {
            toast.error("Hata oluştu")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-900">
                <span className="bg-orange-100 text-orange-800 p-1 px-2 rounded text-sm font-bold">4</span>
                Otomasyon Tetikleyicileri
            </h2>
            <p className="text-sm text-slate-600 mb-4">
                "Kargolandı" durumunda olup, üzerinden 3 gün geçen siparişleri otomatik olarak "Tamamlandı" durumuna alır.
            </p>
            <button
                onClick={handleTrigger}
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white p-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {loading ? "İşleniyor..." : "Eski Siparişleri Şimdi Temizle (3+ Gün)"}
            </button>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
                * Bu işlem normalde günde 1 kez otomatik çalışacak şekilde ayarlanabilir.
            </p>
        </div>
    )
}
