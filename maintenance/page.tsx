import { AlertTriangle } from "lucide-react"

export default function MaintenancePage() {
  return (
    <div className="h-[100dvh] bg-slate-50 dark:bg-[#020617] flex flex-col items-center justify-center p-4 transition-colors duration-300">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 shadow-2xl rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
        <div className="w-24 h-24 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-8 relative">
          <div className="absolute inset-0 bg-amber-200 dark:bg-amber-800/20 rounded-full animate-ping opacity-50"></div>
          <AlertTriangle className="w-12 h-12 text-amber-600 dark:text-amber-500 relative z-10" strokeWidth={2.5} />
        </div>
        
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
          Sistem Bakımda
        </h1>
        
        <p className="text-slate-600 dark:text-slate-400 mb-10 text-lg leading-relaxed">
          Size daha iyi hizmet verebilmek için şu anda sistemlerimizde kısa süreli bir çalışma yürütüyoruz. Anlayışınız için teşekkür ederiz.
        </p>

        <div className="inline-flex items-center justify-center px-5 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300">
          <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse mr-3"></div>
          Lütfen daha sonra tekrar deneyin
        </div>
      </div>
    </div>
  )
}
