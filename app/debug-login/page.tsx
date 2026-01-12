import { db } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'
// Trigger redeploy for admin fix

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
        <div className="p-8 font-mono text-sm max-w-2xl mx-auto">
            <h1 className="text-xl font-bold mb-4">Login Debug Status</h1>
            <pre className="bg-gray-100 p-4 rounded overflow-auto mb-6">
                {JSON.stringify(checks, null, 2)}
            </pre>

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
            </div>

            <div className="mt-8 text-xs text-gray-400 text-center">
                Time: {new Date().toISOString()}
            </div>
        </div>
    )
}
