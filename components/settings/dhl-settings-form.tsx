"use client"

import { useState, useTransition } from "react"
import { User, Lock, Save, Loader2, Globe } from "lucide-react"
import { toast } from "sonner"
import { saveDHLSettings } from "@/app/actions"

interface DHLSettingsFormProps {
    initialSettings: {
        dhl_user?: string
        dhl_pass?: string
        dhl_customer_id?: string
    }
}

export function DHLSettingsForm({ initialSettings }: DHLSettingsFormProps) {
    const [isPending, startTransition] = useTransition()

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            try {
                const res = await saveDHLSettings(formData)
                if (res?.success) {
                    toast.success(res.message)
                } else if (res?.error) {
                    toast.error(res.error)
                }
            } catch (error) {
                console.error(error)
                toast.error("Ayarlar kaydedilirken bir hata oluştu.")
            }
        })
    }

    return (
        <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-red-50/50 p-6 rounded-xl border border-red-100">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">DHL Kullanıcı Adı <span className="text-red-500">*</span></label>
                <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="dhl_user"
                        defaultValue={initialSettings.dhl_user || ''}
                        placeholder="DHL API Kullanıcı Adı"
                        required
                        className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">DHL Şifre <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="dhl_pass"
                        type="password"
                        defaultValue={initialSettings.dhl_pass || ''}
                        placeholder="••••••••"
                        required
                        className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Müşteri No (Customer ID)</label>
                <div className="relative">
                    <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="dhl_customer_id"
                        defaultValue={initialSettings.dhl_customer_id || ''}
                        placeholder="DHL Müşteri Numarası"
                        className="w-full pl-10 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                    />
                </div>
            </div>

            <div className="md:col-span-3 flex justify-end">
                <button
                    disabled={isPending}
                    type="submit"
                    className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isPending ? "Kaydediliyor..." : "DHL Ayarlarını Kaydet"}
                </button>
            </div>
        </form>
    )
}
