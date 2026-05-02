import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.order.findMany({
    select: { id: true, labels: true }
  })

  let updatedCount = 0

  for (const order of orders) {
    if (!order.labels) continue

    let labelsArr: string[] = []
    if (typeof order.labels === 'string') {
      try {
        labelsArr = JSON.parse(order.labels)
      } catch (e) {
        continue
      }
    } else if (Array.isArray(order.labels)) {
      labelsArr = order.labels
    } else {
      continue
    }

    if (labelsArr.length === 0) continue

    const originalLabels = JSON.stringify(labelsArr)

    // Sanitize
    let newLabels = labelsArr.map(l => typeof l === 'string' ? l.toUpperCase() : l)
    newLabels = newLabels.filter(l => l !== 'STANDART KARGO' && l !== 'PRINTMARKT')
    newLabels = newLabels.map(l => typeof l === 'string' ? l.replace('ÖZEL ETIKET', 'ÖZEL ETİKET') : l)
    
    // Deduplicate
    newLabels = [...new Set(newLabels)]

    const newLabelsString = JSON.stringify(newLabels)

    if (originalLabels !== newLabelsString) {
      console.log(`Order ${order.id} updating tags from ${originalLabels} to ${newLabelsString}`)
      await prisma.order.update({
        where: { id: order.id },
        data: { labels: newLabelsString }
      })
      updatedCount++
    }
  }

  console.log(`Finished updating ${updatedCount} orders.`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
