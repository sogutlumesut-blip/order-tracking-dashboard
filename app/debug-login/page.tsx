import { db } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'
// Version: 2.1 (Force Update)

async function upgradeToAdmin() {
    "use server"
    try {
        // 1. Ensure 'admin' user exists!
        const existingAdmin = await db.user.findUnique({ where: { username: "admin" } })

        if (!existingAdmin) {
            // Create it if missing
            const hashedPassword = await bcrypt.hash("admin", 10)
            await db.user.create({
                data: {
                    username: "admin",
                    password: hashedPassword,
                    name: "Admin User",
                    role: "admin"
                }
            })
        } else {
            // Upgrade existing if found
            await db.user.update({
                where: { username: "admin" },
                data: { role: "admin" }
            })
        }

        // 2. Also upgrade everyone else just in case
        await db.user.updateMany({
            where: { NOT: { username: "admin" } },
            data: { role: "admin" }
        })

        revalidatePath("/")
    } catch (e) {
        console.error("Upgrade failed", e)
    }
    redirect("/")
}

async function seedStatuses() {
    "use server"
    try {
        const defaults = [
            { id: "pending", title: "Bekliyor", color: "#64748b", order: 0 },
            { id: "processing", title: "Hazırlanıyor", color: "#3b82f6", order: 1 },
            { id: "shipped", title: "Kargolandı", color: "#f97316", order: 2 },
            { id: "completed", title: "Tamamlandı", color: "#22c55e", order: 3 },
            { id: "cancelled", title: "İptal Edildi", color: "#ef4444", order: 4 },
        ]

        for (const s of defaults) {
            const existing = await db.statusColumn.findUnique({ where: { id: s.id } })
            if (!existing) {
                await db.statusColumn.create({
                    data: { id: s.id, title: s.title, color: s.color, order: s.order }
                })
            }
        }
        revalidatePath("/")
    } catch (e) {
        console.error("Seed failed", e)
    }
    redirect("/")
}

async function resetOrdersToPending() {
    "use server"
    try {
        // Find 'pending' status or create it if missing
        let pending = await db.statusColumn.findUnique({ where: { id: "pending" } })
        if (!pending) {
            // Fallback: Try to find ANY status
            const first = await db.statusColumn.findFirst()
            if (first) pending = first
        }

        if (pending) {
            // Update all non-completed orders to pending
            // We EXCLUDE orders that are explicitly 'completed' if we want, but user asked to move ALL.
            // "Tüm siparişleri Bekliyor'a taşı" means ALL.
            await db.order.updateMany({
                data: { status: pending.id }
            })
        }
        revalidatePath("/")
    } catch (e) {
        console.error("Reset failed", e)
    }
    redirect("/")
}

export default async function DebugLoginPage() {
    const checks = {
        envVar: !!process.env.DATABASE_URL,
        dbConnection: false,
        adminUserFound: false,
        bcryptWorking: false,
        error: null as any
    }

    try {
        const userCount = await db.user.count()
        checks.dbConnection = true
        const admin = await db.user.findUnique({ where: { username: "admin" } })
        if (admin) checks.adminUserFound = true
        const hash = await bcrypt.hash("test", 10)
        checks.bcryptWorking = !!hash
    } catch (e: any) {
        checks.error = e.message
    }

    return (
        <div className="min-h-screen bg-blue-900 text-white font-mono p-8 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-black mb-8 text-yellow-400 bg-black p-4 rounded-xl border-4 border-yellow-400 shadow-[8px_8px_0px_0px_rgba(250,204,21,1)]">
                V3.3 SİPARİŞ KURTARMA (SON DÜZELTME)
            </h1>

            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-2xl mb-8 overflow-auto">
                <pre className="text-sm text-gray-300">
                    {JSON.stringify(checks, null, 2)}
                </pre>
            </div>

            <div className="border border-red-200 bg-red-50 p-6 rounded-lg text-center">
                <h3 className="text-lg font-bold text-red-700 mb-2">Acil Durum: Admin Yetkisi Ver</h3>
                <p className="mb-4 text-gray-600">
                    Aşağıdaki butona bastığınızda, sistemdeki tüm "staff" (personel) kullanıcıları "admin" (yönetici) yapılır.
                    <br />
                    (Sayfa yenilenecektir)
                </p>
                <form action={upgradeToAdmin}>
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow transition-colors block w-full mb-4">
                        Beni YÖNETİCİ (Admin) Yap 🚀
                    </button>
                </form>

                <form action={seedStatuses} className="border-t pt-4 mt-4">
                    <h3 className="text-lg font-bold text-blue-700 mb-2">Veritabanı Onarımı</h3>
                    <p className="mb-2 text-gray-600 text-xs">Kolonlar (Bekliyor, Hazırlanıyor vb.) görünmüyorsa buna basın:</p>
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors w-full">
                        Varsayılan Kolonları Geri Getir ♻️
                    </button>
                </form>

                <form action={resetOrdersToPending} className="border-t pt-4 mt-4">
                    <h3 className="text-lg font-bold text-orange-700 mb-2">Sipariş Taşıma</h3>
                    <p className="mb-2 text-gray-600 text-xs">Siparişler yanlış yerde geliyorsa buna basın:</p>
                    <button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors w-full">
                        Tüm Siparişleri "Bekliyor"a Taşı 📦
                    </button>
                </form>
            </div>

            <div className="mt-8 text-xs text-gray-400 text-center">
                Time: {new Date().toISOString()}
            </div>
        </div>
    )
}
