"use client"

import { useEffect, useState } from "react"
import { ScanBarcode } from "lucide-react"
import { toast } from "sonner"

interface BarcodeScannerProps {
    onScan: (code: string) => void
}

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
    const [lastScanned, setLastScanned] = useState<string | null>(null)

    // Barcode scanners usually act like a keyboard, typing characters very fast and ending with Enter.
    // We captured this input globaly.
    useEffect(() => {
        let buffer = ""
        let lastKeyTime = Date.now()

        const handleKeyDown = (e: KeyboardEvent) => {
            const currentTime = Date.now()

            // If keys are typed too slowly, it's probably manual typing, not a scanner. Reset.
            if (currentTime - lastKeyTime > 100 && buffer.length > 0) {
                buffer = ""
            }

            lastKeyTime = currentTime

            if (e.key === "Enter") {
                if (buffer.length > 2) { // Minimal length check
                    onScan(buffer)
                    setLastScanned(buffer)
                    // Clear buffer
                    buffer = ""
                }
            } else if (e.key.length === 1) { // Only printable chars
                buffer += e.key
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [onScan])

    return (
        <div className="fixed bottom-6 right-6 bg-black text-white px-4 py-3 rounded-full flex items-center gap-3 shadow-xl z-50 border border-white/20">
            <ScanBarcode className={`w-5 h-5 ${lastScanned ? 'text-green-400' : 'text-gray-400'}`} />
            <div className="flex flex-col">
                <span className="text-sm font-bold">Barkod Modu Aktif</span>
                <span className="text-xs text-gray-400">
                    {lastScanned
                        ? `Son Okunan: ${lastScanned}`
                        : "Kargo barkodu bekleniyor..."}
                </span>
            </div>
        </div>
    )
}
