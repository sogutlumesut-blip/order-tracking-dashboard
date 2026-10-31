"use client"

import { useState } from "react"
import { X, Loader2, Check, Package, Printer, Droplet, ScrollText, AlertCircle, Sparkles, Plus, Minus, Trash2 } from "lucide-react"
import { toast } from "sonner"

export interface MaterialItemDefinition {
    id: string
    category: 'paper' | 'hp' | 'epson'
    name: string
    group: string
    dimensions?: string
    colorHex?: string
    unit: string
    defaultQuantity?: number
}

export const MATERIAL_CATALOG: MaterialItemDefinition[] = [
    // --- KAĞIT SİPARİŞİ ---
    { id: "paper-nw-108", category: "paper", group: "Kağıt", name: "Non-Woven", dimensions: "108 cm", unit: "Rulo" },
    { id: "paper-nw-151", category: "paper", group: "Kağıt", name: "Non-Woven", dimensions: "151 cm", unit: "Rulo" },
    { id: "paper-tex-106", category: "paper", group: "Kağıt", name: "Textured", dimensions: "106 cm", unit: "Rulo" },
    { id: "paper-ps-105", category: "paper", group: "Kağıt", name: "Peel and Stick", dimensions: "105 cm", unit: "Rulo" },
    { id: "paper-ps-160", category: "paper", group: "Kağıt", name: "Peel and Stick", dimensions: "160 cm", unit: "Rulo" },
    { id: "paper-cps-106", category: "paper", group: "Kağıt", name: "Canvas Peel and Stick", dimensions: "106 cm", unit: "Rulo" },
    { id: "paper-cps-150", category: "paper", group: "Kağıt", name: "Canvas Peel and Stick", dimensions: "150 cm", unit: "Rulo" },
    { id: "paper-dt-142", category: "paper", group: "Kağıt", name: "Deluxe Textured", dimensions: "142 cm", unit: "Rulo" },
    { id: "paper-pt-142", category: "paper", group: "Kağıt", name: "Premium Textured", dimensions: "142 cm", unit: "Rulo" },

    // --- HP MAKİNA BOYA SİPARİŞİ ---
    { id: "hp-cyan", category: "hp", group: "HP Makina", name: "Cyan", colorHex: "#00AEEF", unit: "Kutu" },
    { id: "hp-magenta", category: "hp", group: "HP Makina", name: "Magenta", colorHex: "#EC008C", unit: "Kutu" },
    { id: "hp-yellow", category: "hp", group: "HP Makina", name: "Yellow", colorHex: "#FACC15", unit: "Kutu" },
    { id: "hp-black", category: "hp", group: "HP Makina", name: "Black", colorHex: "#18181B", unit: "Kutu" },
    { id: "hp-light-cyan", category: "hp", group: "HP Makina", name: "Light Cyan", colorHex: "#7DD3FC", unit: "Kutu" },
    { id: "hp-light-magenta", category: "hp", group: "HP Makina", name: "Light Macenta", colorHex: "#F472B6", unit: "Kutu" },
    { id: "hp-optimizer", category: "hp", group: "HP Makina", name: "Optimizer", colorHex: "#94A3B8", unit: "Kutu" },
    { id: "hp-overcoat", category: "hp", group: "HP Makina", name: "Overcoat", colorHex: "#CBD5E1", unit: "Kutu" },
    { id: "hp-maint-cart", category: "hp", group: "HP Makina", name: "Maintenance Cartridge", colorHex: "#64748B", unit: "Adet" },
    { id: "hp-ink-collection", category: "hp", group: "HP Makina", name: "Ink Collection Unit", colorHex: "#475569", unit: "Adet" },

    // --- EPSON MAKİNA BOYA SİPARİŞİ ---
    { id: "epson-orange", category: "epson", group: "Epson Makina", name: "Orange", colorHex: "#EA580C", unit: "Kutu" },
    { id: "epson-light-black", category: "epson", group: "Epson Makina", name: "Light Black", colorHex: "#64748B", unit: "Kutu" },
    { id: "epson-black", category: "epson", group: "Epson Makina", name: "Black", colorHex: "#18181B", unit: "Kutu" },
    { id: "epson-cyan", category: "epson", group: "Epson Makina", name: "Cyan", colorHex: "#0284C7", unit: "Kutu" },
    { id: "epson-magenta", category: "epson", group: "Epson Makina", name: "Magenta", colorHex: "#DB2777", unit: "Kutu" },
    { id: "epson-yellow", category: "epson", group: "Epson Makina", name: "Yellow", colorHex: "#EAB308", unit: "Kutu" },
    { id: "epson-red", category: "epson", group: "Epson Makina", name: "Red", colorHex: "#DC2626", unit: "Kutu" },
    { id: "epson-light-cyan", category: "epson", group: "Epson Makina", name: "Light Cyan", colorHex: "#38BDF8", unit: "Kutu" },
    { id: "epson-light-magenta", category: "epson", group: "Epson Makina", name: "Light Magenta", colorHex: "#F472B6", unit: "Kutu" },
    { id: "epson-cleaning", category: "epson", group: "Epson Makina", name: "Cleaning", colorHex: "#06B6D4", unit: "Kutu" },
    { id: "epson-stick", category: "epson", group: "Epson Makina", name: "Stick (Temizleme Çubuğu)", colorHex: "#8B5CF6", unit: "Paket" },
]

