"use client"

import { Order, OrderStatus, Comment } from "../data/mock-orders"
import { APP_CONFIG } from "../data/settings"
import { X, Save, Truck, User, Tag, FileText, Upload, Printer, FileDown, History, ChevronDown, ChevronRight } from "lucide-react"
import { useState, useEffect } from "react"
import { NoteLog } from "./note-log"
import { ChatSection } from "./chat-section"
import { ActivityLog } from "./activity-log"
import { getColorClasses } from "@/lib/colors"
import { logManualActivity, uploadCargoLabel, deleteCargoLabel } from "../app/actions"
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
    const [isActivityLogOpen, setIsActivityLogOpen] = useState(false)
    const [previewImage, setPreviewImage] = useState<string | null>(null)

    useEffect(() => {
        if (order) {
            setFormData({ ...order })
        }
    }, [order])

    if (!isOpen || !formData) return null

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

            {/* Image Preview Modal */}
            {previewImage && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <button className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors">
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
            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 print:hidden">
                    <div>
                        <h2 className="text-lg font-bold">Sipariş #{formData.id}</h2>
                        {/* Compact user info for header */}
                        <p className="font-medium text-gray-900">{formData.customer}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handlePrint} className="p-2 hover:bg-gray-200 rounded-full text-gray-600" title="Yazdır">
                            <Printer className="w-5 h-5" />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full">
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
                        <div className="text-right text-xs text-gray-500">
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
                    {formData.note && <div className="mt-4 p-4 border border-dashed border-gray-300"><strong>Müşteri Notu:</strong> {formData.note}</div>}
                </div>

                {/* Content - Two Column Layout */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:block print:grid-cols-1">

                        {/* LEFT COLUMN: Order Details */}
                        <div className="space-y-6">
                            {/* Customer Details Card (Screen Only) */}
                            <div className="print:hidden bg-gray-50 p-4 rounded-lg border">
                                <h3 className="font-semibold text-gray-900 mb-2">Müşteri Bilgileri</h3>
                                <div className="text-sm space-y-2">
                                    <p className="font-bold text-lg text-gray-900">{formData.customer}</p>

                                    <div className="text-gray-600 text-sm space-y-1">
                                        {formData.phone && <p className="flex items-center gap-2">📞 {formData.phone}</p>}
                                        {formData.email && <p className="flex items-center gap-2">📧 {formData.email}</p>}
                                    </div>

                                    {formData.address && (
                                        <div className="text-gray-800 text-sm border-t border-gray-200 pt-2 mt-2">
                                            <p className="font-semibold mb-1 flex items-center gap-1">📍 Teslimat Adresi:</p>
                                            <p className="leading-relaxed">
                                                {formData.address}
                                                {formData.city && (
                                                    <span className="font-bold block text-gray-900 mt-1">
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

                            {/* Product Details (Enhanced) */}
                            <div>
                                <h3 className="font-semibold text-gray-700 mb-3">Ürünler</h3>
                                <div className="space-y-4">
                                    {formData.items.map(item => (
                                        <div key={item.id} className="flex gap-4 border p-3 rounded-lg bg-white shadow-sm">
                                            <div className="w-24 h-24 shrink-0 bg-gray-100 rounded-md overflow-hidden border">
                                                {/* Use real img tag for printing support */}
                                                <img
                                                    src={item.image_src}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => setPreviewImage(item.image_src)}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between">
                                                    <p className="font-bold text-gray-900 line-clamp-2">{item.name}</p>
                                                    {item.sku && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200 ml-2 whitespace-nowrap">
                                                            Stok Kodu: {item.sku}
                                                        </span>
                                                    )}
                                                    {item.sampleData && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200 ml-2 whitespace-nowrap animate-pulse">
                                                            ✨ NUMUNE: {item.sampleData}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Special URL Link */}
                                                {item.url && (
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                                                    >
                                                        🔗 Özel Dosya Linki
                                                    </a>
                                                )}
                                                <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                                                    {item.material && <p>📄 <span className="font-medium">Doku:</span> {item.material}</p>}
                                                    {(() => {
                                                        if (!item.dimensions) return null;
                                                        // Extract Area if present in format "Size (Area)"
                                                        const match = item.dimensions.match(/(.*)\s\((.*)\)/);
                                                        const size = match ? match[1] : item.dimensions;
                                                        const area = match ? match[2] : null;

                                                        return (
                                                            <>
                                                                <p>📏 <span className="font-medium">Ölçüler:</span> {size}</p>
                                                                {area && <p>📐 <span className="font-medium">Toplam Alan:</span> {area}</p>}
                                                            </>
                                                        )
                                                    })()}
                                                    <p>🔢 <span className="font-medium">Adet:</span> {item.quantity}</p>
                                                    {item.productNote && (
                                                        <div className="mt-2 text-amber-700 text-xs border border-amber-200 bg-amber-50 p-2 rounded font-medium">
                                                            📝 <span className="font-bold">Ürün Notu:</span> {item.productNote}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Cargo Label Button */}
                            <div className="print:hidden">
                                {formData.cargoLabelPdf ? (
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    const byteCharacters = atob(formData.cargoLabelPdf as string);
                                                    const byteNumbers = new Array(byteCharacters.length);
                                                    for (let i = 0; i < byteCharacters.length; i++) {
                                                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                                                    }
                                                    const byteArray = new Uint8Array(byteNumbers);
                                                    const blob = new Blob([byteArray], { type: 'application/pdf' });
                                                    const url = URL.createObjectURL(blob);
                                                    window.open(url, '_blank');
                                                }}
                                                className="flex-1 py-3 border-2 border-blue-500 bg-blue-50 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-100 transition-all text-blue-700 font-bold"
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
                                                className="w-12 border-2 border-red-200 bg-red-50 rounded-xl flex items-center justify-center hover:bg-red-100 transition-all text-red-600"
                                                title="Etiketi Sil"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-center text-gray-400">Yüklü Belge Var</p>
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
                                        <div className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-blue-400 hover:text-blue-600 transition-all text-gray-500 font-bold">
                                            <Upload className="w-5 h-5" />
                                            Kargo Etiketi Yükle (PDF)
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Print Only: Process Notes History */}
                            <div className="hidden print:block mt-8 border-t pt-4">
                                <h3 className="font-bold text-gray-900 mb-2">İşlem Notları / Yazışma Geçmişi</h3>
                                {formData.comments && formData.comments.length > 0 ? (
                                    <ul className="space-y-2 text-sm font-mono">
                                        {formData.comments.map((comment: any, idx: number) => (
                                            <li key={idx} className="border-b pb-1">
                                                <span className="font-bold">{comment.author}</span> <span className="text-gray-500">[{comment.timestamp}]:</span> {comment.message}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-gray-500 italic">Henüz not eklenmemiş.</p>
                                )}
                            </div>

                            {/* EDITABLE FIELDS (Hidden in Print) */}
                            <div className="space-y-6 print:hidden">
                                <div className="h-px bg-gray-200 my-4" />
                                {/* Status */}
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-900">Durum</label>
                                    <select
                                        className="w-full p-2 border border-gray-300 rounded-lg bg-white text-black font-bold focus:ring-2 focus:ring-blue-500"
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as OrderStatus })}
                                    >
                                        {statuses.map(status => (
                                            <option key={status.id} value={status.id} className="text-black font-bold">{status.title}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Labels */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
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
                                                    }}
                                                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${isSelected
                                                        ? `${colors.bg} ${colors.text} ${colors.border} font-bold`
                                                        : "bg-gray-50 text-gray-500 hover:bg-gray-100 border-gray-200"
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
                                    <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                        <User className="w-4 h-4" /> {APP_CONFIG.assigneeLabel}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            readOnly
                                            className="w-full p-2 border border-gray-300 rounded-lg bg-gray-100 text-black font-bold cursor-not-allowed"
                                            value={currentUser.name}
                                        />
                                        <span className="absolute right-3 top-2.5 text-xs text-black font-bold">Sabit (Sen)</span>
                                    </div>
                                    <p className="text-[10px] text-gray-900 font-bold">
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
                                            className="w-full p-2 border border-gray-300 rounded-md text-black font-bold placeholder:text-gray-500"
                                            value={formData.trackingNumber || ""}
                                            onChange={(e) => setFormData({ ...formData, trackingNumber: e.target.value })}
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
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
                                    <FileText className="w-4 h-4" /> İşlem Notları
                                </label>
                                <NoteLog
                                    comments={formData.comments || []}
                                    onAddNote={(msg) => onAddComment(formData.id, msg, [])}
                                    currentUser={currentUser}
                                    className="h-[300px]"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
                                    <Upload className="w-4 h-4" /> Yazışma & Dosyalar
                                </label>
                                <ChatSection
                                    comments={formData.comments}
                                    onAddComment={(msg, att) => onAddComment(formData.id, msg, att)}
                                    currentUser={currentUser}
                                />
                            </div>

                            {/* Activity Log - Collapsible & Compact */}
                            <div className="pt-4 border-t border-gray-200 mt-2">
                                <button
                                    onClick={() => setIsActivityLogOpen(!isActivityLogOpen)}
                                    className="flex items-center gap-2 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 p-2 rounded-lg border border-gray-200 transition-colors w-full text-left"
                                >
                                    {isActivityLogOpen ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                    <History className="w-3.5 h-3.5" />
                                    İşlem Geçmişi (Logs)
                                </button>

                                {isActivityLogOpen && (
                                    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm animate-in slide-in-from-top-2 duration-200">
                                        <ActivityLog activities={(formData as any).activities} />
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-between print:hidden">
                    <span className="text-xs text-gray-400 font-mono self-center">Barkod: {formData.barcode}</span>
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
