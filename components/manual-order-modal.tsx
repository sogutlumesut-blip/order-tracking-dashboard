"use client"

import { useState, useRef, useEffect } from "react"
import { X, Upload, Loader2, Plus, FileText, Clipboard, Copy, Trash2, Package } from "lucide-react"
import { toast } from "sonner"

interface ManualOrderModalProps {
    isOpen: boolean
    onClose: () => void
    onCreate: (orderData: any) => Promise<void>
}

interface ProductItem {
    id: string
    productName: string
    quantity: string
    width: string
    height: string
    unit: string
    material: string
    sample: string
    note: string
    sku: string
    imageLink: string
    pdfLink: string
    files: { name: string; type: 'image' | 'pdf'; content: string }[]
}

function generateSku(): string {
    return "PM-" + Math.floor(100000 + Math.random() * 900000)
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 5)
}

const createDefaultProduct = (idx: number = 1): ProductItem => ({
    id: generateId(),
    productName: "",
    quantity: "1",
    width: "",
    height: "",
    unit: "cm",
    material: "",
    sample: "",
    note: "",
    sku: generateSku(),
    imageLink: "",
    pdfLink: "",
    files: []
})

export function ManualOrderModal({ isOpen, onClose, onCreate }: ManualOrderModalProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [activeProductIndex, setActiveProductIndex] = useState(0)
    const [draggingProductIndex, setDraggingProductIndex] = useState<number | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const pendingProductIndexRef = useRef<number>(0)

    const [customerData, setCustomerData] = useState({
        customer: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        total: "",
        generalNote: "",
        cargoBarcodeLink: ""
    })

    const [products, setProducts] = useState<ProductItem[]>([createDefaultProduct(1)])

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setCustomerData(prev => ({ ...prev, [name]: value }))
    }

    const handleProductChange = (index: number, field: keyof ProductItem, value: any) => {
        setProducts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
    }

    const handleProductImageLinkChange = (index: number, rawVal: string) => {
        let val = rawVal.trim()
        if (val.startsWith('blob:')) {
            toast.error("Tarayıcı 'blob:' linkleri dışarıdan açılamaz. Lütfen görseli kopyalayıp (Cmd+V) yapıştırın!")
            handleProductChange(index, 'imageLink', '')
            return
        }

        const driveMatch = val.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
        if (driveMatch && driveMatch[1]) {
            val = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`
            toast.info("Google Drive bağlantısı doğrudan görsel formatına dönüştürüldü.")
        } else if (val.includes('dropbox.com') && val.includes('dl=0')) {
            val = val.replace('dl=0', 'raw=1')
        }

        handleProductChange(index, 'imageLink', val)
    }

    const addProduct = () => {
        const newProd = createDefaultProduct(products.length + 1)
        setProducts(prev => [...prev, newProd])
        setActiveProductIndex(products.length)
        toast.success(`${products.length + 1}. ürün eklendi!`)
    }

    const duplicateProduct = (index: number) => {
        const source = products[index]
        const clone: ProductItem = {
            ...source,
            id: generateId(),
            sku: generateSku(),
            productName: source.productName ? `${source.productName} (Kopya)` : "",
            files: [...source.files]
        }
        setProducts(prev => [...prev, clone])
        setActiveProductIndex(products.length)
        toast.success(`Ürün kopyalandı (${products.length + 1}. ürün oluşturuldu).`)
    }

    const removeProduct = (index: number) => {
        if (products.length <= 1) {
            toast.info("En az 1 ürün bulunmalıdır.")
            return
        }
        setProducts(prev => prev.filter((_, i) => i !== index))
        setActiveProductIndex(prev => {
            if (prev >= index && prev > 0) return prev - 1
            return 0
        })
        toast.success("Ürün kaldırıldı.")
    }

    const removeFile = (productIndex: number, fileIndex: number) => {
        setProducts(prev => prev.map((p, i) => i === productIndex ? {
            ...p,
            files: p.files.filter((_, fi) => fi !== fileIndex)
        } : p))
    }

    const processFileForProduct = (file: File, productIndex: number) => {
        const isImage = file.type.startsWith('image/')
        const isPdf = file.type === 'application/pdf'

        if (!isImage && !isPdf) {
            toast.error("Sadece resim veya PDF yükleyebilirsiniz.")
            return
        }

        if (isImage) {
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
                    if (ctx) {
                        ctx.imageSmoothingEnabled = true
                        ctx.imageSmoothingQuality = 'high'
                        ctx.drawImage(img, 0, 0, width, height)
                        const isPng = file.type === 'image/png'
                        const finalBase64 = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
                        setProducts(prev => prev.map((p, i) => i === productIndex ? {
                            ...p,
                            files: [...p.files, {
                                name: file.name || "yapistirilan-gorsel.jpg",
                                type: 'image',
                                content: finalBase64
                            }]
                        } : p))
                        toast.success("Görsel başarıyla eklendi!")
                    } else {
                        setProducts(prev => prev.map((p, i) => i === productIndex ? {
                            ...p,
                            files: [...p.files, {
                                name: file.name || "yapistirilan-gorsel.jpg",
                                type: 'image',
                                content: rawResult
                            }]
                        } : p))
                        toast.success("Görsel eklendi!")
                    }
                }
                img.onerror = () => {
                    setProducts(prev => prev.map((p, i) => i === productIndex ? {
                        ...p,
                        files: [...p.files, {
                            name: file.name || "gorsel.jpg",
                            type: 'image',
                            content: rawResult
                        }]
                    } : p))
                    toast.success("Görsel eklendi!")
                }
                img.src = rawResult
            }
            reader.readAsDataURL(file)
        } else {
            if (file.size > 1024 * 1024) {
                toast.error("PDF dosyası çok büyük (Max 1MB). Lütfen link alanını kullanın.")
                return
            }
            const reader = new FileReader()
            reader.onload = (event) => {
                if (event.target?.result) {
                    setProducts(prev => prev.map((p, i) => i === productIndex ? {
                        ...p,
                        files: [...p.files, {
                            name: file.name,
                            type: 'pdf',
                            content: event.target!.result as string
                        }]
                    } : p))
                    toast.success("PDF başarıyla eklendi!")
                }
            }
            reader.readAsDataURL(file)
        }
    }

    // Window paste handler (uses activeProductIndex)
    useEffect(() => {
        if (!isOpen) return

        const onWindowPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i]
                    if (item.type.startsWith('image/')) {
                        const blob = item.getAsFile()
                        if (blob) {
                            e.preventDefault()
                            e.stopPropagation()
                            processFileForProduct(blob, activeProductIndex)
                            return
                        }
                    }
                }
            }

            const text = e.clipboardData?.getData('text/plain') || ''
            if (text.trim().startsWith('blob:')) {
                e.preventDefault()
                toast.error("Tarayıcı 'blob:' linkleri geçicidir ve dışarıdan açılamaz. Lütfen görseli sağ tıklayıp 'Resmi Kopyala' yapın ve doğrudan Cmd+V ile buraya yapıştırın!", {
                    duration: 8000
                })
            }
        }

        window.addEventListener('paste', onWindowPaste)
        return () => window.removeEventListener('paste', onWindowPaste)
    }, [isOpen, activeProductIndex, products.length])

    const handlePasteFromClipboard = async (productIndex: number) => {
        try {
            if (navigator.clipboard && navigator.clipboard.read) {
                const items = await navigator.clipboard.read()
                let foundImage = false
                for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'))
                    if (imageType) {
                        const blob = await item.getType(imageType)
                        const file = new File([blob], "pano-gorsel.jpg", { type: imageType })
                        processFileForProduct(file, productIndex)
                        foundImage = true
                        break
                    }
                }
                if (!foundImage) {
                    toast.info("Panoda kopyalanmış bir görsel bulunamadı. Lütfen önce görseli sağ tıklayıp 'Resmi Kopyala' yapınız.")
                }
            } else {
                toast.info("Görseli yapıştırmak için klavyenizden Cmd+V (veya Ctrl+V) tuşlarına basınız.")
            }
        } catch (err) {
            toast.info("Görseli yapıştırmak için klavyenizden Cmd+V (veya Ctrl+V) tuşlarına basınız.")
        }
    }

    const triggerFileInput = (idx: number) => {
        pendingProductIndexRef.current = idx
        setActiveProductIndex(idx)
        fileInputRef.current?.click()
    }

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFileForProduct(e.target.files[0], pendingProductIndexRef.current)
            e.target.value = ""
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!customerData.customer.trim()) {
            toast.error("Müşteri Ad Soyad zorunludur.")
            return
        }

        for (let i = 0; i < products.length; i++) {
            if (!products[i].productName.trim()) {
                toast.error(`${i + 1}. ürünün adı zorunludur.`)
                return
            }
        }

        setIsLoading(true)
        try {
            const items = products.map((p, idx) => {
                const dimensions = p.width && p.height
                    ? `${p.width} x ${p.height} ${p.unit}`
                    : ""

                let area = ""
                if (p.width && p.height) {
                    const w = parseFloat(p.width)
                    const h = parseFloat(p.height)
                    if (!isNaN(w) && !isNaN(h)) {
                        if (p.unit === 'cm') {
                            area = ((w * h) / 10000).toFixed(2) + " m²"
                        } else {
                            area = ((w * 2.54 * h * 2.54) / 10000).toFixed(2) + " m²"
                        }
                    }
                }

                const imageFiles = p.files.filter(f => f.type === 'image').map(f => f.content)
                let validImageLink = p.imageLink?.trim() || ""
                if (validImageLink.startsWith('blob:')) {
                    validImageLink = ""
                }
                const driveMatch = validImageLink.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
                if (driveMatch && driveMatch[1]) {
                    validImageLink = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`
                } else if (validImageLink.includes('dropbox.com') && validImageLink.includes('dl=0')) {
                    validImageLink = validImageLink.replace('dl=0', 'raw=1')
                }

                const allImages = [...(validImageLink ? [validImageLink] : []), ...imageFiles]
                const mainImage = allImages.length > 0 ? allImages.join('|') : "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=300"

                const specialUrl = p.pdfLink || p.files.find(f => f.type === 'pdf')?.content || customerData.cargoBarcodeLink || null

                let finalNote = p.note || ""
                if (p.sample) {
                    finalNote = (finalNote ? finalNote + "\n" : "") + "📌 NUMUNE İSTEĞİ: " + p.sample
                }

                const pQty = Math.max(1, parseInt(String(p.quantity || 1), 10) || 1)

                return {
                    name: p.productName.trim(),
                    sku: p.sku || `PM-${Math.floor(100000 + Math.random() * 900000)}`,
                    quantity: pQty,
                    image_src: mainImage,
                    material: p.material || null,
                    dimensions: dimensions + (area ? ` (${area})` : ""),
                    productNote: finalNote || null,
                    url: specialUrl
                }
            })

            const mainImage = items[0]?.image_src || "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=300"
            const mainSpecialUrl = customerData.cargoBarcodeLink || items[0]?.url || null

            const combinedNotes = [
                customerData.generalNote?.trim(),
                products.length > 1 ? `📦 Toplam ${products.length} farklı ürün kalemi içerir.` : ""
            ].filter(Boolean).join("\n\n")

            const orderPayload = {
                customer: customerData.customer.trim(),
                phone: customerData.phone.trim(),
                email: customerData.email.trim(),
                address: customerData.address.trim(),
                city: customerData.city.trim(),
                total: customerData.total.trim(),
                note: combinedNotes,
                dimensions: items[0]?.dimensions || "",
                image_src: mainImage,
                url: mainSpecialUrl,
                status: 'pending_woo',
                items: items
            }

            // 1. Close modal immediately to not block UI
            onClose()
            setIsLoading(false)

            // 2. Start upload in background
            setTimeout(() => {
                onCreate(orderPayload)
                    .catch((err: any) => {
                        toast.error(err?.message || 'Sipariş yüklenirken hata oluştu.')
                    })
            }, 100)

        } catch (error: any) {
            console.error(error)
            toast.error(error?.message || "Sipariş oluşturulurken hata oluştu.")
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border dark:border-slate-800">

                {/* Header */}
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/60">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
                            <Plus className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold dark:text-slate-100 flex items-center gap-2">
                                Manuel Sipariş Oluştur
                                {products.length > 1 && (
                                    <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                                        {products.length} Ürün Kalemi
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Müşteri bilgileri tek, ürünler ve görseller ayrı eklenebilir.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Hidden Global File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,.pdf"
                    onChange={handleFileInputChange}
                />

                {/* Form Body */}
                <div className="p-4 md:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 dark:text-slate-200">

                    {/* Section: Customer Info */}
                    <div className="bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-xl space-y-3.5">
                        <div className="flex items-center justify-between border-b dark:border-slate-800/80 pb-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <span>👤</span>
                                <span>Müşteri Bilgileri</span>
                            </h3>
                            <span className="text-[11px] text-slate-400 font-medium">Ortak Sipariş Bilgisi</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Ad Soyad *</label>
                                <input
                                    name="customer"
                                    value={customerData.customer}
                                    onChange={handleCustomerChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all font-medium"
                                    placeholder="Örn: Ahmet Yılmaz"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Telefon</label>
                                <input
                                    name="phone"
                                    value={customerData.phone}
                                    onChange={handleCustomerChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all"
                                    placeholder="0532..."
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Toplam Fiyat (₺)</label>
                                <div className="relative">
                                    <input
                                        name="total"
                                        value={customerData.total}
                                        onChange={handleCustomerChange}
                                        className="w-full pl-2 pr-7 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all font-bold text-blue-600 dark:text-blue-400"
                                        placeholder="Örn: 11745"
                                    />
                                    <span className="absolute right-2.5 top-2 text-sm font-bold text-slate-400">₺</span>
                                </div>
                            </div>

                            <div className="space-y-1 md:col-span-3">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Adres</label>
                                <input
                                    name="address"
                                    value={customerData.address}
                                    onChange={handleCustomerChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all"
                                    placeholder="Mahalle, Cadde, Sokak, No, Daire..."
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Şehir (İlçe / İl)</label>
                                <input
                                    name="city"
                                    value={customerData.city}
                                    onChange={handleCustomerChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all"
                                    placeholder="Örn: Beylikdüzü / İstanbul"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">E-posta</label>
                                <input
                                    name="email"
                                    value={customerData.email}
                                    onChange={handleCustomerChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all"
                                    placeholder="ornek@mail.com"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Kargo Barkodu (PDF Linki)</label>
                                <input
                                    name="cargoBarcodeLink"
                                    value={customerData.cargoBarcodeLink}
                                    onChange={handleCustomerChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-900 transition-all"
                                    placeholder="https://...pdf"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section: Products List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b dark:border-slate-800 pb-2">
                            <div className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    Sipariş Edilen Ürünler ({products.length})
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={addProduct}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                            >
                                <Plus className="w-4 h-4" />
                                + 2. Ürün Ekle (Farklı Ölçü / Doku / Görsel)
                            </button>
                        </div>

                        {/* Product Cards */}
                        <div className="space-y-5">
                            {products.map((prod, idx) => {
                                const isCurrentActive = activeProductIndex === idx
                                const isDropTarget = draggingProductIndex === idx

                                return (
                                    <div
                                        key={prod.id}
                                        onFocus={() => setActiveProductIndex(idx)}
                                        onClick={() => setActiveProductIndex(idx)}
                                        className={`border rounded-xl p-4 transition-all duration-200 ${
                                            isCurrentActive
                                                ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/10 bg-white dark:bg-slate-900/90 shadow-sm'
                                                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 hover:border-slate-300'
                                        }`}
                                    >
                                        {/* Card Top Banner */}
                                        <div className="flex items-center justify-between mb-3.5 pb-2 border-b dark:border-slate-800">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                                                    {idx + 1}
                                                </span>
                                                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                                    {idx + 1}. Ürün Detayları
                                                </span>
                                                {prod.productName && (
                                                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-[200px] truncate hidden sm:inline">
                                                        — {prod.productName}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        duplicateProduct(idx)
                                                    }}
                                                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1"
                                                    title="Bu ürünün özelliklerini kopyalayarak yeni ürün oluştur"
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Bu Ürünü Çoğalt</span>
                                                </button>

                                                {products.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            removeProduct(idx)
                                                        }}
                                                        className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors flex items-center gap-1 border border-red-200 dark:border-red-900/50"
                                                        title="Bu ürünü siparişten kaldır"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        <span>Kaldır</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Product Fields */}
                                        <div className="space-y-3.5">
                                            {/* Row 1: Name and Quantity */}
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                                <div className="md:col-span-9 space-y-1">
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                        Ürün Adı / Modeli *
                                                    </label>
                                                    <input
                                                        value={prod.productName}
                                                        onChange={(e) => handleProductChange(idx, 'productName', e.target.value)}
                                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all font-medium"
                                                        placeholder="Örn: Nötr Tonlu Vintage Ağaçlı Orman Manzarası"
                                                    />
                                                </div>

                                                <div className="md:col-span-3 space-y-1">
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                        Adet
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={prod.quantity}
                                                        onChange={(e) => handleProductChange(idx, 'quantity', e.target.value)}
                                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all font-bold"
                                                        placeholder="1"
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 2: Dimensions & Texture */}
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                                <div className="md:col-span-3 space-y-1">
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Genişlik</label>
                                                    <input
                                                        type="number"
                                                        value={prod.width}
                                                        onChange={(e) => handleProductChange(idx, 'width', e.target.value)}
                                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                                        placeholder="Örn: 290"
                                                    />
                                                </div>

                                                <div className="md:col-span-3 space-y-1">
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Yükseklik</label>
                                                    <input
                                                        type="number"
                                                        value={prod.height}
                                                        onChange={(e) => handleProductChange(idx, 'height', e.target.value)}
                                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                                        placeholder="Örn: 270"
                                                    />
                                                </div>

                                                <div className="md:col-span-2 space-y-1">
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Birim</label>
                                                    <select
                                                        value={prod.unit}
                                                        onChange={(e) => handleProductChange(idx, 'unit', e.target.value)}
                                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                                    >
                                                        <option value="cm">cm</option>
                                                        <option value="inch">inç</option>
                                                    </select>
                                                </div>

                                                <div className="md:col-span-4 space-y-1">
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Kağıt Cinsi / Doku</label>
                                                    <select
                                                        value={prod.material}
                                                        onChange={(e) => handleProductChange(idx, 'material', e.target.value)}
                                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all font-medium"
                                                    >
                                                        <option value="">Kağıt Türü Seç</option>
                                                        <option value="Dokusuz Duvar Kağıdı">Dokusuz Duvar Kağıdı</option>
                                                        <option value="Dokulu Duvar Kağıdı">Dokulu Duvar Kağıdı</option>
                                                        <option value="Tekstil Duvar Kağıdı">Tekstil Duvar Kağıdı</option>
                                                        <option value="Kendiliğinden Yapışkanlı Folyo">Kendiliğinden Yapışkanlı Folyo</option>
                                                        <option value="Premium Tekstil Duvar Kağıdı">Premium Tekstil Duvar Kağıdı</option>
                                                        <option value="Dokulu Kendiliğinden Yapışkanlı Duvar Kağıdı">Dokulu Kendiliğinden Yapışkanlı Duvar Kağıdı</option>
                                                        <option value="Hasır Dokulu Duvar Kağıdı">Hasır Dokulu Duvar Kağıdı</option>
                                                        <option value="Gümüş Duvar Kağıdı">Gümüş Duvar Kağıdı</option>
                                                        <option value="Gold Duvar Kağıdı">Gold Duvar Kağıdı</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Row 3: Product Note */}
                                            <div className="space-y-1">
                                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                    Bu Ürüne Özel Not (opsiyonel)
                                                </label>
                                                <input
                                                    value={prod.note}
                                                    onChange={(e) => handleProductChange(idx, 'note', e.target.value)}
                                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                                    placeholder="Örn: 2 parça halinde basılacak / Özel renk tonu / Numune..."
                                                />
                                            </div>

                                            {/* Row 4: Images & Links for this Product */}
                                            <div className="p-3 rounded-lg bg-slate-100/70 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/80 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                                        <span>🖼️</span>
                                                        <span>Bu Ürünün Görseli ve Dosyaları</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePasteFromClipboard(idx)}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 transition-colors shadow-2xs"
                                                    >
                                                        <Clipboard className="w-3 h-3" />
                                                        Panodan Yapıştır (Cmd+V)
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                                            Görsel Linki (Web / Google Drive)
                                                        </label>
                                                        <input
                                                            value={prod.imageLink}
                                                            onChange={(e) => handleProductImageLinkChange(idx, e.target.value)}
                                                            className="w-full p-1.5 border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950"
                                                            placeholder="https://... (veya Google Drive linki)"
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                                            Tasarım / Baskı PDF Linki (varsa)
                                                        </label>
                                                        <input
                                                            value={prod.pdfLink}
                                                            onChange={(e) => handleProductChange(idx, 'pdfLink', e.target.value)}
                                                            className="w-full p-1.5 border border-slate-300 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-blue-500 outline-none bg-white dark:bg-slate-950"
                                                            placeholder="https://...pdf"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Upload / Drag / Thumbnails */}
                                                <div
                                                    onDragOver={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        setDraggingProductIndex(idx)
                                                    }}
                                                    onDragLeave={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        setDraggingProductIndex(null)
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        setDraggingProductIndex(null)
                                                        setActiveProductIndex(idx)
                                                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                            for (let fi = 0; fi < e.dataTransfer.files.length; fi++) {
                                                                processFileForProduct(e.dataTransfer.files[fi], idx)
                                                            }
                                                        }
                                                    }}
                                                    className={`p-2.5 rounded-lg border-2 border-dashed transition-all flex flex-wrap gap-2.5 items-center ${
                                                        isDropTarget
                                                            ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 ring-2 ring-blue-300'
                                                            : 'border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60'
                                                    }`}
                                                >
                                                    {prod.files.map((file, fi) => (
                                                        <div key={fi} className="relative group border dark:border-slate-700 rounded-md p-1 w-16 h-16 flex items-center justify-center bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFile(idx, fi)}
                                                                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm"
                                                                title="Dosyayı kaldır"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                            {file.type === 'image' ? (
                                                                <img src={file.content} alt="preview" className="w-full h-full object-cover rounded" />
                                                            ) : (
                                                                <div className="flex flex-col items-center">
                                                                    <FileText className="w-6 h-6 text-red-500" />
                                                                    <span className="text-[8px] text-slate-500 truncate max-w-full">{file.name}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}

                                                    <button
                                                        type="button"
                                                        onClick={() => triggerFileInput(idx)}
                                                        className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-md w-16 h-16 flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 transition-all bg-white dark:bg-slate-900"
                                                    >
                                                        <Upload className="w-4 h-4" />
                                                        <span className="text-[9px] mt-0.5 font-semibold">Görsel Yükle</span>
                                                    </button>

                                                    {prod.files.length === 0 && (
                                                        <div className="text-[11px] text-slate-400 dark:text-slate-500 flex flex-col ml-1">
                                                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                                                                Görseli bu kutuya sürükleyip bırakabilirsiniz
                                                            </span>
                                                            <span className="text-[10px]">
                                                                veya resmi kopyalayıp klavyeden <b>Cmd+V / Ctrl+V</b> ile doğrudan yapıştırın.
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Add Product Button (Bottom of Products) */}
                        <button
                            type="button"
                            onClick={addProduct}
                            className="w-full py-2.5 border-2 border-dashed border-blue-400 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.005]"
                        >
                            <Plus className="w-4 h-4" />
                            <span>+ {products.length + 1}. Farklı Ürün Ekle (Yeni Ölçü / Doku / Görsel)</span>
                        </button>
                    </div>

                    {/* Section: General Order Note */}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Genel Sipariş Notu (opsiyonel)</label>
                        <textarea
                            name="generalNote"
                            value={customerData.generalNote}
                            onChange={handleCustomerChange}
                            rows={2}
                            className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all resize-none"
                            placeholder="Kargo, paketleme veya teslimat ile ilgili genel notlar..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-3 md:p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            setCustomerData({
                                customer: "PERLOS GIDA LİMİTED ŞİRKETİ",
                                phone: "0 543 591 62 40",
                                email: "ornek@mail.com",
                                address: "ADNAN KAHVECİ MAH. OSMANLI CAD. BEYAZ PALAS B BLOK NO: 63 /2 İÇ KAPI NO: 3",
                                city: "BEYLİKDÜZÜ/ İSTANBUL",
                                total: "14500",
                                generalNote: "Aynı müşteriye tek pakette kargolanacak.",
                                cargoBarcodeLink: ""
                            })
                            setProducts([
                                {
                                    id: "sample-1",
                                    productName: "Nötr Tonlu Vintage Ağaçlı Orman Manzarası",
                                    quantity: "1",
                                    width: "290",
                                    height: "270",
                                    unit: "cm",
                                    material: "Premium Tekstil Duvar Kağıdı",
                                    sample: "",
                                    note: "Salon için",
                                    sku: "PM-112233",
                                    imageLink: "",
                                    pdfLink: "",
                                    files: []
                                },
                                {
                                    id: "sample-2",
                                    productName: "Modern Soyut Geometrik Duvar Kağıdı",
                                    quantity: "2",
                                    width: "150",
                                    height: "260",
                                    unit: "cm",
                                    material: "Dokulu Kendiliğinden Yapışkanlı Duvar Kağıdı",
                                    sample: "",
                                    note: "Yatak odası için",
                                    sku: "PM-445566",
                                    imageLink: "",
                                    pdfLink: "",
                                    files: []
                                }
                            ])
                            setActiveProductIndex(0)
                            toast.info("Örnek 2 ürünlü sipariş bilgileri dolduruldu!")
                        }}
                        className="px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors font-semibold border border-blue-200 dark:border-blue-800 flex items-center gap-1.5"
                    >
                        ⚡ Örnek Al
                    </button>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isLoading}
                            className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all font-bold flex items-center gap-2 disabled:opacity-50 hover:scale-[1.02]"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            <span>Siparişi Oluştur ({products.length} Ürün)</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}
