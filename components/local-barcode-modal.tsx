
"use client"

import { X, Printer, RefreshCcw } from "lucide-react"
import Barcode from "react-barcode"
import QRCode from "react-qr-code"
import { useRef, useState } from "react"
import { useReactToPrint } from "react-to-print"
import { syncCargoKargoEntegrator } from "@/app/actions"
import { toast } from "sonner"

interface LocalBarcodeModalProps {
    order: any
    isOpen: boolean
    onClose: () => void
}

export function LocalBarcodeModal({ order, isOpen, onClose }: LocalBarcodeModalProps) {
    const printRef = useRef<HTMLDivElement>(null)
    const [isSyncing, setIsSyncing] = useState(false)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Kargo-Barkod-${order.cargoBarcode || order.barcode || order.id}`,
    })

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await syncCargoKargoEntegrator()
            if (res.success) {
                toast.success("Kargo bilgileri güncellendi. Yeni barkod birazdan yansıyacaktır.")
            } else {
                toast.error("Kargo bilgisi bulunamadı veya bir hata oluştu.")
            }
        } catch (e) {
            toast.error("Senkronizasyon başarısız.")
        } finally {
            setIsSyncing(false)
        }
    }

    if (!isOpen || !order) return null

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">Barkod Yazdır</h3>
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={`p-1.5 rounded-md transition-all ${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
                            title="Kargo Bilgilerini Güncelle"
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Printable Content Area */}
                <div className="flex-1 overflow-auto p-8 bg-slate-100 flex justify-center">
                    <div
                        ref={printRef}
                        className="bg-white p-6 rounded shadow-sm border border-slate-200 w-[10cm] min-h-[15cm] flex flex-col items-center text-center print:shadow-none print:border-none print:w-[10cm] print:h-[150mm] print:p-4 text-black dark:text-black"
                        style={{ 
                            width: "100mm", 
                            height: "150mm", 
                            color: "#000000", 
                            backgroundColor: "#ffffff",
                            boxSizing: "border-box"
                        }}
                    >
                        {/* Sender / Header */}
                        <div className="w-full border-b-2 border-black pb-2 mb-4" style={{ borderColor: "#000000" }}>
                            <h1 className="text-xl font-bold uppercase tracking-wider" style={{ color: "#000000" }}>KARGO GÖNDERİSİ</h1>
                            <p className="text-sm font-semibold" style={{ color: "#000000" }}>Duvar Kağıdı Marketi</p>
                        </div>

                        {/* Middle: Receiver Info */}
                        <div className="w-full text-left mb-4 space-y-1">
                            <p className="text-[10px] uppercase font-bold" style={{ color: "#475569" }}>ALICI:</p>
                            <p className="font-bold text-base leading-tight" style={{ color: "#000000" }}>{order.customer}</p>
                            <p className="text-[11px] leading-tight" style={{ color: "#1e293b" }}>{order.address}</p>
                            <p className="text-[11px] font-bold" style={{ color: "#000000" }}>{order.city}</p>
                            <p className="text-[11px] mt-1" style={{ color: "#000000" }}>{order.phone}</p>
                        </div>

                        {/* Middle: Order Content (NEW) */}
                        <div className="w-full text-left mb-4 flex-1 overflow-hidden border-t border-slate-200 pt-2" style={{ borderColor: "#e2e8f0" }}>
                            <p className="text-[10px] uppercase font-bold mb-1" style={{ color: "#475569" }}>SİPARİŞ İÇERİĞİ:</p>
                            <div className="space-y-2">
                                {order.items?.map((item: any, idx: number) => {
                                    const imgUrls = (item.image_src || "").split('|').filter(Boolean);
                                    const firstImg = imgUrls[0];
                                    return (
                                        <div key={idx} className="flex gap-2 items-start border-b border-slate-100 last:border-0 pb-2 mb-2" style={{ borderColor: '#f1f5f9' }}>
                                            {firstImg && (
                                                <div className="w-12 h-12 shrink-0 bg-slate-100 rounded border border-slate-200 overflow-hidden flex items-center justify-center" style={{ borderColor: "#e2e8f0" }}>
                                                    <img
                                                        src={firstImg}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start gap-2">
                                                    <p className="text-[11px] font-bold leading-tight flex-1 uppercase" style={{ color: '#000000' }}>
                                                        {item.name}
                                                    </p>
                                                    <p className="text-[12px] font-black px-1.5 py-0.5 rounded whitespace-nowrap" style={{ color: '#000000', backgroundColor: '#e2e8f0' }}>
                                                        x{item.quantity}
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 text-[9px] font-semibold">
                                                    {item.sku && (
                                                        <span className="border px-1 rounded font-bold" style={{ color: '#1f2937', backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' }}>
                                                            KOD: {item.sku}
                                                        </span>
                                                    )}
                                                    {item.material && (
                                                        <span className="px-1 rounded" style={{ color: '#4b5563', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                            {item.material}
                                                        </span>
                                                    )}
                                                    {item.dimensions && (
                                                        <span className="px-1 rounded font-bold" style={{ color: '#065f46', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                                                            📏 {item.dimensions}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bottom: Barcode & QR Code */}
                        <div className="mt-auto w-full flex flex-col items-center justify-end pt-4 border-t-2 border-black" style={{ borderColor: "#000000" }}>
                            <div className="flex items-end justify-between gap-4 w-full">
                                {/* Left: Internal QR for Ready/Packed */}
                                <div className="flex flex-col items-center flex-1">
                                    <p className="text-[10px] font-bold mb-1" style={{ color: "#475569" }}>SİTEM (QR)</p>
                                    <QRCode
                                        value={order.barcode || order.id.toString()}
                                        size={70}
                                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                                        viewBox={`0 0 256 256`}
                                        fgColor="#000000"
                                        bgColor="#ffffff"
                                    />
                                    <p className="text-[10px] font-mono mt-1" style={{ color: "#000000" }}>{order.barcode || order.id}</p>
                                </div>

                                {/* Right: Cargo Barcode for Shipped */}
                                <div className="flex flex-col items-center flex-[2]">
                                    <p className="text-[10px] font-bold mb-1" style={{ color: "#475569" }}>KARGO (DHL/STANDART)</p>
                                    <Barcode
                                        value={order.cargoBarcode || order.cargoTrackingNumber || order.barcode || order.id.toString()}
                                        width={1.4}
                                        height={50}
                                        fontSize={10}
                                        margin={0}
                                        lineColor="#000000"
                                    />
                                    {order.cargoTrackingNumber && (
                                        <p className="text-[9px] font-mono mt-0.5" style={{ color: "#1f2937" }}>Takip: {order.cargoTrackingNumber}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-slate-50 flex gap-3">
                    <button
                        onClick={() => handlePrint()}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
                    >
                        <Printer className="w-5 h-5" />
                        Yazdır
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-3 border border-slate-300 hover:bg-slate-100 rounded-lg font-medium text-slate-700 transition-colors"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    )
}
