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
    
    const [permissions, setPermissions] = useState<{
        view: string[];
        move: string[];
        flags: string[];
    }>(() => {
        const defaultPerms = {
            view: statuses.map(s => s.id),
            move: statuses.map(s => s.id),
            flags: []
        };
        if (!user.allowedStatuses) return defaultPerms;
        try {
            const parsed = JSON.parse(user.allowedStatuses);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return {
                    view: Array.isArray(parsed.view) ? parsed.view : statuses.map(s => s.id),
                    move: Array.isArray(parsed.move) ? parsed.move : statuses.map(s => s.id),
                    flags: Array.isArray(parsed.flags) ? parsed.flags : []
                };
            }
            if (Array.isArray(parsed)) {
                const flags = parsed.filter((item: string) => item === "MANUAL_SYNC");
                const sts = parsed.filter((item: string) => item !== "MANUAL_SYNC");
                if (sts.length === 0) {
                    return {
                        view: statuses.map(s => s.id),
                        move: statuses.map(s => s.id),
                        flags: flags
                    };
                }
                return {
                    view: sts,
                    move: sts, // old format mapped to both view and move
                    flags: flags
                };
            }
        } catch {
            // ignore and fallback
        }
        return defaultPerms;
    })

    const handleToggleView = (statusId: string) => {
        setPermissions(prev => {
            const isChecked = prev.view.includes(statusId);
            const newView = isChecked
                ? prev.view.filter(id => id !== statusId)
                : [...prev.view, statusId];
            return {
                ...prev,
                view: newView
            };
        });
    }

    const handleToggleMove = (statusId: string) => {
        setPermissions(prev => {
            const isChecked = prev.move.includes(statusId);
            const newMove = isChecked
                ? prev.move.filter(id => id !== statusId)
                : [...prev.move, statusId];
            return {
                ...prev,
                move: newMove
            };
        });
    }

    const handleToggleFlag = (flag: string) => {
        setPermissions(prev => {
            const isChecked = prev.flags.includes(flag);
            const newFlags = isChecked
                ? prev.flags.filter(f => f !== flag)
                : [...prev.flags, flag];
            return {
                ...prev,
                flags: newFlags
            };
        });
    }

    const handleSave = async () => {
        try {
            await updateUserPermissions(user.id, permissions)
            setIsOpen(false)
            toast.success("Yetkiler güncellendi")
        } catch (error) {
            toast.error("Hata oluştu")
        }
    }

    const isFullAccess = permissions.view.length === statuses.length && permissions.move.length === statuses.length;

    return (
        <div className="relative">
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsOpen(!isOpen)
                }}
                className={`cursor-pointer relative z-10 flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold border shadow-sm transition-all active:scale-95 ${!isFullAccess
                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 dark:hover:bg-slate-800"
                    }`}
            >
                <Shield className="w-3.5 h-3.5" />
                {isFullAccess ? "Tam Yetki" : `${permissions.view.length} Görüş / ${permissions.move.length} Taşıma`}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={(e) => {
                    e.stopPropagation()
                }}>
                    <div
                        className="bg-white dark:bg-slate-950 p-6 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 relative animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Sütun Yetki Detayları</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{user.name}</p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsOpen(false)
                                }}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 p-2 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-400 p-3 rounded-lg text-xs mb-4">
                            <span className="font-bold">Görüş Yetkisi:</span> İşaretli kolonlar panoda gösterilir.
                            <br />
                            <span className="font-bold">Taşıma Yetkisi:</span> İşaretli kolonlara/kolonlardan kart sürüklenebilir.
                        </div>

                        <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-700">
                                        <th className="py-2 font-bold text-slate-500">Kolon</th>
                                        <th className="py-2 text-center font-bold text-slate-500">Görüş</th>
                                        <th className="py-2 text-center font-bold text-slate-500">Taşıma</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {statuses.map(status => {
                                        const isViewChecked = permissions.view.includes(status.id);
                                        const isMoveChecked = permissions.move.includes(status.id);
                                        return (
                                            <tr key={status.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                <td className="py-2.5 font-medium text-slate-700 dark:text-slate-300">
                                                    {status.title}
                                                </td>
                                                <td className="py-2.5 text-center">
                                                    <label className="inline-flex items-center justify-center cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only"
                                                            checked={isViewChecked}
                                                            onChange={() => handleToggleView(status.id)}
                                                        />
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                                            isViewChecked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                                                        }`}>
                                                            {isViewChecked && <Check className="w-3.5 h-3.5" />}
                                                        </div>
                                                    </label>
                                                </td>
                                                <td className="py-2.5 text-center">
                                                    <label className="inline-flex items-center justify-center cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            className="sr-only"
                                                            checked={isMoveChecked}
                                                            onChange={() => handleToggleMove(status.id)}
                                                        />
                                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                                            isMoveChecked ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                                                        }`}>
                                                            {isMoveChecked && <Check className="w-3.5 h-3.5" />}
                                                        </div>
                                                    </label>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>

                            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                                <label className="flex items-center justify-between p-3 border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900/30 rounded-lg hover:bg-orange-100/50 cursor-pointer group transition-all select-none">
                                    <span className="text-xs font-bold text-orange-800 dark:text-orange-400">
                                        Woo Çek (Manuel Sync) Yetkisi
                                    </span>
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={permissions.flags.includes("MANUAL_SYNC")}
                                        onChange={() => handleToggleFlag("MANUAL_SYNC")}
                                    />
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                        permissions.flags.includes("MANUAL_SYNC") ? "bg-orange-600 border-orange-600 text-white" : "border-orange-300 bg-white dark:border-orange-800 dark:bg-slate-900"
                                    }`}>
                                        {permissions.flags.includes("MANUAL_SYNC") && <Check className="w-3.5 h-3.5" />}
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsOpen(false)
                                }}
                                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleSave()
                                }}
                                className="bg-black dark:bg-white dark:text-black text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-lg"
                            >
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    )
}
