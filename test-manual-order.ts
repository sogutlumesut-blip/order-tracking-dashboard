import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testManualOrder() {
  const barcode = `MANUAL-TEST-${Date.now()}`
  try {
    const order = await prisma.order.create({
      data: {
        customer: "Test Customer",
        phone: "123456",
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
            name: "Test Product",
            sku: "TEST-SKU",
            quantity: 1,
            image_src: "https://test.com/image.jpg",
            material: "Test Material",
            dimensions: "100x100 cm",
            url: null
          }]
        }
      }
    })
    console.log("Successfully created order:", order.id)
  } catch (error) {
    console.error("Error creating order:", error)
  } finally {
    await prisma.$disconnect()
  }
}

testManualOrder()
