"use client"

import { Order, OrderStatus, Comment } from "../data/mock-orders"
import { OrderCard } from "./order-card"
import { useState, useEffect, useRef, useMemo } from "react"
import { ChevronDown, ChevronUp, Search, RefreshCw, Loader2, Plus } from "lucide-react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, closestCorners } from "@dnd-kit/core"
import { BarcodeScanner } from "./barcode-scanner"
import { OrderDetailPanel } from "./order-detail-panel"
import { toast } from "sonner"
import { Toaster } from "sonner"
import { updateOrderStatus, updateOrderDetails, addCommentAction, getOrders, markOrderAsRead, syncWooCommerceOrders, syncEtsyOrders, createManualOrder } from "../app/actions"
import { ManualOrderModal } from "./manual-order-modal"

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
            audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3")
            audioRef.current.volume = 0.7 // Set reasonable volume
        }
    }, [])

    // Track orders in ref to access inside interval without resetting it
    const ordersRef = useRef(orders)
    useEffect(() => {
        ordersRef.current = orders
    }, [orders])

    useEffect(() => {
        const interval = setInterval(async () => {
            if (activeId) return; // Don't poll while dragging

            const latestOrders = await getOrders()
            const currentOrders = ordersRef.current

            // Sound Logic
            const hasNew = latestOrders.length > currentOrders.length
            const hasNotification = latestOrders.some((o: any) => o.hasNotification && !currentOrders.find(old => old.id === o.id)?.hasNotification)

            if ((hasNew || hasNotification) && audioRef.current) {
                audioRef.current.play().catch((e: any) => console.log("Audio play failed (Autoplay blocked?)", e))
                toast.info("Yeni sipariş/aktivite var!")
            }

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

    const [selectedTexture, setSelectedTexture] = useState<string>("")

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
        // Texture Filter
        if (selectedTexture) {
            const hasTexture = order.items.some(i => i.material === selectedTexture)
            if (!hasTexture) return false
        }

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
        return filteredOrders
            .filter(order => order.status === statusId || order.status === statusTitle)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
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

                    {/* Texture Filter */}
                    <div className="relative">
                        <select
                            value={selectedTexture}
                            onChange={(e) => setSelectedTexture(e.target.value)}
                            className="block w-48 pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700 bg-white shadow-sm transition-shadow hover:shadow-md cursor-pointer appearance-none"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                        >
                            <option value="">Tüm Dokular</option>
                            {uniqueTextures.map(texture => (
                                <option key={texture} value={texture}>{texture}</option>
                            ))}
                        </select>
                    </div>


                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        {/* Woo Sync Button */}
                        {/* Admin Only Sync Buttons */}
                        {currentUser.role === 'admin' && (
                            <>
                                <button
                                    onClick={handleSync}
                                    disabled={isSyncing}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    {isSyncing ? 'Çekiliyor...' : 'Woo Çek'}
                                </button>

                                <button
                                    onClick={async () => {
                                        setIsSyncing(true)
                                        toast.info("Etsy senkronizasyonu...")
                                        try {
                                            const res = await syncEtsyOrders()
                                            if (res.error) toast.error(res.error)
                                            else {
                                                toast.success(res.message)
                                                const latest = await getOrders()
                                                setOrders(latest as any)
                                            }
                                        } catch (e) { toast.error("Hata oluştu") }
                                        finally { setIsSyncing(false) }
                                    }}
                                    disabled={isSyncing}
                                    className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    Etsy Çek
                                </button>
                                <div className="h-6 w-px bg-gray-200"></div>
                            </>
                        )}

                        <div className="h-6 w-px bg-gray-200"></div>

                        {searchTerm && (
                            <span className="font-bold text-blue-600">
                                {filteredOrders.length} sonuç bulundu
                            </span>
                        )}
                        {!searchTerm && (
                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                <span>Toplam <span className="font-bold text-gray-900">{orders.length}</span> sipariş</span>
                                <span className="h-4 w-px bg-gray-300"></span>
                                <span>Bugün <span className="font-bold text-green-600">{orders.filter(o => new Date(o.date).toDateString() === new Date().toDateString()).length}</span> sipariş</span>
                            </div>
                        )}

                        <div className="h-6 w-px bg-gray-200"></div>

                        {/* Manual Order Button */}
                        <button
                            onClick={() => setIsManualOrderOpen(true)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Manuel Sipariş
                        </button>

                        <button
                            onClick={async () => {
                                const newOrder = {
                                    id: Math.floor(Math.random() * 10000),
                                    customer: "Demo Müşteri",
                                    total: "1500.00 ₺",
                                    status: "Sipariş Alındı",
                                    date: new Date().toISOString().split('T')[0],
                                    updatedAt: new Date().toISOString(),
                                    items: [],
                                    labels: JSON.stringify(['Demo']),
                                    hasNotification: true
                                }
                                setOrders(prev => [newOrder as any, ...prev])
                            }}
                            className="hidden" // Hiding Demo Button
                        >
                            + Demo Sipariş
                        </button>
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
                        const isCollapsed = collapsedIds.includes(column.id)
                        const columnOrders = getOrdersByStatus(column.id, column.title)

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
                                <div
                                    key={column.id}
                                    className={`flex-shrink-0 w-12 flex flex-col h-full rounded-xl border border-gray-200 cursor-pointer transition-all hover:w-14 items-center py-4 justify-between ${column.color || 'bg-gray-50'}`}
                                    onClick={toggleCollapse}
                                    title={column.title}
                                >
                                    <div className="bg-white text-gray-900 text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-sm border border-gray-100">
                                        {columnOrders.length}
                                    </div>
                                    <div className="p-1.5 rounded-full bg-white/40 hover:bg-white/80 transition-colors backdrop-blur-sm">
                                        <ChevronDown className="w-4 h-4 text-gray-700" />
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div key={column.id} className="flex-shrink-0 w-80 max-w-[90vw] flex flex-col h-full rounded-xl bg-gray-50/50 border border-gray-100 transition-all snap-center shadow-sm">
                                <div className={`p-4 border-b rounded-t-xl sticky top-0 backdrop-blur-sm z-10 flex justify-between items-center ${column.color || 'bg-gray-100'} bg-opacity-90`}>
                                    <div className="flex items-center gap-2">
                                        <h2 className="font-bold text-gray-800">{column.title}</h2>
                                        <span className="bg-white/60 text-gray-900 text-xs font-bold px-2 py-0.5 rounded-full border border-black/5 shadow-sm">
                                            {columnOrders.length}
                                        </span>
                                    </div>
                                    <button
                                        onClick={toggleCollapse}
                                        className="p-1 hover:bg-black/5 rounded-md transition-colors text-gray-600"
                                    >
                                        <ChevronUp className="w-4 h-4" />
                                    </button>
                                </div>

                                <DroppableId id={column.id}>
                                    <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[200px]">
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
                                    </div>
                                </DroppableId>
                            </div>
                        )
                    })}
                </div>
            </div>
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
        </DndContext>
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

function DroppableId({ id, children }: { id: string; children: React.ReactNode }) {
    const { setNodeRef } = useDroppable({ id: id })
    return (
        <div ref={setNodeRef} className="h-full">
            {children}
        </div>
    )
}
