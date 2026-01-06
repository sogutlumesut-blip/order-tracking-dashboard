"use client"

import { useState } from "react"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trash2, GripVertical } from "lucide-react"
import { updateStatusOrder, deleteStatus } from "@/app/actions"
import { toast } from "sonner"

interface Status {
    id: string
    title: string
    color: string
    order: number
}

interface StatusListProps {
    initialStatuses: Status[]
}

export function StatusList({ initialStatuses }: StatusListProps) {
    const [items, setItems] = useState(initialStatuses)
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (over && active.id !== over.id) {
            setItems((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id)
                const newIndex = items.findIndex((item) => item.id === over.id)
                const newItems = arrayMove(items, oldIndex, newIndex)

                // Update order property
                const reordered = newItems.map((item, index) => ({
                    ...item,
                    order: index
                }))

                // Call Server Action
                updateStatusOrder(reordered.map(i => ({ id: i.id, order: i.order })))
                    .then(() => toast.success("Sıralama güncellendi"))
                    .catch(() => toast.error("Sıralama hatası"))

                return reordered
            })
        }
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext
                items={items.map(i => i.id)}
                strategy={verticalListSortingStrategy}
            >
                <div className="space-y-3 mb-6">
                    {items.map((status) => (
                        <SortableItem key={status.id} status={status} />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    )
}

function SortableItem({ status }: { status: Status }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: status.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border group relative"
        >
            <div className="flex items-center gap-3">
                {/* DRAG HANDLE */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing p-1 -ml-1"
                >
                    <GripVertical className="w-5 h-5" />
                </button>

                <div className={`w-4 h-4 rounded-full ${status.color.replace('bg-', 'bg-') || 'bg-gray-200'} border`} />
                <div>
                    <p className="font-bold text-sm text-gray-900">{status.title}</p>
                    <p className="text-xs text-gray-500 font-mono font-medium">{status.id}</p>
                </div>
            </div>

            <form
                action={async () => {
                    await deleteStatus(status.id)
                    toast.success("Silindi")
                }}
            >
                <button className="text-red-500 hover:text-red-700 p-1 opacity-50 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                </button>
            </form>
        </div>
    )
}