export function generateMaterialSvg(item: MaterialItemDefinition): string {
    const isPaper = item.category === 'paper'
    const isHp = item.category === 'hp'
    const accent = item.colorHex || (isPaper ? '#38BDF8' : isHp ? '#EC4899' : '#F97316')
    const badgeLabel = isPaper ? 'KAĞIT / RULO' : isHp ? 'HP MAKİNA BOYASI' : 'EPSON MAKİNA BOYASI'
    const subText = item.dimensions ? `En: ${item.dimensions}` : (item.colorHex ? 'Orijinal Mürekkep' : 'Sarf Malzeme')

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
        <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0f172a" />
                <stop offset="100%" stop-color="#1e293b" />
            </linearGradient>
            <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${accent}" stop-opacity="0.25" />
                <stop offset="100%" stop-color="${accent}" stop-opacity="0.05" />
            </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#bg)" rx="16" />
        <rect x="12" y="12" width="376" height="236" rx="12" fill="url(#glow)" stroke="${accent}" stroke-opacity="0.4" stroke-width="2" />
        
        <circle cx="200" cy="85" r="38" fill="${accent}" fill-opacity="0.2" />
        <circle cx="200" cy="85" r="24" fill="${accent}" />

        <rect x="110" y="145" width="180" height="22" rx="11" fill="${accent}" fill-opacity="0.25" />
        <text x="200" y="160" fill="${accent}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="800" text-anchor="middle" letter-spacing="1">${badgeLabel}</text>

        <text x="200" y="196" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="800" text-anchor="middle">${item.name}</text>
        <text x="200" y="222" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" text-anchor="middle">${subText}</text>
    </svg>
    `.trim()

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

interface MaterialOrderModalProps {
    isOpen: boolean
    onClose: () => void
    onCreate: (orderPayload: any) => Promise<void>
    currentUserName?: string
}

export function MaterialOrderModal({ isOpen, onClose, onCreate, currentUserName = "Atölye" }: MaterialOrderModalProps) {
    // Map of item.id -> quantity (if selected)
    const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
    const [note, setNote] = useState("")
    const [activeTab, setActiveTab] = useState<'all' | 'paper' | 'hp' | 'epson'>('all')
    const [isLoading, setIsLoading] = useState(false)

    if (!isOpen) return null

    const toggleItem = (itemId: string) => {
        setSelectedItems(prev => {
            const next = { ...prev }
            if (next[itemId]) {
                delete next[itemId]
            } else {
                next[itemId] = 1
            }
            return next
        })
    }

    const setQuantity = (itemId: string, qty: number) => {
        if (qty <= 0) {
            setSelectedItems(prev => {
                const next = { ...prev }
                delete next[itemId]
                return next
            })
            return
        }
        setSelectedItems(prev => ({
            ...prev,
            [itemId]: Math.min(99, qty)
        }))
    }

    const clearAll = () => {
        setSelectedItems({})
        setNote("")
    }

    const selectedCount = Object.keys(selectedItems).length
    const totalUnits = Object.values(selectedItems).reduce((sum, q) => sum + q, 0)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (selectedCount === 0) {
            toast.error("Lütfen sipariş vermek için en az 1 malzeme seçin.")
            return
        }

        setIsLoading(true)

        try {
            // Build items list
            const items = Object.entries(selectedItems).map(([id, qty]) => {
                const catalogItem = MATERIAL_CATALOG.find(i => i.id === id)!
                const displayName = catalogItem.dimensions 
                    ? `${catalogItem.name} ${catalogItem.dimensions}` 
                    : catalogItem.name

                const materialCategory = catalogItem.category === 'paper' 
                    ? 'Kağıt' 
                    : catalogItem.category === 'hp' 
                        ? 'HP Makina Boyası' 
                        : 'Epson Makina Boyası'

                return {
                    name: displayName,
                    sku: `MLZ-${catalogItem.id.toUpperCase()}`,
                    quantity: qty,
                    material: materialCategory,
                    dimensions: catalogItem.dimensions || "-",
                    productNote: `${qty} ${catalogItem.unit} talep edildi.`,
                    image_src: generateMaterialSvg(catalogItem)
                }
            })

            const primaryItemName = items[0]?.name || "Malzeme"
            const extraCountText = items.length > 1 ? ` (+${items.length - 1} çeşit)` : ""

            const orderPayload = {
                customer: `📦 MALZEME SİPARİŞİ\nTalep Eden: ${currentUserName}`,
                status: 'pending_woo', // Bekliyor (DKM)
                source: 'malzeme',
                note: note.trim() || `Malzeme Siparişi: ${items.map(i => `${i.name} (${i.quantity} ad.)`).join(', ')}`,
                labels: ['Malzeme', 'DKM'],
                items: items,
                total: "0.00 ₺"
            }

            // Close modal immediately
            onClose()
            clearAll()
            setIsLoading(false)

            // Submit
            setTimeout(() => {
                onCreate(orderPayload).catch(err => {
                    toast.error("Sipariş verilirken hata oluştu: " + (err?.message || "Bilinmeyen hata"))
                })
            }, 50)

        } catch (err: any) {
            console.error(err)
            toast.error(err?.message || "Malzeme siparişi oluşturulamadı.")
            setIsLoading(false)
        }
    }

    const filteredCatalog = activeTab === 'all' 
        ? MATERIAL_CATALOG 
        : MATERIAL_CATALOG.filter(i => i.category === activeTab)

    const paperItems = filteredCatalog.filter(i => i.category === 'paper')
    const hpItems = filteredCatalog.filter(i => i.category === 'hp')
    const epsonItems = filteredCatalog.filter(i => i.category === 'epson')

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent dark:from-amber-950/30 dark:via-orange-950/20 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                            <Package className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                Malzeme Siparişi Oluştur
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                    Bekliyor (DKM)
                                </span>
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                İhtiyacınız olan kağıt ve boyaları tikleyip adet belirleyin; sipariş doğrudan Bekliyor (DKM) paneline düşecektir.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Filter Tabs & Quick Actions */}
                <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={`px-3 py-1 rounded-md font-semibold transition-all ${activeTab === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                        >
                            Tümü ({MATERIAL_CATALOG.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('paper')}
                            className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1 ${activeTab === 'paper' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                        >
                            <ScrollText className="w-3.5 h-3.5 text-blue-500" />
                            Kağıtlar
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('hp')}
                            className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1 ${activeTab === 'hp' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                        >
                            <Droplet className="w-3.5 h-3.5 text-pink-500" />
                            HP Boya
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('epson')}
                            className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1 ${activeTab === 'epson' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                        >
                            <Printer className="w-3.5 h-3.5 text-orange-500" />
                            Epson Boya
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedCount > 0 && (
                            <button
                                type="button"
                                onClick={clearAll}
                                className="text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 font-semibold hover:underline"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Seçimleri Temizle
                            </button>
                        )}
                        <span className="font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-md">
                            {selectedCount} Çeşit ({totalUnits} Adet/Rulo) Seçildi
                        </span>
                    </div>
                </div>

                {/* Content - Scrollable Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
                    
                    {/* SECTION 1: KAĞIT SİPARİŞİ */}
                    {paperItems.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                                <ScrollText className="w-4 h-4 text-blue-600" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                    Kağıt Siparişi
                                </h3>
                                <span className="text-[11px] text-slate-400 font-medium">({paperItems.length} çeşit)</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {paperItems.map(item => {
                                    const isSelected = !!selectedItems[item.id]
                                    const qty = selectedItems[item.id] || 1

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleItem(item.id)}
                                            className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected 
                                                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 shadow-xs' 
                                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {/* Checkbox */}
                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                                    isSelected 
                                                        ? 'bg-blue-600 border-blue-600 text-white' 
                                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                                }`}>
                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                                        {item.name}
                                                    </p>
                                                    {item.dimensions && (
                                                        <span className="inline-block mt-0.5 text-[10px] font-black px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                                            En: {item.dimensions}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Quantity Stepper */}
                                            {isSelected && (
                                                <div 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-lg p-0.5 shadow-2xs shrink-0"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(item.id, qty - 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    >
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="w-6 text-center text-xs font-black text-blue-700 dark:text-blue-300">
                                                        {qty}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(item.id, qty + 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* SECTION 2: HP MAKİNA İÇİN BOYA SİPARİŞİ */}
                    {hpItems.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                                <Droplet className="w-4 h-4 text-pink-600" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                    Boya Siparişi — HP Makina İçin
                                </h3>
                                <span className="text-[11px] text-slate-400 font-medium">({hpItems.length} çeşit)</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {hpItems.map(item => {
                                    const isSelected = !!selectedItems[item.id]
                                    const qty = selectedItems[item.id] || 1

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleItem(item.id)}
                                            className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected 
                                                    ? 'border-pink-600 bg-pink-50/60 dark:bg-pink-950/40 shadow-xs' 
                                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {/* Checkbox */}
                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                                    isSelected 
                                                        ? 'bg-pink-600 border-pink-600 text-white' 
                                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                                }`}>
                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </div>

                                                {/* Color circle preview */}
                                                {item.colorHex && (
                                                    <span 
                                                        className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shrink-0 shadow-2xs"
                                                        style={{ backgroundColor: item.colorHex }}
                                                    />
                                                )}

                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                                        {item.name}
                                                    </p>
                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                        {item.unit}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Quantity Stepper */}
                                            {isSelected && (
                                                <div 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-pink-300 dark:border-pink-700 rounded-lg p-0.5 shadow-2xs shrink-0"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(item.id, qty - 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    >
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="w-6 text-center text-xs font-black text-pink-700 dark:text-pink-300">
                                                        {qty}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(item.id, qty + 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* SECTION 3: EPSON MAKİNA İÇİN BOYA SİPARİŞİ */}
                    {epsonItems.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-800">
                                <Printer className="w-4 h-4 text-orange-600" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                    Boya Siparişi — Epson Makina İçin
                                </h3>
                                <span className="text-[11px] text-slate-400 font-medium">({epsonItems.length} çeşit)</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {epsonItems.map(item => {
                                    const isSelected = !!selectedItems[item.id]
                                    const qty = selectedItems[item.id] || 1

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleItem(item.id)}
                                            className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected 
                                                    ? 'border-orange-600 bg-orange-50/60 dark:bg-orange-950/40 shadow-xs' 
                                                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-950'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {/* Checkbox */}
                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                                    isSelected 
                                                        ? 'bg-orange-600 border-orange-600 text-white' 
                                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                                }`}>
                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </div>

                                                {/* Color circle preview */}
                                                {item.colorHex && (
                                                    <span 
                                                        className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shrink-0 shadow-2xs"
                                                        style={{ backgroundColor: item.colorHex }}
                                                    />
                                                )}

                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                                        {item.name}
                                                    </p>
                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                        {item.unit}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Quantity Stepper */}
                                            {isSelected && (
                                                <div 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-orange-300 dark:border-orange-700 rounded-lg p-0.5 shadow-2xs shrink-0"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(item.id, qty - 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    >
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="w-6 text-center text-xs font-black text-orange-700 dark:text-orange-300">
                                                        {qty}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuantity(item.id, qty + 1)}
                                                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* SECTION 4: NOT ALANI (ACİL DURUM / EKSTRA TALEPLER) */}
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                                Sipariş Notu & Acil Durum Açıklaması
                            </span>
                            <span className="text-[11px] font-normal text-slate-400">İsteğe bağlı</span>
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            placeholder="Varsa acil durum notunuzu, aciliyet derecesini veya yukarıda listelenmeyen ekstra malzeme/açıklamayı buraya yazabilirsiniz..."
                            className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white dark:bg-slate-950 transition-all resize-none shadow-2xs"
                        />
                        <p className="text-[11px] text-slate-400">
                            💡 Bu nota yazdığınız bilgiler, Kanban kartı üzerinde belirgin sarı uyarı kutusunda görünecektir.
                        </p>
                    </div>

                    {/* Bottom Action Footer (Inside form) */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            Hedef Sütun: <strong className="text-slate-800 dark:text-slate-200 font-bold">Bekliyor (DKM)</strong>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="px-4 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors"
                            >
                                Vazgeç
                            </button>

                            <button
                                type="submit"
                                disabled={selectedCount === 0 || isLoading}
                                className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Sipariş Gönderiliyor...</span>
                                    </>
                                ) : (
                                    <>
                                        <Package className="w-4 h-4" />
                                        <span>Malzeme Siparişini Ver ({selectedCount} Çeşit)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
