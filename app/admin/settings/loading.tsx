import { ArrowLeft } from "lucide-react"

export default function SettingsLoading() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">

                {/* Header Skeleton */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800/50 shadow-sm">
                        <ArrowLeft className="w-6 h-6 text-slate-300 dark:text-slate-700" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                        <div className="h-4 w-56 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
                    </div>
                </div>

                {/* Integration Card 1 (WooCommerce) */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-12 bg-blue-100 dark:bg-blue-950/50 rounded animate-pulse" />
                        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 w-full bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
                        <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
                    </div>
                    <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                </div>

                {/* Integration Card 2 (PrintMarkt) */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-12 bg-orange-100 dark:bg-orange-950/50 rounded animate-pulse" />
                        <div className="h-6 w-60 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
                    <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                </div>

                {/* Integration Card 3 (FaturaEntegra) */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-12 bg-indigo-100 dark:bg-indigo-950/50 rounded animate-pulse" />
                        <div className="h-6 w-52 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-1/2 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
                    <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                </div>

                {/* Personnel Management Table Card */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/50 space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="space-y-2">
                            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                            <div className="h-4 w-72 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
                        </div>
                        <div className="h-9 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
                    </div>

                    <div className="space-y-3">
                        {/* Table Header Placeholder */}
                        <div className="grid grid-cols-6 gap-4 py-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                        </div>
                        {/* Table Rows Placeholder */}
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="grid grid-cols-6 gap-4 py-3 border-b border-slate-50 dark:border-slate-800/50">
                                <div className="h-4 bg-slate-100 dark:bg-slate-800/50 rounded col-span-1 animate-pulse" />
                                <div className="h-4 bg-slate-100 dark:bg-slate-800/50 rounded col-span-1 animate-pulse" />
                                <div className="h-4 bg-slate-100 dark:bg-slate-800/50 rounded col-span-1 animate-pulse" />
                                <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                                <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded col-span-1 animate-pulse" />
                                <div className="h-4 bg-slate-100 dark:bg-slate-800/50 rounded col-span-1 animate-pulse" />
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    )
}
