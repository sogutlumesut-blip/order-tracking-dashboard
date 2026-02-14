import { KanbanBoard } from "@/components/kanban-board"
import { getOrders, getStatuses, getLabels } from "./actions"
import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect("/login")

  let orders: any[] = []
  let statuses: any[] = []
  let labels: any[] = []
  let dbError = null

  try {
    orders = await getOrders()
    statuses = await getStatuses()
    labels = await getLabels()
  } catch (e) {
    console.error("Dashboard Data Fetch Error:", e)
    dbError = "Veritabanı bağlantısı kurulamadı. Lütfen 5-10 dakika sonra tekrar deneyiniz."
    // Provide fallback statuses so UI doesn't crash completely
    statuses = [
      { id: "pending", title: "Bekliyor", color: "bg-gray-100", order: 0 },
      { id: "error", title: "Sistem Hatası", color: "bg-red-100", order: 1 }
    ]
  }

  // PERMISSION CHECK: Filter statuses if user has restrictions
  let userPermissions: string[] = []

  if (session.user.role !== 'admin' && !dbError) {
    try {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { allowedStatuses: true }
      })

      if (user?.allowedStatuses) {
        userPermissions = JSON.parse(user.allowedStatuses) as string[]

        // Filter Statuses (ignore MANUAL_SYNC flag for column filtering)
        if (Array.isArray(userPermissions) && userPermissions.length > 0) {
          const visibleStatusIds = userPermissions.filter(id => id !== "MANUAL_SYNC")
          if (visibleStatusIds.length > 0) {
            statuses = statuses.filter(s => visibleStatusIds.includes(s.id))
          }
        }
      }
    } catch (e) {
      console.error("Permission filter error:", e)
    }
  }

  const formattedOrders = orders || []

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      {dbError && (
        <div className="bg-red-600 text-white px-4 py-2 text-center font-bold animate-pulse">
          🚨 {dbError} (Bakım Modu)
        </div>
      )}
      <main className="flex-1 overflow-hidden">
        <KanbanBoard
          initialOrders={formattedOrders}
          currentUser={{ ...session.user, allowedStatuses: userPermissions }}
          cols={statuses}
          tags={labels}
        />
      </main>
    </div>
  )
}
