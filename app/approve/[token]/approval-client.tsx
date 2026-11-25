"use client"

import { useState } from "react"
import { CheckCircle2, Edit3, AlertTriangle } from "lucide-react"

export function ApprovalClient({ token, defaultName, version }: { token: string; defaultName: string; version: number }) {
    const [customerName, setCustomerName] = useState(defaultName)
    const [revNote, setRevNote] = useState("")
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

    const handleApprove = async () => {
        setBusy(true)
        setResult(null)
        try {
            const r = await fetch(`/api/approve/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve", customerName }),
            })
            const d = await r.json()
            if (r.ok) {
                setResult({
                    ok: true,
                    msg: `Onayınız alındı! Sipariş "Onaylandı" sütununa taşındı.${d.printReadyPath ? " Yüksek çözünürlüklü baskı dosyası TEST klasörüne kaydedildi." : ""}`,
                })
                setTimeout(() => window.location.reload(), 1500)
            } else {
                setResult({ ok: false, msg: d.error || "Onay kaydedilemedi." })
            }
        } finally {
            setBusy(false)
        }
    }

    const handleRevision = async () => {
        if (!revNote.trim()) {
            setResult({ ok: false, msg: "Lütfen revizyon açıklamasını yazın." })
            return
        }
        setBusy(true)
        setResult(null)
        try {
            const r = await fetch(`/api/approve/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "revision", note: revNote }),
            })
            const d = await r.json()
            if (r.ok) {
                setResult({ ok: true, msg: "Revizyon talebiniz iletildi. Sipariş 'Taslak' sütununa geri alındı." })
                setTimeout(() => window.location.reload(), 1500)
            } else {
                setResult({ ok: false, msg: d.error || "Revizyon gönderilemedi." })
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Onay veya Revizyon Kararı</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-3">
                    <h3 className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Taslağı Onayla (v{version})
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        Ölçü, kadraj ve %100 yakın baskı detayını inceledim, onaylıyorum.
                    </p>
                    <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Adınız Soyadınız"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-sm"
                    />
                    <button
                        disabled={busy}
                        onClick={handleApprove}
                        className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50"
                    >
                        {busy ? "İşleniyor..." : "✅ Taslağı Onayla"}
                    </button>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
                    <h3 className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Edit3 className="w-4 h-4" /> Revizyon İste
                    </h3>
                    <textarea
                        rows={3}
                        value={revNote}
                        onChange={(e) => setRevNote(e.target.value)}
                        placeholder="Örn: Deseni biraz sola kaydırabilir miyiz?"
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-sm"
                    />
                    <button
                        disabled={busy}
                        onClick={handleRevision}
                        className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm disabled:opacity-50"
                    >
                        ✏️ Revizyon Talebi Gönder
                    </button>
                </div>
            </div>
            {result && (
                <div className={`p-3 rounded-xl text-sm font-semibold flex items-center gap-2 ${result.ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
                    {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {result.msg}
                </div>
            )}
        </div>
    )
}
