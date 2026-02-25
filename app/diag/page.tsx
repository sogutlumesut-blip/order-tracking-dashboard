
import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { updateOrderStatusV3 } from "../actionsV2"
import fs from 'fs'
import path from 'path'

export default async function DiagPage() {
    let dbStatus = "Checking..."
    let sessionStatus = "Checking..."
    let dbHost = "Unknown"
    let recentLogs: any[] = []
    let actionsFingerprint = "Unknown"

    try {
        const count = await db.order.count()
        dbStatus = `OK. Order count: ${count}`

        // Try to get host from internal prisma state if possible or just env
        dbHost = process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || "No DATABASE_URL in env"

        recentLogs = await db.orderActivity.findMany({
            orderBy: { timestamp: 'desc' },
            take: 10
        })

        // Read fingerprint of actions.ts
        try {
            const actionsPath = path.join(process.cwd(), 'app', 'actions.ts')
            if (fs.existsSync(actionsPath)) {
                const content = fs.readFileSync(actionsPath, 'utf8')
                actionsFingerprint = `Size: ${content.length}, Start: ${content.substring(0, 50).replace(/\n/g, ' ')}`
            } else {
                actionsFingerprint = "File NOT FOUND at " + actionsPath
            }
        } catch (e: any) {
            actionsFingerprint = "Error: " + e.message
        }

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
        <div className="p-10 font-mono text-xs sm:text-sm">
            <h1 className="text-2xl font-bold mb-4">OMS Diagnostic v3.6.6.10</h1>
            <div className="space-y-2 bg-slate-100 p-4 rounded mb-6">
                <p><strong>Database:</strong> {dbStatus}</p>
                <p><strong>DB Host:</strong> {dbHost}</p>
                <p><strong>Session:</strong> {sessionStatus}</p>
                <p><strong>Time (Server):</strong> {new Date().toISOString()}</p>
                <p><strong>Actions.ts Fingerprint:</strong> {actionsFingerprint}</p>
            </div>

            <div className="mb-8 p-4 border rounded bg-blue-50">
                <h2 className="text-xl mb-2 font-bold">Manual Test Action</h2>
                <form action={async () => {
                    'use server'
                    try {
                        console.log("DIAG_ACTION_START: #236 to draft (V3)")
                        const res = await updateOrderStatusV3(236, 'draft')
                        console.log("DIAG_ACTION_RESULT:", res)
                    } catch (e: any) {
                        console.error("DIAG_ACTION_ERROR:", e)
                    }
                }}>
                    <p className="mb-2">Clicking this will try to move Order #236 to 'draft' status.</p>
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">
                        Test updateOrderStatus(236, 'draft')
                    </button>
                </form>
            </div>

            <div>
                <h2 className="text-xl mb-2 font-bold">Recent Order Activity (Top 10)</h2>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300">
                        <thead>
                            <tr className="bg-slate-200">
                                <th className="border p-1">Time</th>
                                <th className="border p-1">Order</th>
                                <th className="border p-1">Action</th>
                                <th className="border p-1">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentLogs.map((log, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="border p-1 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                    <td className="border p-1 text-center">{log.orderId}</td>
                                    <td className="border p-1">{log.action}</td>
                                    <td className="border p-1 truncate max-w-xs">{log.details}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
