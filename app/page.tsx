import { KanbanBoard } from "@/components/kanban-board"
import { getOrders, simulateWooCommerceOrder, getStatuses, getLabels } from "./actions"
import { getSession, logout } from "@/lib/auth"
import { redirect } from "next/navigation"
import { LogOut, User, Settings } from "lucide-react"
import Link from "next/link"
import { db } from "@/lib/prisma"

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect("/login")

  const orders = await getOrders()
  let statuses = await getStatuses()
  const labels = await getLabels()

  // PERMISSION CHECK: Filter statuses if user has restrictions
  if (session.user.role !== 'admin') {
    try {
      const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { allowedStatuses: true }
      })

      if (user?.allowedStatuses) {
        const allowed = JSON.parse(user.allowedStatuses) as string[]
        if (Array.isArray(allowed) && allowed.length > 0) {
          statuses = statuses.filter(s => allowed.includes(s.id))
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
      {/* Header */}
      <header className="bg-white border-b h-16 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            OMS
          </div>
          <h1 className="font-bold text-lg text-gray-800">Sipariş Takip</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
            <User className="w-4 h-4" />
            <span className="font-medium">{session.user.name}</span>
            <span className="text-xs text-gray-400">({session.user.role})</span>
          </div>

          {session.user.role === 'admin' && (
            <Link href="/admin/settings" className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors" title="Ayarlar">
              <Settings className="w-5 h-5" />
            </Link>
          )}

          {session.user.role === 'admin' && (
            <form action={simulateWooCommerceOrder}>
              <button
                type="submit"
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                title="WooCommerce'den sipariş düşmüş gibi simüle et"
              >
                + Demo Sipariş
              </button>
            </form>
          )}

          <form action={async () => {
            "use server"
            await logout()
            redirect("/login")
          }}>
            <button className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Çıkış Yap">
              <LogOut className="w-5 h-5" />
            </button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <KanbanBoard
          initialOrders={formattedOrders}
          currentUser={session.user}
          cols={statuses}
          tags={labels}
        />
      </main>
    </div>
  )
}
