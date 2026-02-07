
"use client"

import { useState, useEffect } from "react"
import { Globe, Key, Lock, Save, Plus, Trash2, ExternalLink, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { saveEtsySettings } from "@/app/actions"
import Link from "next/link"

interface EtsyStore {
    id: string // UUID or internal ID
    name: string // Friendly name "My Shop 1"
    shopId: string
    apiKey: string
    accessToken: string | null
    connected: boolean
}

interface EtsyMultiStoreSettingsProps {
    initialStores: EtsyStore[]
}

export function EtsyMultiStoreSettings({ initialStores }: EtsyMultiStoreSettingsProps) {
    // Ensure we always have an array
    const [stores, setStores] = useState<EtsyStore[]>(initialStores || [])
    const [isSaving, setIsSaving] = useState(false)

    const addStore = () => {
        setStores([...stores, {
            id: crypto.randomUUID(),
            name: `Mağaza ${stores.length + 1}`,
            shopId: "",
            apiKey: "",
            accessToken: null,
            connected: false
        }])
    }

    const removeStore = (index: number) => {
        if (confirm("Bu mağazayı listeden silmek istediğinize emin misiniz?")) {
            const newStores = [...stores]
            newStores.splice(index, 1)
            setStores(newStores)
        }
    }

    const updateStore = (index: number, field: keyof EtsyStore, value: string) => {
        const newStores = [...stores]
        newStores[index] = { ...newStores[index], [field]: value }
        setStores(newStores)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const formData = new FormData()
            formData.append("etsy_stores_json", JSON.stringify(stores))

            const result = await saveEtsySettings(formData)
            if (result.success) {
                toast.success(result.message)
            } else {
                toast.error(result.error)
            }
        } catch (e) {
            toast.error("Kaydetme hatası")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
                <span className="bg-orange-600 text-white p-1 px-2 rounded text-sm">ETSY</span>
                Etsy Entegrasyonu (Çoklu Mağaza)
            </h2>
            <p className="text-sm text-gray-600 mb-6">
                Birden fazla Etsy mağazasını buradan yönetebilirsiniz.
                <br />
                <span className="text-orange-600 font-medium">Etsy Developers</span> portalından her mağaza için App oluşturup bilgileri giriniz.
            </p>

            <div className="space-y-6">
                {stores.map((store, index) => (
                    <div key={store.id} className="relative p-6 border-2 border-orange-100 rounded-xl bg-orange-50/30 transition-all hover:border-orange-200">
                        {/* Remove Button */}
                        <button
                            onClick={() => removeStore(index)}
                            className="absolute top-4 right-4 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                            title="Mağazayı Sil"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        <h3 className="text-sm font-bold text-orange-800 uppercase mb-4 flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            {store.name || `Mağaza ${index + 1}`}
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Friendly Name */}
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Mağaza Takma Adı</label>
                                <input
                                    value={store.name}
                                    onChange={(e) => updateStore(index, 'name', e.target.value)}
                                    placeholder="Örn: DuvarKağıdıMarketi"
                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>

                            {/* Shop ID */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Etsy Shop ID</label>
                                <input
                                    value={store.shopId}
                                    onChange={(e) => updateStore(index, 'shopId', e.target.value)}
                                    placeholder="Örn: 12345678"
                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono"
                                />
                            </div>

                            {/* API Key */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">API Key (Keystring)</label>
                                <input
                                    value={store.apiKey}
                                    onChange={(e) => updateStore(index, 'apiKey', e.target.value)}
                                    type="password"
                                    placeholder="x-api-key"
                                    className="w-full p-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono"
                                />
                            </div>

                            {/* Connection Status & Action */}
                            <div className="col-span-2 mt-2 pt-4 border-t border-orange-100">
                                <label className="block text-xs font-bold text-gray-500 mb-2">Bağlantı Durumu</label>

                                {store.accessToken ? (
                                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                                            <Lock className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-green-700">Bağlantı Aktif</p>
                                            <p className="text-xs text-green-600">Token Alındı</p>
                                        </div>
                                        <Link
                                            href={`/api/etsy/auth?storeIndex=${index}`}
                                            className="px-3 py-1.5 text-xs bg-white border border-green-200 text-green-700 rounded-md hover:bg-green-50 flex items-center gap-1"
                                        >
                                            <RefreshCw className="w-3 h-3" /> Yenile
                                        </Link>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <Link
                                            href={`/api/etsy/auth?storeIndex=${index}`}
                                            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${store.shopId && store.apiKey
                                                    ? "bg-orange-600 text-white hover:bg-orange-700 shadow-sm"
                                                    : "bg-gray-200 text-gray-400 cursor-not-allowed pointer-events-none"
                                                }`}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            Etsy ile Bağla
                                        </Link>
                                        {!store.shopId && <span className="text-xs text-red-500">* Önce ID ve Key giriniz.</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Empty State */}
                {stores.length === 0 && (
                    <div className="text-center p-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-500">
                        <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Henüz mağaza eklenmemiş.</p>
                    </div>
                )}

                {/* Actions Footer */}
                <div className="flex flex-col md:flex-row gap-4 justify-between pt-4 border-t">
                    <button
                        onClick={addStore}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-all font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Yeni Mağaza Ekle
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center justify-center gap-2 px-8 py-2 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-all shadow-md disabled:opacity-50"
                    >
                        {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Tüm Ayarları Kaydet
                    </button>
                </div>
            </div>
        </div>
    )
}
