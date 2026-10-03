"use client"

import { useState, useTransition, useEffect } from "react"
import { Globe, Key, Lock, Save, Loader2, Copy, Check, RefreshCw, AlertCircle, ShoppingBag, ExternalLink, HelpCircle } from "lucide-react"
import { toast } from "sonner"
import { saveShopifySettings, syncShopifyOrders } from "@/app/actions"

interface ShopifySettingsFormProps {
    initialSettings: {
        shopify_shop_domain?: string
        shopify_access_token?: string
        shopify_webhook_secret?: string
    }
}

export function ShopifySettingsForm({ initialSettings }: ShopifySettingsFormProps) {
    const [isPending, startTransition] = useTransition()
    const [isSyncing, setIsSyncing] = useState(false)
    const [copied, setCopied] = useState(false)
    const [webhookUrl, setWebhookUrl] = useState("")

    useEffect(() => {
        if (typeof window !== "undefined") {
            setWebhookUrl(`${window.location.origin}/api/webhook/shopify`)
        }
    }, [])

    const handleCopyWebhook = () => {
        if (!webhookUrl) return
        navigator.clipboard.writeText(webhookUrl)
        setCopied(true)
        toast.success("Webhook URL'si panoya kopyalandı!")
        setTimeout(() => setCopied(false), 2500)
    }

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            try {
                const res = await saveShopifySettings(formData)
                if (res.success) {
                    toast.success(res.message)
                } else {
                    toast.error(res.error || "Ayarlar kaydedilemedi.")
                }
            } catch (error: any) {
                console.error(error)
                toast.error("Ayarlar kaydedilirken bir hata oluştu: " + error.message)
            }
        })
    }

    const handleManualSync = async () => {
        setIsSyncing(true)
        try {
            const res = await syncShopifyOrders(true)
            if (res.error) {
                toast.error(`Shopify Hatası: ${res.error}`)
            } else if (res.success) {
                toast.success(res.message || `${res.count} yeni sipariş aktarıldı!`)
            }
        } catch (err: any) {
            toast.error("Senkronizasyon sırasında hata oluştu: " + err.message)
        } finally {
            setIsSyncing(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* 1. Webhook Setup Instruction Card */}
            <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5 shadow-sm">
                        <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                            Otomatik Sipariş Düşüşü (Webhook Kurulumu)
                            <span className="text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                                Önerilen & Anlık
                            </span>
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                            Shopify mağazanıza gelen siparişlerin anında sisteme düşmesi ve bildirim sesinin çalması için aşağıdaki Webhook adresini Shopify yönetici panelinize ekleyiniz:
                        </p>
                    </div>
                </div>

                {/* Webhook Copy Box */}
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg p-2 px-3 shadow-inner">
                    <span className="text-xs font-mono text-emerald-800 dark:text-emerald-300 select-all truncate flex-1 font-semibold">
                        {webhookUrl || "https://siteniz.com/api/webhook/shopify"}
                    </span>
                    <button
                        type="button"
                        onClick={handleCopyWebhook}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all shadow-sm shrink-0 active:scale-95"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Kopyalandı" : "URL Kopyala"}
                    </button>
                </div>

                {/* Step by step guide */}
                <div className="text-xs text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 rounded-lg p-3 border border-emerald-100 dark:border-emerald-900/50 space-y-1.5">
                    <div className="font-bold text-emerald-900 dark:text-emerald-400 mb-1 flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5" />
                        Shopify Panelinde Webhook Nasıl Tanımlanır?
                    </div>
                    <ol className="list-decimal list-inside space-y-1 pl-1 text-[11.5px] leading-relaxed">
                        <li>Shopify Yönetici Paneli sol alttaki <strong>Ayarlar (Settings)</strong> &gt; <strong>Bildirimler (Notifications)</strong> menüsüne girin.</li>
                        <li>Sayfanın en altına inip <strong>Web kancaları (Webhooks)</strong> altındaki <strong>Web kancası oluştur (Create webhook)</strong> butonuna tıklayın.</li>
                        <li><strong>Olay (Event)</strong>: <code className="bg-emerald-100 dark:bg-emerald-900/80 px-1 py-0.5 rounded text-emerald-900 dark:text-emerald-200 font-mono">Sipariş oluşturma (Order creation)</code> seçin.</li>
                        <li><strong>Biçim (Format)</strong>: <code className="bg-emerald-100 dark:bg-emerald-900/80 px-1 py-0.5 rounded text-emerald-900 dark:text-emerald-200 font-mono">JSON</code> seçin.</li>
                        <li><strong>URL</strong>: Yukarıdan kopyaladığınız Webhook adresini yapıştırın ve <strong>Kaydet</strong> butonuna basın.</li>
                        <li className="text-slate-500 italic">(İsteğe bağlı) Aynı şekilde <code className="font-mono">Sipariş güncelleme (Order update)</code> olayı için de bir webhook oluşturabilirsiniz.</li>
                    </ol>
                </div>
            </div>

            {/* 2. API Settings Form (For Syncing Past Orders & Polling) */}
            <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="col-span-1 md:col-span-2">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
                        Shopify Admin API Ayarları
                    </h4>
                    <p className="text-xs text-slate-500 mb-4">
                        Mevcut siparişleri çekmek veya geçmiş siparişleri içeri aktarmak için Shopify Özel Uygulama (Custom App) bilgilerinizi girebilirsiniz.
                    </p>
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
                            placeholder="ornek-magaza.myshopify.com"
                            className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                        />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                        Shopify panelinizdeki adres (örn: <code className="font-mono text-emerald-600">magazaniz.myshopify.com</code>).
                    </span>
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
                        Shopify &gt; Uygulamalar &gt; Uygulama Geliştirme &gt; Özel Uygulama üzerinden <code className="font-mono text-emerald-600">read_orders</code> yetkili token.
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
                        Shopify Web kancaları bölümünün en altında yer alan imza anahtarı.
                    </span>
                </div>

                <div className="col-span-1 md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={isSyncing || !initialSettings.shopify_shop_domain || !initialSettings.shopify_access_token}
                        className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        title="Shopify'daki son siparişleri hemen çek"
                    >
                        {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {isSyncing ? "Siparişler Çekiliyor..." : "Shopify'dan Siparişleri Çek (Test Et)"}
                    </button>

                    <button
                        disabled={isPending}
                        type="submit"
                        className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isPending ? "Kaydediliyor..." : "Shopify Ayarlarını Kaydet"}
                    </button>
                </div>
            </form>
        </div>
    )
}
