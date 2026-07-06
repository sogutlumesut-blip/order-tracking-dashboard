"use client"

import { Comment } from "../data/mock-orders" // Ensure this type matches generic Comment structure
import { useState, useRef } from "react"
import { Send, Paperclip, File as FileIcon, Trash2 } from "lucide-react"

interface ChatAttachment {
    name: string
    type: 'image' | 'file'
    url: string
}

interface ChatSectionProps {
    comments?: Comment[]
    onAddComment: (message: string, attachments: ChatAttachment[]) => void
    currentUser: { id: string; name: string; role: string }
    onImageClick?: (url: string) => void
    isLoading?: boolean
    onDeleteComment?: (commentId: string) => void
}

export function ChatSection({ comments = [], onAddComment, currentUser, onImageClick, isLoading, onDeleteComment }: ChatSectionProps) {
    const [message, setMessage] = useState("")
    const [attachment, setAttachment] = useState<{ name: string, type: 'image' | 'file', url: string } | null>(null)
    const [isSending, setIsSending] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSend = async () => {
        if (isSending) return
        if (!message.trim() && !attachment) return

        setIsSending(true)
        const attachments = attachment ? [attachment] : []

        try {
            await onAddComment(message, attachments)
            setMessage("")
            setAttachment(null)
        } catch (err) {
            console.error("Yorum gönderilirken hata oluştu:", err)
        } finally {
            setIsSending(false)
        }
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
                resolve(canvas.toDataURL('image/jpeg', 0.90)) // Compress as JPEG at 90% quality (High-Res)
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
                        console.log("Görsel yüksek kalitede yapıştırıldı.")
                    }
                    reader.readAsDataURL(file)
                }
            }
        }
    }

    return (
        <div className="flex flex-col h-[600px] border dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/50 shadow-sm transition-all" onPaste={handlePaste}>
            {/* Header */}
            <div className="p-3 border-b dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Yazışma Geçmişi</span>
                {/* No user selector anymore, automated */}
                <span className="text-blue-600 dark:text-blue-400 font-medium">{currentUser.name} olarak yazıyorsunuz</span>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center my-auto text-slate-400 dark:text-slate-500 gap-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-medium animate-pulse">Yükleniyor...</span>
                    </div>
                ) : comments.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm mt-10 italic">
                        Henüz mesaj yok.
                    </div>
                ) : null}

                {!isLoading && comments.map(comment => {
                    const isMe = comment.author === currentUser.name; // Simple check by name for now
                    return (
                        <div key={comment.id} className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-bold text-slate-700">{comment.author}</span>
                                <span>{comment.timestamp}</span>
                                {currentUser?.role === 'admin' && (
                                    <button
                                        onClick={() => onDeleteComment?.(comment.id)}
                                        className="text-slate-400 hover:text-red-500 ml-1 p-0.5 rounded transition-colors"
                                        title="Mesajı Sil"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${isMe
                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                : 'bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-sm shadow-sm text-slate-900 dark:text-slate-100 font-medium'
                                }`}>
                                {comment.message && <p>{comment.message}</p>}

                                {comment.attachments?.map((att: ChatAttachment, i: number) => (
                                    <div key={i} className="mt-2 p-2 bg-black/10 rounded-lg flex items-center gap-2 overflow-hidden">
                                        {att.type === 'image' ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={att.url}
                                                alt="attachment"
                                                className="w-full h-auto rounded-md max-w-[200px] min-h-[100px] min-w-[120px] bg-slate-100 dark:bg-slate-700/50 object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                                onClick={() => onImageClick?.(att.url)}
                                            />
                                        ) : (
                                            <a href={att.url} download={att.name} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs underline hover:text-blue-600 transition-colors">
                                                <FileIcon className="w-4 h-4" />
                                                {att.name}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white dark:bg-slate-800 border-t dark:border-slate-700 space-y-2">
                {attachment && (
                    <div className="relative flex items-center bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 p-2 rounded-lg text-sm w-fit border border-blue-200 dark:border-blue-900/30">
                        {attachment.type === 'image' ? (
                            <div className="relative w-16 h-16 mr-2 rounded overflow-hidden border border-blue-300 dark:border-blue-900/50 bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={attachment.url}
                                    alt="Önizleme"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ) : (
                            <FileIcon className="w-4 h-4 mr-1 flex-shrink-0" />
                        )}
                        <span className="max-w-[200px] truncate mr-2 font-medium">{attachment.name}</span>
                        <button
                            onClick={() => setAttachment(null)}
                            className="hover:bg-blue-100 dark:hover:bg-blue-800 rounded-full p-1 font-bold flex items-center justify-center w-5 h-5 text-xs text-blue-850 dark:text-blue-200 transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending}
                        className={`p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileSelect}
                        accept="image/*,.pdf,.doc,.docx"
                    />

                    <input
                        type="text"
                        disabled={isSending}
                        className="flex-1 bg-slate-50 dark:bg-slate-700 border-none rounded-full px-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-500 dark:placeholder:text-slate-400"
                        placeholder="Mesaj yazın veya görselleri yapıştırın..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        onPaste={handlePaste}
                    />

                    <button
                        onClick={handleSend}
                        className={`p-2 rounded-full transition-colors ${isSending ? 'opacity-50 cursor-not-allowed' : ''} ${message.trim() || attachment
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                            }`}
                        disabled={isSending || (!message.trim() && !attachment)}
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
