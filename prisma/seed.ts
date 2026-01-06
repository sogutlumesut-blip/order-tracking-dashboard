const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
    // 1. Ensure Admin User
    const password = await bcrypt.hash('admin', 10)
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            name: 'Yönetici',
            password,
            role: 'admin'
        }
    })
    console.log({ admin })

    // 2. Seed Settings (Statuses and Labels)
    const statuses = [
        { id: "pending", title: "Bekliyor", color: "bg-gray-100", order: 0 },
        { id: "processing", title: "Hazırlanıyor", color: "bg-blue-50", order: 1 },
        { id: "printed", title: "Basıldı / Üretildi", color: "bg-purple-50", order: 2 },
        { id: "shipped", title: "Kargolandı", color: "bg-green-50", order: 3 },
        { id: "completed", title: "Tamamlandı", color: "bg-green-100", order: 4 },
    ]

    for (const status of statuses) {
        await prisma.statusColumn.upsert({
            where: { id: status.id },
            update: {},
            create: status
        })
    }

    const labels = [
        { name: "Acil", color: "red" },
        { name: "Hediye", color: "pink" },
        { name: "Yurtdışı", color: "blue" },
        { name: "Özel İstek", color: "purple" },
        { name: "Kurumsal", color: "gray" },
        { name: "WooCommerce", color: "orange" }, // Added for integration
        { name: "Yeni", color: "green" }, // Added for integration
    ]

    for (const label of labels) {
        // Check existence by name to avoid duplicates if re-seeded logic was simpler
        const exists = await prisma.orderLabel.findFirst({ where: { name: label.name } })
        if (!exists) {
            await prisma.orderLabel.create({
                data: {
                    name: label.name,
                    color: label.color
                }
            })
        }
    }

    // 2. Clear existing orders to avoid duplicates if re-run (optional, but good for "reset")
    // await prisma.comment.deleteMany({})
    // await prisma.orderItem.deleteMany({})
    // await prisma.order.deleteMany({})

    // 3. Create Sample Orders

    // Order 1: Pending
    const order1 = await prisma.order.create({
        data: {
            customer: "Ahmet Yılmaz",
            total: "1.250 ₺",
            status: "pending",
            labels: JSON.stringify(["Acil"]),
            assignedTo: "Ahmet Usta",
            barcode: "1001",
            printNotes: "Lütfen dikkatli paketlensin.",
            items: {
                create: [
                    {
                        name: "Özel Tasarım Kupa",
                        quantity: 2,
                        image_src: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=500&q=80"
                    }
                ]
            },
            comments: {
                create: [
                    {
                        message: "Müşteri logosu vektörel olarak eklendi.",
                        authorId: admin.id
                    }
                ]
            }
        }
    })

    // Order 2: Processing
    const order2 = await prisma.order.create({
        data: {
            customer: "Ayşe Demir",
            total: "450 ₺",
            status: "processing",
            labels: JSON.stringify(["Hediye Paketi"]),
            assignedTo: "Baskı Makinesi 1",
            barcode: "1002",
            items: {
                create: [
                    {
                        name: "Kanvas Tablo (50x70)",
                        quantity: 1,
                        image_src: "https://images.unsplash.com/photo-1579783902614-a3fb39279c23?auto=format&fit=crop&w=500&q=80"
                    }
                ]
            }
        }
    })

    // Order 3: Shipped
    const order3 = await prisma.order.create({
        data: {
            customer: "Mehmet Çelik",
            total: "3.500 ₺",
            status: "shipped",
            labels: JSON.stringify([]),
            assignedTo: "Kargo",
            trackingNumber: "TR123456789",
            barcode: "1003",
            items: {
                create: [
                    {
                        name: "Duvar Kağıdı Rulo",
                        quantity: 5,
                        image_src: "https://images.unsplash.com/photo-1615800098779-1be4350c592a?auto=format&fit=crop&w=500&q=80"
                    }
                ]
            },
            comments: {
                create: [
                    {
                        message: "Kargoya verildi, takip numarası girildi.",
                        authorId: admin.id
                    }
                ]
            }
        }
    })

    console.log("Sample orders created:", { order1, order2, order3 })
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
