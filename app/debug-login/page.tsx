import { db } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'

async function upgradeToAdmin() {
    "use server"
    try {
        await db.user.updateMany({
            where: { OR: [{ username: "admin" }, { role: "staff" }] },
            data: { role: "admin" }
        })
        revalidatePath("/")
    } catch (e) {
        console.error("Upgrade failed", e)
    }
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
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow transition-colors">
                        Beni YÖNETİCİ (Admin) Yap 🚀
                    </button>
                </form>
            </div>

            <div className="mt-8 text-xs text-gray-400 text-center">
                Time: {new Date().toISOString()}
            </div>
        </div>
    )
}
