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
}

export function ActivityLog({ activities }: ActivityLogProps) {
    if (!activities || activities.length === 0) return null

    const getIcon = (action: string) => {
        switch (action) {
            case 'STATUS_CHANGE': return <Truck className="w-3 h-3" />
            case 'NOTE_ADDED': return <FileText className="w-3 h-3" />
            case 'COMMENT_ADDED': return <MessageSquare className="w-3 h-3" />
            case 'ASSIGN_CHANGE': return <User className="w-3 h-3" />
            default: return <Info className="w-3 h-3" />
        }
    }

    return (
        <div className="border dark:border-slate-700 rounded-xl bg-gray-50/50 dark:bg-slate-900/50 overflow-hidden flex flex-col h-[300px]">
            <div className="p-3 border-b dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400">
                <FileText className="w-4 h-4" />
                İşlem Geçmişi (Log)
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
                {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3 text-xs">
                        <div className="mt-1 shrink-0 p-1.5 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-full text-gray-400 dark:text-slate-500">
                            {getIcon(activity.action)}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <span className="font-bold text-gray-900 dark:text-slate-200">{activity.author}</span>
                                <span className="text-gray-400 dark:text-slate-500 text-[10px]">{activity.timestamp}</span>
                            </div>
                            <p className="text-gray-600 dark:text-slate-400 mt-0.5 font-medium">{activity.details}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
