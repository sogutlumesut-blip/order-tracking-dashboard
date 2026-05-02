import { PrismaClient } from '@prisma/client'
import { createDHLExpressShipment } from "./lib/dhl-api"
import { createKargoEntegratorShipment } from "./lib/kargo-entegrator-api"

const db = new PrismaClient()

async function testFull() {
  const barcode = `MANUAL-TEST-FULL-${Date.now()}`
  try {
    const order = await db.order.create({
      data: {
        customer: "Test UI Customer",
        phone: "",
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
            name: "Test UI Product",
            sku: "",
            quantity: 1,
            image_src: "https://test.com/image.jpg",
            material: "Dokulu Duvar Kağıdı",
            dimensions: "100x100 cm",
            url: null
          }]
        }
      }
    })
    console.log("Order created:", order.id)

    // Simulate logManualActivity
    await db.orderActivity.create({
        data: {
            orderId: order.id,
            author: "System",
            action: "ORDER_CREATED",
            details: "Manuel sipariş oluşturuldu."
        }
    })
    console.log("Logged activity")

    // Simulate createDHLShipmentAction
    console.log("Trying to create DHL shipment...")
    const orderWithItems = await db.order.findUnique({
        where: { id: order.id },
        include: { items: true }
    });
    
    // Simulate kargo entegrator fetch
    const shipmentRes = await createKargoEntegratorShipment(orderWithItems, orderWithItems!.items);
    console.log("Kargo Entegrator response:", shipmentRes)

  } catch (error) {
    console.error("FAIL:", error)
  } finally {
    await db.$disconnect()
  }
}

testFull()
