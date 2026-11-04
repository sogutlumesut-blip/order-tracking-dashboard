"use client"

import { useState, useRef, useEffect } from "react"
import { X, Upload, Loader2, Plus, FileText, Image as ImageIcon, Clipboard, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { createDHLShipmentAction } from "@/app/actions"

interface ManualOrderModalProps {
    isOpen: boolean
    onClose: () => void
    onCreate: (orderData: any) => Promise<void>
}

export function ManualOrderModal({ isOpen, onClose, onCreate }: ManualOrderModalProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [files, setFiles] = useState<{ name: string; type: 'image' | 'pdf'; content: string }[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [formData, setFormData] = useState({
        customer: "",
        phone: "",
        email: "",
        address: "",
        city: "",

        // Product
        productName: "",
        width: "",
        height: "",
        unit: "cm",
        material: "",
        sample: "",
        note: "",
        total: "",

        // Extra
        sku: "PM-" + Math.floor(100000 + Math.random() * 900000),
        imageLink: "",
        pdfLink: ""
    })

    const [isDragging, setIsDragging] = useState(false)

    const processFile = (file: File) => {
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
                        setFiles(prev => [...prev, {
                            name: file.name || "yapistirilan-gorsel.jpg",
                            type: 'image',
                            content: finalBase64
                        }])
                        toast.success("Görsel başarıyla eklendi!")
                    } else {
                        setFiles(prev => [...prev, {
                            name: file.name || "yapistirilan-gorsel.jpg",
                            type: 'image',
                            content: rawResult
                        }])
                        toast.success("Görsel eklendi!")
                    }
                }
                img.onerror = () => {
                    setFiles(prev => [...prev, {
                        name: file.name || "gorsel.jpg",
                        type: 'image',
                        content: rawResult
                    }])
                    toast.success("Görsel eklendi!")
                }
                img.src = rawResult
            }
            reader.readAsDataURL(file)
        } else {
            if (file.size > 1024 * 1024) {
                toast.error("PDF dosyası çok büyük (Max 1MB). Lütfen 'Kargo Barkodu (PDF Linki)' alanını kullanın.")
                return
            }
            const reader = new FileReader()
            reader.onload = (event) => {
                if (event.target?.result) {
                    setFiles(prev => [...prev, {
                        name: file.name,
                        type: 'pdf',
                        content: event.target!.result as string
                    }])
                    toast.success("PDF başarıyla eklendi!")
                }
            }
            reader.readAsDataURL(file)
        }
    }

    // Window paste handler (e.g. copying image from Gemini/browser and pressing Cmd+V)
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
                            processFile(blob)
                            return
                        }
                    }
                }
            }

            const text = e.clipboardData?.getData('text/plain') || ''
            if (text.trim().startsWith('blob:')) {
                e.preventDefault()
                toast.error("Tarayıcı 'blob:' linkleri geçicidir ve dışarıdan açılamaz. Lütfen görseli sağ tıklayıp 'Resmi Kopyala' (Copy image) yapın ve doğrudan Cmd+V ile buraya yapıştırın!", {
                    duration: 8000
                })
            }
        }

        window.addEventListener('paste', onWindowPaste)
        return () => window.removeEventListener('paste', onWindowPaste)
    }, [isOpen])

    const handlePasteFromClipboard = async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.read) {
                const items = await navigator.clipboard.read()
                let foundImage = false
                for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'))
                    if (imageType) {
                        const blob = await item.getType(imageType)
                        const file = new File([blob], "pano-gorsel.jpg", { type: imageType })
                        processFile(file)
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleImageLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.trim()
        if (val.startsWith('blob:')) {
            toast.error("Tarayıcı 'blob:' linkleri (blob:https://...) dışarıdan açılamaz. Lütfen görseli kopyalayıp (Cmd+V) buraya yapıştırın veya 'Yükle' butonunu kullanın!", {
                duration: 8000
            })
            setFormData(prev => ({ ...prev, imageLink: "" }))
            return
        }

        const driveMatch = val.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/)
        if (driveMatch && driveMatch[1]) {
            val = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`
            toast.info("Google Drive bağlantısı doğrudan görsel formatına dönüştürüldü.")
        } else if (val.includes('dropbox.com') && val.includes('dl=0')) {
            val = val.replace('dl=0', 'raw=1')
        }

        setFormData(prev => ({ ...prev, imageLink: val }))
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0])
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                processFile(e.dataTransfer.files[i])
            }
        }
    }

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.customer || !formData.productName) {
            toast.error("Müşteri adı ve Ürün adı zorunludur.")
            return
        }

        setIsLoading(true)
        try {
            // Construct dimensions string
            const dimensions = formData.width && formData.height
                ? `${formData.width} x ${formData.height} ${formData.unit}`
                : ""

            // Calculate Area (approx for display)
            let area = ""
            if (formData.width && formData.height) {
                const w = parseFloat(formData.width)
                const h = parseFloat(formData.height)
                if (formData.unit === 'cm') {
                    area = ((w * h) / 10000).toFixed(2) + " m²"
                } else {
                    // Inch to m2 approx
                    area = ((w * 2.54 * h * 2.54) / 10000).toFixed(2) + " m²"
                }
            }

            // Find image src (uploaded files and valid imageLink)
            const imageFiles = files.filter(f => f.type === 'image').map(f => f.content)
            let validImageLink = formData.imageLink?.trim() || ""
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

            // Find special url (first pdf or file)
            const specialUrl = formData.pdfLink || files.find(f => f.type === 'pdf')?.content || null

            // Prepare note with sample info
            let finalNote = formData.note
            if ((formData as any).sample) {
                finalNote = (finalNote ? finalNote + "\n\n" : "") + "📌 NUMUNE İSTEĞİ: " + (formData as any).sample
            }

            const orderPayload = {
                ...formData,
                note: finalNote,
                dimensions,
                area,
                image_src: mainImage,
                url: specialUrl,
                status: 'pending_woo',
                items: [{
                    name: formData.productName,
                    sku: formData.sku,
                    quantity: 1,
                    image_src: mainImage,
                    material: formData.material,
                    dimensions: dimensions + (area ? ` (${area})` : ""),
                    url: specialUrl
                }]
            }

            // 1. Close modal immediately to not block UI
            onClose()
            setIsLoading(false)

            // 2. Start upload in background, wrapped in setTimeout to escape React's startTransition batching
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50">
                    <h2 className="text-lg font-bold flex items-center gap-2 dark:text-slate-100">
                        <Plus className="w-5 h-5 text-blue-600" />
                        Manuel Sipariş Oluştur
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Section: Customer */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 border-b dark:border-slate-800 pb-1">👤 Müşteri Bilgileri</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Ad Soyad *</label>
                                    <input
                                        name="customer"
                                        value={formData.customer}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="Örn: Ahmet Yılmaz"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Telefon</label>
                                    <input
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="0555..."
                                    />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Adres</label>
                                    <input
                                        name="address"
                                        value={formData.address}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="Tam adres..."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Şehir (İlçe / İl)</label>
                                    <input
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="Örn: İzmit / Kocaeli"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">E-posta</label>
                                    <input
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="mail@ornek.com"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section: Product */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 border-b dark:border-slate-800 pb-1">📦 Ürün Bilgileri</h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Ürün Adı *</label>
                                    <input
                                        name="productName"
                                        value={formData.productName}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="Özel Duvar Kağıdı - Orman Temalı"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Fiyat</label>
                                    <div className="relative">
                                        <input
                                            name="total"
                                            value={formData.total}
                                            onChange={handleChange}
                                            className="w-full pl-2 pr-6 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                            placeholder="Örn: 1500"
                                        />
                                        <span className="absolute right-3 top-2 text-sm font-semibold text-slate-400">₺</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Genişlik</label>
                                    <input
                                        type="number"
                                        name="width"
                                        value={formData.width}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Yükseklik</label>
                                    <input
                                        type="number"
                                        name="height"
                                        value={formData.height}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Birim</label>
                                    <select
                                        name="unit"
                                        value={formData.unit}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                    >
                                        <option value="cm">cm</option>
                                        <option value="inch">inç</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Kağıt Cinsi / Doku</label>
                                <select
                                    name="material"
                                    value={formData.material}
                                    onChange={handleChange}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
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

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Sipariş Notu</label>
                                <textarea
                                    name="note"
                                    value={formData.note}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all resize-none"
                                    placeholder="Özel notlar..."
                                />
                            </div>
                        </div>

                        {/* Section: Files */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b dark:border-slate-800 pb-1">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200">📎 Dosyalar (Görsel & PDF Linki)</h3>
                                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                                    <Clipboard className="w-3.5 h-3.5" />
                                    Cmd+V ile doğrudan yapıştırabilirsiniz
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Ürün Görseli (Web / Drive Linki)</label>
                                    <input
                                        name="imageLink"
                                        value={formData.imageLink}
                                        onChange={handleImageLinkChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="https://... (veya Google Drive linki)"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Kargo Barkodu (PDF Linki)</label>
                                    <input
                                        name="pdfLink"
                                        value={formData.pdfLink}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="https://...pdf"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-400">Veya Görsel Yükle / Panodan Yapıştır:</p>
                                    <button
                                        type="button"
                                        onClick={handlePasteFromClipboard}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 transition-colors shadow-xs"
                                    >
                                        <Clipboard className="w-3.5 h-3.5" />
                                        Panodan Görsel Yapıştır (Cmd+V)
                                    </button>
                                </div>

                                <div 
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`p-3 rounded-xl border-2 border-dashed transition-all flex flex-wrap gap-3 items-center ${
                                        isDragging 
                                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-300' 
                                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                                    }`}
                                >
                                    {files.map((file, idx) => (
                                        <div key={idx} className="relative group border dark:border-slate-700 rounded-lg p-1.5 w-20 h-20 flex items-center justify-center bg-white dark:bg-slate-800 overflow-hidden shadow-xs">
                                            <button
                                                type="button"
                                                onClick={() => removeFile(idx)}
                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                            {file.type === 'image' ? (
                                                <img src={file.content} alt="preview" className="w-full h-full object-cover rounded" />
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <FileText className="w-8 h-8 text-red-500" />
                                                    <span className="text-[9px] text-slate-500 truncate max-w-full">{file.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-lg w-20 h-20 flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 transition-all bg-white dark:bg-slate-900"
                                    >
                                        <Upload className="w-6 h-6" />
                                        <span className="text-[10px] mt-1 font-semibold">Dosya Seç</span>
                                    </button>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*,.pdf"
                                        onChange={handleFileChange}
                                    />

                                    {files.length === 0 && (
                                        <div className="text-xs text-slate-400 dark:text-slate-500 flex flex-col gap-0.5 ml-2">
                                            <span className="font-semibold text-slate-600 dark:text-slate-300">Görseli buraya sürükleyip bırakabilirsiniz</span>
                                            <span className="text-[11px]">veya herhangi bir yerden resmi kopyalayıp klavyeden <b>Cmd+V / Ctrl+V</b> yapabilirsiniz.</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold">Önemli Not:</span> Gemini, Google veya web sayfalarındaki görselleri eklemek için resme sağ tıklayıp <b>"Resmi Kopyala"</b> (Copy Image) seçeneğini kullanıp bu ekranda <b>Cmd+V (Ctrl+V)</b> ile yapıştırınız. "Resim bağlantısını kopyala" seçildiğinde oluşan geçici <code>blob:</code> linkleri kaydedilemez.
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setFormData({
                            customer: "Örnek Müşteri",
                            phone: "0532 123 45 67",
                            email: "ornek@mail.com",
                            address: "Örnek Mahallesi, Test Sokak No:1",
                            city: "İstanbul",
                            productName: "Orman Temalı Duvar Kağıdı",
                            width: "350",
                            height: "260",
                            unit: "cm",
                            material: "Tekstil Duvar Kağıdı",
                            sample: "",
                            note: "Acele teslimat lütfen.",
                            total: "",
                            sku: formData.sku,
                            imageLink: "",
                            pdfLink: ""
                        })}
                        className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-semibold border border-blue-200"
                    >
                        ⚡ Örnek Al
                    </button>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors font-medium"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading}
                            className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors font-bold flex items-center gap-2 disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Sipariş Oluştur
                        </button>
                    </div>

                </div>
            </div>
        </div>
    )
}
