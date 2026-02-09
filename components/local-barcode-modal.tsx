
"use client"

import { X, Printer } from "lucide-react"
import Barcode from "react-barcode"
import { useRef } from "react"
import { useReactToPrint } from "react-to-print"

interface LocalBarcodeModalProps {
    order: any
    isOpen: boolean
    onClose: () => void
}

export function LocalBarcodeModal({ order, isOpen, onClose }: LocalBarcodeModalProps) {
    const printRef = useRef<HTMLDivElement>(null)

    // @ts-ignore - react-to-print types might be tricky, but this works
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `Kargo-Barkod-${order.cargoBarcode || order.id}`,
        onAfterPrint: () => {
            // Optional: Close modal after print, or keep open
            // onClose() 
        }
    })

    if (!isOpen || !order || !order.cargoBarcode) return null

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg">Barkod Yazdır</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Printable Content Area */}
                <div className="flex-1 overflow-auto p-8 bg-gray-100 flex justify-center">
                    <div
                        ref={printRef}
                        className="bg-white p-6 rounded shadow-sm border border-gray-200 w-[10cm] min-h-[10cm] flex flex-col items-center text-center print:shadow-none print:border-none print:w-full print:h-full"
                        style={{ width: "100mm", height: "100mm" }} // Standard generic label size (10x10cm) or fit to content
                    >
                        {/* Sender / Header */}
                        <div className="w-full border-b-2 border-black pb-2 mb-4">
                            <h1 className="text-xl font-bold uppercase tracking-wider">KARGO GÖNDERİSİ</h1>
                            <p className="text-sm font-semibold">Duvar Kağıdı Marketi</p>
                        </div>

                        {/* Middle: Receiver Info */}
                        <div className="w-full text-left mb-6 space-y-1 flex-1">
                            <p className="text-xs text-gray-500 uppercase font-bold">ALICI:</p>
                            <p className="font-bold text-lg leading-tight">{order.customer}</p>
                            <p className="text-sm">{order.address}</p>
                            <p className="text-sm font-bold">{order.city}</p>
                            <p className="text-sm mt-1">{order.phone}</p>
                        </div>

                        {/* Bottom: Barcode */}
                        <div className="mt-auto w-full flex flex-col items-center justify-end pt-4 border-t-2 border-black">
                            <Barcode
                                value={order.cargoBarcode}
                                width={2}
                                height={80}
                                fontSize={16}
                            />
                            <p className="text-xs font-mono mt-2">{order.cargoTrackingNumber ? `Takip No: ${order.cargoTrackingNumber}` : ''}</p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t bg-gray-50 flex gap-3">
                    <button
                        onClick={() => handlePrint()}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
                    >
                        <Printer className="w-5 h-5" />
                        Yazdır
                    </button>
                    <button
                        onClick={onClose}
                        className="px-6 py-3 border border-gray-300 hover:bg-gray-100 rounded-lg font-medium text-gray-700 transition-colors"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    )
}
