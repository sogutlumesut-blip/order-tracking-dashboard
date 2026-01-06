"use client"

import { createUser } from "@/app/actions"
import { Plus, Save, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export function AddUserForm() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm transition-all"
            >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Yeni Personel</span>
                <span className="sm:hidden">Ekle</span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 relative animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Yeni Personel Oluştur</h3>
                            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form action={async (formData) => {
                            const res = await createUser(formData)
                            if (res?.error) {
                                toast.error(res.error)
                            } else {
                                toast.success("Personel eklendi")
                                setIsOpen(false)
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Ad Soyad</label>
                                <input name="name" placeholder="Örn: Ahmet Yılmaz" className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Kullanıcı Adı</label>
                                <input name="username" placeholder="kullanici123" className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Şifre</label>
                                <input name="password" type="password" placeholder="******" className="w-full p-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Yetki</label>
                                <select name="role" className="w-full p-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" defaultValue="staff">
                                    <option value="staff">Personel</option>
                                    <option value="admin">Yönetici</option>
                                    <option value="pending">Onay Bekleyen</option>
                                </select>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                    İptal
                                </button>
                                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200">
                                    <Save className="w-4 h-4" />
                                    Kaydet
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
