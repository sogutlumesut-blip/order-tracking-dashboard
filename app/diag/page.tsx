
import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { updateOrderStatus } from "../actions"

export default async function DiagPage() {
    let dbStatus = "Checking..."
    let sessionStatus = "Checking..."
    let testActionResult = "Not run"

    try {
        const count = await db.order.count()
        dbStatus = `OK. Order count: ${count}`
    } catch (e: any) {
        dbStatus = `FAILED: ${e.message}`
    }

    try {
        const session = await getSession()
        sessionStatus = session ? `OK. User: ${session.user?.name}` : "No Session"
    } catch (e: any) {
        sessionStatus = `FAILED: ${e.message}`
    }

    return (
        <div className="p-10 font-mono">
            <h1 className="text-2xl font-bold mb-4">OMS Diagnostic v3.6.6.6</h1>
            <div className="space-y-2">
                <p><strong>Database:</strong> {dbStatus}</p>
                <p><strong>Session:</strong> {sessionStatus}</p>
                <p><strong>Time (Server):</strong> {new Date().toISOString()}</p>
            </div>
            <div className="mt-8 p-4 border rounded">
                <h2 className="text-xl mb-2">Manual Actions</h2>
                <form action={async () => {
                    'use server'
                    // This is a server action triggered by a form
                    try {
                        const result = await updateOrderStatus(236, 'pending')
                        console.log("Diag result:", result)
                    } catch (e) {
                        console.error("Diag error:", e)
                    }
                }}>
                    <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
                        Run updateOrderStatus(236, 'pending')
                    </button>
                </form>
            </div>
        </div>
    )
}
