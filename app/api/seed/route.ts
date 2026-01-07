
import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        // 1. Ensure Admin User
        const password = await bcrypt.hash('admin', 10)
        let userAction = "previously existed";

        const existingAdmin = await db.user.findUnique({ where: { username: 'admin' } })
        if (!existingAdmin) {
            await db.user.create({
                data: {
                    username: 'admin',
                    name: 'Yönetici',
                    password,
                    role: 'admin'
                }
            })
            userAction = "created new";
        }

        // 2. Seed Settings (Statuses)
        const statuses = [
            { id: "pending", title: "Bekliyor", color: "bg-gray-100", order: 0 },
            { id: "processing", title: "Hazırlanıyor", color: "bg-blue-50", order: 1 },
            { id: "printed", title: "Basıldı / Üretildi", color: "bg-purple-50", order: 2 },
            { id: "shipped", title: "Kargolandı", color: "bg-green-50", order: 3 },
            { id: "completed", title: "Tamamlandı", color: "bg-green-100", order: 4 },
        ]

        for (const status of statuses) {
            await db.statusColumn.upsert({
                where: { id: status.id },
                update: {},
                create: status
            })
        }

        // 3. Seed Labels
        const labels = [
            { name: "Acil", color: "red" },
            { name: "Hediye", color: "pink" },
            { name: "Yurtdışı", color: "blue" },
            { name: "Özel İstek", color: "purple" },
            { name: "Kurumsal", color: "gray" },
            { name: "WooCommerce", color: "orange" },
            { name: "Yeni", color: "green" },
        ]

        for (const label of labels) {
            const exists = await db.orderLabel.findFirst({ where: { name: label.name } })
            if (!exists) {
                await db.orderLabel.create({
                    data: {
                        name: label.name,
                        color: label.color
                    }
                })
            }
        }

        return NextResponse.json({
            success: true,
            message: `Database seeded successfully. Admin user ${userAction}.`,
            info: "Login with admin / admin"
        })

    } catch (error: any) {
        console.error("Seed Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
