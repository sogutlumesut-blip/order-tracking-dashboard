
import { db } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'

export default async function DebugLoginPage() {
    const checks = {
        envVar: !!process.env.DATABASE_URL,
        dbConnection: false,
        adminUserFound: false,
        bcryptWorking: false,
        error: null as any
    }

    try {
        // Check DB Connection
        const userCount = await db.user.count()
        checks.dbConnection = true

        // Check Admin User
        const admin = await db.user.findUnique({
            where: { username: "admin" }
        })
        if (admin) {
            checks.adminUserFound = true
        }

        // Check Bcrypt
        const hash = await bcrypt.hash("test", 10)
        checks.bcryptWorking = !!hash

    } catch (e: any) {
        checks.error = e.message
    }

    return (
        <div className="p-8 font-mono text-sm">
            <h1 className="text-xl font-bold mb-4">Login Debug Status</h1>
            <pre className="bg-gray-100 p-4 rounded">
                {JSON.stringify(checks, null, 2)}
            </pre>
            <div className="mt-4 text-xs text-gray-500">
                Time: {new Date().toISOString()}
            </div>
        </div>
    )
}
