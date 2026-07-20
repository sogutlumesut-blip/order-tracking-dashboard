import { useState, useEffect } from "react"

import { Order } from "../data/mock-orders"
import Image from "next/image"
import { Calendar, Package, AlertCircle, User, Truck, Clock, AlertTriangle } from "lucide-react"
import { getColorClasses } from "@/lib/colors"

function getPersonnelColorClass(name: string): string {
    const cleanName = (name || "Sistem").trim().toLocaleUpperCase('tr-TR');
    
    const staffColors: Record<string, string> = {
        'YEŞİM': 'bg-pink-600 dark:bg-pink-500',
        'YASEMİN': 'bg-teal-600 dark:bg-teal-500',
        'DOGUKAN': 'bg-violet-600 dark:bg-violet-500',
        'DOĞUKAN': 'bg-violet-600 dark:bg-violet-500',
        'MESUT': 'bg-indigo-600 dark:bg-indigo-500',
        'SİSTEM': 'bg-slate-600 dark:bg-slate-500',
        'SYSTEM': 'bg-slate-600 dark:bg-slate-500',
        'AHMET': 'bg-emerald-600 dark:bg-emerald-500',
        'MEHMET': 'bg-amber-600 dark:bg-amber-500',
    };
    
    const firstWord = cleanName.split(' ')[0];
    if (staffColors[firstWord]) {
        return staffColors[firstWord];
    }
    
    // Fallback: simple deterministic hash based on name characters
    const colors = [
        'bg-purple-600 dark:bg-purple-500',
        'bg-emerald-600 dark:bg-emerald-500',
        'bg-amber-600 dark:bg-amber-500',
        'bg-rose-600 dark:bg-rose-500',
        'bg-indigo-600 dark:bg-indigo-500',
        'bg-teal-600 dark:bg-teal-500',
        'bg-fuchsia-600 dark:bg-fuchsia-500',
        'bg-violet-600 dark:bg-violet-500'
    ];
    let hash = 0;
    for (let i = 0; i < firstWord.length; i++) {
        hash = firstWord.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

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
    const isCancelled = order.labels.includes('İPTAL EDİLDİ') || order.labels.includes('İptal Edildi')
    const isDeleted = order.labels.includes('SİLİNDİ') || order.labels.includes('Silindi')

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
                    isCancelled ? 'border-rose-500 bg-rose-50/10 dark:bg-rose-950/20' :
                        isDeleted ? 'border-slate-500 bg-slate-50/10 dark:bg-slate-950/20' :
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
                        className={`object-cover group-hover:scale-105 transition-transform duration-500 ${(isPaymentFailed || isCancelled || isDeleted) ? 'grayscale' : ''}`}
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

                {/* Cancelled Badge */}
                {isCancelled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-30">
                        <div className="bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xl flex items-center gap-2 transform -rotate-6 border-2 border-white">
                            <AlertTriangle className="w-5 h-5 text-white" />
                            İPTAL EDİLDİ
                        </div>
                    </div>
                )}

                {/* Deleted Badge */}
                {isDeleted && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-30">
                        <div className="bg-slate-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xl flex items-center gap-2 transform -rotate-6 border-2 border-white">
                            <AlertTriangle className="w-5 h-5 text-white" />
                            SİLİNDİ
                        </div>
                    </div>
                )}

                {/* Badges Container */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 z-20 items-start">
                    {/* Notification Badge */}
                    {order.hasNotification && !isPaymentFailed && !isCancelled && !isDeleted && (() => {
                        let badgeText = order.status === 'pending' || order.status.toLowerCase().includes('yeni') ? 'YENİ SİPARİŞ' : 'YENİ GÜNCELLEME';
                        let bgColorClass = 'bg-blue-600'; // Default Blue
                        let badgeEmoji = '🔔';

                        if (order.comments && order.comments.length > 0) {
                            const latest = [...order.comments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                            const commentTime = new Date(latest.timestamp).getTime();
                            const orderUpdateTime = new Date(order.updatedAt).getTime();

                            // If the comment was added around the same time as the latest update (within 30 seconds)
                            if (Math.abs(orderUpdateTime - commentTime) < 30000) {
                                const typeLabel = latest.type === 'note' ? 'NOT' : 'MESAJ';
                                const authorName = (latest.author || "Sistem").split(' ')[0].toLocaleUpperCase('tr-TR');
                                badgeText = `YENİ ${typeLabel}: ${authorName}`;
                                badgeEmoji = latest.type === 'note' ? '📝' : '💬';
                                bgColorClass = getPersonnelColorClass(latest.author);
                            }
                        }

                        return (
                            <div className={`${bgColorClass} text-white justify-self-start text-[10px] font-bold px-2 py-1 rounded-full shadow-lg animate-bounce flex items-center gap-1`}>
                                <span>{badgeEmoji}</span>
                                <span>{badgeText}</span>
                            </div>
                        );
                    })()}

                    {/* Stale Warning Badge */}
                    {isStuck && !isPaymentFailed && (
                        <div className="bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                            <Clock className="w-3 h-3" />
                            <span>{Math.floor(daysSinceUpdate)} GÜNDÜR BEKLİYOR</span>
                        </div>
                    )}
                </div>

                {/* Visual Status Indicator for Shipped Orders using Tracking Number */}
                {order.status === 'shipped' && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg z-10">
                        <Truck className="w-4 h-4" />
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 flex items-center gap-1">
                                {order.barcode}
                            </span>
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">
                                {(order.source === 'woo' || order.source === 'wayfair') && order.externalId ? `#${order.externalId}` : (order.id > 0 ? `#${order.id}` : null)}
                            </h3>
                            {order.source === 'etsy' && (
                                <span className="bg-[#F1641E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                    <span className="font-serif italic lowercase font-extrabold translate-y-[1px]">E</span>
                                    ETSY
                                </span>
                            )}
                            {order.source === 'wayfair' && (
                                <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                    WAYFAIR
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
                        <div className="text-sm text-slate-600 dark:text-slate-400 font-medium flex flex-col leading-tight mt-0.5">
                            {order.customer.split('\n').map((line, i, arr) => (
                                <span key={i} className={
                                    arr.length > 1 && i === 0 
                                        ? "font-bold text-red-800 dark:text-red-400 text-base" 
                                        : arr.length > 1 && i > 0 
                                            ? "text-[11px] text-slate-500 uppercase mt-0.5" 
                                            : ""
                                }>
                                    {line}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`text-sm font-semibold px-2 py-1 rounded-md ${isPaymentFailed ? 'text-red-700 bg-red-100 line-through' : 'text-green-600 bg-green-50'}`}>
                            {order.source === 'PrintMarkt' || order.source === 'wayfair'
                                ? `$${order.total.replace('$', '').replace('USD', '').trim()}`
                                : `${order.total.replace('₺', '').replace('TL', '').replace('$', '').replace('USD', '').trim()} ₺`}
                        </span>
                        {/* Payment & Source Badges */}
                        <div className="flex items-center gap-1">
                            {order.source === 'PrintMarkt' && (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border text-blue-700 bg-blue-100 border-blue-200 shadow-sm">
                                    PRINTMARKT
                                </span>
                            )}
                            {order.paymentMethod && (
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border shadow-sm ${
                                    order.paymentMethod.toLowerCase().includes('havale') || order.paymentMethod.toLowerCase().includes('eft')
                                        ? 'text-purple-700 bg-purple-100 border-purple-200'
                                        : (order.paymentMethod.toUpperCase() === 'ON_ACCOUNT' || order.paymentMethod.toUpperCase() === 'PRINTMARKT' || order.paymentMethod.toUpperCase() === 'CARI')
                                            ? 'text-emerald-700 bg-emerald-100 border-emerald-200'
                                            : 'text-slate-600 bg-slate-100 border-slate-200'
                                }`}>
                                    {(order.paymentMethod.toUpperCase() === 'ON_ACCOUNT' || order.paymentMethod.toUpperCase() === 'PRINTMARKT') 
                                        ? 'CARI' 
                                        : order.paymentMethod.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
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
                                <span className={order.items[0].dimensions === 'SAMPLE' ? "bg-pink-50 dark:bg-pink-900/30 px-1.5 py-0.5 rounded text-pink-700 dark:text-pink-400 font-bold border border-pink-100 dark:border-pink-800 animate-pulse flex items-center gap-1" : "bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1"}>
                                    <span>{order.items[0].dimensions === 'SAMPLE' ? '✨ SAMPLE' : `📏 ${order.items[0].dimensions}`}</span>
                                    {/* Auto M2 Calculation */}
                                    {(() => {
                                        const dimStr = order.items[0].dimensions!;
                                        if (/m²|m2/i.test(dimStr)) return null;

                                        // Try to parse dimensions (supports decimals and spaces like "195x96.5")
                                        const match = dimStr.match(/(\d+(?:\.\d+)?)\s*[^0-9]*?\s*[x*]\s*[^0-9]*?\s*(\d+(?:\.\d+)?)/)
                                        if (match) {
                                            const w = parseFloat(match[1])
                                            const h = parseFloat(match[2])
                                            
                                            // Detect if it is in inches
                                            const isInch = dimStr.includes('"') || 
                                                           /(?:^|\d|\s)(in|inch|inches|inc|inç)(?:\b|$)/i.test(dimStr);
                                            
                                            let m2 = 0
                                            if (isInch) {
                                                // 1 inch = 0.0254 meters
                                                m2 = (w * 0.0254) * (h * 0.0254)
                                            } else {
                                                // Assuming cm, convert to m²
                                                m2 = (w * h) / 10000
                                            }
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

                    <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{order.date ? new Date(order.date).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* DESIGN PDF LINK (PrintMarkt / Custom URL) */}
                            {order.items && order.items.length > 0 && order.items[0].url && (order.items[0].url.startsWith('http') || order.items[0].url.startsWith('blob')) && (
                                <a
                                    href={order.items[0].url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-1 rounded transition-colors shadow-sm z-10 relative"
                                    title="Tasarım Dosyasını İndir"
                                >
                                    <span className="translate-y-[0.5px]">📄</span> PDF İndir
                                </a>
                            )}
                            {/* CARGO LABEL PDF LINK */}
                            {order.hasCargoPdf && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`/api/cargo-label/${order.id}`, '_blank');
                                    }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors shadow-sm z-10 relative"
                                    title="Kargo Etiketi"
                                >
                                    <span className="translate-y-[0.5px]">🏷️</span> Etiket
                                </button>
                            )}
                            {/* SHARE TO CHAT BUTTON */}
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    const orderNo = order.source === 'woo' && order.externalId ? `#${order.externalId}` : `#${order.id}`;
                                    const productName = order.items && order.items.length > 0 ? order.items[0].name : "Ürün detayı yok";
                                    const productSku = order.items && order.items.length > 0 && order.items[0].sku ? ` (Kod: ${order.items[0].sku})` : "";
                                    const text = `📦 Sipariş Paylaşıldı:\n• Sipariş No: ${orderNo}\n• Müşteri: ${order.customer}\n• Ürün: ${productName}${productSku}\n• Tutar: ${order.total}`;
                                    
                                    try {
                                        const res = await fetch('/api/chat', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ 
                                                text,
                                                attachment: mainImage || undefined
                                            })
                                        });
                                        if (res.ok) {
                                            window.dispatchEvent(new CustomEvent('open-team-chat'));
                                        } else {
                                            alert("Sohbete gönderilemedi.");
                                        }
                                    } catch (err) {
                                        console.error(err);
                                        alert("Sohbete gönderilirken hata oluştu.");
                                    }
                                }}
                                className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded transition-colors shadow-sm z-10 relative"
                                title="Sohbette Paylaş"
                            >
                                <span className="translate-y-[0.5px]">💬</span> Sohbete Gönder
                            </button>
                            {order.assignedTo && (
                                <div className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                                    <User className="w-3 h-3" />
                                    <span>{order.assignedTo.split(' ')[0]}</span>
                                </div>
                            )}
                        </div>
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

            {/* Optimistic Saving Indicator */}
            {order.id < 0 && (
                <div className="absolute bottom-0 left-0 w-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold text-center py-1 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Sunucuya Kaydediliyor... Lütfen sayfayı yenilemeyin.
                </div>
            )}
        </div>
    )
}
