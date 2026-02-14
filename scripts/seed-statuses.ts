
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding default statuses...')

    const defaults = [
        { id: 'pending', title: 'Bekliyor', color: '#64748b', order: 0 },
        { id: 'processing', title: 'Hazırlanıyor', color: '#3b82f6', order: 1 },
        { id: 'shipped', title: 'Kargolandı', color: '#f97316', order: 2 },
        { id: 'completed', title: 'Tamamlandı', color: '#22c55e', order: 3 },
        { id: 'cancelled', title: 'İptal Edildi', color: '#ef4444', order: 4 },
    ]

    for (const s of defaults) {
        await prisma.statusColumn.upsert({
            where: { id: s.id },
            update: s,
            create: s,
        })
    }

    console.log('Default statuses seeded.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
