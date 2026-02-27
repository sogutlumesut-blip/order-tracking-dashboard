"use client"

import { Order, OrderStatus, Comment } from "../data/mock-orders"
import { APP_CONFIG } from "../data/settings"
import { X, Save, Truck, User, Tag, FileText, Upload, Printer, FileDown, History, ChevronDown, ChevronRight, ExternalLink, Receipt, ShieldCheck } from "lucide-react"
import { useState, useEffect } from "react"
import { NoteLog } from "./note-log"
import { ChatSection } from "./chat-section"
import { ActivityLog } from "./activity-log"
import { getColorClasses } from "@/lib/colors"
import { logManualActivity, uploadCargoLabel, deleteCargoLabel, getOrderDetails, createInvoiceAction, createCargoLabelAction, createDHLShipmentAction } from "../app/actions"
import { LocalBarcodeModal } from "./local-barcode-modal"
import { toast } from "sonner"

interface OrderDetailPanelProps {
    order: Order | null
    isOpen: boolean
    onClose: () => void
    onUpdate: (updatedOrder: Order) => void
    onAddComment: (orderId: number, message: string, attachments: any[]) => void
    currentUser: { id: string; name: string; role: string }
    statuses: { id: string; title: string; color: string }[]
    tags: { id: string; name: string; color: string | null }[]
}

