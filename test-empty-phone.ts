import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testManualOrder() {
  const barcode = `MANUAL-TEST-2-${Date.now()}`
  try {
    const order = await prisma.order.create({
      data: {
        customer: "Test Customer",
        phone: "",
        email: "",
        address: "",
        city: "",
        note: "",
        total: "0.00 ₺",
        status: "pending_woo",
        barcode,
        labels: JSON.stringify(['Manuel']),
        hasNotification: true,
        items: {
          create: [{
            name: "Test Product",
            sku: "",
            quantity: 1,
            image_src: "",
            material: "",
            dimensions: "",
            url: null
          }]
        }
      }
    })
    console.log("Successfully created order with empty strings:", order.id)
  } catch (error) {
    console.error("Error creating order:", error)
  } finally {
    await prisma.$disconnect()
  }
}

testManualOrder()
