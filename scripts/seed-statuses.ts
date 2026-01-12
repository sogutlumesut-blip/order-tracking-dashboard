
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
    console.log("Seeding statuses...")

    const defaults = [
        { title: "Bekliyor", color: "#64748b", order: 0 },
        { title: "Hazırlanıyor", color: "#3b82f6", order: 1 },
        { title: "Kargolandı", color: "#f97316", order: 2 },
        { title: "Tamamlandı", color: "#22c55e", order: 3 },
        { title: "İptal Edildi", color: "#ef4444", order: 4 },
    ]

    for (const s of defaults) {
        const existing = await db.statusColumn.findFirst({ where: { title: s.title } })
        if (!existing) {
            await db.statusColumn.create({
                data: {
                    title: s.title,
                    color: s.color,
                    order: s.order
                }
            })
            console.log(`Created ${s.title}`)
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await db.$disconnect())
