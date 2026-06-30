'use client'

import { useState, useEffect, useRef } from "react"
import { MessageCircle, X, Send, User as UserIcon, Paperclip, Download } from "lucide-react"

interface User {
    id: string
    name: string
    role: string
}

// Web Audio API notification sound (soft premium chime)
const playNotificationSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContext) return
        const ctx = new AudioContext()
        
        const now = ctx.currentTime
        
        // Tone 1 (soft bell)
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = 'sine'
        osc1.frequency.setValueAtTime(880, now) // A5 note
        gain1.gain.setValueAtTime(0, now)
        gain1.gain.linearRampToValueAtTime(0.1, now + 0.05)
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
        
        osc1.connect(gain1)
        gain1.connect(ctx.destination)
        osc1.start(now)
        osc1.stop(now + 0.4)
        
        // Tone 2 (E6, starts slightly later)
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(1320, now + 0.08) // E6 note
        gain2.gain.setValueAtTime(0, now + 0.08)
        gain2.gain.linearRampToValueAtTime(0.15, now + 0.12)
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
        
        osc2.connect(gain2)
        gain2.connect(ctx.destination)
        osc2.start(now + 0.08)
        osc2.stop(now + 0.5)
    } catch (e) {
        console.error("Web Audio API error", e)
    }
}

// Client-side image compression utility
const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.src = base64Str
        img.onload = () => {
            const canvas = document.createElement('canvas')
            const maxDimension = 800
            let width = img.width
            let height = img.height

            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width)
                    width = maxDimension
                } else {
                    width = Math.round((width * maxDimension) / height)
                    height = maxDimension
                }
            }

            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height)
                // Compress to JPEG with 0.7 quality
                resolve(canvas.toDataURL('image/jpeg', 0.7))
            } else {
                reject(new Error("Canvas context or loading failed."))
            }
        }
        img.onerror = () => {
            reject(new Error("Seçilen görsel formatı tarayıcı tarafından desteklenmiyor. Lütfen PNG veya JPG formatında yükleyin."))
        }
    })
}

// Helper function to render text with clickable links
const renderMessageText = (text: string, isMe: boolean) => {
    if (!text) return null;
    
    // Match URLs starting with http:// or https://
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
        if (part.match(urlRegex)) {
            const linkClass = isMe 
                ? "text-emerald-200 hover:text-white underline break-all font-medium" 
                : "text-emerald-600 dark:text-emerald-400 hover:underline break-all font-medium";
            return (
                <a 
                    key={index} 
                    href={part} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={linkClass}
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }
        return part;
    });
};

