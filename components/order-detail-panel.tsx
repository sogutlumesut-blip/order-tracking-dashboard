"use client"

import { Order, OrderStatus, Comment } from "../data/mock-orders"
import { APP_CONFIG } from "../data/settings"
import { X, Save, Truck, User, Tag, FileText, Upload, Printer, FileDown, History, ChevronDown, ChevronRight, ExternalLink, Receipt, ShieldCheck, Download } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { NoteLog } from "./note-log"
import { ChatSection } from "./chat-section"
import { ActivityLog } from "./activity-log"
import { getColorClasses } from "@/lib/colors"
import { logManualActivity, uploadCargoLabel, deleteCargoLabel, getOrderDetails, fetchOrderForCargo, createInvoiceAction, createCargoLabelAction, createDHLShipmentAction, markOrderAsPaidAction, updateOrderDetails } from "../app/actions"
import { LocalBarcodeModal } from "./local-barcode-modal"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface OrderDetailPanelProps {
    order: Order | null
    isOpen: boolean
    onClose: () => void
    onUpdate: (updatedOrder: Order) => void
    onAddComment: (orderId: number, message: string, attachments: any[], type: string) => void
    currentUser: { id: string; name: string; role: string }
    statuses: { id: string; title: string; color: string }[]
    tags: { id: string; name: string; color: string | null }[]
}

