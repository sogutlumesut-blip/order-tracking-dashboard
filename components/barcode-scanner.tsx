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

    return null
}