export function TeamChat({ currentUser }: { currentUser: User }) {
    const [isOpen, setIsOpen] = useState(false)
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null)
    
    // Initialize messages from localStorage cache if available for instant load
    const [messages, setMessages] = useState<any[]>(() => {
        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem('team_chat_messages')
            if (cached) {
                try {
                    return JSON.parse(cached)
                } catch (e) {
                    return []
                }
            }
        }
        return []
    })
    
    const [newMessage, setNewMessage] = useState("")
    const [attachment, setAttachment] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    
    const messagesRef = useRef(messages)
    const isOpenRef = useRef(isOpen)
    const sendingMessageIdsRef = useRef<Set<string>>(new Set())

    // Keep refs up-to-date to avoid stale closures in polling callbacks
    useEffect(() => {
        messagesRef.current = messages
        if (typeof window !== 'undefined') {
            const nonOptimistic = messages.filter(m => !m.isOptimistic)
            localStorage.setItem('team_chat_messages', JSON.stringify(nonOptimistic))
        }
    }, [messages])

    useEffect(() => {
        isOpenRef.current = isOpen
    }, [isOpen])

    // Event listener to open chat window when an order is shared
    useEffect(() => {
        const handleOpenChat = () => {
            setIsOpen(true)
            fetchMessages(false)
            setTimeout(() => scrollToBottom(true), 100)
        }
        window.addEventListener('open-team-chat', handleOpenChat)
        return () => window.removeEventListener('open-team-chat', handleOpenChat)
    }, [])

    const fetchMessages = async (showLoading = false) => {
        if (showLoading && messagesRef.current.length === 0) setIsLoading(true)
        try {
            const response = await fetch('/api/chat')
            const res = await response.json()
            if (res.success && res.messages) {
                const currentMessages = messagesRef.current
                // Preserve in-flight optimistic messages or recently sent messages that aren't in the server poll yet
                const now = Date.now()
                const temporaryOrRecent = currentMessages.filter(m => {
                    const isOptimistic = m.isOptimistic && sendingMessageIdsRef.current.has(m.id)
                    const isRecentMe = m.senderId === currentUser.id && 
                                       (now - new Date(m.createdAt).getTime()) < 10000 &&
                                       !res.messages.some((serverMsg: any) => serverMsg.id === m.id)
                    return isOptimistic || isRecentMe
                })
                
                // Identify new incoming messages from other users
                const newOtherMessages = res.messages.filter((newMsg: any) => {
                    const alreadyExists = currentMessages.some(m => m.id === newMsg.id)
                    const isNotMe = newMsg.senderId !== currentUser.id
                    return !alreadyExists && isNotMe
                })

                setMessages([...res.messages, ...temporaryOrRecent])

                // Play notification sound on new incoming messages
                if (newOtherMessages.length > 0 && currentMessages.length > 0) {
                    playNotificationSound()
                }
                
                if (!isOpenRef.current && res.messages.length > currentMessages.length && currentMessages.length > 0) {
                    setHasUnread(true)
                }
            }
        } catch (e) {
            console.error("Failed to fetch messages:", e)
        }
        if (showLoading) setIsLoading(false)
    }

    useEffect(() => {
        // Initial fetch on mount (shows spinner only if there's no cached data)
        fetchMessages(messages.length === 0)
    }, [])

    useEffect(() => {
        if (isOpen) {
            setHasUnread(false)
            // Force scroll to bottom on open (using setTimeout to ensure layout has updated)
            setTimeout(() => scrollToBottom(true), 50)
            // Immediately fetch fresh messages on open
            fetchMessages(false)
        }
        
        // Dynamic polling: 2s when open (real-time chat feel), 10s when closed
        const intervalTime = isOpen ? 2000 : 10000
        const interval = setInterval(() => fetchMessages(), intervalTime)
        
        return () => clearInterval(interval)
    }, [isOpen])

    useEffect(() => {
        if (isOpen) {
            scrollToBottom(false) // Only scroll if already at bottom
        }
    }, [messages])

    const scrollToBottom = (force = false) => {
        const container = scrollContainerRef.current
        if (!container) return

        // User is near bottom if within 200px of scroll limit
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200

        if (force || isNearBottom) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: force ? 'auto' : 'smooth'
            })
        }
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newMessage.trim() && !attachment) return

        const optimisticId = 'temp-' + Date.now()
        const optimisticMessage = {
            id: optimisticId,
            text: newMessage,
            attachment: attachment,
            senderId: currentUser.id,
            createdAt: new Date(),
            sender: currentUser,
            isOptimistic: true
        }
        
        sendingMessageIdsRef.current.add(optimisticId)
        setMessages(prev => [...prev, optimisticMessage])
        setNewMessage("")
        setAttachment(null)
        setTimeout(() => scrollToBottom(true), 50)

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: optimisticMessage.text,
                    attachment: optimisticMessage.attachment || undefined
                })
            })
            const res = await response.json()
            if (!res.success) {
                sendingMessageIdsRef.current.delete(optimisticId)
                // Revert on error
                setMessages(prev => prev.filter(m => m.id !== optimisticId))
                alert("Mesaj gönderilemedi: " + res.error)
            } else {
                sendingMessageIdsRef.current.delete(optimisticId)
                // Replace the optimistic message directly with the server-saved message
                setMessages(prev => prev.map(m => m.id === optimisticId ? res.message : m))
            }
        } catch (error: any) {
            sendingMessageIdsRef.current.delete(optimisticId)
            setMessages(prev => prev.filter(m => m.id !== optimisticId))
            alert("Mesaj gönderilirken bir hata oluştu: " + (error.message || error))
        }
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="bg-white dark:bg-slate-900 w-80 sm:w-96 h-[680px] max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden mb-4 animate-in slide-in-from-bottom-5">
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
                    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
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
                                                    msg.attachment.startsWith('data:application/pdf') || msg.attachment.endsWith('.pdf') ? (
                                                        <>
                                                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 mt-1 mb-2 max-w-full">
                                                                <div className="w-9 h-9 rounded bg-red-100 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400 font-extrabold text-xs">
                                                                    PDF
                                                                </div>
                                                                <div className="flex-1 min-w-0 text-left">
                                                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[130px]" title={msg.text && msg.text.endsWith('.pdf') ? msg.text : 'Belge.pdf'}>
                                                                        {msg.text && msg.text.endsWith('.pdf') ? msg.text : "Belge.pdf"}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-400">
                                                                        PDF Dosyası
                                                                    </p>
                                                                </div>
                                                                <a 
                                                                    href={msg.attachment} 
                                                                    download={msg.text && msg.text.endsWith('.pdf') ? msg.text : "belge.pdf"}
                                                                    className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
                                                                    title="İndir"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <Download className="w-4 h-4" />
                                                                </a>
                                                            </div>
                                                            {/* Only render text below the PDF card if it is not just the filename */}
                                                            {msg.text && !msg.text.endsWith('.pdf') && (
                                                                <div className="text-xs mt-1">
                                                                    {renderMessageText(msg.text, isMe)}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <img src={msg.attachment} alt="Attachment" className="max-w-full rounded-lg mb-2 max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setActiveLightboxImage(msg.attachment)} />
                                                            {renderMessageText(msg.text, isMe)}
                                                        </>
                                                    )
                                                )}
                                                {!msg.attachment && renderMessageText(msg.text, isMe)}
                                            </div>
                                        </div>
                                        <span className="text-[9px] text-slate-400 mt-1 mx-8">
                                            {new Date(msg.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
                                                                {attachment.startsWith('data:application/pdf') ? (
                                                                    <div className="h-16 px-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-bold">
                                                                        📄 PDF Belgesi
                                                                    </div>
                                                                ) : (
                                                                    <img src={attachment} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-slate-200" />
                                                                )}
                                                                <button onClick={() => setAttachment(null)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-0.5 hover:bg-slate-700">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        )}
                        <form onSubmit={handleSend} className="flex gap-2 items-center relative">
                            <label className="cursor-pointer text-slate-400 hover:text-emerald-600 transition-colors p-2">
                                <input 
                                    type="file" 
                                    accept="image/*,.pdf,application/pdf" 
                                    className="hidden" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                            if (file.type.includes('tiff') || file.name.endsWith('.tiff') || file.name.endsWith('.tif')) {
                                                alert("TIFF formatındaki görseller tarayıcılar tarafından doğrudan gösterilemez. Lütfen görseli PNG veya JPG formatına dönüştürüp tekrar yükleyin.")
                                                e.target.value = ''
                                                return
                                            }
                                            if (file.size > 10 * 1024 * 1024) {
                                                alert("Dosya boyutu 10MB'dan büyük olamaz.")
                                                e.target.value = ''
                                                return
                                            }
                                            const reader = new FileReader()
                                            reader.onload = async () => {
                                                if (file.type === 'application/pdf') {
                                                    setAttachment(reader.result as string)
                                                    if (!newMessage.trim()) {
                                                        setNewMessage(file.name)
                                                    }
                                                } else {
                                                    try {
                                                        const compressed = await compressImage(reader.result as string)
                                                        setAttachment(compressed)
                                                    } catch (err: any) {
                                                        alert("Görsel yüklenemedi: " + err.message)
                                                    }
                                                }
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
                                            // Ignore TIFF format from clipboard (macOS clipboards copy TIFF alongside PNG/JPEG)
                                            if (items[i].type.indexOf('image') !== -1 && !items[i].type.includes('tiff')) {
                                                const file = items[i].getAsFile()
                                                if (file) {
                                                    if (file.size > 10 * 1024 * 1024) {
                                                        alert("Dosya boyutu 10MB'dan büyük olamaz.")
                                                        return
                                                    }
                                                    const reader = new FileReader()
                                                    reader.onload = async () => {
                                                        try {
                                                            const compressed = await compressImage(reader.result as string)
                                                            setAttachment(compressed)
                                                        } catch (err: any) {
                                                            alert("Görsel yüklenemedi: " + err.message)
                                                        }
                                                    }
                                                    reader.readAsDataURL(file)
                                                }
                                            } else if (items[i].type === 'application/pdf') {
                                                const file = items[i].getAsFile()
                                                if (file) {
                                                    if (file.size > 10 * 1024 * 1024) {
                                                        alert("Dosya boyutu 10MB'dan büyük olamaz.")
                                                        return
                                                    }
                                                    const reader = new FileReader()
                                                    reader.onload = () => {
                                                        setAttachment(reader.result as string)
                                                        if (!newMessage.trim()) {
                                                            setNewMessage(file.name)
                                                        }
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

            {activeLightboxImage && (
                <div 
                    className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setActiveLightboxImage(null)}
                >
                    <button 
                        className="absolute top-4 right-4 text-white hover:text-slate-200 bg-slate-900/50 p-2 rounded-full backdrop-blur-md transition-colors"
                        onClick={() => setActiveLightboxImage(null)}
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <img 
                        src={activeLightboxImage} 
                        alt="Görsel Detayı" 
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    )
}
