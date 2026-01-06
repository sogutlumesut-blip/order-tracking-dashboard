"use client"

import { useState } from "react"
import { inspectLatestWooCommerceOrder, checkPdfAccess } from "@/app/actions"
import { Search, Loader2, FileText, Code } from "lucide-react"
import { toast } from "sonner"

export function WooDebugTool() {
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<string | null>(null)
    const [pdfResult, setPdfResult] = useState<string | null>(null)
    const [orderIdInput, setOrderIdInput] = useState("")

    const handleInspect = async () => {
        setLoading(true)
        setData(null)
        setPdfResult(null)
        try {
            const result = await inspectLatestWooCommerceOrder(orderIdInput || undefined)
            if (result.success) {
                setData(result.data as string)
                toast.success(orderIdInput ? `${orderIdInput} nolu sipariş çekildi!` : "Son sipariş çekildi!")
            } else {
                toast.error(result.error)
            }
        } catch (e: any) {
            toast.error("Hata: " + e.message)
        } finally {
            setLoading(false)
        }
    }

    const handlePdfTest = async () => {
        setLoading(true)
        setPdfResult(null)
        try {
            const result = await checkPdfAccess()
            if (result.success) {
                setPdfResult("✅ BAŞARILI! Sunucu üzerinden PDF çekilebiliyor.")
                toast.success("PDF Erişimi Başarılı!")
            } else {
                setPdfResult(`❌ BAŞARISIZ: ${result.error}`)
                toast.error("PDF Erişimi Başarısız")
            }
        } catch (e: any) {
            setPdfResult(`❌ HATA: ${e.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                <span className="bg-amber-100 text-amber-700 p-1 px-2 rounded text-sm font-bold">🛠️</span>
                WooCommerce Veri Analizi
            </h2>
            <p className="text-sm text-gray-600 mb-6">
                Kargo barkodu veya özel alanları bulmak için son siparişin tüm ham verisini buradan inceleyebilirsiniz.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-4">
                <input
                    type="text"
                    placeholder="Sipariş No (Opsiyonel)"
                    className="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-40"
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                />

                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={handleInspect}
                        disabled={loading}
                        className="bg-amber-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-50 flex-1 sm:flex-none justify-center"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        İncele
                    </button>

                    <button
                        onClick={handlePdfTest}
                        disabled={loading}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50 flex-1 sm:flex-none justify-center"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        PDF Test
                    </button>
                </div>
            </div>

            {
                pdfResult && (
                    <div className={`mt-4 p-3 rounded-lg text-sm font-mono border ${pdfResult.includes("BAŞARILI") ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
                        {pdfResult}
                    </div>
                )
            }

            {
                data && (
                    <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-gray-500">HAM JSON VERİSİ (Son Sipariş)</span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(data)
                                    toast.success("Kopyalandı!")
                                }}
                                className="text-xs text-blue-600 hover:underline"
                            >
                                Kopyala
                            </button>
                        </div>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96 font-mono whitespace-pre-wrap break-all">
                            {data}
                        </pre>
                        <p className="mt-2 text-xs text-gray-500">
                            * Bu veriyi kopyalayıp geliştiriciye (bana) göndererek hangi alanın kargo barkodu olduğunu bulabiliriz.
                        </p>
                    </div>
                )
            }
        </div >
    )
}
