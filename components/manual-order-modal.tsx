"use client"

import { useState, useRef } from "react"
import { X, Upload, Loader2, Plus, FileText, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"

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

        // Extra
        sku: "PM-" + Math.floor(100000 + Math.random() * 900000),
        imageLink: "",
        pdfLink: ""
    })

    if (!isOpen) return null

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            const isImage = file.type.startsWith('image/')
            const isPdf = file.type === 'application/pdf'

            if (!isImage && !isPdf) {
                toast.error("Sadece resim veya PDF yükleyebilirsiniz.")
                return
            }

            const reader = new FileReader()
            reader.onload = (event) => {
                if (event.target?.result) {
                    setFiles(prev => [...prev, {
                        name: file.name,
                        type: isImage ? 'image' : 'pdf',
                        content: event.target!.result as string // Base64
                    }])
                }
            }
            reader.readAsDataURL(file)
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

            // Find image src (all images joined by |)
            const imageFiles = files.filter(f => f.type === 'image').map(f => f.content)
            const mainImage = formData.imageLink || (imageFiles.length > 0 ? imageFiles.join('|') : "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=300")
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
                area, // Will be appended to dimensions or stored separately
                image_src: mainImage,
                url: specialUrl, // Base64 for now, or cloud link
                status: 'pending', // Default status ID
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

            await onCreate(orderPayload)
            onClose()
            toast.success("Sipariş başarıyla oluşturuldu!")
        } catch (error) {
            console.error(error)
            toast.error("Sipariş oluşturulurken hata oluştu.")
        } finally {
            setIsLoading(false)
        }
    }

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
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Şehir</label>
                                    <input
                                        name="city"
                                        value={formData.city}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="İstanbul"
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
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 border-b dark:border-slate-800 pb-1">📎 Dosyalar (Görsel & PDF Linki)</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-400">Ürün Görseli (Link)</label>
                                    <input
                                        name="imageLink"
                                        value={formData.imageLink}
                                        onChange={handleChange}
                                        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-950 transition-all"
                                        placeholder="https://..."
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

                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-400 mt-2 mb-1">Veya Dosya Yükle:</p>

                            <div className="flex flex-wrap gap-3">
                                {files.map((file, idx) => (
                                    <div key={idx} className="relative group border dark:border-slate-700 rounded-lg p-2 w-20 h-20 flex items-center justify-center bg-slate-50 dark:bg-slate-800 overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => removeFile(idx)}
                                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                    className="border-2 border-dashed border-slate-300 rounded-lg w-20 h-20 flex flex-col items-center justify-center text-slate-400 hover:border-blue-500 hover:text-blue-500 transition-colors"
                                >
                                    <Upload className="w-6 h-6" />
                                    <span className="text-[10px] mt-1">Yükle</span>
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*,.pdf"
                                    onChange={handleFileChange}
                                />
                            </div>
                            <p className="text-[10px] text-slate-500">* PDF veya Görsel yükleyebilirsiniz. Yüklenen ilk görsel ürün görseli olarak kullanılacaktır.</p>
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