export function OrderDetailPanel({ order, isOpen, onClose, onUpdate, onAddComment, currentUser, statuses, tags }: OrderDetailPanelProps) {
    const [formData, setFormData] = useState<Order | null>(null)
    const [isModified, setIsModified] = useState(false)
    const [isActivityLogOpen, setIsActivityLogOpen] = useState(false)
    const [previewImage, setPreviewImage] = useState<string | null>(null)
    const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false)

    // Detaylar artık sipariş objesiyle beraber geliyor
    const [lazyComments, setLazyComments] = useState<any[] | null>(null)
    const [lazyActivities, setLazyActivities] = useState<any[] | null>(null)

    useEffect(() => {
        if (order && isOpen) {
            // Update formData ONLY if:
            // 1. It's a different order (ID change)
            // 2. User hasn't made any local modifications yet (safe to sync)
            if (!formData || formData.id !== order.id || !isModified) {
                setFormData({ ...order })
                setIsModified(false)
            }

            // Always sync comments and activities as they are usually non-conflicting
            const formattedComments = (order.comments || []).map(c => ({
                ...c,
                timestamp: new Date(c.timestamp).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            }))

            setLazyComments(formattedComments)
            setLazyActivities(order.activities || [])
        } else if (!isOpen) {
            // Reset for next time
            setFormData(null)
            setIsModified(false)
            setLazyComments(null)
            setLazyActivities(null)
        }
    }, [order, isOpen])

    if (!isOpen || !formData) return null

    const handleInternalAddComment = async (msg: string, att: any[]) => {
        const newComment: any = {
            id: Date.now(),
            author: currentUser.name,
            message: msg,
            timestamp: new Date().toLocaleString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            attachments: att
        }

        // Update local lazy state for immediate feedback
        setLazyComments(prev => prev ? [...prev, newComment] : [newComment])

        // Call parent
        onAddComment(formData.id, msg, att)
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
                    <button className="absolute top-4 right-4 text-white hover:text-slate-300 transition-colors">
                        <X className="w-8 h-8" />
                    </button>
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
                        <h2 className="text-lg font-bold dark:text-slate-100">Sipariş #{formData.id}</h2>
                        {/* Compact user info for header */}
                        <p className="font-medium text-slate-900 dark:text-slate-300">{formData.customer}</p>
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

                    <h1 className="text-2xl font-bold mb-2">Sipariş Detayı #{formData.id}</h1>
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
                            <p className="font-bold">Tarih: {formData.date}</p>
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
                                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">{formData.customer}</p>

                                    <div className="text-slate-600 dark:text-slate-400 text-sm space-y-1">
                                        {formData.phone && <p className="flex items-center gap-2">📞 {formData.phone}</p>}
                                        {formData.email && <p className="flex items-center gap-2">📧 {formData.email}</p>}
                                    </div>

                                    {formData.address && (
                                        <div className="text-slate-800 dark:text-slate-300 text-sm border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                                            <p className="font-semibold mb-1 flex items-center gap-1">📍 Teslimat Adresi:</p>
                                            <p className="leading-relaxed">
                                                {formData.address}
                                                {formData.city && (
                                                    <span className="font-bold block text-slate-900 mt-1">
                                                        {formData.city.toLocaleUpperCase('tr-TR')}
                                                    </span>
                                                )}
                                            </p>
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
                                            <div className="w-24 h-24 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-md overflow-hidden border dark:border-slate-600">
                                                {/* Use real img tag for printing support */}
                                                <img
                                                    src={item.image_src}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => setPreviewImage(item.image_src)}
                                                />
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
                                                    {item.dimensions && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                            📏 {item.dimensions}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Special URL Link */}
                                                {item.url && (
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                                        >
                                                            🔗 Özel Dosya Linki
                                                        </a>
                                                        <input
                                                            type="text"
                                                            className="flex-1 text-[10px] p-1 border dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900 font-medium focus:ring-1 focus:ring-blue-500 outline-none"
                                                            value={item.url || ""}
                                                            onChange={(e) => {
                                                                const newItems = formData.items.map(i => i.id === item.id ? { ...i, url: e.target.value } : i)
                                                                setFormData({ ...formData, items: newItems })
                                                                setIsModified(true)
                                                            }}
                                                            placeholder="Dosya Linki"
                                                        />
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
                                            toast.promise(createCargoLabelAction(formData.id), {
                                                loading: "Kargo kaydı oluşturuluyor...",
                                                success: (res: any) => {
                                                    if (res.error) throw new Error(res.error);
                                                    if (res.trackingNumber) {
                                                        setFormData({ ...formData, status: 'shipped', trackingNumber: res.trackingNumber });
                                                    }
                                                    return res.message || "Kargo talebi iletildi!";
                                                },
                                                error: (err) => err.message || "Hata oluştu"
                                            });
                                        }}
                                        className="py-3 bg-emerald-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200 dark:shadow-none text-xs"
                                    >
                                        <Truck className="w-5 h-5" />
                                        Kargo Çıkar
                                    </button>
                                    <button
                                        onClick={async () => {
                                            toast.promise(createDHLShipmentAction(formData.id), {
                                                loading: "DHL Kargo kaydı oluşturuluyor...",
                                                success: (res: any) => {
                                                    if (res.error) throw new Error(res.error);
                                                    if (res.trackingNumber) {
                                                        setFormData({ ...formData, status: 'shipped', trackingNumber: res.trackingNumber });
                                                    }
                                                    return "DHL Kargo talebi iletildi!";
                                                },
                                                error: (err) => err.message || "Hata oluştu"
                                            });
                                        }}
                                        className="py-3 bg-red-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-all font-bold shadow-lg shadow-red-200 dark:shadow-none text-xs"
                                    >
                                        <Truck className="w-5 h-5" />
                                        DHL Çıkar
                                    </button>
                                </div>

                                {formData.cargoBarcode && !formData.cargoLabelPdf && (
                                    <div className="mb-4">
                                        <div className="text-center text-xs text-slate-400 mb-2">
                                            Kargo etiketi otomatik çekilemedi.
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <button
                                                onClick={() => window.open(`https://duvarkagidimarketi.com/wp-admin/post.php?post=${formData.id}&action=edit`, '_blank')}
                                                className="py-3 border-2 border-slate-300 bg-slate-50 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-slate-100 hover:border-slate-400 transition-all text-slate-600 font-bold text-xs"
                                            >
                                                <ExternalLink className="w-5 h-5" />
                                                WooCommerce'da Aç
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {formData.cargoLabelPdf ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const pdfData = formData.cargoLabelPdf as string;
                                                    if (pdfData.startsWith('http')) {
                                                        window.open(pdfData, '_blank');
                                                    } else {
                                                        const byteCharacters = atob(pdfData);
                                                        const byteNumbers = new Array(byteCharacters.length);
                                                        for (let i = 0; i < byteCharacters.length; i++) {
                                                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                                                        }
                                                        const byteArray = new Uint8Array(byteNumbers);
                                                        const blob = new Blob([byteArray], { type: 'application/pdf' });
                                                        const url = URL.createObjectURL(blob);
                                                        window.open(url, '_blank');
                                                    }
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
                                                        setFormData({ ...formData, cargoLabelPdf: null });
                                                        onUpdate({ ...formData, cargoLabelPdf: null });
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
                                    </div>
                                )}

                                {/* Process Notes (Log UI) - MOVED TO RIGHT */}
                                {/* Removed from here */}
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
                                    comments={lazyComments || []}
                                    onAddNote={(msg) => handleInternalAddComment(msg, [])}
                                    currentUser={currentUser}
                                    className="h-[300px]"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200 mb-3">
                                    <Upload className="w-4 h-4" /> Yazışma & Dosyalar
                                </label>
                                <ChatSection
                                    comments={lazyComments || []}
                                    onAddComment={(msg, att) => handleInternalAddComment(msg, att)}
                                    currentUser={currentUser}
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
                                    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm animate-in slide-in-from-top-2 duration-200">
                                        <ActivityLog activities={lazyActivities || []} />
                                    </div>
                                )}
                            </div>
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
        </div >
    )
}
