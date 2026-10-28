"use client"

import { useState, useEffect, useRef } from "react"
import { X, Upload, Package, Trash2, FileText, Search, RefreshCw, Layers, Pencil, Check, ImageIcon, ZoomIn } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface WarehouseStockItem {
    id: number
    sku: string
    dimensions: string
    material: string
    orderNo: string | null
    source: string | null
    returnReason: string | null
    pdfPath: string | null
    imageUrl: string | null
    status: string
    usedInOrderId: number | null
    createdAt: string
}

interface WarehouseStockModalProps {
    isOpen: boolean
    onClose: () => void
}

export function WarehouseStockModal({ isOpen, onClose }: WarehouseStockModalProps) {
    const router = useRouter()
    const [stocks, setStocks] = useState<WarehouseStockItem[]>([])
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedChannel, setSelectedChannel] = useState("all")
    const [selectedStatus, setSelectedStatus] = useState("available")
    const [activeTab, setActiveTab] = useState<"list" | "upload" | "mac-watcher">("list")
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    // Image preview / lightbox modal state
    const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null)

    // Edit modal state
    const [editingItem, setEditingItem] = useState<WarehouseStockItem | null>(null)
    const [editForm, setEditForm] = useState({
        sku: "",
        dimensions: "",
        material: "",
        orderNo: "",
        source: "",
        returnReason: "",
        imageUrl: ""
    })

    const handleStartEdit = (item: WarehouseStockItem) => {
        setEditingItem(item)
        setEditForm({
            sku: item.sku || "",
            dimensions: item.dimensions || "",
            material: item.material || "",
            orderNo: item.orderNo || "",
            source: item.source || "",
            returnReason: item.returnReason || "",
            imageUrl: item.imageUrl || ""
        })
    }

    const handleSaveEdit = async () => {
        if (!editingItem) return
        try {
            const res = await fetch("/api/warehouse-stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: editingItem.id,
                    sku: editForm.sku.trim(),
                    dimensions: editForm.dimensions.trim(),
                    material: editForm.material.trim(),
                    orderNo: editForm.orderNo.trim() || null,
                    source: editForm.source.trim() || null,
                    returnReason: editForm.returnReason.trim() || null,
                    imageUrl: editForm.imageUrl.trim() || null
                })
            })
            if (res.ok) {
                toast.success("Depo stoğu güncellendi.")
                setStocks(stocks.map(s => s.id === editingItem.id ? { ...s, ...editForm } : s))
                setEditingItem(null)
                router.refresh()
            } else {
                toast.error("Güncellenirken hata oluştu.")
            }
        } catch (e: any) {
            toast.error("Hata: " + e.message)
        }
    }

    const fetchStocks = async () => {
        setLoading(true)
        try {
            const res = await fetch("/api/warehouse-stock")
            const data = await res.json()
            if (data.success) {
                const list = data.stocks || []
                setStocks(list)
                return list.length
            }
            return 0
        } catch (e) {
            toast.error("Depo stokları yüklenemedi.")
            return 0
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (isOpen) {
            fetchStocks().then((count) => {
                if (count === 0) {
                    setActiveTab("upload")
                }
            })
        }
    }, [isOpen])

    const handleFiles = async (files: FileList | File[]) => {
        const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".pdf"))
        if (pdfFiles.length === 0) {
            toast.error("Lütfen en az bir PDF dosyası seçin (veya klasörün içinde PDF olduğundan emin olun).")
            return
        }

        setUploading(true)
        const total = pdfFiles.length
        let addedTotal = 0
        const CHUNK_SIZE = 5
        const fileErrors: string[] = []

        try {
            for (let i = 0; i < total; i += CHUNK_SIZE) {
                const chunk = pdfFiles.slice(i, i + CHUNK_SIZE)
                const currentCount = Math.min(i + chunk.length, total)
                const percent = Math.round((currentCount / total) * 100)
                setUploadProgress(`Okunuyor ve Ekleniyor: ${currentCount} / ${total} PDF (%${percent})...`)

                const formData = new FormData()
                for (const f of chunk) {
                    formData.append("file", f)
                }

                const res = await fetch("/api/warehouse-stock", {
                    method: "POST",
                    body: formData
                })

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({ error: `Sunucu hatası (${res.status})` }))
                    throw new Error(errData.error || `Yükleme başarısız oldu (${res.status})`)
                }

                const data = await res.json()
                if (data.success) {
                    if (typeof data.count === "number") {
                        addedTotal += data.count
                    }
                    if (data.results) {
                        for (const r of data.results) {
                            if (!r.success) {
                                fileErrors.push(`${r.fileName}: ${r.error || "Okunamadı"}`)
                            }
                        }
                    }
                }
            }

            if (addedTotal > 0) {
                toast.success(`Harika! ${addedTotal} adet ürün depoya başarıyla eklendi!`)
                if (fileErrors.length > 0) {
                    toast.warning(`${fileErrors.length} dosya eklenemedi: ` + fileErrors.slice(0, 2).join(", "))
                }
                await fetchStocks()
                router.refresh()
                setActiveTab("list")
            } else {
                toast.error(fileErrors.length > 0
                    ? `Hiçbir ürün eklenemedi: ${fileErrors[0]}`
                    : "Hiçbir ürün eklenemedi! PDF'lerden SKU veya Sipariş No okunamadı.")
            }
        } catch (e: any) {
            toast.error("Yükleme sırasında hata oluştu: " + e.message)
        } finally {
            setUploading(false)
            setUploadProgress(null)
            if (fileInputRef.current) fileInputRef.current.value = ""
            if (folderInputRef.current) folderInputRef.current.value = ""
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm("Bu depo stok kaydını silmek istediğinize emin misiniz?")) return
        try {
            const res = await fetch(`/api/warehouse-stock?id=${id}`, { method: "DELETE" })
            if (res.ok) {
                toast.success("Kayıt silindi.")
                setStocks(stocks.filter(s => s.id !== id))
                router.refresh()
            }
        } catch (e) {
            toast.error("Silinirken hata oluştu.")
        }
    }

    const handleToggleStatus = async (item: WarehouseStockItem) => {
        const newStatus = item.status === "available" ? "used" : "available"
        try {
            const res = await fetch("/api/warehouse-stock", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, status: newStatus })
            })
            if (res.ok) {
                toast.success(newStatus === "used" ? "Ürün 'Kullanıldı' olarak işaretlendi." : "Ürün 'Depoda Hazır' olarak işaretlendi.")
                setStocks(stocks.map(s => s.id === item.id ? { ...s, status: newStatus } : s))
                router.refresh()
            }
        } catch (e) {
            toast.error("Durum güncellenirken hata oluştu.")
        }
    }

    if (!isOpen) return null

    // Filter stocks
    const filteredStocks = stocks.filter(item => {
        if (selectedStatus !== "all" && item.status !== selectedStatus) return false
        if (selectedChannel !== "all" && (item.source || "").toLowerCase() !== selectedChannel.toLowerCase()) return false
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim()
            const matchesSku = (item.sku || "").toLowerCase().includes(q)
            const matchesOrder = (item.orderNo || "").toLowerCase().includes(q)
            const matchesMat = (item.material || "").toLowerCase().includes(q)
            const matchesDim = (item.dimensions || "").toLowerCase().includes(q)
            const matchesReason = (item.returnReason || "").toLowerCase().includes(q)
            if (!matchesSku && !matchesOrder && !matchesMat && !matchesDim && !matchesReason) return false
        }
        return true
    })

    const availableCount = stocks.filter(s => s.status === "available").length
    const usedCount = stocks.filter(s => s.status === "used").length

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <Package className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                Depo Stokları & İade Yönetimi
                                <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                                    {availableCount} Hazır Stok
                                </span>
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Depodaki iade/hazır ürünlerinizi yönetin. Yeni sipariş geldiğinde sistem otomatik eşleştirir.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchStocks}
                            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Yenile"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 gap-2 bg-white dark:bg-slate-900">
                    <button
                        onClick={() => setActiveTab("list")}
                        className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                            activeTab === "list"
                                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        Depodaki Stoklar ({stocks.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("upload")}
                        className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                            activeTab === "upload"
                                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                    >
                        <Upload className="w-4 h-4" />
                        PDF / Klasör Yükle
                    </button>
                    <button
                        onClick={() => setActiveTab("mac-watcher")}
                        className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                            activeTab === "mac-watcher"
                                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                    >
                        💻 Mac Otomatik İzleyici
                    </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 dark:bg-slate-900/40">
                    {/* TAB 1: LIST */}
                    {activeTab === "list" && (
                        <div className="space-y-4">
                            {/* Filter Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
                                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                                    <Search className="w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Ürün kodu (SKU), sipariş no, ölçü veya doku ara..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full text-xs bg-transparent border-none outline-hidden text-slate-900 dark:text-white"
                                    />
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Channel Filter */}
                                    <select
                                        value={selectedChannel}
                                        onChange={(e) => setSelectedChannel(e.target.value)}
                                        className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                                    >
                                        <option value="all">Tüm Kanallar</option>
                                        <option value="wayfair">Wayfair</option>
                                        <option value="printmarkt">PrintMarkt</option>
                                        <option value="woocommerce">WooCommerce</option>
                                        <option value="etsy">Etsy</option>
                                        <option value="shopify">Shopify 1</option>
                                        <option value="shopify_2">Shopify 2</option>
                                    </select>

                                    {/* Status Filter */}
                                    <select
                                        value={selectedStatus}
                                        onChange={(e) => setSelectedStatus(e.target.value)}
                                        className="text-xs py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                                    >
                                        <option value="available">Hazır / Boşta ({availableCount})</option>
                                        <option value="used">Kullanıldı ({usedCount})</option>
                                        <option value="all">Tümü ({stocks.length})</option>
                                    </select>
                                </div>
                            </div>

                            {/* Table */}
                            {loading ? (
                                <div className="flex items-center justify-center p-12 text-slate-400 text-xs gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Yükleniyor...
                                </div>
                            ) : filteredStocks.length === 0 ? (
                                <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Henüz kayıtlı depo stoğu yok</p>
                                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                                        &quot;PDF / Klasör Yükle&quot; sekmesinden Mac&apos;inizdeki Return Form PDF&apos;lerini topluca yükleyebilirsiniz.
                                    </p>
                                    <button
                                        onClick={() => setActiveTab("upload")}
                                        className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                                    >
                                        <Upload className="w-4 h-4" /> PDF Yüklemeye Git
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 font-bold uppercase border-b border-slate-100 dark:border-slate-700">
                                            <tr>
                                                <th className="py-3 px-3 w-16 text-center">Görsel</th>
                                                <th className="py-3 px-4">Ürün Kodu (SKU)</th>
                                                <th className="py-3 px-4">Ölçü</th>
                                                <th className="py-3 px-4">Doku / Kağıt</th>
                                                <th className="py-3 px-4">Kanal / İade Nedeni</th>
                                                <th className="py-3 px-4">Sipariş No</th>
                                                <th className="py-3 px-4">Durum</th>
                                                <th className="py-3 px-4 text-right">İşlemler</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {filteredStocks.map((item) => (
                                                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-750 transition-colors">
                                                    <td className="py-2 px-3 text-center">
                                                        <div
                                                            onClick={() => {
                                                                const imgSrc = item.imageUrl || `/api/warehouse-stock/image?id=${item.id}`;
                                                                setPreviewImage({ src: imgSrc, title: `${item.sku} - #${item.orderNo || ""}` });
                                                            }}
                                                            className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mx-auto cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group relative"
                                                            title="Görseli büyütmek için tıklayın"
                                                        >
                                                            <img
                                                                src={item.imageUrl || `/api/warehouse-stock/image?id=${item.id}`}
                                                                alt={item.sku || "Ürün"}
                                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLElement;
                                                                    target.style.display = "none";
                                                                    const parent = target.parentElement;
                                                                    if (parent && !parent.querySelector(".fallback-icon")) {
                                                                        const icon = document.createElement("div");
                                                                        icon.className = "fallback-icon text-slate-400 text-sm font-bold flex items-center justify-center w-full h-full";
                                                                        icon.innerHTML = "📦";
                                                                        parent.appendChild(icon);
                                                                    }
                                                                }}
                                                            />
                                                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                                <ZoomIn className="w-4 h-4" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                                                        {item.sku}
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                                                        {item.dimensions}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 px-2 py-0.5 rounded text-[11px] font-medium">
                                                            {item.material}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${
                                                                (item.source || "").toLowerCase().includes("wayfair")
                                                                    ? "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200"
                                                                    : (item.source || "").toLowerCase().includes("printmarkt")
                                                                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200"
                                                                        : (item.source || "").toLowerCase().includes("woo")
                                                                            ? "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/60 dark:text-fuchsia-200"
                                                                            : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                                                            }`}>
                                                                {item.source || "Bilinmiyor"}
                                                            </span>
                                                        </div>
                                                        {item.returnReason && (
                                                            <div className="text-[10px] text-slate-400 truncate max-w-[180px] mt-0.5">
                                                                {item.returnReason}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                                                        #{item.orderNo || "-"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <button
                                                            onClick={() => handleToggleStatus(item)}
                                                            className={`cursor-pointer px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                                                item.status === "available"
                                                                    ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200"
                                                                    : "bg-slate-100 dark:bg-slate-700 text-slate-500 border-slate-300 dark:border-slate-600 hover:bg-slate-200"
                                                            }`}
                                                        >
                                                            {item.status === "available" ? "📦 Hazır Stok" : "✓ Kullanıldı"}
                                                        </button>
                                                    </td>
                                                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                                                        {item.pdfPath && (
                                                            <a
                                                                href={`/api/warehouse-stock/pdf?id=${item.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
                                                                title="PDF İade Formunu Aç"
                                                            >
                                                                <FileText className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                        <button
                                                            onClick={() => handleStartEdit(item)}
                                                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                                                            title="Düzenle"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded transition-colors"
                                                            title="Sil"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: BULK UPLOAD (DRAG & DROP / FOLDER SELECT) */}
                    {activeTab === "upload" && (
                        <div className="max-w-2xl mx-auto space-y-6">
                            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
                                <Package className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="block font-bold mb-1">Mac Kullanıcıları İçin En Kolay Yöntem:</strong>
                                    Mac&apos;inizdeki Return Form PDF&apos;lerinin olduğu klasörü doğrudan bu alana sürükleyip bırakabilirsiniz.
                                    Sistem her bir PDF&apos;in içinden <strong>Ürün Kodu (SKU), Ölçü, Kağıt Türü (Doku), İade Sipariş No ve Kanalı</strong> otomatik okuyup kaydedecektir.
                                </div>
                            </div>

                            {/* Drop Zone */}
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    if (e.dataTransfer.files) {
                                        handleFiles(e.dataTransfer.files)
                                    }
                                }}
                                className="border-2 border-dashed border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 bg-white dark:bg-slate-800/50 rounded-2xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-4 shadow-sm"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                    <Upload className="w-8 h-8" />
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                                        PDF Dosyalarını Buraya Sürükleyin
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        veya bilgisayarınızdan seçmek için tıklayın (Tek tek veya çoklu PDF)
                                    </p>
                                </div>

                                {uploading ? (
                                    <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold animate-pulse">
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        <span>{uploadProgress || "Yükleniyor..."}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                                        >
                                            PDF Dosyalarını Seç
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => folderInputRef.current?.click()}
                                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors border border-slate-200 dark:border-slate-600"
                                        >
                                            Tüm Klasörü Seç 📁
                                        </button>
                                    </div>
                                )}

                                {/* Hidden file inputs */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf"
                                    className="hidden"
                                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                                />
                                <input
                                    ref={folderInputRef}
                                    type="file"
                                    // @ts-expect-error webkitdirectory is a non-standard attribute
                                    webkitdirectory=""
                                    directory=""
                                    multiple
                                    className="hidden"
                                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                                />
                            </div>
                        </div>
                    )}

                    {/* TAB 3: MAC WATCHER SCRIPT GUIDE */}
                    {activeTab === "mac-watcher" && (
                        <div className="max-w-2xl mx-auto space-y-4">
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 space-y-4 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <span>💻</span> Mac Otomatik Klasör İzleyici (Background Watcher)
                                </h3>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                    Eğer panele girip dosya yüklemekle bile uğraşmak istemiyorsanız, Mac&apos;inizdeki klasöre her yeni Return Form PDF&apos;i indiğinde dkmtakip&apos;e otomatik aktaracak küçük bir yardımcı script mevcuttur.
                                </p>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                                        Mac Terminalinde Çalıştırılacak Komut:
                                    </label>
                                    <div className="bg-slate-950 text-slate-100 font-mono text-xs p-3 rounded-lg overflow-x-auto border border-slate-800">
                                        node scripts/warehouse-watcher.js &quot;/Users/mesutsogutlu/Desktop/Iadeler&quot;
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        (Tırnak içine PDF&apos;lerinizin bulunduğu Mac klasörünün yolunu yazmanız yeterlidir.)
                                    </p>
                                </div>

                                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">Nasıl Çalışır?</div>
                                    <div>1. Klasördeki mevcut tüm PDF&apos;leri tek seferde tarar ve ekler.</div>
                                    <div>2. Klasöre yeni bir PDF dosyası kaydettiğiniz anda anında algılar ve dkmtakip&apos;e gönderir.</div>
                                    <div>3. Eşleşen ürünler için sipariş kartında anında <strong>&quot;DEPODA STOK!&quot;</strong> uyarısı belirir.</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 text-xs text-slate-500">
                    <div>
                        Toplam <strong>{stocks.length}</strong> ürün ({availableCount} hazır, {usedCount} kullanıldı)
                    </div>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold transition-colors"
                    >
                        Kapat
                    </button>
                </div>
            </div>

            {/* EDIT STOCK MODAL */}
            {editingItem && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <Pencil className="w-4 h-4 text-emerald-600" />
                                Depo Stoğunu Düzenle
                            </h3>
                            <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Ürün Görseli (URL veya CDN Linki)</label>
                                <div className="flex gap-2 items-center">
                                    {(editForm.imageUrl || editingItem.imageUrl) ? (
                                        <img
                                            src={editForm.imageUrl || editingItem.imageUrl || `/api/warehouse-stock/image?id=${editingItem.id}`}
                                            alt="Önizleme"
                                            className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-400">
                                            <ImageIcon className="w-4 h-4" />
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        value={editForm.imageUrl}
                                        onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                                        placeholder="https://... (Görsel URL)"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Ürün Kodu (SKU)</label>
                                <input
                                    type="text"
                                    value={editForm.sku}
                                    onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="Örn: YZ1034"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Ölçü (Genişlik x Yükseklik)</label>
                                <input
                                    type="text"
                                    value={editForm.dimensions}
                                    onChange={(e) => setEditForm({ ...editForm, dimensions: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="Örn: 90'' W x 60'' H veya 250x150 cm"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Kağıt Türü / Doku</label>
                                <input
                                    type="text"
                                    value={editForm.material}
                                    onChange={(e) => setEditForm({ ...editForm, material: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="Örn: Non Woven, Peel & Stick, Textured"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">İade Sipariş No</label>
                                <input
                                    type="text"
                                    value={editForm.orderNo}
                                    onChange={(e) => setEditForm({ ...editForm, orderNo: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="Örn: CS673263650"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Kanal / Kaynak Platform</label>
                                <input
                                    type="text"
                                    value={editForm.source}
                                    onChange={(e) => setEditForm({ ...editForm, source: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="Örn: Wayfair, PrintMarkt, WooCommerce, Etsy"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Müşteri / İade Nedeni</label>
                                <input
                                    type="text"
                                    value={editForm.returnReason}
                                    onChange={(e) => setEditForm({ ...editForm, returnReason: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                    placeholder="Örn: Jim Pidcock - WayFair"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setEditingItem(null)}
                                className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                            >
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LIGHTBOX / IMAGE PREVIEW MODAL */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-70 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="relative max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate pr-4">
                                {previewImage.title || "Ürün Görseli"}
                            </h4>
                            <button
                                onClick={() => setPreviewImage(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 flex items-center justify-center bg-slate-950/70 overflow-auto">
                            <img
                                src={previewImage.src}
                                alt={previewImage.title}
                                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
