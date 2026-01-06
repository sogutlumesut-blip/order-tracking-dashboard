"use client"

import { Comment } from "../data/mock-orders" // Ensure this type matches generic Comment structure
import { useState, useRef } from "react"
import { Send, Paperclip, File as FileIcon, Image as ImageIcon } from "lucide-react"

interface ChatSectionProps {
    comments?: Comment[]
    onAddComment: (message: string, attachments: any[]) => void
    currentUser: { id: string; name: string; role: string }
}

export function ChatSection({ comments = [], onAddComment, currentUser }: ChatSectionProps) {
    const [message, setMessage] = useState("")
    const [attachment, setAttachment] = useState<{ name: string, type: 'image' | 'file', url: string } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleSend = () => {
        if (!message.trim() && !attachment) return

        const attachments = attachment ? [attachment] : []
        onAddComment(message, attachments)

        setMessage("")
        setAttachment(null)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Convert to Base64 to ensure it persists across sessions/users
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = e.target?.result as string
            const type = file.type.startsWith('image/') ? 'image' : 'file'

            setAttachment({
                name: file.name,
                type: type,
                url: result // Stores actual data
            })
        }
        reader.readAsDataURL(file)
    }

    return (
        <div className="flex flex-col h-[400px] border rounded-xl overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="p-3 border-b bg-white flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-500">Yazışma Geçmişi</span>
                {/* No user selector anymore, automated */}
                <span className="text-blue-600 font-medium">{currentUser.name} olarak yazıyorsunuz</span>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {comments.length === 0 && (
                    <div className="text-center text-gray-400 text-sm mt-10">
                        Henüz mesaj yok.
                    </div>
                )}

                {comments.map(comment => {
                    const isMe = comment.author === currentUser.name; // Simple check by name for now
                    return (
                        <div key={comment.id} className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-bold text-gray-700">{comment.author}</span>
                                <span>{comment.timestamp}</span>
                            </div>

                            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${isMe
                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                : 'bg-white border rounded-tl-sm shadow-sm text-gray-900 font-medium'
                                }`}>
                                {comment.message && <p>{comment.message}</p>}

                                {comment.attachments?.map((att: any, i: number) => (
                                    <div key={i} className="mt-2 p-2 bg-black/10 rounded-lg flex items-center gap-2 overflow-hidden">
                                        {att.type === 'image' ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={att.url} alt="attachment" className="w-full h-auto rounded-md max-w-[200px]" />
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
            <div className="p-3 bg-white border-t space-y-2">
                {attachment && (
                    <div className="flex items-center gap-2 bg-blue-50 text-blue-700 p-2 rounded-lg text-sm w-fit">
                        {attachment.type === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                        <span className="max-w-[200px] truncate">{attachment.name}</span>
                        <button onClick={() => setAttachment(null)} className="ml-2 hover:bg-blue-100 rounded-full p-1">X</button>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
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
                        className="flex-1 bg-gray-50 border-none rounded-full px-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 font-medium placeholder:text-gray-500"
                        placeholder="Mesaj yazın..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />

                    <button
                        onClick={handleSend}
                        className={`p-2 rounded-full transition-colors ${message.trim() || attachment
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                        disabled={!message.trim() && !attachment}
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
