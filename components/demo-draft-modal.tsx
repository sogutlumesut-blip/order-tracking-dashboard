"use client"

import { useEffect, useRef, useState } from "react"
import { X, Wand2, FolderSearch, Eye, Crop as CropIcon, Gauge, ZoomIn, MessageSquare, ExternalLink, Printer, RefreshCw, AlertTriangle, CheckCircle2, Sparkles, CloudDownload } from "lucide-react"
import { toast } from "sonner"

export type DemoModalTab = "preview" | "edit" | "detail" | "ppi" | "server" | "visual" | "whatsapp" | "print"

interface DemoDraftModalProps {
    order: any
    initialTab: DemoModalTab
    onClose: () => void
    onUpdated: () => void
}

export function DemoDraftModal({ order, initialTab, onClose, onUpdated }: DemoDraftModalProps) {
    const [tab, setTab] = useState<DemoModalTab>(initialTab)
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [drafts, setDrafts] = useState<any[]>([])
    const [waLogs, setWaLogs] = useState<any[]>([])
    const [serverResult, setServerResult] = useState<any>(null)
    const [visualResult, setVisualResult] = useState<any>(null)
    const [skuInput, setSkuInput] = useState<string>((order?.items?.[0]?.sku || "").trim())
    const [dimInput, setDimInput] = useState<string>((order?.items?.[0]?.dimensions || "").trim())
    const hasDriveLink = Boolean(
        (order?.items?.[0]?.url && /drive\.google\.com|dropbox\.com/i.test(order.items[0].url)) ||
        (order?.items?.[0]?.image_src && /drive\.google\.com|dropbox\.com/i.test(order.items[0].image_src))
    )

    // Crop & Seamless Tiling canvas state
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const imgRef = useRef<HTMLImageElement | null>(null)
    const [layoutMode, setLayoutMode] = useState<"mural" | "seamless">("mural")
    const [repeatsX, setRepeatsX] = useState(1.0)
    const [offsetX, setOffsetX] = useState(0)
    const [offsetY, setOffsetY] = useState(0)
    const [halfDrop, setHalfDrop] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
    const [livePpi, setLivePpi] = useState<number | null>(null)
    const dragRef = useRef<{ dragging: boolean; sx: number; sy: number; ox: number; oy: number }>({
        dragging: false, sx: 0, sy: 0, ox: 0, oy: 0
    })

    const latest = drafts[0] || null

    const loadOrderDrafts = async () => {
        setLoading(true)
        try {
            const r = await fetch(`/api/demo/drafts?orderId=${order.id}`)
            const d = await r.json()
            if (r.ok) {
                setDrafts(d.drafts || [])
                setWaLogs(d.whatsappLogs || [])
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadOrderDrafts()
        if (initialTab === "server" && skuInput) {
            handleFindServerFile(skuInput)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order.id])

    const handleFindServerFile = async (skuToFind?: string) => {
        const q = (skuToFind ?? skuInput).trim()
        if (!q) {
            toast.error("Aranacak SKU boş.")
            return
        }
        setBusy(true)
        try {
            const r = await fetch(`/api/demo/server?sku=${encodeURIComponent(q)}`)
            const d = await r.json()
            setServerResult(d)
            if (!d.ok) toast.error(d.error || "Dosya bulunamadı")
            else toast.success(`${d.matches?.length || 0} dosya bulundu`)
        } finally {
            setBusy(false)
        }
    }

    const handleVisualMatch = async () => {
        setTab("visual")
        setBusy(true)
        setVisualResult(null)
        try {
            const r = await fetch("/api/demo/visual-match", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id, limit: 6 }),
            })
            const d = await r.json()
            setVisualResult(d)
            if (!d.ok) toast.error(d.error || "Görsel eşleştirme yapılamadı")
            else toast.success(`${d.matches?.length || 0} benzer Server dosyası bulundu`)
        } finally {
            setBusy(false)
        }
    }

    const safeJson = async (r: Response) => {
        const text = await r.text()
        try {
            return JSON.parse(text)
        } catch {
            return { ok: false, error: `Sunucu yanıtı zaman aşımı veya bellek sınırı (HTTP ${r.status}). Büyük dosyalar için Ofis Ajanı'nın açık olduğundan emin olun.` }
        }
    }

    const handleGenerateDraft = async (autoSendWhatsApp = false, extra: { overrideSourcePath?: string; rememberSkuMapping?: boolean; forceDrive?: boolean } = {}) => {
        setBusy(true)
        try {
            const r = await fetch("/api/demo/drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate",
                    orderId: order.id,
                    autoSendWhatsApp,
                    overrideSku: skuInput,
                    overrideDimensions: dimInput,
                    ...extra,
                }),
            })
            const d = await safeJson(r)
            await loadOrderDrafts()
            onUpdated()
            if (!r.ok || !d.ok) {
                toast.error(d.error || d.draft?.errorMessage || "Taslak oluşturulamadı")
            } else {
                toast.success(`Taslak v${d.draft.version} oluşturuldu (${Math.round(d.draft.effectivePpi)} PPI, ${d.draft.totalMs}ms)`)
                setTab("preview")
            }
        } catch (e: any) {
            toast.error(e?.message || "Taslak oluşturulurken bağlantı hatası oluştu")
        } finally {
            setBusy(false)
        }
    }

    const [waIncludeLink, setWaIncludeLink] = useState(false)
    const [copyingSheet, setCopyingSheet] = useState(false)

    const isDemoUi = process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1"

    const sanitizeWaMessage = (rawMsg: string, approvalUrl?: string | null) => {
        let msg = String(rawMsg || "")
        if (!isDemoUi) {
            msg = msg.replace(/^\[DEMO TEST[^\n]*\]\n?/gim, "")
            const origin = typeof window !== "undefined" ? window.location.origin : "https://dkmtakip.online"
            msg = msg.replace(/https?:\/\/localhost:\d+/gi, origin)
            if (!waIncludeLink) {
                msg = msg.replace(/\n?Önizleme ve onay bağlantısı:\s*https?:\/\/\S+/gi, "").trim()
                if (!/onay/i.test(msg)) {
                    msg += "\nLütfen ekteki görseli inceleyip baskı onayınızı iletir misiniz?"
                }
            } else if (approvalUrl && !msg.includes("/approve/")) {
                const safeUrl = approvalUrl.replace(/https?:\/\/localhost:\d+/gi, origin)
                msg += `\nOnay linki: ${safeUrl}`
            }
        }
        return msg.trim()
    }

    const copySheetImageToClipboard = async (draftId: number, version?: number) => {
        setCopyingSheet(true)
        try {
            const url = `/api/demo/files/sheet/${draftId}?v=${version || 1}`
            const resp = await fetch(url)
            if (!resp.ok) throw new Error("Sunum görseli yüklenemedi")
            const blob = await resp.blob()
            // Clipboard API en güvenilir şekilde image/png kabul eder; canvas ile PNG'ye çevir
            const bitmap = await createImageBitmap(blob)
            const canvas = document.createElement("canvas")
            canvas.width = bitmap.width
            canvas.height = bitmap.height
            const ctx = canvas.getContext("2d")
            if (!ctx) throw new Error("Canvas oluşturulamadı")
            ctx.drawImage(bitmap, 0, 0)
            const pngBlob: Blob = await new Promise((resolve, reject) =>
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG dönüştürme hatası"))), "image/png")
            )
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })])
            return true
        } catch (err: any) {
            console.error("Clipboard copy error:", err)
            toast.error("Görsel panoya kopyalanamadı. Lütfen 'Görseli İndir' butonunu kullanın.")
            return false
        } finally {
            setCopyingSheet(false)
        }
    }

    const handleCopyAndOpenWhatsApp = async (phone: string, message: string, draftId?: number, version?: number) => {
        const targetDraftId = draftId || latest?.id
        let copied = false
        if (targetDraftId) {
            copied = await copySheetImageToClipboard(targetDraftId, version || latest?.version)
        }
        const cleanPhone = String(phone || "").replace(/[^0-9]/g, "")
        const waHref = cleanPhone
            ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
            : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
        window.open(waHref, "_blank", "noopener,noreferrer")
        if (copied) {
            toast.success("Görsel panoya kopyalandı! Açılan WhatsApp sohbetinde Cmd+V (Ctrl+V) yapıp görseli direkt gönderin.", { duration: 7000 })
        }
    }

    const handleSendWhatsApp = async () => {
        if (!latest) return toast.error("Önce otomatik taslak oluşturun.")
        setBusy(true)
        try {
            const r = await fetch("/api/demo/drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "whatsapp", orderId: order.id, draftId: latest.id }),
            })
            const d = await r.json()
            if (!r.ok) return toast.error(d.error || "WhatsApp kaydı oluşturulamadı")
            toast.success(
                isDemoUi
                    ? "Test WhatsApp kaydı oluşturuldu (gerçek mesaj gönderilmedi). Sipariş 'Onay Beklemede' sütununa taşındı."
                    : "WhatsApp taslak gönderimi hazırlandı. Sipariş 'Onay Beklemede' sütununa taşındı."
            )
            await loadOrderDrafts()
            onUpdated()
            setTab("whatsapp")
        } finally {
            setBusy(false)
        }
    }

    const [printTargetDir, setPrintTargetDir] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("dkm_print_target_dir") || ""
        }
        return ""
    })

    const handleGeneratePrint = async (opts: { targetDir?: string; forceRegenerate?: boolean } = {}) => {
        if (!latest) return toast.error("Taslak bulunamadı.")
        const chosenDir = (opts.targetDir ?? printTargetDir).trim()
        if (chosenDir && typeof window !== "undefined") {
            localStorage.setItem("dkm_print_target_dir", chosenDir)
        }
        setBusy(true)
        try {
            const r = await fetch("/api/demo/drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "print",
                    orderId: order.id,
                    draftId: latest.id,
                    targetDir: chosenDir || undefined,
                    forceRegenerate: !!opts.forceRegenerate,
                }),
            })
            const d = await safeJson(r)
            if (!r.ok || d.ok === false) return toast.error(d.error || "Baskı dosyası oluşturulamadı")
            const savedPath = d.draft?.printReadyPath || d.printReadyPath || chosenDir || "varsayılan baskı klasörü"
            toast.success(`Onaylı yüksek çözünürlüklü baskı dosyası kaydedildi: ${savedPath}`)
            await loadOrderDrafts()
            onUpdated()
        } finally {
            setBusy(false)
        }
    }

    // Crop / Seamless Editor initialization
    const getWallInches = () => {
        const unitToIn: Record<string, number> = { mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54, in: 1, ft: 12 }
        const inchW = (latest?.width || 100) * (unitToIn[latest?.unit || "cm"] || 1 / 2.54)
        const inchH = (latest?.height || 100) * (unitToIn[latest?.unit || "cm"] || 1 / 2.54)
        return { inchW, inchH }
    }

    const drawSeamlessCanvas = (rX: number, oX: number, oY: number, hd: boolean) => {
        const canvas = canvasRef.current
        const img = imgRef.current
        if (!canvas || !img || !latest?.sourceWidth) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const { inchW, inchH } = getWallInches()
        const wallAspect = inchW / inchH
        const padTop = 30, padLeft = 32, padRight = 14, padBottom = 14
        const maxW = 540, maxH = 440
        let pw = maxW, ph = pw / wallAspect
        if (ph > maxH) { ph = maxH; pw = ph * wallAspect }
        pw = Math.max(80, Math.round(pw))
        ph = Math.max(80, Math.round(ph))

        canvas.width = padLeft + pw + padRight
        canvas.height = padTop + ph + padBottom
        ctx.fillStyle = "#18181b"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const tileW = pw / Math.max(0.25, rX)
        const tileH = tileW * (img.naturalHeight / img.naturalWidth)

        ctx.save()
        ctx.beginPath()
        ctx.rect(padLeft, padTop, pw, ph)
        ctx.clip()

        const startX = -(((oX % 1) + 1) % 1) * tileW
        const startY = -(((oY % 1) + 1) % 1) * tileH
        const cols = Math.ceil((pw - startX) / tileW) + 1
        for (let c = -1; c <= cols; c++) {
            const x = padLeft + startX + c * tileW
            const dropY = hd && (Math.abs(c) % 2 === 1) ? tileH / 2 : 0
            const rows = Math.ceil((ph - startY + dropY) / tileH) + 2
            for (let r = -2; r <= rows; r++) {
                const y = padTop + startY + r * tileH - dropY
                if (x + tileW < padLeft || x > padLeft + pw || y + tileH < padTop || y > padTop + ph) continue
                ctx.drawImage(img, x, y, tileW, tileH)
            }
        }
        ctx.restore()

        // Kırmızı kesim çizgileri & ölçü yazıları (referans görseldeki gibi)
        ctx.strokeStyle = "#dc2626"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, padTop); ctx.lineTo(canvas.width, padTop)
        ctx.moveTo(0, padTop + ph); ctx.lineTo(canvas.width, padTop + ph)
        ctx.moveTo(padLeft, 0); ctx.lineTo(padLeft, canvas.height)
        ctx.moveTo(padLeft + pw, 0); ctx.lineTo(padLeft + pw, canvas.height)
        ctx.stroke()

        const wLbl = latest.unit === "in" ? `${latest.width}"W` : `${latest.width} ${latest.unit} W`
        const hLbl = latest.unit === "in" ? `${latest.height}"H` : `${latest.height} ${latest.unit} H`
        ctx.fillStyle = "#f8fafc"
        ctx.font = "bold 14px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(wLbl, padLeft + pw / 2, 20)
        ctx.save()
        ctx.translate(18, padTop + ph / 2)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(hLbl, 0, 0)
        ctx.restore()

        const repeatWidthInch = inchW / Math.max(0.25, rX)
        setLivePpi(latest.sourceWidth / repeatWidthInch)
    }

    useEffect(() => {
        if (tab !== "edit" || !latest?.proxyPath || !latest?.sourceWidth) return
        const { inchW, inchH } = getWallInches()
        const initMode: "mural" | "seamless" = latest.layoutMode === "seamless" ? "seamless" : "mural"
        setLayoutMode(initMode)
        let initRx = 1.0, initOx = 0, initOy = 0, initHd = false
        if (latest.tileConfig) {
            try {
                const tc = JSON.parse(latest.tileConfig)
                if (tc.repeatWidthInch) initRx = Number((inchW / tc.repeatWidthInch).toFixed(2))
                initOx = Number(tc.offsetX || 0)
                initOy = Number(tc.offsetY || 0)
                initHd = !!tc.halfDrop
            } catch {}
        }
        setRepeatsX(initRx)
        setOffsetX(initOx)
        setOffsetY(initOy)
        setHalfDrop(initHd)

        const initCrop = {
            x: latest.cropX ?? 0,
            y: latest.cropY ?? 0,
            w: latest.cropW ?? latest.sourceWidth,
            h: latest.cropH ?? latest.sourceHeight,
        }
        setCrop(initCrop)
        setLivePpi(initMode === "seamless" ? latest.sourceWidth / (inchW / initRx) : Math.min(initCrop.w / inchW, initCrop.h / inchH))
        const img = new Image()
        img.onload = () => {
            imgRef.current = img
            if (initMode === "seamless") drawSeamlessCanvas(initRx, initOx, initOy, initHd)
            else drawCanvas(initCrop)
        }
        img.src = `/api/demo/files/proxy/${latest.id}?v=${latest.version}`
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, latest?.id])

    useEffect(() => {
        if (tab !== "edit" || !imgRef.current) return
        if (layoutMode === "seamless") drawSeamlessCanvas(repeatsX, offsetX, offsetY, halfDrop)
        else if (crop) drawCanvas(crop)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layoutMode, repeatsX, offsetX, offsetY, halfDrop])

    const drawCanvas = (c: { x: number; y: number; w: number; h: number }) => {
        const canvas = canvasRef.current
        const img = imgRef.current
        if (!canvas || !img || !latest?.sourceWidth) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        const s = Math.min(620 / img.naturalWidth, 400 / img.naturalHeight, 1)
        canvas.width = Math.round(img.naturalWidth * s)
        canvas.height = Math.round(img.naturalHeight * s)
        const sx = canvas.width / latest.sourceWidth
        const sy = canvas.height / latest.sourceHeight
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        ctx.fillStyle = "rgba(2,6,23,0.62)"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        const rx = c.x * sx, ry = c.y * sy, rw = c.w * sx, rh = c.h * sy
        ctx.save()
        ctx.beginPath()
        ctx.rect(rx, ry, rw, rh)
        ctx.clip()
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        ctx.restore()
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth = 2.5
        ctx.strokeRect(rx, ry, rw, rh)
    }

    const updateZoom = (nextZoom: number) => {
        if (!crop || !latest?.sourceWidth) return
        setZoom(nextZoom)
        const unitToIn: Record<string, number> = { mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54, in: 1, ft: 12 }
        const inchW = (latest.width || 100) * (unitToIn[latest.unit || "cm"] || 1 / 2.54)
        const inchH = (latest.height || 100) * (unitToIn[latest.unit || "cm"] || 1 / 2.54)
        const aspect = inchW / inchH
        let baseW = latest.sourceWidth, baseH = baseW / aspect
        if (baseH > latest.sourceHeight) { baseH = latest.sourceHeight; baseW = baseH * aspect }
        const cx = crop.x + crop.w / 2
        const cy = crop.y + crop.h / 2
        const w = Math.max(32, Math.round(baseW / nextZoom))
        const h = Math.max(32, Math.round(baseH / nextZoom))
        const x = Math.round(Math.max(0, Math.min(latest.sourceWidth - w, cx - w / 2)))
        const y = Math.round(Math.max(0, Math.min(latest.sourceHeight - h, cy - h / 2)))
        const next = { x, y, w, h }
        setCrop(next)
        setLivePpi(Math.min(w / inchW, h / inchH))
        drawCanvas(next)
    }

    const handleApplyCrop = async (sendWhatsApp: boolean) => {
        if (layoutMode === "mural" && !crop) return
        setBusy(true)
        try {
            const { inchW } = getWallInches()
            const tileConfig =
                layoutMode === "seamless"
                    ? { repeatWidthInch: inchW / Math.max(0.25, repeatsX), offsetX, offsetY, halfDrop }
                    : undefined
            const r = await fetch("/api/demo/drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "crop",
                    orderId: order.id,
                    crop: layoutMode === "mural" ? crop : undefined,
                    layoutMode,
                    tileConfig,
                    sendWhatsApp,
                    overrideSku: skuInput,
                    overrideDimensions: dimInput,
                }),
            })
            const d = await r.json()
            await loadOrderDrafts()
            onUpdated()
            if (!r.ok || !d.ok) toast.error(d.error || "Düzenleme uygulanamadı")
            else {
                toast.success(`Yeni ${layoutMode === "seamless" ? "takipli (seamless) " : ""}taslak v${d.draft.version} oluşturuldu (${Math.round(d.draft.effectivePpi)} PPI)`)
                setTab("preview")
            }
        } finally {
            setBusy(false)
        }
    }

    const fmtMb = (b: number | null | undefined) => b ? `${(b / 1024 / 1024).toFixed(2)} MB` : "-"

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-3.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black">
                                {process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "DEMO MODE" : "OTOMATİK TASLAK"}
                            </span>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base">
                                Otomatik Taslak Stüdyosu — #{order.barcode || order.id} ({order.customer})
                            </h3>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            Sipariş kartındaki küçük görsel kullanılmaz; yalnızca Windows Server üzerindeki orijinal tasarım işlenir.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* SKU / Dimension quick bar */}
                <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                    <label className="font-semibold text-slate-600 dark:text-slate-300">SKU:</label>
                    <input value={skuInput} onChange={(e) => setSkuInput(e.target.value)} className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono w-44" />
                    <label className="font-semibold text-slate-600 dark:text-slate-300 ml-2">Ölçü:</label>
                    <input value={dimInput} onChange={(e) => setDimInput(e.target.value)} placeholder="örn. 300x250 cm" className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 w-36" />
                    <button disabled={busy} onClick={() => handleGenerateDraft(false)} className="ml-auto px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
                        <Wand2 className="w-3.5 h-3.5" /> {busy ? "İşleniyor..." : "Otomatik Taslak Oluştur"}
                    </button>
                    {hasDriveLink && (
                        <button disabled={busy} onClick={() => handleGenerateDraft(false, { forceDrive: true })} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
                            <CloudDownload className="w-3.5 h-3.5" /> Google Drive&apos;dan Hazırla
                        </button>
                    )}
                    <button disabled={busy} onClick={handleVisualMatch} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
                        <Sparkles className="w-3.5 h-3.5" /> Görselden Bul
                    </button>
                    <button disabled={busy} onClick={() => { setTab("server"); handleFindServerFile() }} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50">
                        <FolderSearch className="w-3.5 h-3.5" /> Server Dosyasını Bul
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-5 pt-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-1 text-xs">
                    {[
                        { id: "preview", label: "Taslağı Görüntüle", icon: Eye },
                        { id: "edit", label: "Taslağı Düzenle (Kırp/Ölçek)", icon: CropIcon },
                        { id: "detail", label: "%100 Detay", icon: ZoomIn },
                        { id: "ppi", label: "Çözünürlük & Performans", icon: Gauge },
                        { id: "server", label: "Server Dosyası", icon: FolderSearch },
                        { id: "visual", label: "Görselden Eşleştir", icon: Sparkles },
                        { id: "whatsapp", label: `${process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "Test WhatsApp" : "WhatsApp"} (${waLogs.length})`, icon: MessageSquare },
                        { id: "print", label: process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "Baskı Dosyası (TEST)" : "Baskı Dosyası", icon: Printer },
                    ].map((t) => {
                        const Icon = t.icon
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id as DemoModalTab)}
                                className={`px-3 py-2 rounded-t-lg font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                                    tab === t.id
                                        ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30"
                                        : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900"
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" /> {t.label}
                            </button>
                        )
                    })}
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {loading && <div className="text-sm text-slate-500 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Yükleniyor...</div>}

                    {latest?.errorMessage && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 text-xs flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div><strong>Hata ({latest.errorCode}):</strong> {latest.errorMessage}</div>
                        </div>
                    )}

                    {/* PREVIEW TAB */}
                    {tab === "preview" && (
                        latest?.previewPath ? (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 font-bold">v{latest.version}</span>
                                        <span className="px-2 py-1 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 font-bold">
                                            {latest.sourceFormat?.toUpperCase()} ({latest.sourceWidth}×{latest.sourceHeight}px • {latest.sourceSpace})
                                        </span>
                                        <span className={`px-2 py-1 rounded font-bold ${latest.ppiStatus === "ok" ? "bg-emerald-100 text-emerald-800" : latest.ppiStatus === "warn" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                                            {Math.round(latest.effectivePpi || 0)} PPI ({latest.ppiStatus})
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <a href={`/api/demo/files/sheet/${latest.id}?download=1&v=${latest.version}`} download className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5">
                                            ⬇️ Birleşik Sunum Kartı (JPG)
                                        </a>
                                        {latest.approvalToken && latest.ppiStatus !== "low" && (
                                            <a href={`/approve/${latest.approvalToken}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5">
                                                <ExternalLink className="w-3.5 h-3.5" /> Müşteri Onay Linkini Aç
                                            </a>
                                        )}
                                        <button disabled={busy} onClick={handleSendWhatsApp} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center gap-1.5">
                                            <MessageSquare className="w-3.5 h-3.5" /> {process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "Test WhatsApp Gönder" : "WhatsApp Gönder"}
                                        </button>
                                    </div>
                                </div>
                                <img src={`/api/demo/files/preview/${latest.id}?t=${latest.version}`} alt="Taslak Önizleme" className="w-full max-h-[55vh] object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950" />
                            </div>
                        ) : (
                            <div className="p-8 text-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Bu sipariş için henüz otomatik taslak oluşturulmadı.</p>
                                <button disabled={busy} onClick={() => handleGenerateDraft(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">
                                    Otomatik Taslak Oluştur
                                </button>
                            </div>
                        )
                    )}

                    {/* CROP / SCALE / SEAMLESS EDIT TAB */}
                    {tab === "edit" && (
                        latest?.proxyPath ? (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setLayoutMode("mural")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${layoutMode === "mural" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"}`}
                                    >
                                        🖼️ Mural (Kırp / Ölçekle)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLayoutMode("seamless")}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${layoutMode === "seamless" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"}`}
                                    >
                                        🔁 Seamless / Takipli Desen (Tekrarla)
                                    </button>
                                    {livePpi !== null && (
                                        <span className={`ml-auto px-2.5 py-1 rounded text-xs font-bold ${livePpi < 45 ? "bg-red-100 text-red-800" : livePpi < 72 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                                            Canlı Efektif PPI: {livePpi.toFixed(1)}
                                        </span>
                                    )}
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                    {layoutMode === "seamless"
                                        ? `Desen duvar ölçüsüne (${latest.width}×${latest.height} ${latest.unit}) kesintisiz takip ederek tekrarlanır. Yatay tekrar sayısını, kaydırmayı ve yarım kaydırmayı (half-drop) canlı ayarlayabilirsiniz.`
                                        : `Kırpma çerçevesini fareyle sürükleyin, yakınlaştırma (ölçek) kaydırıcısıyla kadrajı ayarlayın. Kaydedince yeni sürüm (v${latest.version + 1}) üretilir.`}
                                </p>

                                <canvas
                                    ref={canvasRef}
                                    className="rounded-xl border border-slate-300 dark:border-slate-700 cursor-move max-w-full bg-black"
                                    onMouseDown={(e) => {
                                        if (layoutMode !== "mural" || !crop) return
                                        dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: crop.x, oy: crop.y }
                                    }}
                                    onMouseMove={(e) => {
                                        if (layoutMode !== "mural" || !dragRef.current.dragging || !crop || !canvasRef.current || !latest?.sourceWidth) return
                                        const dx = (e.clientX - dragRef.current.sx) * (latest.sourceWidth / canvasRef.current.width)
                                        const dy = (e.clientY - dragRef.current.sy) * (latest.sourceHeight / canvasRef.current.height)
                                        const x = Math.round(Math.max(0, Math.min(latest.sourceWidth - crop.w, dragRef.current.ox + dx)))
                                        const y = Math.round(Math.max(0, Math.min(latest.sourceHeight - crop.h, dragRef.current.oy + dy)))
                                        const next = { ...crop, x, y }
                                        setCrop(next)
                                        drawCanvas(next)
                                    }}
                                    onMouseUp={() => { dragRef.current.dragging = false }}
                                    onMouseLeave={() => { dragRef.current.dragging = false }}
                                />

                                {layoutMode === "mural" ? (
                                    <div className="flex flex-wrap items-center gap-4">
                                        <label className="text-xs font-bold">Ölçek: {zoom.toFixed(2)}x</label>
                                        <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => updateZoom(Number(e.target.value))} className="flex-1" />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
                                        <div>
                                            <label className="font-bold block mb-1">
                                                Yatay Tekrar Sayısı: {repeatsX.toFixed(2)}x (1 tekrar ≈ {((getWallInches().inchW / Math.max(0.25, repeatsX)) * 2.54).toFixed(1)} cm)
                                            </label>
                                            <input type="range" min={0.5} max={5} step={0.1} value={repeatsX} onChange={(e) => setRepeatsX(Number(e.target.value))} className="w-full" />
                                        </div>
                                        <div className="flex items-center gap-2 pt-4">
                                            <input id="halfDropChk" type="checkbox" checked={halfDrop} onChange={(e) => setHalfDrop(e.target.checked)} />
                                            <label htmlFor="halfDropChk" className="font-bold cursor-pointer">Yarım Kaydırmalı Takip (Half-Drop)</label>
                                        </div>
                                        <div>
                                            <label className="font-semibold block mb-1">Yatay Kaydırma (Offset X): %{Math.round(offsetX * 100)}</label>
                                            <input type="range" min={0} max={1} step={0.02} value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))} className="w-full" />
                                        </div>
                                        <div>
                                            <label className="font-semibold block mb-1">Dikey Kaydırma (Offset Y): %{Math.round(offsetY * 100)}</label>
                                            <input type="range" min={0} max={1} step={0.02} value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} className="w-full" />
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <button disabled={busy} onClick={() => handleApplyCrop(false)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                                        {layoutMode === "seamless" ? "🔁 Takipli Taslağı Kaydet & Üret" : "✂️ Kırpmayı Kaydet & Yeni Taslak Üret"}
                                    </button>
                                    <button disabled={busy} onClick={() => handleApplyCrop(true)} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                                        {layoutMode === "seamless"
                                            ? (process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "🔁 Kaydet + Test WhatsApp Gönder" : "🔁 Kaydet + WhatsApp Gönder")
                                            : (process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1" ? "✂️ Kaydet + Test WhatsApp Gönder" : "✂️ Kaydet + WhatsApp Gönder")}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">Düzenleyici için önce otomatik taslak oluşturun.</p>
                        )
                    )}

                    {/* %100 DETAIL TAB */}
                    {tab === "detail" && (
                        latest?.detailPath ? (
                            <div className="space-y-2">
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                    Baskı dosyasındaki gerçek piksellerin %100 yakın çekim görüntüsüdür.
                                </p>
                                <img src={`/api/demo/files/detail/${latest.id}?t=${latest.version}`} alt="%100 Detay" className="w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950" />
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">Önce otomatik taslak oluşturun.</p>
                        )
                    )}

                    {/* PPI & PERFORMANCE METRICS TAB */}
                    {tab === "ppi" && (
                        latest ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">Efektif PPI</div><div className="text-lg font-black">{latest.effectivePpi?.toFixed(1) || "-"} PPI</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">Dosya Bulma Süresi</div><div className="text-lg font-black">{latest.findMs ?? "-"} ms</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">Dosya Okuma Süresi</div><div className="text-lg font-black">{latest.readMs ?? "-"} ms</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">Taslak Oluşturma Süresi</div><div className="text-lg font-black">{latest.renderMs ?? "-"} ms</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">RAM Kullanımı (Peak)</div><div className="text-lg font-black">{latest.peakRssMb ?? "-"} MB</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">İşlemci (CPU)</div><div className="text-lg font-black">%{latest.cpuPercent ?? "-"}</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">Kaynak Dosya Boyutu</div><div className="text-lg font-black">{fmtMb(latest.sourceBytes)}</div></div>
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border"><div className="text-slate-500">Çıktı Dosya Boyutu</div><div className="text-lg font-black">{fmtMb(latest.outputBytes)}</div></div>
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    <strong>Kaynak Yol (Salt Okunur):</strong> <code>{latest.sourcePath || "-"}</code>
                                </div>
                            </div>
                        ) : <p className="text-sm text-slate-500">Önce otomatik taslak oluşturun.</p>
                    )}

                    {/* SERVER FILE TAB */}
                    {tab === "server" && (
                        <div className="space-y-3 text-xs">
                            <div className="flex gap-2">
                                <input value={skuInput} onChange={(e) => setSkuInput(e.target.value)} placeholder="SKU kodu..." className="px-3 py-1.5 rounded-lg border dark:bg-slate-800 flex-1 font-mono" />
                                <button disabled={busy} onClick={() => handleFindServerFile()} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold">SKU ile Ara</button>
                            </div>
                            {serverResult && (
                                serverResult.ok && serverResult.matches?.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="text-slate-500">Arama kaynağı: <strong>{serverResult.source}</strong> • Son indeksleme: <strong>{serverResult.lastIndexedAt || "Henüz indekslenmedi"}</strong></div>
                                        {serverResult.matches.map((m: any, idx: number) => (
                                            <div key={idx} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 space-y-1">
                                                <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-4 h-4" /> {m.fileName} ({m.format})
                                                </div>
                                                <div>Boyut: <strong>{fmtMb(m.sizeBytes)}</strong> • Piksel: <strong>{m.widthPx}×{m.heightPx}px</strong> • Renk: <strong>{m.colorSpace || "-"}</strong></div>
                                                <div className="text-[11px] text-slate-600 dark:text-slate-400 break-all">Yol: <code>{m.filePath}</code></div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 text-amber-900 dark:text-amber-200">
                                        {serverResult.error || "Eşleşen dosya bulunamadı."}
                                    </div>
                                )
                            )}
                        </div>
                    )}

                    {/* VISUAL MATCH TAB */}
                    {tab === "visual" && (
                        <div className="space-y-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-slate-600 dark:text-slate-400">
                                    SKU isimleri tutmadığında sipariş görselini Windows Server indeksindeki tasarımlarla (dHash + renk imzası) karşılaştırır.
                                </p>
                                <button disabled={busy} onClick={handleVisualMatch} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5" /> {busy ? "Taranıyor..." : "Görselden Yeniden Tara"}
                                </button>
                            </div>
                            {visualResult && !visualResult.ok && (
                                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 text-amber-900 dark:text-amber-200">
                                    {visualResult.error}
                                </div>
                            )}
                            {visualResult?.ok && (
                                <div className="space-y-2">
                                    <div className="text-slate-500">Karşılaştırılan indeksli tasarım: <strong>{visualResult.indexedWithHash}</strong></div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {visualResult.matches.map((m: any) => (
                                            <div key={m.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex gap-3">
                                                <img src={`/api/demo/files/index-thumb/${m.id}`} alt={m.fileName} className="w-24 h-24 object-cover rounded-lg border bg-slate-900 shrink-0" />
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <strong className="truncate">{m.fileName}</strong>
                                                        <span className={`px-2 py-0.5 rounded font-black shrink-0 ${m.similarity >= 85 ? "bg-emerald-600 text-white" : m.similarity >= 70 ? "bg-amber-500 text-slate-950" : "bg-slate-600 text-white"}`}>
                                                            %{m.similarity}
                                                        </span>
                                                    </div>
                                                    <div className="text-slate-500">{m.format} • {m.widthPx}×{m.heightPx}px • {fmtMb(m.sizeBytes)}</div>
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => handleGenerateDraft(false, { overrideSourcePath: m.filePath, rememberSkuMapping: false })}
                                                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                                        >
                                                            Seç &amp; Taslak Üret
                                                        </button>
                                                        <button
                                                            disabled={busy}
                                                            onClick={() => handleGenerateDraft(false, { overrideSourcePath: m.filePath, rememberSkuMapping: true })}
                                                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                                        >
                                                            Seç + SKU&apos;yu Hatırla
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* WHATSAPP TAB */}
                    {tab === "whatsapp" && (
                        <div className="space-y-4 text-xs">
                            <div className="flex flex-wrap justify-between items-center gap-2">
                                <span className="text-slate-600 dark:text-slate-400">
                                    {isDemoUi
                                        ? "DEMO MODE: Gerçek müşteriye gönderilmez."
                                        : "Görseli panoya kopyalayıp doğrudan WhatsApp sohbetine yapıştırarak (Cmd+V / Ctrl+V) müşteriye iletebilirsiniz."}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none mr-1">
                                        <input
                                            type="checkbox"
                                            checked={waIncludeLink}
                                            onChange={(e) => setWaIncludeLink(e.target.checked)}
                                            className="rounded border-slate-300"
                                        />
                                        Mesaja onay linkini de ekle
                                    </label>
                                    {latest && (
                                        <>
                                            <button
                                                type="button"
                                                disabled={copyingSheet}
                                                onClick={async () => {
                                                    const ok = await copySheetImageToClipboard(latest.id, latest.version)
                                                    if (ok) toast.success("Görsel panoya kopyalandı! WhatsApp'ta Cmd+V (Ctrl+V) ile yapıştırabilirsiniz.")
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold disabled:opacity-50"
                                            >
                                                {copyingSheet ? "Kopyalanıyor..." : "📋 Görseli Kopyala"}
                                            </button>
                                            <a
                                                href={`/api/demo/files/sheet/${latest.id}?download=1&v=${latest.version}`}
                                                download
                                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                                            >
                                                ⬇️ İndir (JPG)
                                            </a>
                                        </>
                                    )}
                                    <button disabled={busy || !latest} onClick={handleSendWhatsApp} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold">
                                        📲 Yeni Mesaj Hazırla &amp; Onay Beklemede&apos;ye Al
                                    </button>
                                </div>
                            </div>

                            {latest?.previewPath && (
                                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="font-bold text-slate-700 dark:text-slate-200">
                                            ✨ Müşteri Sunum Kartı (Ölçülü Taslak + %100 Çözünürlük Detayı Bir Arada)
                                        </div>
                                        <button
                                            type="button"
                                            disabled={copyingSheet}
                                            onClick={() => {
                                                const defaultMsg = sanitizeWaMessage(
                                                    `Merhaba ${order.customer},\n#${order.barcode || order.id} numaralı (${latest.sku} • ${latest.dimensionsRaw}) siparişinizin ölçülü baskı taslağı ve %100 çözünürlük detayı ekte yer almaktadır.\nLütfen görseli inceleyip baskı onayınızı iletir misiniz?`,
                                                    latest.approvalToken ? `${window.location.origin}/approve/${latest.approvalToken}` : null
                                                )
                                                handleCopyAndOpenWhatsApp(order.phone || "", defaultMsg, latest.id, latest.version)
                                            }}
                                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <MessageSquare className="w-3.5 h-3.5" /> {copyingSheet ? "Hazırlanıyor..." : "Görseli Kopyala & WhatsApp'ta Aç"}
                                        </button>
                                    </div>
                                    <img
                                        src={`/api/demo/files/sheet/${latest.id}?v=${latest.version}`}
                                        alt="Birleşik Müşteri Sunum Kartı"
                                        className="w-full max-h-[46vh] object-contain rounded-lg border bg-[#f7f3eb]"
                                    />
                                </div>
                            )}

                            {waLogs.map((w) => {
                                const origin = typeof window !== "undefined" ? window.location.origin : "https://dkmtakip.online"
                                const safeApprovalUrl = w.approvalUrl ? String(w.approvalUrl).replace(/https?:\/\/localhost:\d+/gi, origin) : null
                                const cleanMessage = sanitizeWaMessage(w.message || "", safeApprovalUrl)
                                return (
                                    <div key={w.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border space-y-2">
                                        <div className="flex justify-between items-center">
                                            <strong>{w.phone || "Telefon yok"} — {w.customer}</strong>
                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                                                {isDemoUi ? "DEMO" : "WHATSAPP"}
                                            </span>
                                        </div>
                                        <pre className="whitespace-pre-wrap text-[11px] bg-white dark:bg-slate-900 p-2 rounded border">{cleanMessage}</pre>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={copyingSheet}
                                                onClick={() => handleCopyAndOpenWhatsApp(w.phone || order.phone || "", cleanMessage, w.draftId || latest?.id, latest?.version)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50"
                                            >
                                                <MessageSquare className="w-3.5 h-3.5" /> Görseli Kopyala &amp; WhatsApp&apos;ta Aç
                                            </button>
                                            {safeApprovalUrl && (
                                                <a href={safeApprovalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold">
                                                    <ExternalLink className="w-3.5 h-3.5" /> Müşteri Onay Sayfası
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            {waLogs.length === 0 && <p className="text-slate-500">Henüz WhatsApp gönderim kaydı yok.</p>}
                        </div>
                    )}

                    {/* PRINT READY TAB */}
                    {tab === "print" && (
                        <div className="space-y-3 text-xs">
                            {latest?.status === "approved" ? (
                                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 space-y-3">
                                    <div className="font-bold text-emerald-800 dark:text-emerald-200">
                                        ✅ Taslak v{latest.version} Müşteri Tarafından Onaylandı ({latest.approvedByName})
                                    </div>

                                    {latest.printReadyPath && (
                                        <div className="space-y-1">
                                            <div>
                                                {isDemoUi ? "Test Baskı Dosyası:" : "Kayıtlı Baskı Dosyası:"}{" "}
                                                <code className="break-all">{latest.printReadyPath}</code>
                                            </div>
                                            <div>
                                                Boyut: <strong>{fmtMb(latest.printReadyBytes)}</strong> • SHA-256:{" "}
                                                <code>{latest.printReadySha256?.slice(0, 20)}...</code>
                                            </div>
                                        </div>
                                    )}

                                    {/* Hedef Klasör Seçimi (Ofis Ajanı / Windows Server / Masaüstü) */}
                                    {!isDemoUi && (
                                        <div className="p-3 rounded-lg bg-white/70 dark:bg-slate-900/70 border border-emerald-200 dark:border-emerald-800 space-y-2">
                                            <label className="font-bold block text-slate-700 dark:text-slate-200">
                                                📁 Baskı Dosyasını Kaydedeceğiniz Klasör (Ofis Bilgisayarı / Server)
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                <input
                                                    type="text"
                                                    value={printTargetDir}
                                                    onChange={(e) => setPrintTargetDir(e.target.value)}
                                                    placeholder="Örn: ~/Desktop/Baski veya /Volumes/DKM/BASKIYA_HAZIR (boş = varsayılan)"
                                                    className="flex-1 min-w-[260px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => handleGeneratePrint({ targetDir: printTargetDir })}
                                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                                                >
                                                    {busy ? "Kaydediliyor..." : latest.printReadyPath ? "📁 Bu Klasöre Kaydet" : "🖨️ Bu Klasöre Oluştur"}
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                <span className="text-slate-500">Hızlı seçim:</span>
                                                {[
                                                    { label: "Masaüstü / Baski", path: "~/Desktop/Baski" },
                                                    { label: "İndirilenler", path: "~/Downloads" },
                                                    { label: "Server / BASKI", path: "/Volumes/DKM/BASKI" },
                                                ].map((preset) => (
                                                    <button
                                                        key={preset.path}
                                                        type="button"
                                                        onClick={() => setPrintTargetDir(preset.path)}
                                                        className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-slate-700 dark:text-slate-200 font-medium"
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {latest.printReadyPath ? (
                                            <>
                                                <a
                                                    href={`/api/demo/files/print/${latest.id}`}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                                >
                                                    <Printer className="w-3.5 h-3.5" />{" "}
                                                    {isDemoUi ? "Onaylı Baskı TIFF Dosyasını İndir (TEST)" : "Onaylı Baskı TIFF Dosyasını İndir"}
                                                </a>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => handleGeneratePrint({ targetDir: printTargetDir, forceRegenerate: true })}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold disabled:opacity-50"
                                                >
                                                    🔄 Yeniden Üret
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                disabled={busy}
                                                onClick={() => handleGeneratePrint({ targetDir: printTargetDir })}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                            >
                                                🖨️ {isDemoUi ? "Yüksek Çözünürlüklü Test Baskı Dosyasını Oluştur" : "Yüksek Çözünürlüklü Baskı Dosyasını Oluştur"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 space-y-2">
                                    <div className="font-bold text-amber-900 dark:text-amber-200">⛔ Onaysız Baskı Dosyası Koruması Aktif</div>
                                    <p>
                                        {isDemoUi
                                            ? "Baskı dosyası yalnızca müşteri onayı verildikten sonra DKM_DEMO/PRINT_READY test klasörüne kaydedilir."
                                            : "Baskı dosyası yalnızca müşteri onayı verildikten sonra seçtiğiniz klasöre kaydedilir."}
                                    </p>
                                    {isDemoUi && (
                                        <button disabled={busy} onClick={() => handleGeneratePrint()} className="px-3 py-1.5 rounded-lg bg-slate-700 text-white font-bold">
                                            Onaysız Üretimi Dene (Engellenmeli)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
