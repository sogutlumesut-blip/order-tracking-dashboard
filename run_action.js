const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function run() {
  const barcode = `MANUAL-TEST-JS-${Date.now()}`
  try {
    const order = await db.order.create({
      data: {
        customer: "Test JS",
        phone: "123",
        email: "test@test.com",
        address: "Test Address",
        city: "Test City",
        note: "Test Note",
        total: "0.00 ₺",
        status: "pending_woo",
        barcode,
        labels: JSON.stringify(['Manuel']),
        hasNotification: true,
        items: {
          create: [{
            name: "Test JS Product",
            sku: "",
            quantity: 1,
            image_src: "",
            material: "Dokulu Duvar Kağıdı",
            dimensions: "100x100 cm",
            url: null
          }]
        }
      }
    })
    console.log("SUCCESS! order ID:", order.id)
  } catch (e) {
    console.error("FAIL:", e)
  } finally {
    await db.$disconnect()
  }
}
run()
