"use client"

import { useEffect, useState } from "react"
import { Server, FolderSearch, RefreshCw, Save, Trash2, Lock, CheckCircle2, AlertTriangle, Database } from "lucide-react"
import { toast } from "sonner"

export function DemoServerSettings() {
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [serverPath, setServerPath] = useState("")
    const [lastIndexedAt, setLastIndexedAt] = useState<string | null>(null)
    const [indexedCount, setIndexedCount] = useState(0)
    const [paths, setPaths] = useState<Record<string, string>>({})
    const [minPpi, setMinPpi] = useState("45")
    const [warnPpi, setWarnPpi] = useState("72")
    const [printPpiMax, setPrintPpiMax] = useState("150")
    const [maxFileGb, setMaxFileGb] = useState("12")
    const [livePromoStatus, setLivePromoStatus] = useState("locked")
    const [livePromoNote, setLivePromoNote] = useState("")
    const [promoInput, setPromoInput] = useState("")

    const [testResult, setTestResult] = useState<any>(null)
    const [indexResult, setIndexResult] = useState<any>(null)
    const [searchSku, setSearchSku] = useState("")
    const [searchResult, setSearchResult] = useState<any>(null)
    const [agentStatus, setAgentStatus] = useState<any>(null)
    const [agentToken, setAgentToken] = useState<string>("")
    const [saveMsg, setSaveMsg] = useState<string>("")

    const load = async () => {
        setLoading(true)
        try {
            const r = await fetch("/api/demo/server")
            const d = await r.json()
            if (r.ok) {
                setServerPath(d.serverPath || "")
                setLastIndexedAt(d.lastIndexedAt || null)
                setIndexedCount(d.indexedCount || 0)
                setPaths(d.paths || {})
                setMinPpi(d.settings?.minPpi || "45")
                setWarnPpi(d.settings?.warnPpi || "72")
                setPrintPpiMax(d.settings?.printPpiMax || "150")
                setMaxFileGb(d.settings?.maxFileGb || "12")
                setLivePromoStatus(d.settings?.livePromotionStatus || "locked")
                setLivePromoNote(d.settings?.livePromotionNote || "")
                setAgentStatus(d.agentStatus || null)
                setAgentToken(d.agentToken || "")
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const handleTestConnection = async () => {
        setBusy(true)
        setTestResult(null)
        try {
            const r = await fetch("/api/demo/server", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "test", serverPath }),
            })
            const d = await r.json()
            setTestResult(d)
            if (d.ok) toast.success("Windows Server klasörüne salt okunur erişim doğrulandı!")
            else toast.error(d.error || "Bağlantı başarısız")
        } finally {
            setBusy(false)
        }
    }

    const handleIndex = async () => {
        setBusy(true)
        setIndexResult(null)
        try {
            const r = await fetch("/api/demo/server", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "index", serverPath }),
            })
            const d = await r.json()
            setIndexResult(d)
            if (d.ok) {
                toast.success(d.queued ? d.message : `${d.indexedCount} tasarım dosyası indekslendi (${d.durationMs}ms)`)
                await load()
            } else {
                toast.error(d.error || "İndeksleme başarısız")
            }
        } finally {
            setBusy(false)
        }
    }

    const handleSearchSku = async () => {
        if (!searchSku.trim()) return
        setBusy(true)
        try {
            const r = await fetch(`/api/demo/server?sku=${encodeURIComponent(searchSku.trim())}`)
            const d = await r.json()
            setSearchResult(d)
        } finally {
            setBusy(false)
        }
    }

    const handleSaveSettings = async () => {
        setBusy(true)
        setSaveMsg("")
        try {
            const r = await fetch("/api/demo/server", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "save", serverPath, paths, minPpi, warnPpi, printPpiMax, maxFileGb }),
            })
            const d = await r.json()
            if (r.ok) {
                setSaveMsg("✅ Ayarlar veritabanına kaydedildi!")
                toast.success(d.message)
                await load()
            } else {
                setSaveMsg("❌ " + (d.error || "Kaydedilemedi"))
                toast.error(d.error || "Kaydedilemedi")
            }
        } finally {
            setBusy(false)
        }
    }

    const handleResetDemo = async () => {
        if (!confirm("Demo taslakları ve test çıktıları silinecek. Windows Server üzerindeki GERÇEK tasarım dosyalarına kesinlikle dokunulmaz. Devam edilsin mi?")) return
        setBusy(true)
        try {
            const r = await fetch("/api/demo/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reset" }),
            })
            const d = await r.json()
            if (r.ok) toast.success(d.message)
            else toast.error(d.error)
        } finally {
            setBusy(false)
        }
    }

    const handleLivePromo = async (action: "live_approve" | "live_lock") => {
        setBusy(true)
        try {
            const r = await fetch("/api/demo/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, note: promoInput }),
            })
            const d = await r.json()
            if (r.ok) { toast.success(d.message || "Güncellendi"); await load() }
            else toast.error(d.error)
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-sm">Server bağlantı ayarları yükleniyor...</div>

    return (
        <div className="space-y-6 text-slate-900">
            {/* SERVER BAĞLANTI AYARLARI */}
            <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-amber-400">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                        <Server className="w-5 h-5 text-amber-600" />
                        Server Bağlantı Ayarları (Salt Okunur Tasarım Arşivi)
                    </h2>
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold">
                        {process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "DEMO MODE • SALT OKUNUR" : "OTOMATİK TASLAK • SALT OKUNUR"}
                    </span>
                </div>

                <div className="space-y-4 text-sm">
                    <div>
                        <label className="block font-semibold text-slate-700 mb-1">Windows Server Ağ Klasörü Yolu (Gerçek Yolu Girin)</label>
                        <p className="text-xs text-slate-500 mb-2">
                            Mac&apos;te bağlı SMB paylaşımı (örn. <code>/Volumes/Tasarimlar</code>) veya yerel test klasörü (örn. <code>DKM_DEMO/DESIGNS</code>). Orijinal dosyalara yalnızca okuma yetkisi kullanılır.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <input
                                value={serverPath}
                                onChange={(e) => setServerPath(e.target.value)}
                                placeholder="/Volumes/WindowsServerTasarimlar"
                                className="flex-1 min-w-[260px] px-3 py-2 border rounded-lg font-mono text-sm"
                            />
                            <button disabled={busy} onClick={handleTestConnection} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold">
                                Bağlantıyı Test Et
                            </button>
                            <button disabled={busy} onClick={handleIndex} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5">
                                <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Tasarım Klasörlerini İndeksle
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-50 border">
                            <div className="text-slate-500">Ofis Ajanı Durumu</div>
                            <div className="font-bold mt-0.5">
                                {agentStatus?.online
                                    ? `🟢 Çevrimiçi (${agentStatus.hostname || "ofis"})`
                                    : "⚪ Çevrimdışı (Ofis ajanını başlatın)"}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border">
                            <div className="text-slate-500">İndekslenmiş Dosya</div>
                            <div className="font-bold mt-0.5">{indexedCount} tasarım</div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border">
                            <div className="text-slate-500">Son İndeksleme Tarihi</div>
                            <div className="font-bold mt-0.5">{lastIndexedAt ? new Date(lastIndexedAt).toLocaleString("tr-TR") : "Henüz indekslenmedi"}</div>
                        </div>
                    </div>

                    {agentToken && (
                        <div className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs space-y-1.5">
                            <div className="font-bold text-amber-300">🔌 Ofis Ajanı Başlatma Komutu (Ofisteki 1 bilgisayarda çalıştırın):</div>
                            <code className="block break-all text-[11px] bg-slate-950 p-2 rounded border border-slate-700 select-all">
                                {`DKM_CLOUD_URL="${typeof window !== "undefined" ? window.location.origin : "https://dkmtakip.online"}" DKM_AGENT_TOKEN="${agentToken}" DKM_SERVER_PATH="${serverPath || "/Volumes/DKM/Katalog Baskı/ShutterStocks"}" npm run office:agent`}
                            </code>
                        </div>
                    )}

                    {testResult && (
                        <div className={`p-3 rounded-lg text-xs border ${testResult.ok ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-red-50 border-red-300 text-red-900"}`}>
                            {testResult.ok ? (
                                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> <strong>Bağlantı Başarılı (Salt Okunur):</strong> {testResult.path} ({testResult.topLevelCount} öğe bulundu)</div>
                            ) : (
                                <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> <strong>Bağlantı Hatası:</strong> {testResult.error}</div>
                            )}
                        </div>
                    )}

                    {indexResult && (
                        <div className={`p-3 rounded-lg text-xs border ${indexResult.ok ? "bg-blue-50 border-blue-300 text-blue-900" : "bg-red-50 border-red-300 text-red-900"}`}>
                            {indexResult.ok
                                ? indexResult.queued
                                    ? `⏳ ${indexResult.message}`
                                    : `✅ ${indexResult.indexedCount} dosya indekslendi (${indexResult.durationMs} ms). Hatalı/okunamayan: ${indexResult.errorCount}.`
                                : `❌ ${indexResult.error}`}
                        </div>
                    )}

                    {/* SKU İLE DOSYA ARA */}
                    <div className="pt-4 border-t">
                        <label className="block font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                            <FolderSearch className="w-4 h-4 text-blue-600" /> SKU ile Server Dosyası Ara
                        </label>
                        <div className="flex gap-2">
                            <input
                                value={searchSku}
                                onChange={(e) => setSearchSku(e.target.value)}
                                placeholder="SKU kodu girin (örn. 3280_2 veya DKM-TROPIC-01)"
                                className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                            />
                            <button disabled={busy} onClick={handleSearchSku} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                                Ara
                            </button>
                        </div>
                        {searchResult && (
                            <div className="mt-3 space-y-2 text-xs">
                                {searchResult.matches?.length > 0 ? searchResult.matches.map((m: any, i: number) => (
                                    <div key={i} className="p-3 rounded-lg bg-slate-50 border flex flex-wrap justify-between gap-2">
                                        <div>
                                            <div className="font-bold text-slate-900">{m.fileName} <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">{m.format}</span></div>
                                            <div className="text-slate-600 mt-0.5">
                                                Boyut: <strong>{(m.sizeBytes / 1024 / 1024).toFixed(2)} MB</strong> • Piksel: <strong>{m.widthPx || "?"}×{m.heightPx || "?"} px</strong> • Renk: <strong>{m.colorSpace || "-"}</strong>
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-mono break-all mt-0.5">{m.filePath}</div>
                                        </div>
                                        <div className="text-right text-[11px] text-slate-500">
                                            Son indeks: {searchResult.lastIndexedAt ? new Date(searchResult.lastIndexedAt).toLocaleString("tr-TR") : "-"}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                                        {searchResult.error || "SKU ile eşleşen dosya bulunamadı."}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* TEST ÇIKTI KLASÖRLERİ & MOTOR AYARLARI */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                    <Database className="w-5 h-5 text-blue-600" /> Test Klasör Yolları ve Çözünürlük Ayarları
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {[
                        ["previews", "PREVIEWS (JPG Taslaklar)"],
                        ["details", "DETAILS (%100 Yakın Detay)"],
                        ["approved", "APPROVED (Onay Kayıtları)"],
                        ["printReady", "PRINT_READY (Test Baskı Klasörü)"],
                        ["cache", "CACHE (Önbellek)"],
                        ["logs", "LOGS (Performans Günlükleri)"],
                    ].map(([k, label]) => (
                        <div key={k}>
                            <label className="block font-semibold text-slate-600 mb-1">{label}</label>
                            <input
                                value={paths[k] || ""}
                                onChange={(e) => setPaths((prev) => ({ ...prev, [k]: e.target.value }))}
                                className="w-full px-2.5 py-1.5 border rounded font-mono text-xs"
                            />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><label className="block font-semibold text-slate-600 mb-1">Min PPI</label><input value={minPpi} onChange={(e) => setMinPpi(e.target.value)} className="w-full px-2.5 py-1.5 border rounded" /></div>
                    <div><label className="block font-semibold text-slate-600 mb-1">Uyarı PPI</label><input value={warnPpi} onChange={(e) => setWarnPpi(e.target.value)} className="w-full px-2.5 py-1.5 border rounded" /></div>
                    <div><label className="block font-semibold text-slate-600 mb-1">Maks Baskı PPI</label><input value={printPpiMax} onChange={(e) => setPrintPpiMax(e.target.value)} className="w-full px-2.5 py-1.5 border rounded" /></div>
                    <div><label className="block font-semibold text-slate-600 mb-1">Maks Dosya (GB)</label><input value={maxFileGb} onChange={(e) => setMaxFileGb(e.target.value)} className="w-full px-2.5 py-1.5 border rounded" /></div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button disabled={busy} onClick={handleSaveSettings} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5">
                        <Save className="w-4 h-4" /> Server ve Klasör Ayarlarını Kaydet
                    </button>
                    {saveMsg && <span className="text-xs font-bold text-emerald-700">{saveMsg}</span>}
                </div>
            </div>

            {/* DEMO SIFIRLAMA & CANLI GEÇİŞ YÖNETİCİ ONAYI */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-red-200 space-y-3">
                    <h3 className="font-bold text-red-700 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Demo Ortamını Sıfırla</h3>
                    <p className="text-xs text-slate-600">
                        Yalnızca üretilen test taslaklarını, test WhatsApp kayıtlarını ve test baskı çıktılarını siler. <strong>Windows Server üzerindeki gerçek tasarım dosyalarına kesinlikle dokunmaz.</strong>
                    </p>
                    <button disabled={busy} onClick={handleResetDemo} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold">
                        Test Çıktılarını Sıfırla
                    </button>
                </div>

                <div className="bg-white p-5 rounded-xl shadow-sm border border-emerald-200 space-y-3">
                    <h3 className="font-bold text-emerald-800 flex items-center gap-2"><Lock className="w-4 h-4" /> Canlı Sisteme Geçiş Yönetici Onayı</h3>
                    <p className="text-xs text-slate-600">
                        Durum: <strong>{livePromoStatus === "approved_for_merge" ? "✅ YÖNETİCİ ONAYLI (Manuel Merge Bekleniyor)" : "🔒 KİLİTLİ"}</strong>
                        {livePromoNote && <span className="block mt-1 text-slate-500">{livePromoNote}</span>}
                    </p>
                    <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Yönetici onay notu..." className="w-full px-3 py-1.5 border rounded text-xs" />
                    <div className="flex gap-2">
                        <button disabled={busy} onClick={() => handleLivePromo("live_approve")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Onay Kaydet</button>
                        <button disabled={busy} onClick={() => handleLivePromo("live_lock")} className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 text-xs font-bold">Kilitle</button>
                    </div>
                </div>
            </div>
        </div>
    )
}
