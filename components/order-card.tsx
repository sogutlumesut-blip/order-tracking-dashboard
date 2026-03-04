import { useState, useEffect } from "react"

import { Order } from "../data/mock-orders"
import Image from "next/image"
import { Calendar, Package, AlertCircle, User, Truck, Clock, AlertTriangle } from "lucide-react"
import { getColorClasses } from "@/lib/colors"

interface OrderCardProps {
    order: Order
    onClick: () => void
    onPrefetch?: () => void // New callback for hover pre-fetching
    tags: { id: string; name: string; color: string | null }[]
    // New Props for Bulk Selection
    selected?: boolean
    onSelect?: (selected: boolean) => void
    selectionMode?: boolean
}

export function OrderCard({ order, onClick, onPrefetch, tags, selected = false, onSelect, selectionMode = false }: OrderCardProps) {
    // We use the first item's image as the main visual
    const mainImage = order.items[0]?.image_src?.split('|')[0]

    // Check for "Stale" printing orders (User Request: 2 days in "BASKI")
    // Use state to avoid hydration mismatch (server time vs client time)
    const [isStuck, setIsStuck] = useState(false)
    const [daysSinceUpdate, setDaysSinceUpdate] = useState(0)

    const isPaymentFailed = order.labels.includes('Ödeme Başarısız')

    useEffect(() => {
        const isPrintingStatus = ['processing', 'baski', 'printing', 'printed'].includes(order.status.toLowerCase()) || order.status.toLowerCase().includes('print')
        const diff = (new Date().getTime() - new Date(order.updatedAt).getTime()) / (1000 * 3600 * 24)
        setDaysSinceUpdate(diff)
        setIsStuck(isPrintingStatus && diff > 2)
    }, [order.status, order.updatedAt])

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => onPrefetch?.()}
            className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-all relative group overflow-hidden border-2 ${selected ? 'border-blue-600 ring-2 ring-blue-300 transform scale-[1.02]' :
                isPaymentFailed ? 'border-red-600 bg-red-50 dark:bg-red-900/20' :
                    order.hasNotification ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-900/20' :
                        isStuck ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 dark:border-slate-800'
                }`}
        >
            {/* SELECTION CHECKBOX (Visible on hover or if selected or if selectionMode is active) */}
            <div
                className={`absolute top-3 left-3 z-50 transition-all duration-200 ${selected || selectionMode ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'}`}
                onClick={(e) => {
                    e.stopPropagation()
                    if (onSelect) onSelect(!selected)
                }}
            >
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shadow-lg transition-colors ${selected ? 'bg-blue-600 border-blue-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-blue-500'}`}>
                    {selected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
            </div>

            {/* Notification Pulse Overlay */}
            {order.hasNotification && (
                <div className="absolute inset-0 bg-blue-500/5 animate-pulse z-0 pointer-events-none" />
            )}

            {/* 1. VISUAL HERO SECTION */}
            <div className="aspect-video relative bg-slate-100 dark:bg-slate-900 border-b dark:border-slate-800 z-10">
                {mainImage ? (
                    <Image
                        src={mainImage}
                        alt="Sipariş Görseli"
                        fill
                        unoptimized
                        className={`object-cover group-hover:scale-105 transition-transform duration-500 ${isPaymentFailed ? 'grayscale' : ''}`}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <Package className="w-8 h-8" />
                    </div>
                )}

                {/* Payment Failed Badge (Highest Priority) */}
                {isPaymentFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-30">
                        <div className="bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xl flex items-center gap-2 transform -rotate-6 border-2 border-white">
                            <AlertTriangle className="w-5 h-5 text-white" />
                            ÖDEME BAŞARISIZ
                        </div>
                    </div>
                )}


                {/* Notification Badge */}
                {order.hasNotification && !isPaymentFailed && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg z-20 animate-bounce">
                        🔔 YENİ GÜNCELLEME
                    </div>
                )}

                {/* Visual Status Indicator for Shipped Orders using Tracking Number */}
                {order.status === 'shipped' && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg z-10">
                        <Truck className="w-4 h-4" />
                    </div>
                )}

                {/* Stale Warning Badge */}
                {isStuck && !isPaymentFailed && (
                    <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg z-20 flex items-center gap-1 animate-pulse">
                        <Clock className="w-3 h-3" />
                        <span>2 GÜNDÜR BEKLİYOR</span>
                    </div>
                )}

                {/* Overlay Badge for Item Count if multiple */}
                {order.items.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                        +{order.items.length - 1} ürün daha
                    </div>
                )}
            </div>

            {/* 2. ORDER DETAILS */}
            <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">
                                {order.source === 'woo' && order.externalId ? `#${order.externalId}` : `#${order.id}`}
                            </h3>
                            {order.source === 'etsy' && (
                                <span className="bg-[#F1641E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                    <span className="font-serif italic lowercase font-extrabold translate-y-[1px]">E</span>
                                    ETSY
                                </span>
                            )}
                            {(order.source === 'woo' || (!order.source && order.barcode?.startsWith('WC-'))) && (
                                <div className="flex items-center gap-1">
                                    <span className="bg-[#96588A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                        WOO
                                    </span>
                                    {order.source === 'woo' && order.externalId && (
                                        <span className="text-[10px] text-slate-400 font-mono">({order.id})</span>
                                    )}
                                </div>
                            )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">{order.customer}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`text-sm font-semibold px-2 py-1 rounded-md ${isPaymentFailed ? 'text-red-700 bg-red-100 line-through' : 'text-green-600 bg-green-50'}`}>
                            {order.total.replace('$', '').replace('USD', '').trim()} TL
                        </span>
                        {/* Payment Method Badge */}
                        {order.paymentMethod && (
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${order.paymentMethod.toLowerCase().includes('havale') || order.paymentMethod.toLowerCase().includes('eft')
                                ? 'text-purple-700 bg-purple-100 border-purple-200'
                                : 'text-slate-500 bg-slate-100 border-slate-200'
                                }`}>
                                {order.paymentMethod}
                            </span>
                        )}
                    </div>
                </div>

                {/* LABELS ROW */}
                <div className="flex flex-wrap gap-1">
                    {order.labels.map(labelName => {
                        const tagDef = tags.find(t => t.name === labelName)
                        const colors = getColorClasses(tagDef?.color)

                        return (
                            <span
                                key={labelName}
                                className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm border ${colors.bg} ${colors.text} ${colors.border}`}
                            >
                                {labelName}
                            </span>
                        )
                    })}
                </div>

                <div className="pt-2 border-t flex flex-col gap-1.5">
                    {/* Product Name */}
                    <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-1">
                            {order.items && order.items.length > 0 ? order.items[0].name : "Ürün detayı yok"}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                            {order.items && order.items.length > 0 && order.items[0].sku && (
                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-medium">
                                    Kod: {order.items[0].sku}
                                </span>
                            )}
                            {order.items && order.items.length > 0 && order.items[0].dimensions && (
                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1">
                                    <span>📏 {order.items[0].dimensions}</span>
                                    {/* Auto M2 Calculation */}
                                    {(() => {
                                        // Try to parse "100x200" or "100 x 200"
                                        const dims = order.items[0].dimensions!.toLowerCase().match(/(\d+)\s*[x*]\s*(\d+)/)
                                        if (dims) {
                                            const w = parseInt(dims[1])
                                            const h = parseInt(dims[2])
                                            // Assuming cm, convert to m²
                                            const m2 = (w * h) / 10000
                                            return <span className="text-slate-400">({m2.toFixed(2)} m²)</span>
                                        }
                                        return null
                                    })()}
                                </span>
                            )}
                            {/* Texture/Material */}
                            {order.items && order.items.length > 0 && order.items[0].material && (
                                <span className="bg-purple-50 px-1.5 py-0.5 rounded text-purple-700 font-medium border border-purple-100">
                                    Doku: {order.items[0].material}
                                </span>
                            )}
                            {/* Sample Data Badge */}
                            {order.items && order.items.length > 0 && order.items[0].sampleData && (
                                <span className="bg-pink-50 px-1.5 py-0.5 rounded text-pink-700 font-bold border border-pink-100 animate-pulse">
                                    ✨ NUMUNE: {order.items[0].sampleData}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Date & Assignee */}
                    <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <Calendar className="w-3 h-3" />
                            <span>{order.date}</span>
                        </div>
                        {order.assignedTo && (
                            <div className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                                <User className="w-3 h-3" />
                                <span>{order.assignedTo.split(' ')[0]}</span>
                            </div>
                        )}
                    </div>

                    {/* Note Warning */}
                    {order.note && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                            <AlertCircle className="w-3 h-3" />
                            <span className="truncate">{order.note}</span>
                        </div>
                    )}

                    {/* Stuck Warning Detail */}
                    {isStuck && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-red-600 bg-red-50 p-2 rounded-md font-bold">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Dikkat: Bu sipariş {Math.floor(daysSinceUpdate)} gündür işlem görmedi!</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
