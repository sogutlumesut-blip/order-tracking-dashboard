
"use client"

import { useState } from "react"
import { createInvoiceAction, createCargoLabelAction } from "@/app/actions"
import { toast } from "sonner"

export default function DiagPage() {
    const [result, setResult] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    const testInvoice = async () => {
        setLoading(true)
        setResult("Testing Invoice...")
        try {
            const res = await createInvoiceAction(1001) // Using a mock ID
            setResult(res)
            console.log("Invoice Result:", res)
        } catch (e: any) {
            setResult("CATCH: " + e.message)
        }
        setLoading(false)
    }

    const testCargo = async () => {
        setLoading(true)
        setResult("Testing Cargo...")
        try {
            const res = await createCargoLabelAction(1001)
            setResult(res)
            console.log("Cargo Result:", res)
        } catch (e: any) {
            setResult("CATCH: " + e.message)
        }
        setLoading(false)
    }

    return (
        <div className="p-10 space-y-4">
            <h1 className="text-2xl font-bold">Action Diagnostic Tool (v3.6.6.17.4)</h1>
            <div className="flex gap-4">
                <button
                    onClick={testInvoice}
                    className="p-4 bg-blue-500 text-white rounded"
                    disabled={loading}
                >
                    {loading ? "Loading..." : "Test createInvoiceAction(1001)"}
                </button>
                <button
                    onClick={testCargo}
                    className="p-4 bg-green-500 text-white rounded"
                    disabled={loading}
                >
                    {loading ? "Loading..." : "Test createCargoLabelAction(1001)"}
                </button>
            </div>
            <div className="mt-8 p-4 border rounded bg-slate-50 font-mono text-sm whitespace-pre-wrap">
                <p className="font-bold border-b mb-2">RESULT:</p>
                {JSON.stringify(result, null, 2)}
            </div>
        </div>
    )
}
