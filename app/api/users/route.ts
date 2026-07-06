import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const users = await db.user.findMany({
            where: {
                role: {
                    in: ["admin", "staff"]
                }
            },
            select: {
                id: true,
                name: true,
                role: true
            },
            orderBy: {
                name: "asc"
            }
        })
        return NextResponse.json({ success: true, users })
    } catch (e: any) {
        console.error("[API_USERS] Error:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
