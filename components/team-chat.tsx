'use client'

import { useState, useEffect, useRef } from "react"
import { MessageCircle, X, Send, User as UserIcon, Paperclip, ImageIcon } from "lucide-react"
import { getChatMessages, sendChatMessage } from "@/app/actions-chat"

interface User {
    id: string
    name: string
    role: string
}

export function TeamChat({ currentUser }: { currentUser: User }) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<any[]>([])
    const [newMessage, setNewMessage] = useState("")
    const [attachment, setAttachment] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const fetchMessages = async (showLoading = false) => {
        if (showLoading) setIsLoading(true)
        const res = await getChatMessages(Date.now())
        if (res.success && res.messages) {
            setMessages(res.messages)
            if (!isOpen && res.messages.length > messages.length && messages.length > 0) {
                setHasUnread(true)
            }
        }
        if (showLoading) setIsLoading(false)
    }

    useEffect(() => {
        fetchMessages(true)
        const interval = setInterval(() => fetchMessages(), 10000) // Poll every 10 seconds
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        if (isOpen) {
            setHasUnread(false)
            scrollToBottom()
        }
    }, [isOpen, messages])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newMessage.trim() && !attachment) return

        const optimisticMessage = {
            id: 'temp-' + Date.now(),
            text: newMessage,
            attachment: attachment,
            senderId: currentUser.id,
            createdAt: new Date(),
            sender: currentUser,
            isOptimistic: true
        }
        
        setMessages(prev => [...prev, optimisticMessage])
        setNewMessage("")
        setAttachment(null)

        const res = await sendChatMessage(optimisticMessage.text, optimisticMessage.attachment || undefined)
        if (!res.success) {
            // Revert on error
            setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id))
            alert("Mesaj gönderilemedi: " + res.error)
        } else {
            // We fetch the real list to get exact timestamps and IDs from DB
            fetchMessages()
        }
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="bg-white dark:bg-slate-900 w-80 sm:w-96 h-[500px] max-h-[80vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden mb-4 animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-emerald-400" />
                            <h3 className="font-bold">Takım Sohbeti</h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="hover:bg-slate-800 p-1 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
                        {isLoading && messages.length === 0 ? (
                            <div className="flex justify-center items-center h-full">
                                <span className="animate-pulse text-slate-400">Yükleniyor...</span>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex justify-center items-center h-full text-slate-400 text-sm text-center">
                                Henüz mesaj yok.<br/>İlk mesajı siz gönderin!
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const isMe = msg.senderId === currentUser.id
                                return (
                                    <div key={msg.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl max-w-[240px] text-sm break-words ${
                                                isMe 
                                                    ? 'bg-emerald-600 text-white rounded-br-none' 
                                                    : 'bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-bl-none text-slate-800 dark:text-slate-200'
                                            } ${msg.isOptimistic ? 'opacity-70' : ''}`}>
                                                <div className={`text-[10px] font-bold mb-1 ${isMe ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                    {msg.sender?.name || 'Bilinmeyen'}
                                                </div>
                                                {msg.attachment && (
                                                    <img src={msg.attachment} alt="Attachment" className="max-w-full rounded-lg mb-2 max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(msg.attachment, '_blank')} />
                                                )}
                                                {msg.text}
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-slate-400 mt-1 mx-8">
                                            {new Date(msg.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                        {attachment && (
                            <div className="relative inline-block self-start">
                                <img src={attachment} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-slate-200" />
                                <button onClick={() => setAttachment(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-0.5 hover:bg-slate-700">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                        <form onSubmit={handleSend} className="flex gap-2 items-center relative">
                            <label className="cursor-pointer text-slate-400 hover:text-emerald-600 transition-colors p-2">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                            if (file.size > 2 * 1024 * 1024) {
                                                alert("Dosya boyutu 2MB'dan büyük olamaz.")
                                                return
                                            }
                                            const reader = new FileReader()
                                            reader.onload = () => {
                                                setAttachment(reader.result as string)
                                            }
                                            reader.readAsDataURL(file)
                                        }
                                        e.target.value = ''
                                    }}
                                />
                                <Paperclip className="w-5 h-5" />
                            </label>
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onPaste={(e) => {
                                    const items = e.clipboardData.items
                                    for (let i = 0; i < items.length; i++) {
                                        if (items[i].type.indexOf('image') !== -1) {
                                            const file = items[i].getAsFile()
                                            if (file) {
                                                if (file.size > 2 * 1024 * 1024) {
                                                    alert("Dosya boyutu 2MB'dan büyük olamaz.")
                                                    return
                                                }
                                                const reader = new FileReader()
                                                reader.onload = () => {
                                                    setAttachment(reader.result as string)
                                                }
                                                reader.readAsDataURL(file)
                                            }
                                        }
                                    }
                                }}
                                placeholder="Mesaj yazın... (Görsel yapıştırabilirsiniz)"
                                className="flex-1 bg-slate-100 dark:bg-slate-800 border-0 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <button 
                                type="submit" 
                                disabled={(!newMessage.trim() && !attachment)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {!isOpen && (
                <button 
                    onClick={() => setIsOpen(true)}
                    className="relative bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-full shadow-xl transition-transform hover:scale-110 active:scale-95 flex items-center justify-center"
                >
                    <MessageCircle className="w-6 h-6" />
                    {hasUnread && (
                        <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse"></span>
                    )}
                </button>
            )}
        </div>
    )
}
