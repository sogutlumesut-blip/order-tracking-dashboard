
import { db } from "@/lib/prisma"
import { LoginForm } from "./login-form"

export default async function LoginPage() {
    // Server-Side Debug Checks
    let debugInfo = { status: 'init', db: false, err: '' }
    try {
        await db.user.count()
        debugInfo.db = true
        debugInfo.status = 'connected'
    } catch (e: any) {
        debugInfo.err = e.message
        debugInfo.status = 'failed'
    }

    return <LoginForm debugInfo={debugInfo} />
}
