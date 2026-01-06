"use client"

import { useState } from "react"
import { updateUserPermissions } from "@/app/actions"
import { Check, Shield, X } from "lucide-react"
import { toast } from "sonner"

interface UserPermissionsFormProps {
    user: any
    statuses: any[]
}

export function UserPermissionsForm({ user, statuses }: UserPermissionsFormProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [allowed, setAllowed] = useState<string[]>(() => {
        if (!user.allowedStatuses) return []
        try {
            return JSON.parse(user.allowedStatuses)
        } catch {
            return []
        }
    })

    const handleToggle = (statusId: string) => {
        setAllowed(prev => {
            if (prev.includes(statusId)) {
                return prev.filter(id => id !== statusId)
            } else {
                return [...prev, statusId]
            }
        })
    }

    const handleSave = async () => {
        try {
            await updateUserPermissions(user.id, allowed)
            setIsOpen(false)
            toast.success("Yetkiler güncellendi")
        } catch (error) {
            toast.error("Hata oluştu")
        }
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsOpen(!isOpen)
                }}
                className={`cursor-pointer relative z-10 flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold border shadow-sm transition-all active:scale-95 ${allowed.length > 0
                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
            >
                <Shield className="w-3.5 h-3.5" />
                {allowed.length > 0 ? `${allowed.length} Kolon` : "Tam Yetki"}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => {
                    e.stopPropagation()
                    // setIsOpen(false) // Optional: close on backdrop click? Better to force explicit close to avoid accidental clicks
                }}>
                    <div
                        className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm border border-gray-200 relative animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">Görülecek Kolonlar</h3>
                                <p className="text-xs text-gray-500">{user.name}</p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsOpen(false)
                                }}
                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs mb-4">
                            <span className="font-bold">Bilgi:</span> Hiçbir kutucuk seçilmezse kullanıcı <strong>tüm kolonları</strong> görür. Kısıtlama yapmak için en az bir kutucuk seçin.
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                            {statuses.map(status => {
                                const isChecked = allowed.includes(status.id)
                                return (
                                    <label key={status.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer group transition-all select-none">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"
                                            }`}>
                                            {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={isChecked}
                                            onChange={() => handleToggle(status.id)}
                                        />
                                        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                            {status.title}
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                        <div className="pt-4 mt-4 border-t flex justify-end gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsOpen(false)
                                }}
                                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleSave()
                                }}
                                className="bg-black text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors shadow-lg"
                            >
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
