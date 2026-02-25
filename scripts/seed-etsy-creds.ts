
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('--- Etsy Credentials Seeder ---')

    const credentials = [
        { key: 'etsy_global_api_key', value: 'wjf806hjh7a8mswsbf55v2fm' },
        { key: 'etsy_shared_secret', value: 'yj8vf8kq4t' }
    ]

    for (const cred of credentials) {
        const result = await prisma.systemSetting.upsert({
            where: { key: cred.key },
            update: { value: cred.value },
            create: { key: cred.key, value: cred.value }
        })
        console.log(`Saved ${cred.key}: ${result.value}`)
    }

    console.log('--- Done ---')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
