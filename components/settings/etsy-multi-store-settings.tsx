
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
    initialGlobalKey: string
}

export function EtsyMultiStoreSettings({ initialStores, initialGlobalKey }: EtsyMultiStoreSettingsProps) {
    // Ensure we always have an array
    const [stores, setStores] = useState<EtsyStore[]>(initialStores || [])
    const [globalApiKey, setGlobalApiKey] = useState(initialGlobalKey || "")
    const [isSaving, setIsSaving] = useState(false)

    // Load Global Key on mount if available (server should pass it, but for now we fetch or rely on props?
    // Simplified: We need to fetch it separately or pass it.
    // For this quick fix, let's assume it's passed or we fetch it.
    // Actually, we should fetch it. But to save roundtrips, let's add a "Global Key" prop in the parent or fetch here.
    // Let's use a server action to get it? Or just Input that saves to separate key.

    // STARTUP FETCH
    useEffect(() => {
        // We can trigger a server action here if we had one.
        // For now, let's just use the form submission to save it.
    }, [])

    const addStore = () => {
        setStores([...stores, {
            id: crypto.randomUUID(),
            name: `Yeni Mağaza`,
            shopId: "", // Auto-filled
            apiKey: "", // Uses Global
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

            // We need to save the Global Key too.
            // The existing action saveEtsySettings handles "etsy_stores_json".
            // We need to patch the action or send it differently.
            // Let's assume we update the action to handle "etsy_global_api_key".
            if (globalApiKey) {
                formData.append("etsy_global_api_key", globalApiKey)
            }

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
                Etsy Entegrasyonu <span className="text-xs font-normal text-gray-400">v2.0 (Auto-Connect)</span>
            </h2>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-100">
                <label className="block text-sm font-bold text-blue-900 mb-2">Etsy App Keystring (Global API Key)</label>
                <div className="flex gap-2">
                    <input
                        value={globalApiKey}
                        onChange={(e) => setGlobalApiKey(e.target.value)}
                        placeholder="Örn: 1aa2bb3cc4dd..."
                        className="flex-1 p-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    />
                    <div className="text-xs text-blue-600 self-center">
                        Tüm mağazalar bu anahtarı kullanarak bağlanacaktır.
                    </div>
                </div>
            </div>

            <p className="text-sm text-gray-600 mb-6 font-medium">
                Bağlı Mağazalar
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

                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-full ${store.connected ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                                <Globe className="w-6 h-6" />
                            </div>

                            <div className="flex-1">
                                {store.connected ? (
                                    <>
                                        <h3 className="text-lg font-bold text-gray-900">{store.name}</h3>
                                        <p className="text-sm text-gray-500 font-mono">ID: {store.shopId}</p>
                                    </>
                                ) : (
                                    <>
                                        <h3 className="text-md font-bold text-gray-500">Bağlantı Bekleniyor...</h3>
                                        <p className="text-xs text-gray-400">"Bağla" butonuna basınca mağaza bilgileri otomatik çekilecektir.</p>
                                    </>
                                )}
                            </div>

                            <div>
                                {store.connected ? (
                                    <Link
                                        href={`/api/etsy/auth?storeIndex=${index}`}
                                        className="px-4 py-2 text-sm bg-white border border-green-200 text-green-700 rounded-lg hover:bg-green-50 flex items-center gap-2 font-bold"
                                    >
                                        <RefreshCw className="w-3 h-3" /> Yenile / Değiştir
                                    </Link>
                                ) : (
                                    <Link
                                        href={`/api/etsy/auth?storeIndex=${index}`}
                                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-colors ${globalApiKey || store.apiKey
                                            ? "bg-orange-600 text-white hover:bg-orange-700 shadow-sm"
                                            : "bg-gray-300 text-gray-500 cursor-not-allowed" // Encourage entering Global Key first
                                            }`}
                                        onClick={(e) => {
                                            if (!globalApiKey && !store.apiKey) {
                                                e.preventDefault();
                                                toast.error("Önce yukarıya Global API Key giriniz ve kaydediniz.")
                                            }
                                        }}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        Etsy ile Bağla
                                    </Link>
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

                {/* ETSY LEGAL DISCLAIMER */}
                <div className="mt-4 text-[10px] text-gray-400 text-center border-t border-orange-50 pt-2">
                    The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
                </div>
            </div>
        </div>
    )
}
