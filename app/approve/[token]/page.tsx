import { isDemoMode } from "@/lib/prisma"
import { getDemoDb } from "@/lib/demo-engine"
import { ApprovalClient } from "./approval-client"

export const dynamic = "force-dynamic"

export default async function CustomerApprovalPage(props: { params: Promise<{ token: string }> }) {
    const demoMode = isDemoMode()
    const { token } = await props.params
    const ddb = getDemoDb()
    const draft = await ddb.draftRecord.findUnique({ where: { approvalToken: token } })
    if (!draft) {
        return <div className="p-10 text-center font-bold text-red-600">Onay bağlantısı bulunamadı.</div>
    }
    const order = await ddb.order.findUnique({ where: { id: draft.orderId }, include: { items: true } })
    const latest = await ddb.draftRecord.findFirst({ where: { orderId: draft.orderId }, orderBy: { version: "desc" } })

    const isCurrent = latest?.id === draft.id && draft.status !== "superseded"
    const isApproved = draft.status === "approved"
    const isLow = draft.ppiStatus === "low" || draft.status === "failed"
    const canAct = isCurrent && !isApproved && !isLow

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 pb-16">
            {demoMode && (
                <div className="bg-amber-500 text-slate-950 font-black text-center py-2 px-4 text-xs tracking-wide">
                    ⚠️ DEMO MODE — SANAL MÜŞTERİ ONAY SAYFASI • CANLI SİSTEME VE GERÇEK BASKI KLASÖRÜNE AKTARIM YAPILMAZ
                </div>
            )}

            <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                                Baskı Öncesi Taslak Onayı — #{order?.barcode || order?.id}
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">
                                {order?.customer} • {order?.items?.[0]?.name || draft.sku}
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                            isApproved ? "bg-emerald-100 text-emerald-800" : !isCurrent || isLow ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
                        }`}>
                            Taslak v{draft.version} • {isApproved ? "ONAYLANDI" : !isCurrent ? "ESKİ SÜRÜM" : isLow ? "YETERSİZ ÇÖZÜNÜRLÜK" : "ONAY BEKLİYOR"}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><span className="text-slate-500 block">SKU</span><strong>{draft.sku}</strong></div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><span className="text-slate-500 block">Ölçü</span><strong>{draft.dimensionsRaw}</strong></div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><span className="text-slate-500 block">Efektif PPI</span><strong>{Math.round(draft.effectivePpi || 0)} PPI ({draft.ppiStatus})</strong></div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><span className="text-slate-500 block">Kaynak Format</span><strong>{draft.sourceFormat?.toUpperCase()} ({draft.sourceWidth}×{draft.sourceHeight}px)</strong></div>
                    </div>
                </div>

                {isApproved && (
                    <div className="p-4 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-sm font-bold">
                        ✅ Bu taslak (v{draft.version}) {draft.approvedByName} tarafından onaylandı. {demoMode ? "Onaylı yüksek çözünürlüklü baskı dosyası TEST klasörüne kaydedildi." : "Siparişiniz baskıya hazırlanıyor."}
                    </div>
                )}
                {!isCurrent && (
                    <div className="p-4 rounded-xl bg-red-100 border border-red-300 text-red-900 text-sm font-bold">
                        ⛔ Bu onay bağlantısı eski bir taslak sürümüne (v{draft.version}) aittir. Güncel sürüm v{latest?.version} olduğundan bu bağlantıdan onay verilemez.
                    </div>
                )}

                {/* Combined Luxury Presentation Sheet (Scaled + 100% Detail) */}
                <div className="bg-[#f7f3eb] border border-[#e3dac8] rounded-2xl p-4 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="font-bold text-sm text-[#2d2822]">Birleşik Müşteri Sunum Kartı (Ölçülü Taslak + %100 Çözünürlük)</h2>
                            <p className="text-xs text-[#6f665a]">Duvar/tavan ölçünüz ({draft.dimensionsRaw}) ve gerçek baskı netliği tek görselde yer alır.</p>
                        </div>
                        <a
                            href={`/api/demo/files/sheet/${draft.id}?token=${encodeURIComponent(token)}&download=1`}
                            download
                            className="px-3 py-1.5 rounded-lg bg-[#2d2822] hover:bg-[#1f1b17] text-[#f7f3eb] text-xs font-bold"
                        >
                            ⬇️ Sunum Kartını İndir (JPG)
                        </a>
                    </div>
                    <img
                        src={`/api/demo/files/sheet/${draft.id}?token=${encodeURIComponent(token)}&v=${draft.version}`}
                        alt="Birleşik Müşteri Sunum Kartı"
                        className="w-full rounded-xl border border-[#dfd5c3] bg-[#f7f3eb]"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                        <h3 className="font-bold text-sm mb-2">1. Ölçüye Göre Hazırlanan Taslak</h3>
                        <img src={`/api/demo/files/preview/${draft.id}?token=${encodeURIComponent(token)}`} alt="Taslak" className="w-full rounded-xl border bg-slate-950" />
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                        <h3 className="font-bold text-sm mb-2">2. %100 Yakın Baskı Detayı (Gerçek Piksel)</h3>
                        <img src={`/api/demo/files/detail/${draft.id}?token=${encodeURIComponent(token)}`} alt="%100 Detay" className="w-full rounded-xl border bg-slate-950" />
                    </div>
                </div>

                {canAct && <ApprovalClient token={token} defaultName={order?.customer || ""} version={draft.version} />}
            </div>
        </div>
    )
}
