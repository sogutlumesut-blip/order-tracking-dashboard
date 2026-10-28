"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Globe, Key, Lock, Save, Loader2, Copy, Check, RefreshCw, ShoppingBag, HelpCircle, Store, Tag, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { saveShopifySettings, syncShopifyOrders } from "@/app/actions"

interface ShopifySettingsFormProps {
    initialSettings: {
        shopify_shop_name?: string
        shopify_shop_domain?: string
        shopify_access_token?: string
        shopify_webhook_secret?: string
        shopify_shop_name_2?: string
        shopify_shop_domain_2?: string
        shopify_access_token_2?: string
        shopify_webhook_secret_2?: string
    }
}

export function ShopifySettingsForm({ initialSettings }: ShopifySettingsFormProps) {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<"store1" | "store2">("store1")
    const [isSaving, setIsSaving] = useState(false)
    const [isSyncingStore1, setIsSyncingStore1] = useState(false)
    const [isSyncingStore2, setIsSyncingStore2] = useState(false)
    const [isSyncingAll, setIsSyncingAll] = useState(false)
    const [copied1, setCopied1] = useState(false)
    const [copied2, setCopied2] = useState(false)
    const [baseUrl, setBaseUrl] = useState("")

    useEffect(() => {
        if (typeof window !== "undefined") {
            setBaseUrl(window.location.origin)
        }
    }, [])

    const webhookUrl1 = baseUrl ? `${baseUrl}/api/webhook/shopify` : "https://siteniz.com/api/webhook/shopify"
    const webhookUrl2 = baseUrl ? `${baseUrl}/api/webhook/shopify?store=2` : "https://siteniz.com/api/webhook/shopify?store=2"

    const handleCopy = (url: string, store: 1 | 2) => {
        navigator.clipboard.writeText(url)
        if (store === 1) {
            setCopied1(true)
            setTimeout(() => setCopied1(false), 2500)
        } else {
            setCopied2(true)
            setTimeout(() => setCopied2(false), 2500)
        }
        toast.success(`Mağaza ${store} Webhook URL'si panoya kopyalandı!`)
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSaving(true)
        try {
            const formData = new FormData(e.currentTarget)
            const res = await saveShopifySettings(formData)
            if (res.success) {
                toast.success(res.message)
                router.refresh()
            } else {
                toast.error(res.error || "Ayarlar kaydedilemedi.")
            }
        } catch (error: any) {
            console.error(error)
            toast.error("Ayarlar kaydedilirken bir hata oluştu: " + error.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleManualSync = async (targetStore: '1' | '2' | 'all') => {
        if (targetStore === '1') setIsSyncingStore1(true)
        else if (targetStore === '2') setIsSyncingStore2(true)
        else setIsSyncingAll(true)

        try {
            const res = await syncShopifyOrders(true, targetStore)
            if (res.error) {
                toast.error(`Shopify Hatası: ${res.error}`)
            } else if (res.success) {
                toast.success(res.message || `${res.count} yeni sipariş aktarıldı!`)
                router.refresh()
            }
        } catch (err: any) {
            toast.error("Senkronizasyon sırasında hata oluştu: " + err.message)
        } finally {
            if (targetStore === '1') setIsSyncingStore1(false)
            else if (targetStore === '2') setIsSyncingStore2(false)
            else setIsSyncingAll(false)
        }
    }

    const hasStore1 = Boolean(initialSettings.shopify_shop_domain)
    const hasStore2 = Boolean(initialSettings.shopify_shop_domain_2)

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <button
                    type="button"
                    onClick={() => setActiveTab("store1")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                        activeTab === "store1"
                            ? "bg-[#008060] text-white shadow-sm"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                >
                    <Store className="w-4 h-4" />
                    <span>1. Mağaza (Ana Mağaza)</span>
                    <span className={`w-2 h-2 rounded-full ${hasStore1 ? "bg-emerald-300" : "bg-slate-400"}`} />
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("store2")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
                        activeTab === "store2"
                            ? "bg-[#008060] text-white shadow-sm"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                >
                    <Store className="w-4 h-4" />
                    <span>2. Mağaza</span>
                    <span className={`w-2 h-2 rounded-full ${hasStore2 ? "bg-emerald-300" : "bg-amber-400 animate-pulse"}`} />
                    {!hasStore2 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.2 rounded font-extrabold">
                            YENİ
                        </span>
                    )}
                </button>
            </div>

            {/* STORE 1 TAB CONTENT */}
            <div className={activeTab === "store1" ? "space-y-5" : "hidden"}>
                {/* 1. Webhook Setup Instruction Card */}
                <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5 shadow-sm">
                            <ShoppingBag className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                                1. Mağaza Anlık Sipariş Webhook'u
                                <span className="text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                                    Barkod: SHOP-XXXX
                                </span>
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                1. Shopify mağazanıza gelen siparişlerin anında panoya düşmesi için aşağıdaki Webhook adresini Shopify yönetici panelinize ekleyiniz:
                            </p>
                        </div>
                    </div>

                    {/* Webhook Copy Box */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg p-2 px-3 shadow-inner">
                        <span className="text-xs font-mono text-emerald-800 dark:text-emerald-300 select-all truncate flex-1 font-semibold">
                            {webhookUrl1}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleCopy(webhookUrl1, 1)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all shadow-sm shrink-0 active:scale-95"
                        >
                            {copied1 ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied1 ? "Kopyalandı" : "URL Kopyala"}
                        </button>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-lg p-3 border border-emerald-100 dark:border-emerald-900/50 space-y-1 text-[11.5px]">
                        <div className="font-bold text-emerald-900 dark:text-emerald-400 mb-1 flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5" />
                            Shopify Panelinde Webhook Nasıl Tanımlanır?
                        </div>
                        <ol className="list-decimal list-inside space-y-1 pl-1 leading-relaxed">
                            <li>1. Mağazanın Shopify panelinde: <strong>Ayarlar (Settings)</strong> &gt; <strong>Bildirimler (Notifications)</strong> menüsüne girin.</li>
                            <li>En alttaki <strong>Web kancası oluştur (Create webhook)</strong> butonuna basın.</li>
                            <li><strong>Olay (Event)</strong>: <code className="bg-emerald-100 dark:bg-emerald-900/80 px-1 py-0.5 rounded font-mono">Sipariş oluşturma (Order creation)</code></li>
                            <li><strong>Biçim (Format)</strong>: <code className="bg-emerald-100 dark:bg-emerald-900/80 px-1 py-0.5 rounded font-mono">JSON</code></li>
                            <li><strong>URL</strong>: Yukarıdaki 1. Mağaza Webhook adresini yapıştırıp <strong>Kaydet</strong>'e basın.</li>
                        </ol>
                    </div>
                </div>

                {/* API Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            1. Mağaza Adı (Panelde Görünecek İsim)
                        </label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_shop_name"
                                defaultValue={initialSettings.shopify_shop_name || "WallpaperMarkt"}
                                placeholder="Örn: WallpaperMarkt"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800 font-medium"
                            />
                        </div>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            Shopify Mağaza Alan Adı (Store Domain)
                        </label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_shop_domain"
                                defaultValue={initialSettings.shopify_shop_domain || ""}
                                placeholder="wallpapermarkt.myshopify.com"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            Admin API Access Token (Erişim Belirteci)
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_access_token"
                                type="password"
                                defaultValue={initialSettings.shopify_access_token || ""}
                                placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                            />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                            Özel Uygulama (Custom App) <code className="font-mono text-emerald-600">read_orders</code> yetkili token.
                        </span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            Webhook Gizli Anahtarı (Webhook Secret - Opsiyonel)
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_webhook_secret"
                                type="password"
                                defaultValue={initialSettings.shopify_webhook_secret || ""}
                                placeholder="shpss_xxxxxxxxxxxxxxxxxxxx"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                            />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                            Shopify Web kancaları bölümünün en altındaki imza anahtarı.
                        </span>
                    </div>

                    <div className="col-span-1 md:col-span-2 pt-2">
                        <button
                            type="button"
                            onClick={() => handleManualSync('1')}
                            disabled={isSyncingStore1 || !initialSettings.shopify_shop_domain || !initialSettings.shopify_access_token}
                            className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isSyncingStore1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {isSyncingStore1 ? "1. Mağaza Çekiliyor..." : "1. Mağazadan Siparişleri Çek (Test Et)"}
                        </button>
                    </div>
                </div>
            </div>

            {/* STORE 2 TAB CONTENT */}
            <div className={activeTab === "store2" ? "space-y-5" : "hidden"}>
                {/* 2. Webhook Setup Instruction Card */}
                <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5 shadow-sm">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                                2. Mağaza Anlık Sipariş Webhook'u
                                <span className="text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-300 dark:border-blue-700">
                                    Barkod: SHOP2-XXXX (Çakışma Önleyici)
                                </span>
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                2. Shopify mağazanızın siparişlerinin ayrı etiket ve numarayla sisteme düşmesi için aşağıdaki Webhook adresini 2. mağazanıza ekleyiniz:
                            </p>
                        </div>
                    </div>

                    {/* Webhook Copy Box */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-lg p-2 px-3 shadow-inner">
                        <span className="text-xs font-mono text-blue-800 dark:text-blue-300 select-all truncate flex-1 font-semibold">
                            {webhookUrl2}
                        </span>
                        <button
                            type="button"
                            onClick={() => handleCopy(webhookUrl2, 2)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-all shadow-sm shrink-0 active:scale-95"
                        >
                            {copied2 ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied2 ? "Kopyalandı" : "URL Kopyala"}
                        </button>
                    </div>

                    <div className="text-xs text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-lg p-3 border border-blue-100 dark:border-blue-900/50 space-y-1 text-[11.5px]">
                        <div className="font-bold text-blue-900 dark:text-blue-400 mb-1 flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5" />
                            2. Mağazada Webhook Tanımlama:
                        </div>
                        <ol className="list-decimal list-inside space-y-1 pl-1 leading-relaxed">
                            <li>2. Mağazanın Shopify panelinde: <strong>Settings</strong> &gt; <strong>Notifications</strong> menüsüne girin.</li>
                            <li>En alttaki <strong>Create webhook</strong> butonuna basın.</li>
                            <li><strong>Event</strong>: <code className="bg-blue-100 dark:bg-blue-900/80 px-1 py-0.5 rounded font-mono">Order creation</code></li>
                            <li><strong>Format</strong>: <code className="bg-blue-100 dark:bg-blue-900/80 px-1 py-0.5 rounded font-mono">JSON</code></li>
                            <li><strong>URL</strong>: Yukarıdaki 2. Mağaza Webhook adresini yapıştırın ve <strong>Save</strong> butonuna basın.</li>
                            <li className="text-slate-500 italic">Not: Sistem alan adı üzerinden de 2. mağazayı otomatik tanır.</li>
                        </ol>
                    </div>
                </div>

                {/* API Fields for Store 2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            2. Mağaza Adı (Panelde ve Kartlarda Görünecek İsim)
                        </label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_shop_name_2"
                                defaultValue={initialSettings.shopify_shop_name_2 || "Shopify 2"}
                                placeholder="Örn: WallDesign US veya 2. Mağaza"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800 font-medium"
                            />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                            Bu mağazadan gelen siparişlerin kartında etiket olarak görünecektir.
                        </span>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            2. Mağaza Alan Adı (Store Domain)
                        </label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_shop_domain_2"
                                defaultValue={initialSettings.shopify_shop_domain_2 || ""}
                                placeholder="ikinci-magaza.myshopify.com"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            2. Mağaza Admin API Access Token
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_access_token_2"
                                type="password"
                                defaultValue={initialSettings.shopify_access_token_2 || ""}
                                placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                            />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                            2. Mağaza &gt; Apps &gt; Develop apps &gt; <code className="font-mono text-blue-600">read_orders</code> yetkili token.
                        </span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            2. Mağaza Webhook Gizli Anahtarı (Webhook Secret)
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <input
                                name="shopify_webhook_secret_2"
                                type="password"
                                defaultValue={initialSettings.shopify_webhook_secret_2 || ""}
                                placeholder="shpss_xxxxxxxxxxxxxxxxxxxx"
                                className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                            />
                        </div>
                        <span className="text-[11px] text-slate-400 mt-1 block">
                            2. Mağaza Notifications sayfasının en altındaki Webhook imza anahtarı.
                        </span>
                    </div>

                    <div className="col-span-1 md:col-span-2 pt-2">
                        <button
                            type="button"
                            onClick={() => handleManualSync('2')}
                            disabled={isSyncingStore2 || !initialSettings.shopify_shop_domain_2 || !initialSettings.shopify_access_token_2}
                            className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isSyncingStore2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {isSyncingStore2 ? "2. Mağaza Çekiliyor..." : "2. Mağazadan Siparişleri Çek (Test Et)"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => handleManualSync('all')}
                    disabled={isSyncingAll || (!hasStore1 && !hasStore2)}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                    {isSyncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {isSyncingAll ? "Tüm Mağazalar Çekiliyor..." : "Tüm Mağazaları Senkronize Et"}
                </button>

                <button
                    disabled={isSaving}
                    type="submit"
                    className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? "Kaydediliyor..." : "Shopify Ayarlarını Kaydet"}
                </button>
            </div>
        </form>
    )
}
