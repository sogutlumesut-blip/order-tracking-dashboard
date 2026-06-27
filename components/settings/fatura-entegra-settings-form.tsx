
"use client"

import { useState, useTransition } from "react"
import { User, Lock, Save, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { saveFaturaEntegraSettings } from "@/app/actions"

interface FaturaEntegraSettingsFormProps {
    initialSettings: {
        fe_user?: string
        fe_pass?: string
        fe_app_key?: string
    }
}

export function FaturaEntegraSettingsForm({ initialSettings }: FaturaEntegraSettingsFormProps) {
    const [isPending, startTransition] = useTransition()

    const handleSubmit = async (formData: FormData) => {
        startTransition(async () => {
            try {
                const res = await saveFaturaEntegraSettings(formData)
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
        <form action={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-indigo-50/50 p-6 rounded-xl border border-indigo-100">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Kullanıcı Adı <span className="text-red-500">*</span></label>
                <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="fe_user"
                        defaultValue={initialSettings.fe_user || ''}
                        placeholder="Kullanıcı adınız"
                        required
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Şifre <span className="text-red-500">*</span></label>
                <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="fe_pass"
                        type="password"
                        defaultValue={initialSettings.fe_pass || ''}
                        placeholder="••••••••"
                        required
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">App Key (Opsiyonel)</label>
                <div className="relative">
                    <ShieldCheck className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        name="fe_app_key"
                        defaultValue={initialSettings.fe_app_key || ''}
                        placeholder="Uygulama anahtarı"
                        className="w-full pl-10 p-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-800"
                    />
                </div>
            </div>

            <div className="md:col-span-3 flex justify-end">
                <button
                    disabled={isPending}
                    type="submit"
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isPending ? "Kaydediliyor..." : "FaturaEntegra Ayarlarını Kaydet"}
                </button>
            </div>
        </form>
    )
}
