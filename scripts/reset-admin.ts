
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'

// Hardcode URL for debugging since .env parsing was flaky
process.env.DATABASE_URL = "file:./oms.db"

const prisma = new PrismaClient()

async function main() {
    console.log('Resetting admin password...')

    const password = await bcrypt.hash('admin', 10)
    const user = await prisma.user.upsert({
        where: { username: 'admin' },
        update: { password, role: 'admin' },
        create: {
            username: 'admin',
            name: 'Admin User',
            password,
            role: 'admin',
        },
    })
    console.log('Admin user updated:', user.username)
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
