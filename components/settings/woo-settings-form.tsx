"use client"

import { useState, useTransition } from "react"
import { Globe, Key, Lock, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { saveWooCommerceSettings } from "@/app/actions"

interface WooSettingsFormProps {
    initialSettings: {
        wc_url?: string
        wc_key?: string
        wc_secret?: string
    }
}

export function WooSettingsForm({ initialSettings }: WooSettingsFormProps) {
    const [isPending, startTransition] = useTransition()

    const handleSubmit = async (formData: FormData) => {
        const url = formData.get("wc_url") as string
        const key = formData.get("wc_key") as string
        const secret = formData.get("wc_secret") as string

        if (!url || !key || !secret) {
            toast.error("Lütfen tüm alanları doldurunuz.")
            return
        }

        startTransition(async () => {
            try {
                // Call server action
                await saveWooCommerceSettings(formData)
                toast.success("WooCommerce ayarları başarıyla kaydedildi! 🚀")
            } catch (error) {
                console.error(error)
                toast.error("Ayarlar kaydedilirken bir hata oluştu.")
            }
        })
    }

    return (
        <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/50 p-6 rounded-xl border border-blue-100">
            <div className="col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">Site Adresi (URL) <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="wc_url"
                        defaultValue={initialSettings.wc_url || ''}
                        placeholder="https://siteadresiniz.com"
                        required
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Consumer Key (CK) <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="wc_key"
                        type="password"
                        defaultValue={initialSettings.wc_key || ''}
                        placeholder="ck_xxxxxxxxxxxx"
                        required
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Consumer Secret (CS) <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="wc_secret"
                        type="password"
                        defaultValue={initialSettings.wc_secret || ''}
                        placeholder="cs_xxxxxxxxxxxx"
                        required
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div className="col-span-2 flex justify-end">
                <button
                    disabled={isPending}
                    type="submit"
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isPending ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </button>
            </div>
        </form>
    )
}
