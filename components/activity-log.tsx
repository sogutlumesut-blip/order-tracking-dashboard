import { FileText, MessageSquare, Truck, User, Info } from "lucide-react"

interface Activity {
    id: string
    author: string
    action: string
    details: string
    timestamp: string
}

interface ActivityLogProps {
    activities: Activity[]
    isLoading?: boolean
}

export function ActivityLog({ activities, isLoading }: ActivityLogProps) {
    const getIcon = (action: string) => {
        switch (action) {
            case 'STATUS_CHANGE': return <Truck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            case 'NOTE_ADDED': return <FileText className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
            case 'COMMENT_ADDED': return <MessageSquare className="w-3 h-3 text-green-600 dark:text-green-400" />
            case 'ASSIGN_CHANGE': return <User className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            default: return <Info className="w-3 h-3 text-slate-500 dark:text-slate-400" />
        }
    }

    const formatTimestamp = (ts: string) => {
        try {
            const d = new Date(ts);
            if (d instanceof Date && !isNaN(d.getTime())) {
                return d.toLocaleString('tr-TR', {
                    timeZone: 'Europe/Istanbul',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (e) {}
        return ts;
    }

    return (
        <div className="border dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40 overflow-hidden flex flex-col h-[300px] w-full shadow-inner">
            <div className="p-3 border-b dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                <FileText className="w-4 h-4 text-blue-500" />
                İşlem Geçmişi (Log)
            </div>

            <div className="overflow-y-auto p-4 space-y-4 flex-1 bg-slate-50/30 dark:bg-slate-900/30 flex flex-col">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center my-auto text-slate-400 dark:text-slate-500 gap-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-medium animate-pulse">Yükleniyor...</span>
                    </div>
                ) : !activities || activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2">
                        <Info className="w-8 h-8 opacity-50" />
                        <span className="text-xs font-medium">Henüz bir işlem geçmişi bulunmuyor.</span>
                    </div>
                ) : (
                    activities.map((activity) => (
                        <div key={activity.id} className="flex gap-3 text-xs border-b border-slate-100 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0">
                            <div className="mt-1 shrink-0 p-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-full">
                                {getIcon(activity.action)}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <span className="font-bold text-slate-800 dark:text-slate-100">{activity.author}</span>
                                    <span className="text-slate-500 dark:text-slate-400 text-[10px] font-mono">{formatTimestamp(activity.timestamp)}</span>
                                </div>
                                <p className="text-slate-700 dark:text-slate-200 mt-1 font-medium leading-relaxed">{activity.details}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