export function OrderDetailPanel({ order, isOpen, onClose, onUpdate, onAddComment, currentUser, statuses, tags }: OrderDetailPanelProps) {
    const router = useRouter()
    const [formData, setFormData] = useState<Order | null>(null)
    const [isModified, setIsModified] = useState(false)
    const [isActivityLogOpen, setIsActivityLogOpen] = useState(true)
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false)

    // Detaylar artık sipariş objesiyle beraber geliyor
    const [lazyComments, setLazyComments] = useState<any[] | null>(null)
    const [lazyActivities, setLazyActivities] = useState<any[] | null>(null)
    const [isLoadingDetails, setIsLoadingDetails] = useState(false)

    const lastOrderIdRef = useRef<number | null>(null)

    useEffect(() => {
        if (order && isOpen) {
            const isSameOrder = lastOrderIdRef.current === order.id;

            // Update formData ONLY if:
            // 1. It's a different order (ID change)
            // 2. User hasn't made any local modifications yet (safe to sync)
            if (!formData || formData.id !== order.id || !isModified) {
                setFormData({ ...order })
                setIsModified(false)
                setIsActivityLogOpen(true)
            }

            if (!isSameOrder) {
                // Setup placeholder state until server fetch completes
                setLazyComments([])
                setLazyActivities([])
                setIsLoadingDetails(true)
                lastOrderIdRef.current = order.id
            }

            // Background fetch FULL details via REST API
            fetch(`/api/order-details?orderId=${order.id}`)
                .then((res) => {
                    if (!res.ok) throw new Error("API hatası");
                    return res.json();
                })
                .then((details) => {
                    if (details) {
                        const formattedComments = (details.comments || []).map((c: any) => {
                            let displayTime = c.timestamp;
                            try {
                                const d = new Date(c.timestamp);
                                if (d instanceof Date && !isNaN(d.getTime())) {
                                    displayTime = d.toLocaleString('tr-TR', {
                                        timeZone: 'Europe/Istanbul',
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    });
                                }
                            } catch (e) {}
                            return { ...c, timestamp: displayTime };
                        });
                        setLazyComments(formattedComments)
                        setLazyActivities(details.activities)
                    }
                })
                .catch(e => console.error("Lazy fetch err:", e))
                .finally(() => {
                    if (!isSameOrder) {
                        setIsLoadingDetails(false)
                    }
                })
        } else if (!isOpen) {
            // Reset for next time
            setFormData(null)
            setIsModified(false)
            setLazyComments(null)
            setLazyActivities(null)
            lastOrderIdRef.current = null
        }
    }, [order, isOpen])

    if (!isOpen || !formData) return null

    const handleInternalAddComment = async (msg: string, att: any[], type: string = "message") => {
        const newComment: any = {
            id: Date.now().toString(),
            author: currentUser.name,
            message: msg,
            timestamp: new Date().toLocaleString('tr-TR', {
                timeZone: 'Europe/Istanbul',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            attachments: att,
            type: type
        }

        // Update local lazy state for immediate feedback
        setLazyComments(prev => prev ? [...prev, newComment] : [newComment])

        try {
            // Call parent
            await onAddComment(formData.id, msg, att, type)
        } catch (e: any) {
            toast.error(`Mesaj kaydedilemedi: ${e.message}`)
            // Rollback local state
            setLazyComments(prev => prev ? prev.filter(c => c.id !== newComment.id) : null)
            throw e
        }
    }

    const handleInternalDeleteComment = async (commentId: string) => {
        if (!confirm("Bu yorumu/notu silmek istediğinize emin misiniz?")) return

        const previousComments = lazyComments ? [...lazyComments] : null
        setLazyComments(prev => prev ? prev.filter(c => c.id !== commentId) : null)

        try {
            const response = await fetch(`/api/delete-comment?commentId=${commentId}`, {
                method: 'DELETE'
            })
            const result = await response.json()
            if (result && result.error) {
                toast.error(`Silme hatası: ${result.error}`)
                setLazyComments(previousComments)
            } else {
                toast.success("Silindi")
                router.refresh()
            }
        } catch (e: any) {
            toast.error("Silme işlemi sırasında bir hata oluştu.")
            setLazyComments(previousComments)
        }
    }

    const handleSave = () => {
        if (formData) {
            const finalOrderData = {
                ...formData,
                assignedTo: currentUser.name, // Claim ownership
            }

            onUpdate(finalOrderData)
            onClose()
        }
    }

    const handlePrint = async () => {
        window.print();
        await logManualActivity(formData.id, "PRINT_ORDER", "Baskı önizleme açıldı / Yazdırıldı.")
    }

    const handleDownloadPdf = async () => {
        if (formData.cargoBarcode) {
            // Construct the PDF URL using the barcode
            // Assuming standard plugin path or similar - user can verify
            const pdfUrl = `https://duvarkagidimarketi.com/wp-content/plugins/kargo-entegrator/assets/print.php?barcode=${formData.cargoBarcode}`

            window.open(pdfUrl, '_blank')
            await logManualActivity(formData.id, "PDF_DOWNLOAD", `Kargo etiketi indirildi (Barkod: ${formData.cargoBarcode})`)
        } else {
            alert("Barkod verisi bulunamadı. Lütfen Ayarlar > Son Siparişi İncele ekranından verileri güncellediğinizden emin olun.")
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            <LocalBarcodeModal
                order={formData}
                isOpen={isBarcodeModalOpen}
                onClose={() => setIsBarcodeModalOpen(false)}
            />

            {/* Image Preview Modal */}
            {previewImage && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <div className="absolute top-4 right-4 flex gap-2">
                        <a 
                            href={previewImage} 
                            download="taslak.png"
                            className="text-white hover:text-slate-200 bg-slate-900/50 p-2.5 rounded-full backdrop-blur-md transition-colors flex items-center justify-center cursor-pointer"
                            title="Görseli İndir"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Download className="w-5 h-5" />
                        </a>
                        <button className="text-white hover:text-slate-300 transition-colors p-1" onClick={() => setPreviewImage(null)}>
                            <X className="w-8 h-8" />
                        </button>
                    </div>
                    <img
                        src={previewImage}
                        alt="Preview"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    />
                </div>
            )}

            {/* Panel */}
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950 print:hidden">
                    <div>
                        <h2 className="text-lg font-bold dark:text-slate-100">
                            Sipariş {(formData.source === 'woo' || formData.source === 'wayfair') && formData.externalId ? `#${formData.externalId}` : `#${formData.id}`}
                        </h2>
                        {/* Compact user info for header */}
                        <div className="font-medium text-slate-900 dark:text-slate-300">
                            {formData.customer.split('\n').map((line, i, arr) => (
                                <span key={i} className={arr.length > 1 && i === 0 ? "font-bold" : arr.length > 1 && i > 0 ? "text-xs text-slate-500 uppercase block" : ""}>
                                    {line}
                                </span>
                            ))}
                            {(formData.source === 'woo' || formData.source === 'wayfair') && formData.externalId && (
                                <span className="ml-2 text-xs text-slate-400 font-mono inline-block">(Sistem ID: #{formData.id})</span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400" title="Yazdır">
                            <Printer className="w-5 h-5" />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full dark:text-slate-400">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Printable Header (Visible only in Print) */}
                <div className="hidden print:block p-8 border-b">
                    <style>{`
                        @media print {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        }
                    `}</style>

                    {/* Company Logo Section - Placeholder */}
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img
                                src={APP_CONFIG.companyLogo}
                                alt={APP_CONFIG.companyName}
                                className="h-12 w-auto object-contain"
                            />
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            <p>{APP_CONFIG.companyWeb}</p>
                            <p>{APP_CONFIG.companyPhone}</p>
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold mb-2">
                        Sipariş {(formData.source === 'woo' || formData.source === 'wayfair') && formData.externalId ? `#${formData.externalId}` : `#${formData.id}`}
                    </h1>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="font-bold">Müşteri:</p>
                            <p>{formData.customer}</p>
                            <p>{formData.phone}</p>
                            <p>{formData.email}</p>
                            <p>{formData.address}</p>
                            <p>{formData.city}</p>
                        </div>
                        <div className="text-right">
                             <p className="font-bold">Tarih: {formData.date ? new Date(formData.date).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                            <p className="text-xl font-bold mt-2">{formData.total}</p>
                        </div>
                    </div>
                    {formData.note && <div className="mt-4 p-4 border border-dashed border-slate-300"><strong>Müşteri Notu:</strong> {formData.note}</div>}
                </div>

                {/* Content - Two Column Layout */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:block print:grid-cols-1">

                        {/* LEFT COLUMN: Order Details */}
                        <div className="space-y-6">
                            {/* Customer Details Card (Screen Only) */}
                            <div className="print:hidden bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border dark:border-slate-700">
                                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Müşteri Bilgileri</h3>
                                <div className="text-sm space-y-2">
                                    <div className="font-bold text-lg text-slate-900 dark:text-slate-100 leading-tight">
                                        {formData.customer.split('\n').map((line, i, arr) => (
                                            <span key={i} className={arr.length > 1 && i === 0 ? "text-red-800 dark:text-red-400 text-xl block" : arr.length > 1 && i > 0 ? "text-sm text-slate-500 uppercase mt-0.5 block font-semibold" : "block"}>
                                                {line}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="text-slate-600 dark:text-slate-400 text-sm space-y-1">
                                        {formData.phone && <p className="flex items-center gap-2">📞 {formData.phone}</p>}
                                        {formData.email && <p className="flex items-center gap-2">📧 {formData.email}</p>}
                                    </div>

                                    {formData.address && (
                                        <div className="text-slate-800 dark:text-slate-300 text-sm border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                                            <p className="font-semibold mb-1 flex items-center gap-1">📍 Teslimat Adresi:</p>
                                            <textarea
                                                className="w-full text-sm p-2 border rounded-md bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none leading-relaxed text-slate-700 dark:text-slate-300"
                                                value={formData.address}
                                                onChange={(e) => {
                                                    setFormData({ ...formData, address: e.target.value })
                                                    setIsModified(true)
                                                }}
                                                rows={2}
                                            />
                                            <input
                                                type="text"
                                                className="w-full mt-2 font-bold text-slate-900 dark:text-slate-100 p-2 border rounded-md bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 outline-none"
                                                value={formData.city || ""}
                                                onChange={(e) => {
                                                    setFormData({ ...formData, city: e.target.value })
                                                    setIsModified(true)
                                                }}
                                                placeholder="İlçe / İl (Örn: ÇEŞME / İZMİR)"
                                            />
                                        </div>
                                    )}

                                    {formData.note && (
                                        <p className="text-amber-700 text-xs border border-amber-200 bg-amber-50 p-2 rounded mt-2 font-medium">
                                            📝 <span className="font-bold">Müşteri Notu:</span> {formData.note}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Fatura Bilgileri Card (NEW) */}
                            <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
                                    <Receipt className="w-4 h-4" /> Fatura Bilgileri
                                </h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">TCKN / VKN</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 text-xs border dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                                                placeholder="11111111111"
                                                value={formData.taxNumber || ""}
                                                onChange={(e) => {
                                                    setFormData({ ...formData, taxNumber: e.target.value })
                                                    setIsModified(true)
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Vergi Dairesi</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 text-xs border dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                                                placeholder="Kartal"
                                                value={formData.taxOffice || ""}
                                                onChange={(e) => {
                                                    setFormData({ ...formData, taxOffice: e.target.value })
                                                    setIsModified(true)
                                                }}
                                            />
                                        </div>
                                    </div>
                                    {formData.invoiceUrl && (
                                        <div className="pt-2 border-t border-blue-100 dark:border-blue-900/30">
                                            <a
                                                href={formData.invoiceUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center justify-center gap-2 py-2 bg-emerald-600 text-white rounded-md text-xs font-bold hover:bg-emerald-700 transition-all"
                                            >
                                                <FileDown className="w-4 h-4" />
                                                Kesilmiş Faturayı İndir
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Product Details (Enhanced) */}
                            <div>
                                <h3 className="font-semibold text-slate-700 mb-3">Ürünler</h3>
                                <div className="space-y-4">
                                    {formData.items.map(item => (
                                        <div key={item.id} className="flex gap-4 border dark:border-slate-700 p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                                            <div className="flex gap-2 shrink-0 max-w-[50%] flex-wrap">
                                                {(item.image_src || "").split('|').filter(Boolean).map((imgSrc: string, idx: number) => (
                                                    <div key={idx} className="w-24 h-24 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-md overflow-hidden border dark:border-slate-600">
                                                        {/* Use real img tag for printing support */}
                                                        <img
                                                            src={imgSrc}
                                                            alt={`${item.name} ${idx + 1}`}
                                                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => setPreviewImage(imgSrc)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between flex-wrap gap-y-2 mb-2">
                                                    <p className="font-bold text-slate-900 dark:text-slate-100 line-clamp-2">{item.name}</p>
                                                    {item.sampleData && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200 ml-2 animate-pulse text-right">
                                                            ✨ NUMUNE: {item.sampleData}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {item.sku && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                                                            Kod: {item.sku}
                                                        </span>
                                                    )}
                                                    {item.material && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                                            {item.material}
                                                        </span>
                                                    )}
                                                    {item.dimensions && (() => {
                                                         const dimStr = item.dimensions;
                                                         const hasM2 = /m²|m2/i.test(dimStr);
                                                         
                                                         // Try to parse dimensions (supports decimals and spaces)
                                                         const match = dimStr.match(/(\d+(?:\.\d+)?)\s*[^0-9]*?\s*[x*]\s*[^0-9]*?\s*(\d+(?:\.\d+)?)/)
                                                         let extraM2 = "";
                                                         if (match && !hasM2) {
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
                                                             extraM2 = ` (${m2.toFixed(2)} m²)`;
                                                         }
                                                         
                                                         return (
                                                             <span className={item.dimensions === 'SAMPLE' ? "bg-pink-50 dark:bg-pink-900/30 px-2 py-0.5 rounded text-pink-700 dark:text-pink-400 font-bold border border-pink-100 dark:border-pink-800 animate-pulse" : "bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 border dark:border-slate-600/50"}>
                                                                 {item.dimensions === 'SAMPLE' ? '✨ SAMPLE' : `📏 ${dimStr}${extraM2}`}
                                                             </span>
                                                         );
                                                     })()}
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                        ADET: {item.quantity}
                                                    </span>
                                                </div>

                                                {/* Special URL Link */}
                                                {item.url && (
                                                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t dark:border-slate-700">
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-center gap-2 w-full py-2 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40 rounded-md text-xs font-bold transition-all shadow-sm"
                                                        >
                                                            <FileDown className="w-4 h-4" />
                                                            Özel Tasarım (PDF / Resim) İndir
                                                        </a>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] uppercase font-bold text-slate-500">Link:</span>
                                                        <input
                                                            type="text"
                                                                className="flex-1 text-[10px] p-1.5 border dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900 font-medium focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-100"
                                                            value={item.url || ""}
                                                            onChange={(e) => {
                                                                const newItems = formData.items.map(i => i.id === item.id ? { ...i, url: e.target.value } : i)
                                                                setFormData({ ...formData, items: newItems })
                                                                setIsModified(true)
                                                            }}
                                                            placeholder="Dosya Linki"
                                                        />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Cropped Image Link */}
                                                {item.croppedImage && (
                                                    <div className="mt-2">
                                                        <a
                                                            href={item.croppedImage}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/40 rounded-md text-xs font-bold transition-all shadow-sm"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                            Kırpılan Resim (Görüntüle)
                                                        </a>
                                                    </div>
                                                )}

                                                {item.productNote && (
                                                    <div className="mt-2 text-amber-700 text-xs border border-amber-200 bg-amber-50 p-2 rounded font-medium">
                                                        📝 <span className="font-bold">Ürün Notu:</span> {item.productNote}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Cargo Label Button */}
                            <div className="print:hidden space-y-4">
                                {/* ALWAYS VISIBLE: Manual Barcode/Label Button */}
                                <button
                                    onClick={() => setIsBarcodeModalOpen(true)}
                                    className="w-full py-3 border-2 border-slate-800 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-700 hover:text-white transition-all text-slate-800 dark:text-slate-200 font-bold"
                                >
                                    <Printer className="w-5 h-5" />
                                    Barkod / Etiket Oluştur (Manuel)
                                </button>

                                {/* FIX PAYMENT FAILED: Mark as Paid Button */}
                                {formData.labels.includes('Ödeme Başarısız') && (
                                    <button
                                        onClick={async () => {
                                            if (confirm("Gelen ödemeyi onaylıyor musunuz? (Bu işlem 'Ödeme Başarısız' etiketini kardıracaktır.)")) {
                                                toast.promise(markOrderAsPaidAction(formData.id), {
                                                    loading: "Ödeme durumu güncelleniyor...",
                                                    success: (res: any) => {
                                                        if (res.error) throw new Error(res.error);
                                                        
                                                        const updatedLabels = formData.labels.filter(label => label !== 'Ödeme Başarısız');
                                                        const updatedState = { ...formData, labels: updatedLabels };
                                                        
                                                        setFormData(updatedState);
                                                        if (onUpdate) onUpdate(updatedState);
                                                        router.refresh();
                                                        
                                                        return res.message;
                                                    },
                                                    error: (err) => err.message || "Hata oluştu"
                                                });
                                            }
                                        }}
                                        className="w-full py-3 bg-green-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-green-700 transition-all font-bold shadow-lg animate-pulse"
                                    >
                                        <ShieldCheck className="w-5 h-5" />
                                        Manuel Ödendi İşaretle
                                    </button>
                                )}

                                {/* DIRECT ACTIONS: Fatura & Kargo (NEW) */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <button
                                        onClick={async () => {
                                            if (!formData.taxNumber) {
                                                toast.error("Lütfen önce TCKN/VKN alanını doldurun.");
                                                return;
                                            }
                                            toast.promise(createInvoiceAction(formData.id), {
                                                loading: "Fatura oluşturuluyor...",
                                                success: (res: any) => {
                                                    if (res.error) throw new Error(res.error);
                                                    setFormData({ ...formData, invoiceStatus: 'created', invoiceUrl: res.url });
                                                    return "Fatura başarıyla oluşturuldu!";
                                                },
                                                error: (err) => err.message || "Hata oluştu"
                                            });
                                        }}
                                        className="py-3 bg-indigo-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all font-bold shadow-lg shadow-indigo-200 dark:shadow-none text-xs"
                                    >
                                        <Receipt className="w-5 h-5" />
                                        Fatura Kes
                                    </button>

                                    <button
                                        onClick={async () => {
                                            // BROWSER POPUP BLOCKER FIX: Open tab synchronously before async operations
                                            const newTab = window.open('about:blank', '_blank');
                                            if (newTab) {
                                                newTab.document.write("<html><head><title>DHL Yükleniyor...</title></head><body style='font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#334155;'><div style='width:40px;height:40px;border:4px solid #cbd5e1;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;'></div><h2 style='margin-top:20px'>Kargo etiketi oluşturuluyor, lütfen bekleyin...</h2><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>");
                                                newTab.document.close();
                                            }

                                            if (!formData.city || formData.city.trim() === "") {
                                                try { if (newTab) newTab.close(); } catch(e) {}
                                                toast.error("Lütfen 'DHL Çıkar' butonuna basmadan önce İlçe / İl alanını doldurunuz.");
                                                return;
                                            }

                                            const toastId = toast.loading("DHL oluşturuluyor...");
                                            try {
                                                if (isModified) {
                                                    await updateOrderDetails(formData);
                                                    setIsModified(false);
                                                }
                                                // Use standard fetch instead of Server Action to prevent Next.js connection hanging bugs
                                                const timeoutPromise = new Promise<{error: string}>((_, reject) => 
                                                    setTimeout(() => reject(new Error("Kargo Entegratör yanıt vermedi (Zaman Aşımı). Lütfen tekrar deneyin.")), 25000)
                                                );
                                                
                                                const fetchPromise = fetch('/api/dhl-create', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ orderId: formData.id })
                                                }).then(r => r.json());

                                                const res = await Promise.race([
                                                    fetchPromise,
                                                    timeoutPromise
                                                ]) as any;

                                                if (res && res.error) {
                                                    try { if (newTab) newTab.close(); } catch(e) {}
                                                    toast.error(res.error, { id: toastId });
                                                    return;
                                                }

                                                // Skip extra DB query to save ~0.5 - 1 second round trip latency!
                                                const updatedOrder = res.success ? {
                                                    cargoBarcode: res.cargoBarcode,
                                                    cargoTrackingNumber: res.cargoTrackingNumber
                                                } : null;

                                                if (updatedOrder && updatedOrder.cargoBarcode) {
                                                    const pdfUrl = `/api/cargo-label/${formData.id}`;
                                                    try {
                                                        if (newTab) {
                                                            newTab.location.href = pdfUrl;
                                                        } else {
                                                            window.location.href = pdfUrl; 
                                                        }
                                                    } catch (e) {
                                                        // Fallback if Safari blocks the location change
                                                        window.location.href = pdfUrl;
                                                    }

                                                    // Reload to show the new data in the panel
                                                    const updatedState = {
                                                        ...formData,
                                                        cargoBarcode: updatedOrder.cargoBarcode,
                                                        cargoTrackingNumber: updatedOrder.cargoTrackingNumber || formData.cargoTrackingNumber,
                                                        trackingNumber: updatedOrder.cargoTrackingNumber || formData.trackingNumber
                                                    };
                                                    setFormData(updatedState as Order);
                                                    if (onUpdate) onUpdate(updatedState as Order);
                                                    router.refresh();
                                                    toast.dismiss(toastId);
                                                    toast.success("DHL Etiketi başarıyla oluşturuldu ve yazdırılıyor!");
                                                } else {
                                                    router.refresh();
                                                    try { if (newTab) newTab.close(); } catch(e) {}
                                                    toast.dismiss(toastId);
                                                    toast.error("Kargo barkodu veritabanına kaydedilemedi veya boş döndü.");
                                                }
                                            } catch (err: any) {
                                                try { if (newTab) newTab.close(); } catch(e) {}
                                                toast.error(err.message || "Bilinmeyen bir hata oluştu", { id: toastId });
                                            }
                                        }}
                                        className="py-3 bg-red-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-all font-bold shadow-lg shadow-red-200 dark:shadow-none text-xs"
                                    >
                                        <Truck className="w-5 h-5" />
                                        DHL Çıkar
                                    </button>
                                </div>

                                {/* NOTE: With MNG Kargo we no longer store raw PDF bytes in cargoLabelPdf, we use cargoBarcode instead to load dynamic PDF route */}
                                {(!formData.cargoBarcode && !formData.cargoLabelPdf) && (
                                    <div className="mb-4">
                                        <div className="grid grid-cols-1 gap-2">
                                            <button
                                                onClick={() => window.open(`https://duvarkagidimarketi.com/wp-admin/post.php?post=${formData.externalId || formData.id}&action=edit`, '_blank')}
                                                className="py-3 mt-2 border-2 border-slate-300 bg-slate-50 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-slate-100 hover:border-slate-400 transition-all text-slate-600 font-bold text-xs"
                                            >
                                                <ExternalLink className="w-5 h-5" />
                                                WooCommerce'da Aç
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {(formData.cargoBarcode || formData.cargoLabelPdf || formData.hasCargoPdf) ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    window.open(`/api/cargo-label/${formData.id}?t=${Date.now()}`, '_blank');
                                                }}
                                                className="flex-1 py-3 border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-blue-700 dark:text-blue-400 font-bold"
                                            >
                                                <FileDown className="w-5 h-5" />
                                                Etiketi Görüntüle
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm("Etiketi silmek istediğinize emin misiniz?")) return;
                                                    const res = await deleteCargoLabel(formData.id);
                                                    if (res.success) {
                                                        toast.success(res.message);
                                                        setFormData({ ...formData, cargoLabelPdf: undefined, cargoBarcode: undefined });
                                                        onUpdate({ ...formData, cargoLabelPdf: undefined, cargoBarcode: undefined });
                                                    } else {
                                                        toast.error(res.error);
                                                    }
                                                }}
                                                className="w-12 border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/40 transition-all text-red-600 dark:text-red-400"
                                                title="Etiketi Sil"

                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-center text-slate-400">Yüklü Belge Var</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                if (file.size > 2 * 1024 * 1024) {
                                                    alert("Dosya boyutu 2MB'dan büyük olamaz.");
                                                    return;
                                                }

                                                const reader = new FileReader();
                                                reader.onload = async () => {
                                                    const base64 = (reader.result as string).split(',')[1];
                                                    const res = await uploadCargoLabel(formData.id, base64);
                                                    if (res.success) {
                                                        toast.success(res.message);
                                                        setFormData({ ...formData, cargoLabelPdf: base64 });
                                                        onUpdate({ ...formData, cargoLabelPdf: base64 });
                                                    } else {
                                                        toast.error(res.error);
                                                    }
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        <div className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-blue-400 hover:text-blue-600 transition-all text-slate-500 dark:text-slate-400 font-bold">
                                            <Upload className="w-5 h-5" />
                                            Kargo Etiketi Yükle (PDF)
                                        </div>
                                    </div>
                                )}

                                <hr className="border-slate-200 dark:border-slate-700 my-4" />

                            </div>

                            {/* Print Only: Process Notes History */}
                            <div className="hidden print:block mt-8 border-t pt-4">
                                <h3 className="font-bold text-slate-900 mb-2">İşlem Notları / Yazışma Geçmişi</h3>
                                {formData.comments && formData.comments.length > 0 ? (
                                    <ul className="space-y-2 text-sm font-mono">
                                        {formData.comments.map((comment: any, idx: number) => (
                                            <li key={idx} className="border-b pb-1">
                                                <span className="font-bold">{comment.author}</span> <span className="text-slate-500">[{comment.timestamp}]:</span> {comment.message}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-slate-500 italic">Henüz not eklenmemiş.</p>
                                )}
                            </div>

                            {/* EDITABLE FIELDS (Hidden in Print) */}
                            <div className="space-y-6 print:hidden">
                                <div className="h-px bg-slate-200 my-4" />
                                {/* Status */}
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-900 dark:text-slate-200">Durum</label>
                                    <select
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-black dark:text-white font-bold focus:ring-2 focus:ring-blue-500"
                                        value={formData.status}
                                        onChange={(e) => {
                                            setFormData({ ...formData, status: e.target.value as OrderStatus })
                                            setIsModified(true)
                                        }}
                                    >
                                        {statuses.map(status => (
                                            <option key={status.id} value={status.id} className="text-black dark:text-white font-bold">{status.title}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Labels */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200">
                                        <Tag className="w-4 h-4" /> Etiketler
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map(tag => {
                                            const isSelected = formData.labels.includes(tag.name)
                                            const colors = getColorClasses(tag.color)

                                            return (
                                                <button
                                                    key={tag.name}
                                                    onClick={() => {
                                                        const newLabels = isSelected
                                                            ? formData.labels.filter(l => l !== tag.name)
                                                            : [...formData.labels, tag.name]
                                                        setFormData({ ...formData, labels: newLabels })
                                                        setIsModified(true)
                                                    }}
                                                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${isSelected
                                                        ? `${colors.bg} ${colors.text} ${colors.border} font-bold`
                                                        : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                                                        }`}
                                                >
                                                    {tag.name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Assigned To */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200">
                                        <User className="w-4 h-4" /> {APP_CONFIG.assigneeLabel}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            readOnly
                                            className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800 text-black dark:text-slate-300 font-bold cursor-not-allowed"
                                            value={currentUser.name}
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-black dark:text-slate-300 font-bold">Sabit (Sen)</span>
                                    </div>
                                    <p className="text-[10px] text-slate-900 dark:text-slate-400 font-bold">
                                        * Kaydettiğinizde siparişin sorumlusu otomatik olarak siz olursunuz.
                                    </p>
                                </div>

                                {/* Tracking Number */}
                                {formData.status === 'shipped' && (
                                    <div className="space-y-2 p-4 bg-green-50 rounded-lg border border-green-100">
                                        <label className="flex items-center gap-2 text-sm font-bold text-green-900">
                                            <Truck className="w-4 h-4" /> Kargo Takip No
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Kargo Takip No Giriniz"
                                            className="w-full p-2 border border-slate-300 rounded-md text-black font-bold placeholder:text-slate-500"
                                            value={formData.trackingNumber || ""}
                                            onChange={(e) => {
                                                setFormData({ ...formData, trackingNumber: e.target.value })
                                                setIsModified(true)
                                            }}
                                        />


                                        {/* Process Notes (Log UI) - MOVED TO RIGHT */}
                                        {/* Removed from here */}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Chat & Files */}
                        <div className="flex flex-col h-full print:hidden space-y-6">

                            {/* Note Log (Top Right) */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200 mb-3">
                                    <FileText className="w-4 h-4" /> İşlem Notları
                                </label>
                                <NoteLog
                                    comments={(lazyComments || []).filter(c => c.type === 'note')}
                                    onAddNote={(msg, att) => handleInternalAddComment(msg, att, 'note')}
                                    currentUser={currentUser}
                                    onImageClick={setPreviewImage}
                                    onDeleteNote={handleInternalDeleteComment}
                                    className="h-[550px]"
                                    isLoading={isLoadingDetails}
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200 mb-3">
                                    <Upload className="w-4 h-4" /> Yazışma & Dosyalar
                                </label>
                                <ChatSection
                                    comments={(lazyComments || []).filter(c => c.type === 'message' || !c.type)}
                                    onAddComment={(msg, att) => handleInternalAddComment(msg, att, 'message')}
                                    currentUser={currentUser}
                                    onImageClick={setPreviewImage}
                                    onDeleteComment={handleInternalDeleteComment}
                                    isLoading={isLoadingDetails}
                                />
                            </div>

                            {/* Activity Log - Collapsible & Compact */}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 mt-2">
                                <button
                                    onClick={() => setIsActivityLogOpen(!isActivityLogOpen)}
                                    className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors w-full text-left"
                                >
                                    {isActivityLogOpen ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                    <History className="w-3.5 h-3.5" />
                                    İşlem Geçmişi (Logs)
                                </button>

                                {isActivityLogOpen && (
                                    <div className="mt-2 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm animate-in slide-in-from-top-2 duration-200">
                                        <ActivityLog activities={lazyActivities || []} isLoading={isLoadingDetails} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between print:hidden">
                        <span className="text-xs text-slate-400 font-mono self-center">Barkod: {formData.barcode}</span>
                        <button
                            onClick={handleSave}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Kaydet
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
