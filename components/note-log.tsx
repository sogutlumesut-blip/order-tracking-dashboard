"use client"

import { Comment } from "../data/mock-orders"
import { useState } from "react"
import { Send, FileText } from "lucide-react"

interface NoteLogProps {
    comments?: Comment[]
    onAddNote: (message: string) => void
    currentUser: { id: string; name: string; role: string }
    className?: string
}

export function NoteLog({ comments = [], onAddNote, currentUser, className }: NoteLogProps) {
    const [note, setNote] = useState("")

    const handleSend = () => {
        if (!note.trim()) return
        onAddNote(note)
        setNote("")
    }

    return (
        <div className={`flex flex-col border rounded-xl overflow-hidden bg-white shadow-sm ${className || 'h-[400px]'}`}>
            {/* Header */}
            <div className="p-3 border-b bg-gray-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="font-bold text-gray-700 text-sm">İşlem Notları ve Tarihçe</span>
            </div>

            {/* Log Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
                {comments.length === 0 && (
                    <div className="text-center text-gray-400 text-xs mt-10 italic">
                        Henüz not eklenmemiş.
                    </div>
                )}

                {comments.map(comment => (
                    <div key={comment.id} className="relative bg-amber-50 border border-amber-200 rounded-lg p-3 shadow-sm group hover:shadow-md transition-shadow">
                        {/* Note Content */}
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium mb-4">
                            {comment.message}
                        </p>

                        {/* Attachments */}
                        {comment.attachments && comment.attachments.length > 0 && (
                            <div className="mb-3 flex gap-2">
                                {comment.attachments.map((att, i) => (
                                    <span key={i} className="text-xs bg-white/50 px-2 py-1 rounded text-amber-800 border border-amber-200">
                                        📎 {att.name || 'Ek'}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Footer: Author & Time */}
                        <div className="flex items-center justify-between border-t border-amber-100 pt-2 mt-1">
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
            <div className="p-3 bg-gray-50 border-t">
                <div className="relative">
                    <textarea
                        className="w-full p-3 pr-12 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px] resize-none font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-500"
                        placeholder="Yeni not ekle..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!note.trim()}
                        className={`absolute right-2 bottom-2 p-2 rounded-full transition-colors ${note.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400'
                            }`}
                        title="Notu Kaydet"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-2 ml-1">
                    * Eklenen notlar silinemez ve değiştirilemez.
                </p>
            </div>
        </div>
    )
}
