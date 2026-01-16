import { KanbanBoard } from "@/components/kanban-board"
import { getOrders, getStatuses, getLabels } from "./actions"
import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect("/login")

  const orders = await getOrders()
  let statuses = await getStatuses()
  const labels = await getLabels()

  // PERMISSION CHECK: Filter statuses if user has restrictions
  let userPermissions: string[] = []

  if (session.user.role !== 'admin') {
    try {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { allowedStatuses: true }
      })

      if (user?.allowedStatuses) {
        userPermissions = JSON.parse(user.allowedStatuses) as string[]

        // Filter Statuses (ignore MANUAL_SYNC flag for column filtering)
        if (Array.isArray(userPermissions) && userPermissions.length > 0) {
          // We only filter columns if there are actual column IDs. 
          // If the array only contains "MANUAL_SYNC", we shouldn't hide all columns.
          // However, the logic in UserPermissionsForm implies checking boxes adds them.
          // If 'MANUAL_SYNC' is the only thing checked, then 'statuses.filter' might return empty if not handled.
          // Actually, standard IDs are like 'pending', 'wc-pending'. 'MANUAL_SYNC' is distinct.

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

  // Transform DB orders for UI
  // No transformation needed anymore, getOrders returns ready UI data
  // Transform DB orders for UI
  // No transformation needed anymore, getOrders returns ready UI data
  const formattedOrders = orders || []

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
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
