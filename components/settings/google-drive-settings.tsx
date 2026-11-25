"use client"

import { useEffect, useState } from "react"
import { Cloud, CheckCircle2, ExternalLink, Save, Unlink } from "lucide-react"
import { toast } from "sonner"

export function GoogleDriveSettings() {
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [clientId, setClientId] = useState("")
    const [clientSecret, setClientSecret] = useState("")
    const [connected, setConnected] = useState(false)
    const [connectedEmail, setConnectedEmail] = useState("")
    const [connectedAt, setConnectedAt] = useState<string | null>(null)
    const [redirectUri, setRedirectUri] = useState("")
    const [hasCredentials, setHasCredentials] = useState(false)
    const [msg, setMsg] = useState("")

    const load = async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/google-drive/status")
            const d = await r.json()
            if (r.ok) {
                setClientId(d.clientId || "")
                setConnected(!!d.connected)
                setConnectedEmail(d.connectedEmail || "")
                setConnectedAt(d.connectedAt || null)
                setRedirectUri(d.redirectUri || "")
                setHasCredentials(!!d.hasCredentials)
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const handleSave = async () => {
        setBusy(true)
        setMsg("")
        try {
            const r = await fetch("/api/google-drive/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId, clientSecret }),
            })
            const d = await r.json()
            if (r.ok) {
                setMsg("✅ " + d.message)
                setClientSecret("")
                toast.success(d.message)
                await load()
            } else {
                setMsg("❌ " + (d.error || "Kaydedilemedi"))
            }
        } finally {
            setBusy(false)
        }
    }

    const handleDisconnect = async () => {
        if (!confirm("Google Drive bağlantısı kaldırılsın mı?")) return
        setBusy(true)
        try {
            await fetch("/api/google-drive/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "disconnect" }),
            })
            setMsg("Google Drive bağlantısı kaldırıldı.")
            await load()
        } finally {
            setBusy(false)
        }
    }

    if (loading) return null

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-200 space-y-4 text-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-emerald-600" />
                    Google Drive Müşteri Linki Bağlantısı (Salt Okunur)
                </h2>
                <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {connected ? `🟢 Bağlı: ${connectedEmail}` : "⚪ Bağlı Değil"}
                </span>
            </div>

            <p className="text-xs text-slate-600">
                Müşterilerin siparişlere eklediği <strong>özel/paylaşımlı Google Drive dosya ve klasör linklerini</strong> otomatik indirip taslak hazırlamak için şirket Google hesabınızı bir kez <code>drive.readonly</code> (yalnızca okuma) yetkisiyle bağlayın.
            </p>

            {connected && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>
                            <strong>{connectedEmail}</strong> bağlı {connectedAt ? `(${new Date(connectedAt).toLocaleString("tr-TR")})` : ""}. Müşterilerin paylaştığı tüm Drive dosya ve klasörleri otomatik okunur.
                        </span>
                    </div>
                    <button disabled={busy} onClick={handleDisconnect} className="px-3 py-1 rounded bg-white border border-red-200 text-red-700 font-bold flex items-center gap-1">
                        <Unlink className="w-3.5 h-3.5" /> Bağlantıyı Kes
                    </button>
                </div>
            )}

            <div className="p-3 rounded-lg bg-slate-50 border text-xs space-y-1">
                <div className="font-bold text-slate-700">Google Cloud Console Redirect URI (Yetkili yönlendirme URI&apos;si):</div>
                <code className="block bg-white p-2 rounded border font-mono text-[11px] select-all">{redirectUri}</code>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                    <label className="block font-semibold text-slate-700 mb-1">Google OAuth Client ID</label>
                    <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className="w-full px-3 py-2 border rounded-lg font-mono text-xs" />
                </div>
                <div>
                    <label className="block font-semibold text-slate-700 mb-1">Google OAuth Client Secret {hasCredentials && "(kayıtlı — değiştirmek için yazın)"}</label>
                    <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-..." className="w-full px-3 py-2 border rounded-lg font-mono text-xs" />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <button disabled={busy} onClick={handleSave} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5">
                    <Save className="w-4 h-4" /> API Bilgilerini Kaydet
                </button>
                {hasCredentials && (
                    <a href="/api/google-drive/auth" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5">
                        <ExternalLink className="w-4 h-4" /> {connected ? "Google Hesabını Yeniden Bağla" : "🔗 Google Hesabı ile Bağlan (Salt Okunur)"}
                    </a>
                )}
                {msg && <span className="text-xs font-bold text-emerald-700">{msg}</span>}
            </div>
        </div>
    )
}
