"use client"

import { Order, OrderStatus, Comment } from "../data/mock-orders"
import { APP_CONFIG } from "../data/settings"
import { X, Save, Truck, User, Tag, FileText, Upload, Printer, FileDown, History, ChevronDown, ChevronRight, ExternalLink, Receipt, ShieldCheck, Download, Package, Scissors, ScrollText, Droplet, CheckCircle2, Camera, Image as ImageIcon } from "lucide-react"
import { useState, useEffect, useRef, useMemo } from "react"
import { NoteLog } from "./note-log"
import { ChatSection } from "./chat-section"
import { ActivityLog } from "./activity-log"
import { getColorClasses } from "@/lib/colors"
import { logManualActivity, uploadCargoLabel, deleteCargoLabel, getOrderDetails, fetchOrderForCargo, createInvoiceAction, createCargoLabelAction, createDHLShipmentAction, markOrderAsPaidAction, updateOrderDetails, syncOrderCargoToShopifyAction } from "../app/actions"
import { parseTurkishCityAndDistrict } from "@/lib/turkish-cities"
import { LocalBarcodeModal } from "./local-barcode-modal"
import { formatDimensions } from "./order-card"
import Barcode from "react-barcode"
import QRCode from "react-qr-code"
import { useReactToPrint } from "react-to-print"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface OrderDetailPanelProps {
    order: Order | null
    isOpen: boolean
    onClose: () => void
    onUpdate: (updatedOrder: Order) => void
    onAddComment: (orderId: number, message: string, attachments: any[], type: string) => void
    currentUser: { 
        id: string; 
        name: string; 
        role: string; 
        allowedStatuses?: string[];
        permissions?: {
            view: string[];
            move: string[];
            flags: string[];
        }
    }
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

    const activeOrderIdRef = useRef<number | null>(null)

    const parsedNote = useMemo(() => {
        if (!formData?.note) return { cleanNote: "", invoiceTitle: "", invoiceAddress: "", extraInfo: "" };
        
        let text = formData.note;
        let invoiceTitle = "";
        let invoiceAddress = "";
        let extraInfo = "";

        if (text.includes("FATURA İSTENDİ") || text.includes("FATURA BİLGİLERİ")) {
            const titleMatch = text.match(/•?\s*(?:Fatura Unvanı|Unvan):\s*([^\n•📦]+)/i);
            if (titleMatch) invoiceTitle = titleMatch[1].trim();

            const addrMatch = text.match(/•?\s*(?:Fatura Adresi|Adres):\s*([^\n•📦]+)/i);
            if (addrMatch) invoiceAddress = addrMatch[1].trim();

            const pkgMatch = text.match(/(📦\s*Toplam[^\n•]+)/i);
            if (pkgMatch) extraInfo = pkgMatch[1].trim();

            text = text
                .replace(/🧾\s*FATURA\s*(?:İSTENDİ|BİLGİLERİ):?[\s\S]*?(?=📦|$)/i, "")
                .replace(/📦\s*Toplam[^\n]+/gi, "")
                .trim();
        } else if (text.includes("📦 Toplam")) {
            const pkgMatch = text.match(/(📦\s*Toplam[^\n•]+)/i);
            if (pkgMatch) extraInfo = pkgMatch[1].trim();
            text = text.replace(/📦\s*Toplam[^\n]+/gi, "").trim();
        }

        return {
            cleanNote: text.trim(),
            invoiceTitle,
            invoiceAddress,
            extraInfo
        };
    }, [formData?.note]);
    const abortControllerRef = useRef<AbortController | null>(null)
    const printSlipRef = useRef<HTMLDivElement>(null)

    const reactToPrintFn = useReactToPrint({
        contentRef: printSlipRef,
        documentTitle: `Siparis-${formData?.externalId?.replace(/^pm_/, '') || formData?.id || ''}`,
        pageStyle: `
            @page {
                size: 100mm 150mm !important;
                margin: 0 !important;
            }
            @media print {
                html, body {
                    width: 100mm !important;
                    height: 150mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
            }
        `
    })

    // Sync formData when order prop changes
    useEffect(() => {
        if (order && isOpen) {
            // Update formData if it's a new order OR user hasn't made local modifications
            if (!formData || formData.id !== order.id || !isModified) {
                setFormData({ ...order })
                if (!formData || formData.id !== order.id) {
                    setIsModified(false)
                    setIsActivityLogOpen(true)
                }
            }
        } else if (!isOpen) {
            setFormData(null)
            setIsModified(false)
        }
    }, [order, isOpen, isModified])

    // Fetch full order details (comments & activities) safely without race conditions
    useEffect(() => {
        if (!order || !isOpen) {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort()
                abortControllerRef.current = null
            }
            activeOrderIdRef.current = null
            setLazyComments(null)
            setLazyActivities(null)
            setIsLoadingDetails(false)
            return
        }

        const currentOrderId = order.id
        const isDifferentOrder = activeOrderIdRef.current !== currentOrderId

        // Abort previous order's fetch if still in flight
        if (isDifferentOrder && abortControllerRef.current) {
            abortControllerRef.current.abort()
        }

        activeOrderIdRef.current = currentOrderId

        // When switching to a new order, immediately clear previous order's comments and show loading
        if (isDifferentOrder) {
            setLazyComments([])
            setLazyActivities([])
            setIsLoadingDetails(true)
        }

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        fetch(`/api/order-details?orderId=${currentOrderId}`, {
            cache: 'no-store',
            signal: abortController.signal
        })
            .then(async (res) => {
                if (!res.ok) throw new Error("API hatası")
                return res.json()
            })
            .then((details) => {
                // GUARD: If user switched to another order while this was fetching, DO NOT UPDATE!
                if (activeOrderIdRef.current !== currentOrderId) {
                    return
                }

                if (details) {
                    const formattedComments = (details.comments || []).map((c: any) => {
                        let displayTime = c.timestamp
                        try {
                            const d = new Date(c.timestamp)
                            if (d instanceof Date && !isNaN(d.getTime())) {
                                displayTime = d.toLocaleString('tr-TR', {
                                    timeZone: 'Europe/Istanbul',
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                })
                            }
                        } catch (e) {}
                        return { ...c, timestamp: displayTime }
                    })

                    setLazyComments((prev) => {
                        // Double check we are still on the same order
                        if (activeOrderIdRef.current !== currentOrderId) return prev
                        const now = Date.now()
                        const pendingOptimistic = (prev || []).filter((c: any) => 
                            c.isOptimistic && 
                            (now - (c.createdAt || 0) < 15000) &&
                            !formattedComments.some((fc: any) => 
                                fc.message === c.message && fc.type === c.type
                            )
                        )
                        return [...formattedComments, ...pendingOptimistic]
                    })
                    setLazyActivities(details.activities || [])
                }
            })
            .catch((e) => {
                if (e.name === 'AbortError') {
                    // Fetch was aborted because user switched orders
                    return
                }
                console.error("Lazy fetch err:", e)
            })
            .finally(() => {
                // GUARD: Only stop loading if we are still on this order
                if (activeOrderIdRef.current === currentOrderId) {
                    setIsLoadingDetails(false)
                }
            })

        return () => {
            abortController.abort()
        }
    }, [order?.id, isOpen])

    if (!isOpen || !formData) return null

    const handleInternalAddComment = async (msg: string, att: any[], type: string = "message") => {
        const newComment: any = {
            id: 'opt-' + Date.now(),
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
            type: type,
            isOptimistic: true,
            createdAt: Date.now()
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
        if (!confirm("Bu mesajı / dosyayı silmek istediğinize emin misiniz?")) return

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
                if (result.activity) {
                    setLazyActivities(prev => prev ? [result.activity, ...prev] : [result.activity])
                }
                router.refresh()
            }
        } catch (e: any) {
            toast.error("Silme işlemi sırasında bir hata oluştu.")
            setLazyComments(previousComments)
        }
    }

    const handleItemImageUpload = (itemId: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (!formData) return
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            const reader = new FileReader()
            reader.onload = (event) => {
                const rawResult = event.target?.result as string
                const img = new Image()
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    const MAX_WIDTH = 2560
                    const MAX_HEIGHT = 2560
                    let width = img.width
                    let height = img.height
                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width
                            width = MAX_WIDTH
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height
                            height = MAX_HEIGHT
                        }
                    }
                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext('2d')
                    const matchesItem = (i: any, idx: number) => {
                        if (itemId && i.id === itemId) return true;
                        if (!itemId && idx === 0) return true;
                        if (formData.items.length === 1) return true;
                        return false;
                    };
                    if (ctx) {
                        ctx.imageSmoothingEnabled = true
                        ctx.imageSmoothingQuality = 'high'
                        ctx.drawImage(img, 0, 0, width, height)
                        const isPng = file.type === 'image/png'
                        const finalBase64 = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
                        const updated = formData.items.map((i: any, idx: number) => matchesItem(i, idx) ? { ...i, image_src: finalBase64 } : i)
                        setFormData({ ...formData, items: updated })
                        setIsModified(true)
                        toast.success("Görsel yüklendi! Kaydetmek için 'Değişiklikleri Kaydet' butonuna basınız.")
                    } else {
                        const updated = formData.items.map((i: any, idx: number) => matchesItem(i, idx) ? { ...i, image_src: rawResult } : i)
                        setFormData({ ...formData, items: updated })
                        setIsModified(true)
                        toast.success("Görsel yüklendi! Kaydetmek için 'Değişiklikleri Kaydet' butonuna basınız.")
                    }
                }
                img.onerror = () => {
                    const matchesItem = (i: any, idx: number) => {
                        if (itemId && i.id === itemId) return true;
                        if (!itemId && idx === 0) return true;
                        if (formData.items.length === 1) return true;
                        return false;
                    };
                    const updated = formData.items.map((i: any, idx: number) => matchesItem(i, idx) ? { ...i, image_src: rawResult } : i)
                    setFormData({ ...formData, items: updated })
                    setIsModified(true)
                    toast.success("Görsel eklendi! Kaydetmek için 'Değişiklikleri Kaydet' butonuna basınız.")
                }
                img.src = rawResult
            }
            reader.readAsDataURL(file)
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
        if (!formData) return
        if (reactToPrintFn) {
            reactToPrintFn()
        } else {
            window.print()
        }
        await logManualActivity(formData.id, "PRINT_ORDER", "10x15 Barkod Sipariş Fişi yazdırıldı.")
    }

    const getSlipPlatformBadge = (): string | null => {
        if (!formData) return null
        const src = (formData.source || "").toLowerCase().trim()
        const barcode = (formData.barcode || "").toUpperCase().trim()
        const payMethod = (formData.paymentMethod || "").toUpperCase().trim()
        const labelsStr = (formData.labels || []).map((l: string) => l.toUpperCase())

        if (src === 'woo' || src === 'woocommerce') return 'WOO'
        if (src === 'printmarkt') return 'PRINTMARKT'
        if (src === 'wayfair') return 'WAYFAIR'
        if (src === 'shopify') return 'SHOPIFY'
        if (src === 'shopify_2') return 'SHOPIFY 2'
        if (src === 'etsy') return 'ETSY'

        if (barcode.startsWith('WC-') || barcode.startsWith('WOO-')) return 'WOO'
        if (barcode.startsWith('WF-') || barcode.startsWith('WAYFAIR-')) return 'WAYFAIR'
        if (barcode.startsWith('PM-') || barcode.startsWith('PRINTMARKT-')) return 'PRINTMARKT'
        if (barcode.startsWith('SHOP2-')) return 'SHOPIFY 2'
        if (barcode.startsWith('SH-') || barcode.startsWith('SHOPIFY-') || barcode.startsWith('SHOP-')) return 'SHOPIFY'
        if (barcode.startsWith('ET-') || barcode.startsWith('ETSY-')) return 'ETSY'

        if (labelsStr.some(l => l.includes('WOO'))) return 'WOO'
        if (labelsStr.some(l => l.includes('PRINTMARKT'))) return 'PRINTMARKT'
        if (labelsStr.some(l => l.includes('WAYFAIR'))) return 'WAYFAIR'
        if (labelsStr.some(l => l.includes('SHOPIFY 2') || l.includes('SHOPIFY2'))) return 'SHOPIFY 2'
        if (labelsStr.some(l => l.includes('SHOPIFY'))) return 'SHOPIFY'
        if (labelsStr.some(l => l.includes('ETSY'))) return 'ETSY'

        if (payMethod.includes('PRINTMARKT')) return 'PRINTMARKT'

        if (formData.source && formData.source.trim()) {
            return formData.source.toUpperCase().trim()
        }

        return null
    }

    const getSlipDisplayOrderNo = () => {
        if (!formData) return ''
        if ((formData.source === 'woo' || formData.source === 'wayfair' || formData.source === 'shopify' || formData.source === 'shopify_2' || formData.source === 'PrintMarkt') && formData.externalId) {
            const clean = formData.externalId.replace(/^pm_/, '')
            return clean.startsWith('#') ? clean : `#${clean}`
        }
        return `#${formData.id}`
    }

    const getSlipBarcodeValue = () => {
        if (!formData) return ''
        return (
            formData.cargoBarcode ||
            formData.cargoTrackingNumber ||
            formData.barcode ||
            (formData.externalId ? formData.externalId.replace(/^pm_/, '') : null) ||
            formData.id.toString()
        )
    }

    const getSlipM2 = (dimStr?: string | null) => {
        if (!dimStr || dimStr === '-') return ''
        if (/m²|m2/i.test(dimStr)) return ''
        const match = dimStr.match(/(\d+(?:\.\d+)?)\s*[^0-9]*?\s*[x*]\s*[^0-9]*?\s*(\d+(?:\.\d+)?)/)
        if (!match) return ''
        const w = parseFloat(match[1])
        const h = parseFloat(match[2])
        const isInch = (formData?.source || '').toLowerCase() === 'wayfair' || 
                       (formData?.barcode && formData.barcode.toUpperCase().startsWith('WF-')) || 
                       dimStr.includes('"') || 
                       /(?:^|\d|\s)(in|inch|inches|inc|inç)(?:\b|$)/i.test(dimStr)
        const m2 = isInch ? (w * 0.0254) * (h * 0.0254) : (w * h) / 10000
        return ` (${m2.toFixed(2)} m²)`
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

    const handleDownloadPreviewImage = async (url: string) => {
        try {
            let blob: Blob
            if (url.startsWith('data:')) {
                const res = await fetch(url)
                blob = await res.blob()
            } else {
                const res = await fetch(url)
                blob = await res.blob()
            }
            let ext = 'jpg'
            if (blob.type === 'image/png') ext = 'png'
            else if (blob.type === 'image/webp') ext = 'webp'
            else if (blob.type === 'image/gif') ext = 'gif'
            else if (blob.type === 'application/pdf') ext = 'pdf'

            const objectUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = `taslak-${formData.id || Date.now()}.${ext}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000)
            toast.success("Görsel tam kalitede indirildi")
        } catch (e) {
            const a = document.createElement('a')
            a.href = url
            a.download = "taslak.png"
            a.target = "_blank"
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end print:block print:static">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm print:hidden" onClick={onClose} />

            <LocalBarcodeModal
                order={formData}
                isOpen={isBarcodeModalOpen}
                onClose={() => setIsBarcodeModalOpen(false)}
            />

            {/* Image Preview Modal */}
            {previewImage && (
                <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
                    <div className="absolute top-4 right-4 flex gap-2">
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDownloadPreviewImage(previewImage)
                            }}
                            className="text-white hover:text-slate-200 bg-slate-900/50 p-2.5 rounded-full backdrop-blur-md transition-colors flex items-center justify-center cursor-pointer hover:bg-slate-800"
                            title="Orijinal Görseli İndir (Tam Kalite)"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                        <button className="text-white hover:text-slate-300 transition-colors p-1 cursor-pointer" onClick={() => setPreviewImage(null)}>
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

            {/* Global Print Styles for 10x15 cm Barcode Paper */}
            <style>{`
                @media print {
                    @page {
                        size: 100mm 150mm !important;
                        margin: 0 !important;
                    }
                    html, body {
                        width: 100mm !important;
                        height: 150mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body * {
                        visibility: hidden !important;
                    }
                    #order-10x15-slip, #order-10x15-slip *,
                    #local-barcode-print, #local-barcode-print * {
                        visibility: visible !important;
                    }
                    #order-10x15-slip {
                        display: flex !important;
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100mm !important;
                        min-height: 148mm !important;
                        margin: 0 !important;
                    }
                }
            `}</style>

            {/* 10x15 cm Barcode / Order Slip (Used by react-to-print & print media) */}
            <div 
                className="print:block"
                style={{ 
                    position: "absolute", 
                    left: "-9999px", 
                    top: 0, 
                    pointerEvents: "none" 
                }}
            >
                <div
                    ref={printSlipRef}
                    id="order-10x15-slip"
                    style={{
                        width: "100mm",
                        minHeight: "148mm",
                        boxSizing: "border-box",
                        padding: "3.5mm 4mm",
                        backgroundColor: "#ffffff",
                        color: "#000000",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                        fontSize: "10px",
                        lineHeight: "1.25",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between"
                    }}
                >
                    <div>
                        {/* HEADER: LOGO, COMPANY, ORDER NO, PLATFORM */}
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            borderBottom: "2px solid #000000",
                            paddingBottom: "4px",
                            marginBottom: "4px"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <img
                                    src={APP_CONFIG.companyLogo}
                                    alt={APP_CONFIG.companyName}
                                    style={{ height: "22px", width: "auto", objectFit: "contain" }}
                                    onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                <div>
                                    <div style={{ fontSize: "11px", fontWeight: "900", letterSpacing: "-0.2px", lineHeight: "1.1" }}>
                                        {APP_CONFIG.companyName}
                                    </div>
                                    <div style={{ fontSize: "8px", color: "#333333", lineHeight: "1.1" }}>
                                        {APP_CONFIG.companyPhone} • {APP_CONFIG.companyWeb}
                                    </div>
                                </div>
                            </div>

                            <div style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                                    {getSlipPlatformBadge() && (
                                        <span style={{
                                            fontSize: "8.5px",
                                            fontWeight: "900",
                                            backgroundColor: "#000000",
                                            color: "#ffffff",
                                            padding: "1px 4px",
                                            borderRadius: "2px",
                                            letterSpacing: "0.5px"
                                        }}>
                                            {getSlipPlatformBadge()}
                                        </span>
                                    )}
                                    <span style={{ fontSize: "15px", fontWeight: "900" }}>
                                        {getSlipDisplayOrderNo()}
                                    </span>
                                </div>
                                <div style={{ fontSize: "8.5px", color: "#444444", fontWeight: "600" }}>
                                    {formData.date ? new Date(formData.date).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                </div>
                            </div>
                        </div>

                        {/* PRICE & PAYMENT & BARCODE STRIP */}
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            border: "1.5px solid #000000",
                            borderRadius: "3px",
                            padding: "3px 5px",
                            marginBottom: "4px",
                            backgroundColor: "#fafafa"
                        }}>
                            {/* Barcode & QR */}
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {getSlipBarcodeValue() && (
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                                        <Barcode
                                            value={getSlipBarcodeValue()}
                                            width={1.15}
                                            height={26}
                                            fontSize={8}
                                            margin={0}
                                            lineColor="#000000"
                                        />
                                    </div>
                                )}
                                {getSlipBarcodeValue() && (
                                    <div style={{ display: "flex", alignItems: "center" }}>
                                        <QRCode
                                            value={getSlipBarcodeValue()}
                                            size={32}
                                            style={{ height: "32px", width: "32px" }}
                                            viewBox="0 0 256 256"
                                            fgColor="#000000"
                                            bgColor="#ffffff"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Total Amount */}
                            <div style={{ textAlign: "right", borderLeft: "1px solid #cccccc", paddingLeft: "6px" }}>
                                <div style={{ fontSize: "7.5px", textTransform: "uppercase", color: "#555555", fontWeight: "700" }}>
                                    Toplam Tutar
                                </div>
                                <div style={{ fontSize: "13px", fontWeight: "900", color: "#000000", whiteSpace: "nowrap" }}>
                                    {formData.total}
                                </div>
                                {formData.paymentMethod && (
                                    <div style={{ fontSize: "7.5px", color: "#333333", fontWeight: "600" }}>
                                        {formData.paymentMethod}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CUSTOMER & DELIVERY INFO */}
                        <div style={{
                            border: "1px solid #000000",
                            borderRadius: "3px",
                            padding: "4px 6px",
                            marginBottom: "4px",
                            fontSize: "9.5px",
                            lineHeight: "1.3"
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid #eeeeee", paddingBottom: "2px", marginBottom: "2px" }}>
                                <div>
                                    <span style={{ fontWeight: "700", color: "#555555", fontSize: "8.5px" }}>MÜŞTERİ: </span>
                                    <span style={{ fontWeight: "900", fontSize: "11px" }}>{formData.customer}</span>
                                </div>
                                {formData.phone && (
                                    <div style={{ fontWeight: "700", fontSize: "10px" }}>
                                        📞 {formData.phone}
                                    </div>
                                )}
                            </div>

                            {formData.address && (
                                <div style={{ color: "#111111" }}>
                                    <span style={{ fontWeight: "700", color: "#555555", fontSize: "8.5px" }}>ADRES: </span>
                                    <span>{formData.address}</span>
                                </div>
                            )}

                            {formData.city && (
                                <div style={{ fontWeight: "900", fontSize: "10px", marginTop: "1px", textTransform: "uppercase" }}>
                                    📍 {formData.city}
                                </div>
                            )}

                            {/* Customer Note */}
                            {formData.note && (
                                <div style={{
                                    marginTop: "3px",
                                    padding: "3px 5px",
                                    border: "1px dashed #000000",
                                    borderRadius: "2px",
                                    backgroundColor: "#f5f5f5",
                                    fontSize: "9px"
                                }}>
                                    <strong style={{ color: "#000000" }}>📝 Müşteri Notu: </strong>
                                    <span>{formData.note}</span>
                                </div>
                            )}
                        </div>

                        {/* INVOICE / TAX INFO (If exists) */}
                        {(formData.taxNumber || formData.taxOffice) && (
                            <div style={{
                                border: "1px solid #666666",
                                borderRadius: "2px",
                                padding: "2px 5px",
                                marginBottom: "4px",
                                fontSize: "8.5px",
                                display: "flex",
                                justifyContent: "space-between",
                                backgroundColor: "#fbfbfb"
                            }}>
                                <span><strong>Fatura:</strong> TCKN/VKN: <strong>{formData.taxNumber || "-"}</strong></span>
                                <span>Vergi Dairesi: <strong>{formData.taxOffice || "-"}</strong></span>
                            </div>
                        )}

                        {/* PRODUCTS SECTION */}
                        <div style={{ marginBottom: "4px" }}>
                            <div style={{
                                fontSize: "9px",
                                fontWeight: "900",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                                borderBottom: "1.5px solid #000000",
                                paddingBottom: "2px",
                                marginBottom: "3px",
                                display: "flex",
                                justifyContent: "space-between"
                            }}>
                                <span>ÜRÜNLER ({formData.items.length})</span>
                                <span style={{ fontSize: "8px", fontWeight: "600", color: "#555555" }}>Üretim & Paketleme</span>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {formData.items.map((item, idx) => {
                                    const extraM2 = getSlipM2(item.dimensions);
                                    const firstImg = (item.image_src || "").split('|').filter(Boolean)[0];
                                    return (
                                        <div
                                            key={item.id || idx}
                                            style={{
                                                display: "flex",
                                                gap: "6px",
                                                border: "1px solid #dddddd",
                                                borderRadius: "3px",
                                                padding: "3px 4px",
                                                pageBreakInside: "avoid"
                                            }}
                                        >
                                            {/* Images */}
                                            <div style={{ display: "flex", gap: "3px", flexShrink: 0 }}>
                                                {firstImg && (
                                                    <img
                                                        src={firstImg}
                                                        alt={item.name}
                                                        style={{
                                                            width: "36px",
                                                            height: "36px",
                                                            objectFit: "cover",
                                                            borderRadius: "2px",
                                                            border: "1px solid #999999"
                                                        }}
                                                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                    />
                                                )}
                                                {item.croppedImage && item.croppedImage !== firstImg && (
                                                    <div style={{ position: "relative" }}>
                                                        <img
                                                            src={item.croppedImage}
                                                            alt="Kırpılan"
                                                            style={{
                                                                width: "36px",
                                                                height: "36px",
                                                                objectFit: "cover",
                                                                borderRadius: "2px",
                                                                border: "1.5px solid #000000"
                                                            }}
                                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                        />
                                                        <span style={{
                                                            position: "absolute",
                                                            bottom: "0",
                                                            left: "0",
                                                            right: "0",
                                                            backgroundColor: "#000000",
                                                            color: "#ffffff",
                                                            fontSize: "6px",
                                                            fontWeight: "900",
                                                            textAlign: "center",
                                                            lineHeight: "1"
                                                        }}>
                                                            KIRPILAN
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Details */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: "9px",
                                                    fontWeight: "800",
                                                    lineHeight: "1.2",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap"
                                                }}>
                                                    {item.name}
                                                </div>

                                                <div style={{
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    gap: "3px",
                                                    marginTop: "2px",
                                                    fontSize: "8px"
                                                }}>
                                                    {item.sku && (
                                                        <span style={{
                                                            border: "1px solid #000000",
                                                            padding: "0 3px",
                                                            borderRadius: "2px",
                                                            fontWeight: "700"
                                                        }}>
                                                            KOD: {item.sku}
                                                        </span>
                                                    )}
                                                    {item.material && (
                                                        <span style={{
                                                            border: "1px solid #777777",
                                                            padding: "0 3px",
                                                            borderRadius: "2px"
                                                        }}>
                                                            {item.material}
                                                        </span>
                                                    )}
                                                    {item.dimensions && item.dimensions !== '-' && (
                                                        <span style={{
                                                            border: "1px solid #777777",
                                                            padding: "0 3px",
                                                            borderRadius: "2px",
                                                            fontWeight: "700"
                                                        }}>
                                                            📏 {formatDimensions(item.dimensions, formData.source, formData.barcode)}{extraM2}
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        backgroundColor: "#000000",
                                                        color: "#ffffff",
                                                        padding: "0 4px",
                                                        borderRadius: "2px",
                                                        fontWeight: "900",
                                                        marginLeft: "auto"
                                                    }}>
                                                        ADET: {item.quantity}
                                                    </span>
                                                </div>

                                                {item.sampleData && (
                                                    <div style={{
                                                        fontSize: "7.5px",
                                                        fontWeight: "700",
                                                        color: "#000000",
                                                        marginTop: "1px"
                                                    }}>
                                                        ✨ Numune: {item.sampleData}
                                                    </div>
                                                )}

                                                {item.productNote && (
                                                    <div style={{
                                                        fontSize: "7.5px",
                                                        fontStyle: "italic",
                                                        color: "#333333",
                                                        marginTop: "1px"
                                                    }}>
                                                        Not: {item.productNote}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* WAREHOUSE STOCK MATCH BANNER (if exists) */}
                        {formData.warehouseStockMatch && (
                            <div style={{
                                border: "1px solid #000000",
                                backgroundColor: "#f5f5f5",
                                padding: "2px 5px",
                                marginBottom: "4px",
                                fontSize: "8px",
                                fontWeight: "700"
                            }}>
                                📦 DEPO STOK KULLANIMI: {formData.warehouseStockMatch.sku} ({formData.warehouseStockMatch.dimensions})
                            </div>
                        )}

                        {/* PROCESS NOTES / HISTORY (Latest comments) */}
                        {formData.comments && formData.comments.length > 0 && (
                            <div style={{
                                borderTop: "1px dashed #888888",
                                paddingTop: "2px",
                                marginBottom: "2px"
                            }}>
                                <div style={{ fontSize: "8px", fontWeight: "800", color: "#333333", marginBottom: "1px" }}>
                                    İşlem / Yazışma Notları:
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                    {formData.comments.slice(-2).map((comment: any, cIdx: number) => {
                                        const authorName = typeof comment.author === 'object' ? (comment.author?.name || 'Sistem') : (comment.author || 'Sistem');
                                        return (
                                            <div key={cIdx} style={{ fontSize: "7.5px", color: "#222222", lineHeight: "1.2" }}>
                                                <strong>{authorName}</strong>: {comment.message}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* FOOTER */}
                    <div style={{
                        borderTop: "1px solid #000000",
                        paddingTop: "2px",
                        marginTop: "3px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "7.5px",
                        color: "#555555"
                    }}>
                        <span>10x15 Barkod Sipariş Ekstresi</span>
                        <span>{APP_CONFIG.companyName} • {new Date().toLocaleDateString('tr-TR')}</span>
                    </div>
                </div>
            </div>

            {/* Panel */}
            <div className="relative w-full max-w-3xl lg:max-w-4xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 print:hidden">

                {/* Header */}
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold dark:text-slate-100">
                                Sipariş {(formData.source === 'woo' || formData.source === 'wayfair' || formData.source === 'shopify' || formData.source === 'shopify_2' || formData.source === 'PrintMarkt') && formData.externalId ? `#${formData.externalId.replace(/^pm_/, '')}` : `#${formData.id}`}
                            </h2>
                            {((formData.source || '').toLowerCase().startsWith('shopify') || (formData.barcode || '').startsWith('SH-') || (formData.barcode || '').startsWith('SHOP')) && (
                                <span className={`${(formData.source || '').toLowerCase() === 'shopify_2' ? 'bg-[#5c6ac4]' : 'bg-[#008060]'} text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm`}>
                                    {(formData.source || '').toLowerCase() === 'shopify_2' ? 'SHOPIFY 2' : 'SHOPIFY'}
                                </span>
                            )}
                            {((formData.source || '').toLowerCase() === 'etsy' || (formData.barcode || '').startsWith('ET-')) && (
                                <span className="bg-[#F1641E] text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                    <span className="font-serif italic lowercase font-extrabold translate-y-[0.5px]">e</span>
                                    ETSY
                                </span>
                            )}
                            {((formData.source || '').toLowerCase() === 'wayfair' || (formData.barcode || '').startsWith('WF-')) && (
                                <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                    WAYFAIR
                                </span>
                            )}
                            {(((formData.source || '').toLowerCase() === 'woo' || (formData.source || '').toLowerCase() === 'woocommerce') || (!formData.source && (formData.barcode || '').startsWith('WC-'))) && (
                                <span className="bg-[#96588A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                                    WOO
                                </span>
                            )}
                            {((formData.source || '').toLowerCase() === 'printmarkt' || (formData.barcode || '').startsWith('PM-') || (formData.paymentMethod || '').toUpperCase().includes('PRINTMARKT')) && (
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border text-blue-700 bg-blue-100 border-blue-200 shadow-sm">
                                    PRINTMARKT
                                </span>
                            )}
                        </div>
                        {/* Compact user info for header */}
                        <div className="font-medium text-slate-900 dark:text-slate-300">
                            {formData.customer.split('\n').map((line, i, arr) => (
                                <span key={i} className={arr.length > 1 && i === 0 ? "font-bold" : arr.length > 1 && i > 0 ? "text-xs text-slate-500 uppercase block" : ""}>
                                    {line}
                                </span>
                            ))}
                            {(formData.source === 'woo' || formData.source === 'wayfair' || formData.source === 'shopify' || formData.source === 'shopify_2' || formData.source === 'PrintMarkt') && formData.externalId && (
                                <span className="ml-2 text-xs text-slate-400 font-mono inline-block">(Sistem ID: #{formData.id})</span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handlePrint} 
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors shadow-xs" 
                            title="10x15 cm Barkod Kağıdına Sipariş Fişi / Ekstre Yazdır"
                        >
                            <Printer className="w-4 h-4" />
                            <span>10x15 Fiş Yazdır</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full dark:text-slate-400">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content - Two Column Layout */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                        {/* LEFT COLUMN: Order Details */}
                        <div className="space-y-6 min-w-0">
                            {/* WAREHOUSE STOCK MATCH BANNER */}
                            {formData.warehouseStockMatch && (
                                <div className={`p-4 rounded-xl space-y-3 shadow-md border-2 ${
                                    formData.warehouseStockMatch.matchType === "close_smaller"
                                        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-500"
                                        : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500"
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className={`flex items-center gap-2 font-bold text-sm ${
                                            formData.warehouseStockMatch.matchType === "close_smaller"
                                                ? "text-amber-900 dark:text-amber-200"
                                                : "text-emerald-800 dark:text-emerald-200"
                                        }`}>
                                            {formData.warehouseStockMatch.matchType === "close_smaller" ? (
                                                <Scissors className="w-5 h-5 text-amber-600 shrink-0" />
                                            ) : (
                                                <Package className="w-5 h-5 text-emerald-600 shrink-0" />
                                            )}
                                            <span>
                                                {formData.warehouseStockMatch.matchType === "close_smaller"
                                                    ? "Depodaki Büyük Stok Bu Sipariş İçin Kesilip Kullanılabilir!"
                                                    : "Bu Ürün Deponuzda Birebir Hazır Stokta Bulunuyor!"}
                                            </span>
                                        </div>
                                        <span className={`text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                                            formData.warehouseStockMatch.matchType === "close_smaller"
                                                ? "bg-amber-600"
                                                : "bg-emerald-600"
                                        }`}>
                                            {formData.warehouseStockMatch.source} İADESİ
                                        </span>
                                    </div>
                                    
                                    <p className={`text-xs ${
                                        formData.warehouseStockMatch.matchType === "close_smaller"
                                            ? "text-amber-800 dark:text-amber-300"
                                            : "text-emerald-700 dark:text-emerald-300"
                                    }`}>
                                        {formData.warehouseStockMatch.matchType === "close_smaller" ? (
                                            <>
                                                Yeni baskı almanıza gerek olmayabilir. Depodaki <strong>{formData.warehouseStockMatch.dimensions}</strong> ölçülü ürün bu siparişten daha büyüktür. Kenarlarından kesilerek ({formData.warehouseStockMatch.orderDimensions || "küçük sipariş"} için) kullanılabilir.
                                            </>
                                        ) : (
                                            <>
                                                Yeni baskı almanıza gerek olmayabilir. Bu ürün daha önce <strong>{formData.warehouseStockMatch.source}</strong> üzerinden iade edilmiş ve depoda hazır bekliyor.
                                            </>
                                        )}
                                    </p>

                                    <div className={`flex gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border ${
                                        formData.warehouseStockMatch.matchType === "close_smaller"
                                            ? "border-amber-200 dark:border-amber-800"
                                            : "border-emerald-200 dark:border-emerald-800"
                                    }`}>
                                        <a
                                            href={formData.warehouseStockMatch.imageUrl || `/api/warehouse-stock/image?id=${formData.warehouseStockMatch.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Ürün görselini büyüt"
                                            className="block group relative shrink-0"
                                        >
                                            <img
                                                src={formData.warehouseStockMatch.imageUrl || `/api/warehouse-stock/image?id=${formData.warehouseStockMatch.id}`}
                                                alt={formData.warehouseStockMatch.sku || "Depo Ürünü"}
                                                className={`w-20 h-20 rounded-lg object-cover border group-hover:scale-105 transition-transform bg-slate-100 dark:bg-slate-800 shadow-xs ${
                                                    formData.warehouseStockMatch.matchType === "close_smaller"
                                                        ? "border-amber-300 dark:border-amber-700"
                                                        : "border-emerald-300 dark:border-emerald-700"
                                                }`}
                                                onError={(e) => {
                                                    const target = e.target as HTMLElement;
                                                    target.style.display = 'none';
                                                    if (target.parentElement) target.parentElement.style.display = 'none';
                                                }}
                                            />
                                        </a>
                                        <div className="flex-1 text-xs text-slate-800 dark:text-slate-200 grid grid-cols-2 gap-2">
                                            <div><span className="text-slate-500 dark:text-slate-400">Ürün Kodu:</span> <strong>{formData.warehouseStockMatch.sku}</strong></div>
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400">Depo Ölçüsü:</span> <strong>{formData.warehouseStockMatch.dimensions}</strong>
                                                {formData.warehouseStockMatch.matchType === "close_smaller" && formData.warehouseStockMatch.orderDimensions && (
                                                    <span className="block text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                                                        Sipariş: {formData.warehouseStockMatch.orderDimensions} (Küçük)
                                                    </span>
                                                )}
                                            </div>
                                            <div><span className="text-slate-500 dark:text-slate-400">Doku / Kağıt:</span> <strong>{formData.warehouseStockMatch.material}</strong></div>
                                            <div><span className="text-slate-500 dark:text-slate-400">İade Sipariş No:</span> <strong>#{formData.warehouseStockMatch.orderNo || "-"}</strong></div>
                                            {formData.warehouseStockMatch.returnReason && (
                                                <div className="col-span-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                                                    <span className="text-slate-500 dark:text-slate-400">İade Nedeni / Müşteri:</span> <strong>{formData.warehouseStockMatch.returnReason}</strong>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-1">
                                        {formData.warehouseStockMatch.pdfPath && (
                                            <a
                                                href={`/api/warehouse-stock/pdf?id=${formData.warehouseStockMatch.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 py-2 px-3 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-50 text-center transition-colors"
                                            >
                                                📄 İade Formu PDF&apos;ini Aç
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (confirm("Bu ürün depodan alındı ve bu siparişte kullanıldı olarak işaretlensin mi?")) {
                                                    try {
                                                        const res = await fetch("/api/warehouse-stock", {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({
                                                                id: formData.warehouseStockMatch?.id,
                                                                status: "used",
                                                                usedInOrderId: formData.id
                                                            })
                                                        });
                                                        if (res.ok) {
                                                            toast.success("Depo stoğu kullanıldı olarak işaretlendi.");
                                                            setFormData({ ...formData, warehouseStockMatch: null });
                                                            router.refresh();
                                                        }
                                                    } catch (e) {
                                                        toast.error("İşlem sırasında hata oluştu.");
                                                    }
                                                }
                                            }}
                                            className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold text-center transition-colors shadow-xs"
                                        >
                                            ✅ Depodan Kullanıldı (Stoktan Düş)
                                        </button>
                                    </div>
                                </div>
                            )}

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

                                    <div className="text-slate-600 dark:text-slate-400 text-sm space-y-1.5">
                                        {formData.phone && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">📞</span>
                                                <a
                                                    href={(() => {
                                                        const clean = formData.phone.replace(/\D/g, "");
                                                        if (!clean) return "#";
                                                        if (clean.startsWith("00")) return `https://wa.me/${clean.substring(2)}`;
                                                        if (clean.startsWith("0") && clean.length === 11) return `https://wa.me/90${clean.substring(1)}`;
                                                        if (clean.length === 10 && clean.startsWith("5")) return `https://wa.me/90${clean}`;
                                                        return `https://wa.me/${clean}`;
                                                    })()}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 group transition-colors"
                                                    title="WhatsApp'ta Sohbet Başlat"
                                                >
                                                    <span className="hover:underline">{formData.phone}</span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 group-hover:bg-emerald-500 group-hover:text-white dark:group-hover:bg-emerald-600 group-hover:border-emerald-500 transition-all shadow-xs">
                                                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                                                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                                                        </svg>
                                                        WhatsApp
                                                    </span>
                                                </a>
                                            </div>
                                        )}
                                        {formData.email && (
                                            <p className="flex items-center gap-2">
                                                <span className="text-base">📧</span>
                                                <a
                                                    href={`mailto:${formData.email}`}
                                                    className="text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                                                    title="E-posta Gönder"
                                                >
                                                    {formData.email}
                                                </a>
                                            </p>
                                        )}
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

                                    {parsedNote.cleanNote && (
                                        <div className="text-amber-800 dark:text-amber-300 text-xs border border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg mt-2 font-medium whitespace-pre-wrap break-words leading-relaxed shadow-xs">
                                            <div className="font-bold mb-1 flex items-center gap-1 text-amber-900 dark:text-amber-200">
                                                <span>📝</span> <span>Müşteri Notu:</span>
                                            </div>
                                            <p>{parsedNote.cleanNote}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Fatura Bilgileri Card */}
                            <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Receipt className="w-4 h-4" /> Fatura Bilgileri
                                    </div>
                                    {(formData.invoiceUrl || formData.invoiceStatus === 'created') && (
                                        <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Fatura Kesildi
                                        </span>
                                    )}
                                </h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">TCKN / VKN</label>
                                            <input
                                                type="text"
                                                className="w-full p-2 text-xs border dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold"
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

                                    {/* Fatura Unvanı */}
                                    {(parsedNote.invoiceTitle || formData.taxNumber) && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Fatura Unvanı / Şirket Adı</label>
                                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white/70 dark:bg-slate-900/60 p-2 rounded border dark:border-slate-700">
                                                {parsedNote.invoiceTitle || formData.customer}
                                            </div>
                                        </div>
                                    )}

                                    {/* Fatura Adresi */}
                                    {(parsedNote.invoiceAddress || formData.taxNumber) && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Fatura Adresi</label>
                                            <div className="text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-900/60 p-2 rounded border dark:border-slate-700 leading-relaxed">
                                                {parsedNote.invoiceAddress || (formData.address ? `${formData.address} ${formData.city ? `(${formData.city})` : ''}` : "Kargo adresi ile aynı")}
                                            </div>
                                        </div>
                                    )}

                                    {formData.invoiceUrl && (
                                        <div className="pt-2 border-t border-blue-100 dark:border-blue-900/30">
                                            <a
                                                href={
                                                    formData.invoiceUrl.includes("faturaentegrator.com/download/invoice/")
                                                        ? `/api/invoice-pdf/${formData.id}`
                                                        : formData.invoiceUrl
                                                }
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
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-amber-500" />
                                        <span>Ürünler ({formData.items.length})</span>
                                    </h3>
                                    {formData.items.length > 1 && (
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-xs">
                                            {parsedNote.extraInfo || `Çoklu Ürün (${formData.items.length} Kalem)`}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    {formData.items.map(item => (
                                        <div key={item.id} className="flex flex-col gap-3 border dark:border-slate-700 p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
                                            <div className="flex gap-2 flex-wrap">
                                                {(() => {
                                                    const isMaterial = item.sku?.startsWith('MLZ') || 
                                                                       item.material === 'Kağıt' || 
                                                                       item.material?.toLowerCase().includes('boya') || 
                                                                       formData.source === 'malzeme' || 
                                                                       formData.labels?.includes('Malzeme');

                                                    if (isMaterial) {
                                                        const name = (item.name || "").trim();
                                                        const material = (item.material || "").trim();
                                                        const sku = (item.sku || "").toUpperCase();
                                                        const matLower = material.toLowerCase();

                                                        const isHp = matLower.includes('hp') || sku.includes('HP');
                                                        const isEpson = matLower.includes('epson') || sku.includes('EPSON');
                                                        const isPaper = !isHp && !isEpson && (matLower.includes('kağıt') || matLower.includes('kagit') || sku.includes('PAPER') || sku.includes('KGT') || sku.includes('NW') || sku.includes('TEX'));
                                                        
                                                        const lowerName = name.toLowerCase();
                                                        let colorHex = isPaper ? '#38BDF8' : isHp ? '#EC4899' : '#F97316';
                                                        if (lowerName.includes('light cyan')) colorHex = '#7DD3FC';
                                                        else if (lowerName.includes('light macenta') || lowerName.includes('light magenta')) colorHex = '#F472B6';
                                                        else if (lowerName.includes('cyan')) colorHex = '#00AEEF';
                                                        else if (lowerName.includes('magenta') || lowerName.includes('macenta')) colorHex = '#EC008C';
                                                        else if (lowerName.includes('yellow')) colorHex = '#FACC15';
                                                        else if (lowerName.includes('light black')) colorHex = '#64748B';
                                                        else if (lowerName.includes('black')) colorHex = '#18181B';
                                                        else if (lowerName.includes('orange')) colorHex = '#EA580C';
                                                        else if (lowerName.includes('red')) colorHex = '#DC2626';
                                                        else if (lowerName.includes('optimizer')) colorHex = '#94A3B8';
                                                        else if (lowerName.includes('overcoat')) colorHex = '#CBD5E1';
                                                        else if (lowerName.includes('cleaning')) colorHex = '#06B6D4';
                                                        else if (lowerName.includes('temizlik kiti') || lowerName.includes('kiti')) colorHex = '#0D9488';
                                                        else if (lowerName.includes('stick')) colorHex = '#8B5CF6';
                                                        else if (lowerName.includes('universal') || lowerName.includes('kafa')) colorHex = '#6366F1';

                                                        return (
                                                            <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col items-center justify-center p-2 text-center shadow-md relative select-none">
                                                                <div 
                                                                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-1 shadow-md"
                                                                    style={{
                                                                        backgroundColor: `${colorHex}25`,
                                                                        border: `1.5px solid ${colorHex}`
                                                                    }}
                                                                >
                                                                    {isPaper ? (
                                                                        <ScrollText className="w-5 h-5 text-blue-400" />
                                                                    ) : (
                                                                        <Droplet className="w-5 h-5" style={{ color: colorHex }} />
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] font-extrabold text-white truncate max-w-full">
                                                                    {item.name}
                                                                </span>
                                                                <span 
                                                                    className="text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5 truncate max-w-full"
                                                                    style={{ color: colorHex, backgroundColor: `${colorHex}20` }}
                                                                >
                                                                    {isPaper ? (item.dimensions && item.dimensions !== '-' ? item.dimensions : 'Kağıt Rulo') : (isHp ? 'HP Boya' : 'Epson Boya')}
                                                                </span>
                                                            </div>
                                                        );
                                                    }

                                                    const rawImgUrls = (item.image_src || "").split('|').filter(Boolean);
                                                    const imgUrls = rawImgUrls.map((u: string) => {
                                                        if (u.startsWith('blob:')) return "";
                                                        const driveMatch = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
                                                        if (driveMatch && driveMatch[1]) {
                                                            return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
                                                        }
                                                        if (u.includes('dropbox.com') && u.includes('dl=0')) {
                                                            return u.replace('dl=0', 'raw=1');
                                                        }
                                                        return u;
                                                    }).filter(Boolean);

                                                    return (
                                                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                                                            <div className="flex flex-wrap gap-2 items-center">
                                                                {imgUrls.length > 0 ? (
                                                                    imgUrls.map((imgSrc: string, idx: number) => {
                                                                        const isThisCropped = item.croppedImage && imgSrc === item.croppedImage;
                                                                        return (
                                                                            <div key={idx} className={`w-24 h-24 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-md overflow-hidden border ${isThisCropped ? 'border-2 border-emerald-500 shadow-xs' : 'dark:border-slate-600'} relative group/img`}>
                                                                                {/* Use real img tag for printing support */}
                                                                                <img
                                                                                    src={imgSrc}
                                                                                    alt={`${item.name} ${idx + 1}`}
                                                                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                                                    onClick={() => setPreviewImage(imgSrc)}
                                                                                    onError={(e) => {
                                                                                        // Graceful fallback for broken image
                                                                                        (e.currentTarget as HTMLElement).style.display = 'none';
                                                                                        const parent = e.currentTarget.parentElement;
                                                                                        if (parent && !parent.querySelector('.fallback-err')) {
                                                                                            const div = document.createElement('div');
                                                                                            div.className = 'fallback-err w-full h-full flex flex-col items-center justify-center text-[10px] text-amber-500 font-semibold p-1 text-center bg-amber-50 dark:bg-amber-950/30';
                                                                                            div.innerHTML = '<span>⚠️ Görsel</span><span>Yüklenemedi</span>';
                                                                                            parent.appendChild(div);
                                                                                        }
                                                                                    }}
                                                                                />
                                                                                {isThisCropped && (
                                                                                    <div className="absolute top-0 inset-x-0 bg-emerald-600 text-white text-[9px] font-black py-0.5 text-center flex items-center justify-center gap-0.5 shadow-xs">
                                                                                        <Scissors className="w-2.5 h-2.5" />
                                                                                        <span>KIRPILAN</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <div className="w-24 h-24 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-md border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                                                                        <ImageIcon className="w-6 h-6 opacity-40 mb-1" />
                                                                        <span className="text-[10px] font-medium leading-tight">Görsel Yok</span>
                                                                    </div>
                                                                )}
                                                                {/* If croppedImage is not in image_src list, also render it */}
                                                                {item.croppedImage && !imgUrls.includes(item.croppedImage) && (
                                                                    <div className="w-24 h-24 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-md overflow-hidden border-2 border-emerald-500 relative group/img shadow-xs">
                                                                        <img
                                                                            src={item.croppedImage}
                                                                            alt={`${item.name} Kırpılan`}
                                                                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                                            onClick={() => setPreviewImage(item.croppedImage!)}
                                                                        />
                                                                        <div className="absolute top-0 inset-x-0 bg-emerald-600 text-white text-[9px] font-black py-0.5 text-center flex items-center justify-center gap-0.5 shadow-xs">
                                                                            <Scissors className="w-2.5 h-2.5" />
                                                                            <span>KIRPILAN</span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded border border-blue-200 dark:border-blue-800 cursor-pointer transition-colors shadow-xs">
                                                                <Camera className="w-3 h-3" />
                                                                <span>{imgUrls.length > 0 ? "Görsel Değiştir" : "Görsel Yükle"}</span>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="hidden"
                                                                    onChange={(e) => handleItemImageUpload(item.id, e)}
                                                                />
                                                            </label>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <div className="w-full min-w-0 break-words">
                                                <div className="flex items-start justify-between flex-wrap gap-y-2 mb-2">
                                                    <p className="font-bold text-slate-900 dark:text-slate-100 line-clamp-2">{item.name}</p>
                                                    {item.sampleData && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200 ml-2 animate-pulse text-right">
                                                            ✨ NUMUNE: {item.sampleData}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {item.sku && (() => {
                                                        let displaySku = item.sku;
                                                        if (item.sampleData && (displaySku.startsWith('NU-') || displaySku.startsWith('nu-'))) {
                                                            const parts = item.sampleData.split(' - ');
                                                            const actualSku = parts[0]?.trim();
                                                            if (actualSku && actualSku.length < 15) {
                                                                displaySku = `${displaySku} (${actualSku})`;
                                                            }
                                                        }
                                                        return (
                                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs sm:text-[13px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 uppercase shadow-xs">
                                                                Kod: {displaySku}
                                                            </span>
                                                        );
                                                    })()}
                                                    {item.material && (
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs sm:text-[13px] font-bold border shadow-xs ${
                                                            item.material.toLowerCase().includes('hp')
                                                                ? 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950/60 dark:text-pink-300 dark:border-pink-800'
                                                                : item.material.toLowerCase().includes('epson')
                                                                    ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800'
                                                                    : item.material.toLowerCase().includes('kağıt')
                                                                        ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                                                                        : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                                                        }`}>
                                                            <span>{item.material.toLowerCase().includes('hp') ? '🎨' : item.material.toLowerCase().includes('epson') ? '🖨️' : item.material.toLowerCase().includes('kağıt') ? '📜' : ''}</span>
                                                            <span>{item.material}</span>
                                                        </span>
                                                    )}
                                                    {item.dimensions && item.dimensions !== '-' && (() => {
                                                         const dimStr = item.dimensions;
                                                         const hasM2 = /m²|m2/i.test(dimStr);
                                                         
                                                         // Try to parse dimensions (supports decimals and spaces)
                                                         const match = dimStr.match(/(\d+(?:\.\d+)?)\s*[^0-9]*?\s*[x*]\s*[^0-9]*?\s*(\d+(?:\.\d+)?)/)
                                                         let extraM2 = "";
                                                         const isInch = (formData?.source || '').toLowerCase() === 'wayfair' || 
                                                                        (formData?.barcode && formData.barcode.toUpperCase().startsWith('WF-')) ||
                                                                        dimStr.includes('"') || 
                                                                        /(?:^|\d|\s)(in|inch|inches|inc|inç)(?:\b|$)/i.test(dimStr);
                                                         if (match && !hasM2) {
                                                             const w = parseFloat(match[1])
                                                             const h = parseFloat(match[2])
                                                             let m2 = isInch ? (w * 0.0254) * (h * 0.0254) : (w * h) / 10000;
                                                             extraM2 = ` (${m2.toFixed(2)} m²)`;
                                                         }
                                                         
                                                         const formattedDim = formatDimensions(dimStr, formData?.source, formData?.barcode);
                                                         
                                                         return (
                                                             <span className={item.dimensions === 'SAMPLE' ? "inline-flex items-center text-xs sm:text-[13px] bg-pink-50 dark:bg-pink-900/30 px-2.5 py-1 rounded-md text-pink-700 dark:text-pink-400 font-bold border border-pink-200 dark:border-pink-800 animate-pulse shadow-xs" : "inline-flex items-center text-xs sm:text-[13px] font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-xs"}>
                                                                 {item.dimensions === 'SAMPLE' ? '✨ SAMPLE' : `📏 ${formattedDim}${extraM2}`}
                                                             </span>
                                                         );
                                                     })()}
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs sm:text-[13px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shadow-xs">
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
                                                                className="flex-1 min-w-0 w-full text-[10px] p-1.5 border dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900 font-medium focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-100"
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
                                                    <div className="mt-2.5 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg flex flex-col gap-2 shadow-xs">
                                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                                            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                                                                <Scissors className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                                                Müşterinin Kırptığı Görsel:
                                                            </span>
                                                            <a
                                                                href={item.croppedImage}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 hover:underline"
                                                            >
                                                                <span>Yeni Sekmede Aç</span>
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] uppercase font-bold text-slate-500">Kırpma:</span>
                                                            <input
                                                                type="text"
                                                                className="flex-1 min-w-0 w-full text-[10px] p-1.5 border border-emerald-300 dark:border-emerald-800 rounded bg-white dark:bg-slate-900 font-mono text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500"
                                                                value={item.croppedImage || ""}
                                                                onChange={(e) => {
                                                                    const newItems = formData.items.map(i => i.id === item.id ? { ...i, croppedImage: e.target.value } : i)
                                                                    setFormData({ ...formData, items: newItems })
                                                                    setIsModified(true)
                                                                }}
                                                                placeholder="Kırpılan Resim Linki"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(item.croppedImage || "");
                                                                    toast.success("Kırpma linki kopyalandı!");
                                                                }}
                                                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow-xs transition-colors shrink-0 flex items-center gap-1"
                                                            >
                                                                Kopyala
                                                            </button>
                                                        </div>
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
                                    {Boolean(formData.invoiceUrl || formData.invoiceStatus === 'created') ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => {
                                                    const pdfUrl = formData.invoiceUrl?.includes("faturaentegrator.com/download/invoice/")
                                                        ? `/api/invoice-pdf/${formData.id}`
                                                        : (formData.invoiceUrl || `/api/invoice-pdf/${formData.id}`);
                                                    window.open(pdfUrl, '_blank');
                                                }}
                                                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-200 dark:shadow-none text-xs"
                                                title="Fatura başarıyla kesildi. Tıklayarak PDF'i açın veya indirin."
                                            >
                                                <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                                                <div className="flex flex-col items-start leading-tight">
                                                    <span>Fatura Kesildi</span>
                                                    <span className="text-[9px] font-normal opacity-90">İndir / Görüntüle</span>
                                                </div>
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!window.confirm("Bu siparişin faturası zaten kesilmiş. Tekrar yeni bir fatura kesmek istediğinize emin misiniz? (Yeni bir fatura seri numarası kullanılacaktır)")) {
                                                        return;
                                                    }
                                                    const effectiveTaxNumber = (formData.taxNumber || "11111111111").trim();
                                                    const effectiveTaxOffice = (formData.taxOffice || "").trim();
                                                    if (isModified) {
                                                        await updateOrderDetails({
                                                            ...formData,
                                                            taxNumber: effectiveTaxNumber,
                                                            taxOffice: effectiveTaxOffice
                                                        });
                                                        setIsModified(false);
                                                    }
                                                    toast.promise(createInvoiceAction(formData.id, effectiveTaxNumber, effectiveTaxOffice), {
                                                        loading: "EDM Bilişim üzerinden fatura oluşturuluyor...",
                                                        success: (res: any) => {
                                                            if (res.error) throw new Error(res.error);
                                                            const updated = {
                                                                ...formData,
                                                                taxNumber: effectiveTaxNumber,
                                                                taxOffice: effectiveTaxOffice,
                                                                invoiceStatus: 'created',
                                                                invoiceUrl: res.url
                                                            };
                                                            setFormData(updated);
                                                            if (onUpdate) onUpdate(updated);
                                                            return "Fatura başarıyla oluşturuldu!";
                                                        },
                                                        error: (err) => err.message || "Hata oluştu"
                                                    });
                                                }}
                                                className="px-2 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-[10px] font-semibold transition-all shrink-0"
                                                title="Faturayı Tekrar Kes"
                                            >
                                                Yeniden Kes
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={async () => {
                                                const effectiveTaxNumber = (formData.taxNumber || "11111111111").trim();
                                                const effectiveTaxOffice = (formData.taxOffice || "").trim();
                                                if (isModified) {
                                                    await updateOrderDetails({
                                                        ...formData,
                                                        taxNumber: effectiveTaxNumber,
                                                        taxOffice: effectiveTaxOffice
                                                    });
                                                    setIsModified(false);
                                                }
                                                toast.promise(createInvoiceAction(formData.id, effectiveTaxNumber, effectiveTaxOffice), {
                                                    loading: "EDM Bilişim üzerinden fatura oluşturuluyor...",
                                                    success: (res: any) => {
                                                        if (res.error) throw new Error(res.error);
                                                        const updated = {
                                                            ...formData,
                                                            taxNumber: effectiveTaxNumber,
                                                            taxOffice: effectiveTaxOffice,
                                                            invoiceStatus: 'created',
                                                            invoiceUrl: res.url
                                                        };
                                                        setFormData(updated);
                                                        if (onUpdate) onUpdate(updated);
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
                                    )}

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

                                            // Auto-normalize city and district (e.g. "istanbul kadıköy" -> "Kadıköy / İstanbul")
                                            const locParsed = parseTurkishCityAndDistrict(formData.city, formData.address);
                                            let currentCity = formData.city;
                                            if (locParsed && locParsed.formattedCity && locParsed.formattedCity !== formData.city) {
                                                currentCity = locParsed.formattedCity;
                                                formData.city = locParsed.formattedCity;
                                            }

                                            const toastId = toast.loading("DHL oluşturuluyor...");
                                            try {
                                                if (isModified) {
                                                    updateOrderDetails({ ...formData, city: currentCity }).catch(() => {});
                                                    setIsModified(false);
                                                }
                                                // Use standard fetch instead of Server Action to prevent Next.js connection hanging / action-hash bugs
                                                const timeoutPromise = new Promise<{error: string}>((_, reject) => 
                                                    setTimeout(() => reject(new Error("Kargo Entegratör yanıt vermedi (Zaman Aşımı). Lütfen tekrar deneyin.")), 25000)
                                                );
                                                
                                                const fetchPromise = fetch('/api/dhl-create', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ 
                                                        orderId: formData.id,
                                                        city: currentCity,
                                                        address: formData.address,
                                                        customer: formData.customer,
                                                        phone: formData.phone
                                                    })
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
                                            {(() => {
                                                const isShopify = formData.source === 'shopify' || 
                                                    formData.source === 'shopify_2' || 
                                                    (formData.barcode && formData.barcode.startsWith('SH-')) ||
                                                    (Array.isArray(formData.labels) && formData.labels.some((l: any) => String(l).toLowerCase().includes('shopify'))) ||
                                                    (typeof formData.labels === 'string' && (formData.labels as string).toLowerCase().includes('shopify'));

                                                if (isShopify) {
                                                    return (
                                                        <button
                                                            onClick={() => window.open(`https://admin.shopify.com/store/orders?query=${formData.externalId || formData.id}`, '_blank')}
                                                            className="py-3 mt-2 border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:border-emerald-400 transition-all text-emerald-700 dark:text-emerald-400 font-bold text-xs"
                                                        >
                                                            <ExternalLink className="w-5 h-5 text-emerald-600" />
                                                            Shopify'da Aç
                                                        </button>
                                                    );
                                                }

                                                if (formData.source === 'woocommerce' || (formData.barcode && formData.barcode.startsWith('WC-'))) {
                                                    return (
                                                        <button
                                                            onClick={() => window.open(`https://duvarkagidimarketi.com/wp-admin/post.php?post=${formData.externalId || formData.id}&action=edit`, '_blank')}
                                                            className="py-3 mt-2 border-2 border-slate-300 bg-slate-50 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-slate-100 hover:border-slate-400 transition-all text-slate-600 font-bold text-xs"
                                                        >
                                                            <ExternalLink className="w-5 h-5" />
                                                            WooCommerce'da Aç
                                                        </button>
                                                    );
                                                }

                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {(() => {
                                    const isEasyshipLabel = !!(formData.cargoLabelPdf && (formData.cargoLabelPdf.startsWith('easyship:') || formData.cargoLabelPdf.includes('/easyship:')));
                                    const hasValidLabel = !!((formData.cargoBarcode || formData.cargoLabelPdf || formData.hasCargoPdf) && !isEasyshipLabel);

                                    if (hasValidLabel) {
                                        return (
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

                                                {formData.source?.startsWith('shopify') && (
                                                    <button
                                                        onClick={async () => {
                                                            const toastId = toast.loading("Kargo takip bilgisi Shopify'a iletiliyor...");
                                                            try {
                                                                const res = await syncOrderCargoToShopifyAction(formData.id);
                                                                if (res.error) {
                                                                    toast.error(res.error, { id: toastId });
                                                                } else {
                                                                    toast.success(res.message || "Shopify siparişi gönderildi olarak işaretlendi!", { id: toastId });
                                                                }
                                                            } catch (err: any) {
                                                                toast.error(err.message, { id: toastId });
                                                            }
                                                        }}
                                                        className="w-full py-2 px-3 border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg flex items-center justify-center gap-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold text-xs transition-all shadow-xs"
                                                    >
                                                        <Truck className="w-3.5 h-3.5 text-emerald-600" />
                                                        Shopify'a Kargo Bildir (Gönderildi Yap)
                                                    </button>
                                                )}
                                                <p className="text-[10px] text-center text-slate-400">Yüklü Belge Var</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-3">
                                            {isEasyshipLabel && (
                                                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex flex-col gap-2">
                                                    <div>
                                                        <p className="font-bold flex items-center gap-1">
                                                            <span>⚠️</span> Easyship Kargo Etiketi Hazır
                                                        </p>
                                                        <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                                                            Bu siparişin kargo barkodu PrintMarkt üzerinde Easyship ile oluşturulmuştur. Güvenlik nedeniyle doğrudan indirilemez. PrintMarkt panelinden indirdiğiniz PDF kargo etiketini aşağıdaki alandan yükleyebilirsiniz.
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => window.open(`/api/cargo-label/${formData.id}?t=${Date.now()}`, '_blank')}
                                                        className="w-full py-1.5 border border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded-lg text-amber-900 dark:text-amber-300 font-bold transition-all flex items-center justify-center gap-1.5"
                                                    >
                                                        <FileDown className="w-3.5 h-3.5" />
                                                        Easyship Bilgilerini Göster
                                                    </button>
                                                </div>
                                            )}
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
                                                                 setFormData({ ...formData, cargoLabelPdf: base64, hasCargoPdf: true });
                                                                 onUpdate({ ...formData, cargoLabelPdf: base64, hasCargoPdf: true });
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
                                        </div>
                                    );
                                })()}

                                <hr className="border-slate-200 dark:border-slate-700 my-4" />

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
                                        {statuses.map(status => {
                                            const isCurrent = status.id === formData.status;
                                            const hasMovePermission = () => {
                                                if (currentUser.role === 'admin') return true;
                                                if (currentUser.permissions) {
                                                    return currentUser.permissions.move.includes(status.id);
                                                }
                                                if (currentUser.allowedStatuses) {
                                                    return currentUser.allowedStatuses.includes(status.id);
                                                }
                                                return true;
                                            };
                                            const canSelect = isCurrent || hasMovePermission();
                                            return (
                                                <option 
                                                    key={status.id} 
                                                    value={status.id} 
                                                    disabled={!canSelect}
                                                    className="text-black dark:text-white font-bold disabled:text-slate-400"
                                                >
                                                    {status.title} {!canSelect ? " (Yetki Yok)" : ""}
                                                </option>
                                            );
                                        })}
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
                        <div className="flex flex-col h-full print:hidden space-y-6 min-w-0">

                            {/* Note Log (Top Right) */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200 mb-3">
                                    <FileText className="w-4 h-4" /> İşlem Notları
                                </label>
                                <NoteLog
                                    key={`note-${formData.id}`}
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
                                    key={`chat-${formData.id}`}
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
