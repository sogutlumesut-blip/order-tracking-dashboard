"use client"

import { Order, OrderStatus, Comment } from "../data/mock-orders"
import { OrderCard } from "./order-card"
import { useState, useEffect, useRef, useMemo } from "react"
import { ChevronDown, ChevronUp, Search, RefreshCw, Loader2, Plus, Filter, X, LogOut, User, Settings, Volume2, VolumeX } from "lucide-react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, closestCorners } from "@dnd-kit/core"
import { BarcodeScanner } from "./barcode-scanner"
import { OrderDetailPanel } from "./order-detail-panel"
import { toast } from "sonner"
import { Toaster } from "sonner"
import { updateOrderStatus, updateOrderDetails, addCommentAction, getOrders, markOrderAsRead, syncWooCommerceOrders, syncEtsyOrders, createManualOrder, simulateWooCommerceOrder, logoutAction } from "../app/actions"
import Link from "next/link"
import { ManualOrderModal } from "./manual-order-modal"
import { useRouter } from "next/navigation"

interface KanbanBoardProps {
    initialOrders: Order[]
    currentUser: { id: string; name: string; role: string }
    cols: { id: string; title: string; color: string }[]
    tags: { id: string; name: string; color: string | null }[]
}

export function KanbanBoard({ initialOrders, currentUser, cols, tags }: KanbanBoardProps) {
    const [orders, setOrders] = useState<Order[]>(initialOrders)
    const [collapsedIds, setCollapsedIds] = useState<string[]>([])
    const [searchTerm, setSearchTerm] = useState("")
    const [isSyncing, setIsSyncing] = useState(false)
    const router = useRouter()

    useEffect(() => {
        const saved = localStorage.getItem("collapsedColumns")
        if (saved) {
            try {
                setCollapsedIds(JSON.parse(saved))
            } catch (e) { }
        }
    }, [])

    const [activeId, setActiveId] = useState<number | null>(null)
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
    const [isPanelOpen, setIsPanelOpen] = useState(false)
    const [isManualOrderOpen, setIsManualOrderOpen] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
        setOrders(initialOrders)
    }, [initialOrders])

    // Use useRef for Audio to avoid hydration mismatch (Audio is not defined on server)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        if (typeof Audio !== "undefined") {
            // Cash Register Sound (Ka-ching!)
            audioRef.current = new Audio("/sounds/notification.mp3")
            audioRef.current.volume = 0.7
        }
    }, [])

    // Track orders in ref to access inside interval without resetting it
    const ordersRef = useRef(orders)
    useEffect(() => {
        ordersRef.current = orders
    }, [orders])

    // Store IDs to detect NEW ones specifically
    const previousOrderIds = useRef<Set<number>>(new Set(initialOrders.map(o => o.id)))

    // Unified Polling & Sync Logic is handled in the next useEffect
    // Removed naive checkSync useEffect to prevent state clobbering

    useEffect(() => {
        // Initial Sync on Mount
        const initialSync = async () => {
            toast.info("Siparişler kontrol ediliyor...", { duration: 2000, id: "init-sync" })
            await syncWooCommerceOrders(true) // Force sync on load
        }
        initialSync()

        const interval = setInterval(async () => {
            if (activeId) return; // Don't poll while dragging

            // 1. AUTO-SYNC: Trigger server-side sync check
            // We poll every 10 seconds. Server handles rate limiting (15s).
            try {
                const syncRes = await syncWooCommerceOrders(false)
                if (syncRes && !syncRes.error && !(syncRes as any).skipped) {
                    console.log("Auto-Sync Success: New data pulled")
                    router.refresh()
                }
            } catch (e) { console.error("Auto Force Sync Error", e) }


            const latestOrders = await getOrders()
            const currentOrders = ordersRef.current

            // ... rest of polling logic ...
            // Sound Logic: Check for NEW IDs
            const latestIds = new Set<number>(latestOrders.map((o: Order) => o.id))
            const prevIds = previousOrderIds.current

            // Find IDs that are in latest but NOT in previous (New arrivals)
            const newArrivals = latestOrders.filter((o: Order) => !prevIds.has(o.id))

            if (newArrivals.length > 0) {
                console.log("New Orders Detected:", newArrivals.map((o: Order) => o.id))

                if (audioRef.current) {
                    audioRef.current.play()
                        .then(() => toast.success(`${newArrivals.length} yeni sipariş geldi! 🔔`))
                        .catch((e) => {
                            console.log("Audio play failed (Autoplay detection):", e)
                            toast.info("Yeni sipariş var! (Sesi açmak için sayfaya tıklayın)")
                        })
                }
            }

            // Update previous IDs for next poll
            previousOrderIds.current = latestIds

            // Sync Logic
            setOrders(currentOrders => {
                // Check if any significant change exists first to avoid re-renders
                // But we must do the mapping to check timestamps mixed with server data
                let hasChanges = false

                // We need to merge server data with local optimistic data
                const mergedOrders = latestOrders.map((serverOrder: any) => {
                    const localOrder = currentOrders.find(o => o.id === serverOrder.id)

                    // 1. Interaction Lock Check (Grace period of 15 seconds)
                    if (interactionLocks.current[serverOrder.id] && Date.now() - interactionLocks.current[serverOrder.id] < 15000) {
                        return localOrder || serverOrder
                    }

                    // 2. Timestamp Check
                    if (localOrder && new Date(localOrder.updatedAt).getTime() > new Date(serverOrder.updatedAt).getTime()) {
                        return localOrder
                    }

                    // Check if this specific order changed from what we have
                    if (!localOrder ||
                        localOrder.status !== serverOrder.status ||
                        localOrder.updatedAt !== serverOrder.updatedAt ||
                        JSON.stringify(localOrder.labels) !== JSON.stringify(serverOrder.labels)) {
                        hasChanges = true
                    }

                    return serverOrder as Order
                })

                // Also check if any orders were deleted (existed in current but not in latest)
                if (currentOrders.length !== latestOrders.length) {
                    hasChanges = true
                }

                return hasChanges ? mergedOrders : currentOrders
            })

        }, 5000)
        return () => clearInterval(interval)
    }, [activeId])

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    )

    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
    const [openFilterId, setOpenFilterId] = useState<string | null>(null)

    const toggleFilter = (columnId: string) => {
        setOpenFilterId(prev => prev === columnId ? null : columnId)
    }

    const uniqueTextures = useMemo(() => {
        const textures = new Set<string>()
        orders.forEach(o => {
            o.items.forEach(i => {
                if (i.material) textures.add(i.material)
            })
        })
        return Array.from(textures).sort()
    }, [orders])

    // Filter Logic
    const filteredOrders = orders.filter(order => {
        // Search Filter
        if (!searchTerm) return true
        const lowerTerm = searchTerm.toLowerCase()
        return (
            order.customer.toLowerCase().includes(lowerTerm) ||
            order.id.toString().includes(lowerTerm) ||
            (order.barcode && order.barcode.toLowerCase().includes(lowerTerm)) ||
            (order.phone && order.phone.includes(lowerTerm))
        )
    })

    const getOrdersByStatus = (statusId: string, statusTitle: string) => {
        let ordersInColumn = filteredOrders.filter(order => order.status === statusId || order.status === statusTitle)

        // Apply Column Specific Filter
        const filter = columnFilters[statusId]
        if (filter) {
            ordersInColumn = ordersInColumn.filter(o => o.items.some(i => i.material === filter))
        }

        return ordersInColumn.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as number)
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event

        if (!over) {
            setActiveId(null)
            return
        }

        const activeId = active.id as number
        const overId = over.id as string // status id

        const order = orders.find(o => o.id === activeId)
        if (!order) return

        // Optimistic Update
        const oldStatus = order.status
        if (oldStatus === overId) {
            setActiveId(null)
            return
        }

        const newOrders = orders.map(o => {
            if (o.id === activeId) {
                return { ...o, status: overId as OrderStatus, updatedAt: new Date().toISOString() }
            }
            return o
        })
        interactionLocks.current[activeId] = Date.now()
        setOrders(newOrders)
        setActiveId(null)

        // Server Action
        try {
            await updateOrderStatus(activeId, overId)
            toast.success("Sipariş durumu güncellendi")
        } catch (error) {
            toast.error("Güncelleme başarısız")
            setOrders(orders) // Revert
        }
    }

    // Lock mechanic to prevent polling overwrite
    const interactionLocks = useRef<Record<string, number>>({})

    const handleBarcodeScan = async (code: string) => {
        const targetOrder = orders.find(o => o.barcode === code || o.id.toString() === code)
        if (targetOrder) {
            interactionLocks.current[targetOrder.id] = Date.now()
            setOrders(prev => prev.map(o => o.id === targetOrder.id ? { ...o, status: 'shipped' } : o))
            try {
                await updateOrderStatus(targetOrder.id, 'shipped')
                toast.success(`Sipariş #${targetOrder.id} Kargolandı!`)
            } catch (e) { toast.error("Hata oluştu") }
        } else {
            toast.error(`Barkod bulunamadı: ${code}`)
        }
    }

    const handleOrderUpdate = async (updatedOrder: Order) => {
        interactionLocks.current[updatedOrder.id] = Date.now()
        const orderWithNotification = { ...updatedOrder, hasNotification: true, updatedAt: new Date().toISOString() }
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? orderWithNotification : o))

        await updateOrderDetails(updatedOrder)
        toast.success("Sipariş güncellendi")
    }

    const handleAddComment = async (orderId: number, message: string, attachments: any[]) => {
        const newComment: Comment = {
            id: Date.now().toString(),
            author: currentUser.name,
            message,
            timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            attachments
        }

        setOrders(prev => prev.map(o => {
            if (o.id === orderId) {
                return {
                    ...o,
                    hasNotification: true,
                    updatedAt: new Date().toISOString(),
                    comments: o.comments ? [...o.comments, newComment] : [newComment]
                }
            }
            return o
        }))

        await addCommentAction(orderId, message, attachments)
    }

    const handleSync = async () => {
        setIsSyncing(true)
        toast.info("WooCommerce ile senkronizasyon yapılıyor...")
        try {
            const result = await syncWooCommerceOrders()
            if (result.success) {
                toast.success(result.message)
                if (result.logs && result.logs.length > 0) {
                    console.log("--- WOO SYNC LOGS ---")
                    result.logs.forEach((log: string) => console.log(log))
                    console.log("---------------------")
                }
                // Refresh local state immediately
                const latest = await getOrders()
                setOrders(latest as any)
            } else {
                toast.error(result.error)
            }
        } catch (e: any) {
            console.error("Sync Error:", e)
            toast.error(`Bağlantı hatası: ${e.message || "Bilinmeyen bir sorun oluştu"}`)
        } finally {
            setIsSyncing(false)
        }
    }


    if (!mounted) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col h-full">
                {/* Header moved from page.tsx */}
                <header className="bg-white border-b h-16 flex items-center justify-between px-4 md:px-6 shrink-0 z-20 relative">
                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shrink-0">
                            OMS
                        </div>
                        <h1 className="font-bold text-sm md:text-lg text-gray-800 truncate">Sipariş Takip <span className="hidden md:inline text-xs text-gray-400 font-normal">v2.3 (Sütunlar: {cols.length})</span></h1>
                    </div>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-4">
                        {/* Sound Toggle */}
                        <button
                            onClick={() => {
                                if (audioRef.current) {
                                    audioRef.current.play()
                                        .then(() => {
                                            toast.success("Bildirim sesi test edildi 🔔")
                                            // User interaction unlocked audio
                                        })
                                        .catch(() => toast.error("Ses çalınamadı. Tarayıcı izinlerini kontrol edin."))
                                }
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                            title="Bildirim sesini test et"
                        >
                            <Volume2 className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                            <User className="w-4 h-4" />
                            <span className="font-medium">{currentUser.name}</span>
                            <span className="text-xs text-gray-400">({currentUser.role})</span>
                        </div>

                        {currentUser.role === 'admin' && (
                            <Link href="/admin/settings" className="p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors" title="Ayarlar">
                                <Settings className="w-5 h-5" />
                            </Link>
                        )}

                        {/* Manuel Sipariş - Everyone can see */}
                        <button
                            onClick={() => setIsManualOrderOpen(true)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                            title="Manuel sipariş oluştur"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Manuel Sipariş</span>
                        </button>

                        {/* Woo & Etsy Sync - Styled similarly */}
                        {(currentUser.role === 'admin' || (currentUser as any).allowedStatuses?.includes("MANUAL_SYNC")) && ( // Note: currentUser in props might need mapping for permissions if detailed object passed
                            <>
                                <form action={async () => {
                                    toast.info("WooCommerce senkronizasyonu...")
                                    await syncWooCommerceOrders(true) // FORCE SYNC
                                    toast.success("Senkronizasyon tamamlandı")
                                }}>
                                    <button
                                        type="submit"
                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                                        title="WooCommerce'den son siparişleri manuel çek"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        Woo Çek
                                    </button>
                                </form>

                                {currentUser.role === 'admin' && (
                                    <form action={async () => {
                                        toast.info("Etsy senkronizasyonu...")
                                        await syncEtsyOrders()
                                        toast.success("Senkronizasyon tamamlandı")
                                    }}>
                                        <button
                                            type="submit"
                                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                                            title="Etsy'den son siparişleri manuel çek"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Etsy Çek
                                        </button>
                                    </form>
                                )}
                            </>
                        )}


                        <form action={async () => {
                            await logoutAction()
                        }}>
                            <button className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Çıkış Yap">
                                <LogOut className="w-5 h-5" />
                            </button>
                        </form>
                    </div>

                    {/* Mobile Menu Trigger */}
                    <div className="md:hidden flex items-center gap-2">
                        <button
                            onClick={() => setIsManualOrderOpen(true)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Ekle</span>
                        </button>

                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-gray-700 hover:bg-gray-100 rounded-md">
                            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Settings className="w-6 h-6" />}
                        </button>
                    </div>
                </header>

                {/* Mobile Menu Dropdown */}
                {mobileMenuOpen && (
                    <div className="md:hidden bg-white border-b p-4 flex flex-col gap-4 absolute top-16 left-0 w-full z-30 shadow-xl animate-in slide-in-from-top-2">
                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <User className="w-4 h-4" />
                                <span className="font-bold">{currentUser.name}</span>
                            </div>
                            <span className="text-xs bg-gray-200 px-2 py-1 rounded-full">{currentUser.role}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {(currentUser.role === 'admin' || (currentUser as any).allowedStatuses?.includes("MANUAL_SYNC")) && (
                                <form action={async () => {
                                    toast.info("Woo Senkronize ediliyor...")
                                    await syncWooCommerceOrders(true)
                                    setMobileMenuOpen(false)
                                }} className="col-span-1">
                                    <button className="w-full flex items-center justify-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-bold text-sm border border-blue-100">
                                        <RefreshCw className="w-4 h-4" />
                                        Woo Çek
                                    </button>
                                </form>
                            )}

                            {currentUser.role === 'admin' && (
                                <form action={async () => {
                                    toast.info("Etsy Senkronize ediliyor...")
                                    await syncEtsyOrders()
                                    setMobileMenuOpen(false)
                                }} className="col-span-1">
                                    <button className="w-full flex items-center justify-center gap-2 p-3 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 font-bold text-sm border border-orange-100">
                                        <RefreshCw className="w-4 h-4" />
                                        Etsy Çek
                                    </button>
                                </form>
                            )}

                            {currentUser.role === 'admin' && (
                                <Link onClick={() => setMobileMenuOpen(false)} href="/admin/settings" className="col-span-2 flex items-center justify-center gap-2 p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm border border-gray-200">
                                    <Settings className="w-4 h-4" />
                                    Tüm Ayarlar
                                </Link>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-2 border-t mt-2">
                            <button
                                onClick={() => {
                                    if (audioRef.current) {
                                        audioRef.current.play().catch(() => { })
                                        toast.success("Ses test edildi")
                                    }
                                }}
                                className="flex items-center gap-2 text-sm text-gray-600 px-2 py-1"
                            >
                                <Volume2 className="w-4 h-4" />
                                Test Ses
                            </button>

                            <form action={async () => await logoutAction()} className="ml-auto">
                                <button className="flex items-center gap-2 text-sm text-red-600 font-bold px-2 py-1">
                                    <LogOut className="w-4 h-4" />
                                    Çıkış Yap
                                </button>
                            </form>
                        </div>
                    </div>
                )}
                {/* Search Toolbar */}
                <div className="px-6 py-4 bg-white border-b flex items-center justify-between shrink-0 gap-4">
                    <div className="relative w-full max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Sipariş ara (Müşteri, No, Tel, Barkod)..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out text-gray-900 font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>


                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <form action={simulateWooCommerceOrder} className="hidden">
                            <button className="flex items-center gap-2 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-md transition-colors font-medium">
                                <Plus className="w-4 h-4" />
                                <span>Manuel Sipariş</span>
                            </button>
                        </form>

                        <div className="hidden md:flex items-center gap-1">
                            <span className="font-semibold text-gray-900">{filteredOrders.length}</span>
                            <span>sipariş</span>
                        </div>
                    </div>
                </div>

                {/* Board Area */}
                <div className="flex-1 flex gap-3 md:gap-6 overflow-x-auto p-2 md:p-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent snap-x snap-mandatory">
                    <Toaster position="top-center" />
                    <BarcodeScanner onScan={handleBarcodeScan} />

                    <ManualOrderModal
                        isOpen={isManualOrderOpen}
                        onClose={() => setIsManualOrderOpen(false)}
                        onCreate={async (data) => {
                            await createManualOrder(data)
                            const latest = await getOrders()
                            setOrders(latest as any)
                        }}
                    />

                    <OrderDetailPanel
                        isOpen={isPanelOpen}
                        onClose={() => setIsPanelOpen(false)}
                        order={selectedOrder ? orders.find(o => o.id === selectedOrder.id) || selectedOrder : null}
                        onUpdate={handleOrderUpdate}
                        onAddComment={handleAddComment}
                        currentUser={currentUser}
                        tags={tags}
                        statuses={cols}
                    />

                    {cols.map((column) => {
                        const columnOrders = getOrdersByStatus(column.id, column.title)
                        const isCollapsed = collapsedIds.includes(column.id)

                        const toggleCollapse = () => {
                            setCollapsedIds(prev => {
                                const newSet = prev.includes(column.id)
                                    ? prev.filter(id => id !== column.id)
                                    : [...prev, column.id]
                                localStorage.setItem("collapsedColumns", JSON.stringify(newSet))
                                return newSet
                            })
                        }

                        if (isCollapsed) {
                            return (
                                <div key={column.id} className="h-full pt-6">
                                    <div
                                        onClick={() => toggleCollapse()}
                                        className={`w-12 h-full rounded-full ${column.color || 'bg-gray-100'} border border-gray-200 flex flex-col items-center py-4 gap-4 cursor-pointer hover:bg-gray-200 transition-colors shadow-sm`}
                                    >
                                        <div className="writing-vertical-lr transform rotate-180 text-sm font-bold text-gray-600 whitespace-nowrap tracking-wider">
                                            {column.title}
                                        </div>
                                        <div className="flex flex-col items-center gap-1 mt-auto pb-4">
                                            <span className="bg-white text-gray-900 text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-sm">
                                                {columnOrders.length}
                                            </span>
                                            <div className="p-1.5 rounded-full bg-white/40 hover:bg-white/80 transition-colors backdrop-blur-sm">
                                                <ChevronDown className="w-4 h-4 text-gray-700" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div key={column.id} className="flex-shrink-0 w-80 max-w-[90vw] flex flex-col h-full rounded-xl bg-gray-50 border border-gray-200 transition-all snap-center shadow-sm">
                                <div className={`px-3 py-3 border-b rounded-t-xl relative z-30 flex flex-col gap-2 transition-colors ${column.color || 'bg-gray-100'} shadow-sm`}>
                                    <div className="flex justify-between items-center w-full relative">
                                        <div className="flex items-center gap-2">
                                            <h2 className="font-bold text-gray-800 text-sm">{column.title}</h2>
                                            <span className="bg-white/80 text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-black/5 shadow-sm">
                                                {columnOrders.length}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {/* Filter Toggle */}
                                            <div className="relative">
                                                <button
                                                    className={`p-1.5 rounded-md transition-all filter-menu-trigger ${columnFilters && columnFilters[column.id] ? 'bg-blue-100 text-blue-600 ring-1 ring-blue-500' : 'hover:bg-black/5 text-gray-500'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (typeof toggleFilter === 'function') toggleFilter(column.id);
                                                    }}
                                                >
                                                    <Filter className="w-3.5 h-3.5" strokeWidth={2.5} />
                                                </button>

                                                {/* Custom Dropdown Menu */}
                                                {openFilterId === column.id && (
                                                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50 filter-menu overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                        <div className="p-1 max-h-64 overflow-y-auto">
                                                            <button
                                                                onClick={() => {
                                                                    setColumnFilters(prev => { const n = { ...prev }; delete n[column.id]; return n; });
                                                                    setOpenFilterId(null);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${!columnFilters[column.id] ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                                            >
                                                                Tümü
                                                            </button>
                                                            {uniqueTextures.map(texture => (
                                                                <button
                                                                    key={texture}
                                                                    onClick={() => {
                                                                        setColumnFilters(prev => ({ ...prev, [column.id]: texture }));
                                                                        setOpenFilterId(null);
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${columnFilters[column.id] === texture ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                                                >
                                                                    {texture}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => toggleCollapse()}
                                                className="p-1.5 hover:bg-black/5 rounded-md transition-colors text-gray-600"
                                            >
                                                <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Active Filter Badge */}
                                    {columnFilters[column.id] && (
                                        <div className="flex items-center justify-between bg-blue-50 border border-blue-100 px-2 py-1 rounded text-xs text-blue-700 animate-in slide-in-from-top-1">
                                            <span className="font-medium truncate">{columnFilters[column.id]}</span>
                                            <button
                                                onClick={() => setColumnFilters(prev => { const n = { ...prev }; delete n[column.id]; return n; })}
                                                className="ml-1 p-0.5 hover:bg-blue-100 rounded-full"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* SCROLLABLE DROPPABLE AREA */}
                                <div className="flex-1 min-h-0 overflow-hidden relative">
                                    <DroppableId id={column.id} className="h-full overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300">
                                        {columnOrders.map(order => (
                                            <DraggableItem key={order.id} id={order.id}>
                                                <OrderCard
                                                    order={order}
                                                    onClick={() => {
                                                        setSelectedOrder(order);
                                                        setIsPanelOpen(true);
                                                        if (order.hasNotification) {
                                                            markOrderAsRead(order.id)
                                                            setOrders(prev => prev.map(o => o.id === order.id ? {
                                                                ...o,
                                                                hasNotification: false,
                                                                updatedAt: new Date().toISOString()
                                                            } : o))
                                                        }
                                                    }}
                                                    tags={tags}
                                                />
                                            </DraggableItem>
                                        ))}
                                        {columnOrders.length === 0 && (
                                            <div className="h-24 flex items-center justify-center text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg pointer-events-none">
                                                {searchTerm ? "Sonuç yok" : "Sipariş Yok"}
                                            </div>
                                        )}
                                    </DroppableId>
                                </div>
                            </div>
                        )
                    })}

                </div >
                <DragOverlay>
                    {activeId ? (() => {
                        const activeOrder = orders.find(o => o.id === activeId)
                        if (!activeOrder) return null
                        return (
                            <div className="cursor-grabbing shadow-2xl rounded-xl scale-105 transition-transform">
                                <div className="w-80 pointer-events-none">
                                    <OrderCard
                                        order={activeOrder}
                                        onClick={() => { }}
                                        tags={tags}
                                    />
                                </div>
                            </div>
                        )
                    })() : null}
                </DragOverlay>
            </div>
        </DndContext >
    )
}

function DraggableItem({ id, children }: { id: number; children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: id })
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-none">
            {children}
        </div>
    )
}

function DroppableId({ id, children, className }: { id: string; children: React.ReactNode, className?: string }) {
    const { setNodeRef } = useDroppable({ id: id })
    return (
        <div ref={setNodeRef} className={className || "h-full"}>
            {children}
        </div>
    )
}
