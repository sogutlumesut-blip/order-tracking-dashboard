import { KanbanBoard } from "@/components/kanban-board"
import { getOrders, getStatuses, getLabels, syncWooCommerceOrders, syncPrintMarktOrders } from "./actions"
import { Footer } from "@/components/footer"
import { TeamChat } from "@/components/team-chat"
import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { db } from "@/lib/prisma"

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect("/login")

  // Kick off background syncs asynchronously without awaiting
  syncWooCommerceOrders(false).catch(e => console.error("BG WC Sync Error:", e));
  syncPrintMarktOrders(false).catch(e => console.error("BG PM Sync Error:", e));

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
      { id: "pending_woo", title: "Bekliyor (DKM)", color: "bg-slate-100", order: 0 },
      { id: "pending_pm", title: "Bekliyor (PrintMarkt)", color: "bg-slate-100", order: 1 },
      { id: "error", title: "Sistem Hatası", color: "bg-red-100", order: 2 }
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
    <div className="h-[100dvh] bg-slate-50 dark:bg-[#020617] flex flex-col overflow-hidden transition-colors duration-300">
      {dbError && (
        <div className="bg-red-600 text-white px-4 py-2 text-center font-bold animate-pulse">
          🚨 {dbError} (Bakım Modu)
        </div>
      )}
      <main className="flex-1 overflow-hidden">
        <KanbanBoard
          initialOrders={formattedOrders}
          currentUser={{
            id: session.user.id,
            name: session.user.name,
            role: session.user.role,
            allowedStatuses: userPermissions
          }}
          cols={statuses}
          tags={labels}
        />
      </main>
      <TeamChat currentUser={{ id: session.user.id, name: session.user.name, role: session.user.role }} />
      <Footer />
    </div>
  )
}
// Automated deploy test
