"use client"

import { Comment } from "../data/mock-orders"
import { useState, useRef } from "react"
import { Send, FileText, Paperclip, File as FileIcon, Image as ImageIcon, Trash2 } from "lucide-react"

interface NoteAttachment {
    name: string
    type: 'image' | 'file'
    url: string
}

interface NoteLogProps {
    comments?: Comment[]
    onAddNote: (message: string, attachments: NoteAttachment[]) => void
    currentUser: { id: string; name: string; role: string }
    className?: string
    isLoading?: boolean
    onImageClick?: (url: string) => void
    onDeleteNote?: (commentId: string) => void
}

export function NoteLog({ comments = [], onAddNote, currentUser, className, isLoading, onImageClick, onDeleteNote }: NoteLogProps) {
    const [note, setNote] = useState("")
    const [attachment, setAttachment] = useState<NoteAttachment | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSend = () => {
        if (!note.trim() && !attachment) return
        const attachments = attachment ? [attachment] : []
        onAddNote(note, attachments)
        setNote("")
        setAttachment(null)
    }

    const compressImage = (base64Str: string, maxWidth = 2048, maxHeight = 2048): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.src = base64Str
            img.onload = () => {
                const canvas = document.createElement('canvas')
                let width = img.width
                let height = img.height

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width
                        width = maxWidth
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height
                        height = maxHeight
                    }
                }

                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                ctx?.drawImage(img, 0, 0, width, height)
                resolve(canvas.toDataURL('image/jpeg', 0.90))
            }
        })
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async () => {
            let result = reader.result as string
            const isImg = file.type.startsWith('image/')

            if (isImg) {
                try {
                    result = await compressImage(result)
                } catch {
                    // Fallback to raw base64 if compression fails
                }
            }

            setAttachment({
                name: file.name,
                type: isImg ? 'image' : 'file',
                url: result
            })
        }
        reader.readAsDataURL(file)
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile()
                if (file) {
                    const reader = new FileReader()
                    reader.onload = async () => {
                        let result = reader.result as string
                        try {
                            result = await compressImage(result)
                        } catch {}
                        setAttachment({
                            name: `yapistirilan-gorsel-${Date.now()}.jpg`,
                            type: 'image',
                            url: result
                        })
                    }
                    reader.readAsDataURL(file)
                }
            }
        }
    }

    return (
        <div className={`flex flex-col border dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm ${className || 'h-[400px]'}`} onPaste={handlePaste}>
            {/* Header */}
            <div className="p-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">İşlem Notları ve Tarihçe</span>
            </div>

            {/* Log Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center my-auto text-slate-400 dark:text-slate-500 gap-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-medium animate-pulse">Yükleniyor...</span>
                    </div>
                ) : comments.length === 0 ? (
                    <div className="text-center text-slate-400 text-xs mt-10 italic">
                        Henüz not eklenmemiş.
                    </div>
                ) : (
                    null
                )}

                {!isLoading && comments.map(comment => (
                    <div key={comment.id} className="relative bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg p-3 shadow-sm group hover:shadow-md transition-shadow pr-8">
                        {/* Admin Delete Button */}
                        {currentUser?.role === 'admin' && (
                            <button
                                onClick={() => onDeleteNote?.(comment.id)}
                                className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Notu Sil"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}

                        {/* Note Content */}
                        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap font-medium mb-4">
                            {comment.message}
                        </p>

                        {/* Attachments */}
                        {comment.attachments && comment.attachments.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {comment.attachments.map((att, i) => (
                                    <div key={i} className="p-1 bg-amber-100/50 dark:bg-amber-900/20 rounded border border-amber-200/50 dark:border-amber-900/30 overflow-hidden">
                                        {att.type === 'image' ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={att.url}
                                                alt="attachment"
                                                className="w-full h-auto rounded-lg max-w-[450px] bg-slate-100 dark:bg-slate-700/50 object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
                                                onClick={() => onImageClick?.(att.url)}
                                            />
                                        ) : (
                                            <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-300 underline hover:text-blue-600 transition-colors py-0.5 px-1.5 font-medium">
                                                <FileIcon className="w-3.5 h-3.5" />
                                                {att.name}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer: Author & Time */}
                        <div className="flex items-center justify-between border-t border-amber-100 dark:border-amber-900/30 pt-2 mt-1">
                            <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                {comment.author}
                            </span>
                            <span className="text-[10px] text-amber-700/70 font-mono bg-amber-100/50 px-1.5 py-0.5 rounded">
                                {comment.timestamp}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t dark:border-slate-700">
                {attachment && (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 p-2 rounded-lg text-sm w-fit mb-2 border border-amber-200 dark:border-amber-900/30">
                        {attachment.type === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                        <span className="max-w-[200px] truncate">{attachment.name}</span>
                        <button onClick={() => setAttachment(null)} className="ml-2 hover:bg-amber-100 dark:hover:bg-amber-800 rounded-full p-1 font-bold">✕</button>
                    </div>
                )}

                <div className="relative">
                    <textarea
                        className="w-full p-3 pr-24 text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px] resize-none font-medium text-slate-900 dark:text-slate-100 placeholder:font-normal placeholder:text-slate-500 dark:placeholder:text-slate-400 bg-white dark:bg-slate-900"
                        placeholder="Yeni not ekle veya görselleri yapıştırın..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                    />
                    <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                            title="Dosya/Fotoğraf Ekle"
                        >
                            <Paperclip className="w-4 h-4" />
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!note.trim() && !attachment}
                            className={`p-2 rounded-full transition-colors ${note.trim() || attachment ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                                }`}
                            title="Notu Kaydet"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 ml-1">
                    * Eklenen notlar silinemez ve değiştirilemez.
                </p>
            </div>
        </div>
    )
}
