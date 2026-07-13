'use client'

import { useState, useEffect, useRef } from "react"
import { MessageCircle, X, Send, User as UserIcon, Paperclip, Download, CornerUpLeft, Trash2, Smile } from "lucide-react"
import { toast } from "sonner"

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
            const maxDimension = 2048 // 2K Ultra High Resolution
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
                // Compress as JPEG with 0.90 quality (lossless look, small footprint)
                resolve(canvas.toDataURL('image/jpeg', 0.90))
            } else {
                reject(new Error("Canvas context or loading failed."))
            }
        }
        img.onerror = () => {
            reject(new Error("Seçilen görsel formatı tarayıcı tarafından desteklenmiyor. Lütfen PNG veya JPG formatında yükleyin."))
        }
    })
}

// Helper function to normalize text for comparison (case, space, and Turkish character insensitive)
const normalizeText = (str: string) => {
    return str
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
}

// Helper function to render text with clickable links and @mentions
const renderMessageText = (text: string, isMe: boolean) => {
    if (!text) return null;
    
    // Match URLs starting with http:// or https://
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urlParts = text.split(urlRegex);
    
    return urlParts.map((urlPart, urlIndex) => {
        if (urlPart.match(urlRegex)) {
            const linkClass = isMe 
                ? "text-emerald-200 hover:text-white underline break-all font-medium" 
                : "text-emerald-600 dark:text-emerald-400 hover:underline break-all font-medium";
            return (
                <a 
                    key={`url-${urlIndex}`} 
                    href={urlPart} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={linkClass}
                    onClick={(e) => e.stopPropagation()}
                >
                    {urlPart}
                </a>
            );
        }
        
        // Match mentions starting with @ (e.g. @Yasemin Grafiker)
        const mentionRegex = /(@[A-Za-z0-9ğüşöçıİĞÜŞÖÇ]+(?:\s[A-Za-z0-9ğüşöçıİĞÜŞÖÇ]+)?)/g;
        const mentionParts = urlPart.split(mentionRegex);
        
        return mentionParts.map((mPart, mIndex) => {
            if (mPart.match(mentionRegex)) {
                return (
                    <span 
                        key={`mention-${urlIndex}-${mIndex}`} 
                        className={`font-bold px-1.5 py-0.5 rounded text-xs select-none ${
                            isMe 
                                ? 'bg-emerald-700/50 text-emerald-100' 
                                : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-750 dark:text-emerald-400'
                        }`}
                    >
                        {mPart}
                    </span>
                );
            }
            return mPart;
        });
    });
};

export function TeamChat({ currentUser }: { currentUser: User }) {
    const [isOpen, setIsOpen] = useState(false)
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null)
    const [replyToMessage, setReplyToMessage] = useState<any | null>(null)
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
    const [allUsers, setAllUsers] = useState<any[]>([])
    const [showMentionList, setShowMentionList] = useState(false)
    const [mentionSearch, setMentionSearch] = useState("")
    const [activeMentionAlert, setActiveMentionAlert] = useState<any | null>(null)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const response = await fetch('/api/users')
                const data = await response.json()
                if (data.success && data.users) {
                    setAllUsers(data.users.filter((u: any) => u.id !== currentUser.id))
                }
            } catch (err) {
                console.error("Failed to load users for mentions:", err)
            }
        }
        if (isOpen) {
            loadUsers()
        }
    }, [isOpen, currentUser.id])
    const inputRef = useRef<HTMLInputElement>(null)
    
    // Initialize messages from localStorage cache if available for instant load
    const [messages, setMessages] = useState<any[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const cached = localStorage.getItem('team_chat_messages')
                if (cached) {
                    return JSON.parse(cached)
                }
            } catch (e) {
                console.error("Error reading team_chat_messages from localStorage:", e)
            }
        }
        return []
    })
    
    const [newMessage, setNewMessage] = useState("")
    const [attachment, setAttachment] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    
    const messagesRef = useRef(messages)
    const isOpenRef = useRef(isOpen)
    const sendingMessageIdsRef = useRef<Set<string>>(new Set())
    const isFirstFetchRef = useRef(true)

    // Keep refs up-to-date to avoid stale closures in polling callbacks
    useEffect(() => {
        messagesRef.current = messages
        if (typeof window !== 'undefined') {
            try {
                // To avoid QuotaExceededError in localStorage, we save high-res images as a lightweight placeholder.
                // This lets chat history load instantly on F5 while showing a nice loading state until the API returns.
                const nonOptimistic = messages.filter(m => !m.isOptimistic).map(m => {
                    if (m.attachment && m.attachment.startsWith('data:image/') && m.attachment.length > 50000) {
                        return { ...m, attachment: "placeholder-loading" }
                    }
                    if (m.attachment && m.attachment.startsWith('data:')) {
                        return { ...m, attachment: null }
                    }
                    return m
                })
                localStorage.setItem('team_chat_messages', JSON.stringify(nonOptimistic))
            } catch (e) {
                console.warn("Failed to save team_chat_messages to localStorage (quota exceeded or disabled):", e)
            }
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
            const currentMessages = messagesRef.current
            const nonOptimisticMessages = currentMessages.filter(m => !m.isOptimistic)
            const lastMessage = nonOptimisticMessages[nonOptimisticMessages.length - 1]
            
            let url = '/api/chat'
            // Use incremental fetch on subsequent polls if we have a last message timestamp
            if (!isFirstFetchRef.current && lastMessage && lastMessage.createdAt) {
                const timestamp = new Date(lastMessage.createdAt).getTime()
                url = `/api/chat?since=${timestamp}`
            }
            
            isFirstFetchRef.current = false

            const response = await fetch(url)
            const res = await response.json()
            if (res.success && res.messages) {
                const latestMessages = messagesRef.current

                if (url.includes('since=')) {
                    // Incremental Poll
                    if (res.messages.length === 0) {
                        if (showLoading) setIsLoading(false)
                        return
                    }
                    
                    // Filter out any messages from res.messages that already exist in latestMessages
                    const newUniqueMessages = res.messages.filter((newMsg: any) => 
                        !latestMessages.some(m => m.id === newMsg.id)
                    )
                    
                    if (newUniqueMessages.length === 0) {
                        if (showLoading) setIsLoading(false)
                        return
                    }
                    
                    // Identify new incoming messages from other users (for sound/unread notification)
                    const newOtherMessages = newUniqueMessages.filter((newMsg: any) => 
                        newMsg.senderId !== currentUser.id
                    )
                    
                    // Keep optimistic messages that are still sending or haven't arrived yet
                    const filteredCurrent = latestMessages.filter(m => 
                        m.isOptimistic || !res.messages.some((nm: any) => nm.id === m.id)
                    )
                    
                    setMessages([...filteredCurrent, ...newUniqueMessages])
                    
                    if (newOtherMessages.length > 0) {
                        playNotificationSound()
                        if (!isOpenRef.current) {
                            setHasUnread(true)
                        }
                        
                        // Check if the current user is mentioned in any of the new messages (Turkish character, space, and case insensitive)
                        const mentionMsg = newOtherMessages.find((nm: any) => {
                            if (!nm.text) return false
                            const normText = normalizeText(nm.text)
                            const normName = normalizeText(currentUser.name)
                            return normText.includes(`@${normName}`) || normText.includes(normName)
                        })
                        
                        if (mentionMsg) {
                            if (!isOpenRef.current) {
                                setActiveMentionAlert(mentionMsg)
                            }
                            
                            toast(`Sohbette Etiketlendiniz! 🔔`, {
                                description: `${mentionMsg.sender?.name || 'Bir çalışma arkadaşınız'}: "${mentionMsg.text}"`,
                                action: {
                                    label: "Sohbeti Aç",
                                    onClick: () => {
                                        setIsOpen(true)
                                        setTimeout(() => {
                                            jumpToMessage(mentionMsg.id)
                                        }, 400)
                                    }
                                },
                                duration: Infinity
                            })
                        }
                    }
                } else {
                    // Initial Load
                    const now = Date.now()
                    const temporaryOrRecent = latestMessages.filter(m => {
                        const isOptimistic = m.isOptimistic && sendingMessageIdsRef.current.has(m.id)
                        const isRecentMe = m.senderId === currentUser.id && 
                                           (now - new Date(m.createdAt).getTime()) < 10000 &&
                                           !res.messages.some((serverMsg: any) => serverMsg.id === m.id)
                        return isOptimistic || isRecentMe
                    })
                    
                    const newOtherMessages = res.messages.filter((newMsg: any) => {
                        const alreadyExists = latestMessages.some(m => m.id === newMsg.id)
                        const isNotMe = newMsg.senderId !== currentUser.id
                        return !alreadyExists && isNotMe
                    })

                    setMessages([...res.messages, ...temporaryOrRecent])
                    
                    const recentMentions = newOtherMessages.filter((nm: any) => {
                        if (!nm.text) return false
                        const normText = normalizeText(nm.text)
                        const normName = normalizeText(currentUser.name)
                        const isMentioned = normText.includes(`@${normName}`) || normText.includes(normName)
                        const isRecent = Date.now() - new Date(nm.createdAt).getTime() < 60000 // Sent within last 60 seconds
                        return isMentioned && isRecent
                    })

                    if (recentMentions.length > 0) {
                        const mentionMsg = recentMentions[recentMentions.length - 1]
                        if (!isOpenRef.current) {
                            setActiveMentionAlert(mentionMsg)
                        }
                        
                        toast(`Sohbette Etiketlendiniz! 🔔`, {
                            description: `${mentionMsg.sender?.name || 'Bir çalışma arkadaşınız'}: "${mentionMsg.text}"`,
                            action: {
                                label: "Sohbeti Aç",
                                onClick: () => {
                                    setIsOpen(true)
                                    setTimeout(() => {
                                        jumpToMessage(mentionMsg.id)
                                    }, 400)
                                }
                            },
                            duration: Infinity
                        })

                        if (!isOpenRef.current) {
                            setIsOpen(true)
                            setTimeout(() => {
                                jumpToMessage(mentionMsg.id)
                            }, 500)
                        }
                    }

                    if (newOtherMessages.length > 0 && latestMessages.length > 0) {
                        playNotificationSound()
                    }
                    
                    if (!isOpenRef.current && res.messages.length > latestMessages.length && latestMessages.length > 0) {
                        setHasUnread(true)
                    }
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setNewMessage(val)
        
        const caretPos = e.target.selectionStart || 0
        const textBeforeCaret = val.substring(0, caretPos)
        const lastSpaceIdx = textBeforeCaret.lastIndexOf(" ")
        const currentWord = lastSpaceIdx === -1 
            ? textBeforeCaret 
            : textBeforeCaret.substring(lastSpaceIdx + 1)

        if (currentWord.startsWith("@")) {
            setShowMentionList(true)
            setMentionSearch(currentWord.slice(1))
        } else {
            setShowMentionList(false)
        }
    }

    const selectMention = (userName: string) => {
        const caretPos = inputRef.current?.selectionStart || 0
        const textBeforeCaret = newMessage.substring(0, caretPos)
        const textAfterCaret = newMessage.substring(caretPos)
        
        const lastSpaceIdx = textBeforeCaret.lastIndexOf(" ")
        const prefix = lastSpaceIdx === -1 
            ? "" 
            : textBeforeCaret.substring(0, lastSpaceIdx + 1)
            
        const updatedPrefix = `${prefix}@${userName} `
        setNewMessage(updatedPrefix + textAfterCaret)
        setShowMentionList(false)
        
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus()
                const newCaretPos = updatedPrefix.length
                inputRef.current.setSelectionRange(newCaretPos, newCaretPos)
            }
        }, 50)
    }

    const insertEmoji = (emoji: string) => {
        const caretPos = inputRef.current?.selectionStart || 0
        const textBeforeCaret = newMessage.substring(0, caretPos)
        const textAfterCaret = newMessage.substring(caretPos)
        
        const updatedText = textBeforeCaret + emoji + textAfterCaret
        setNewMessage(updatedText)
        
        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus()
                const newCaretPos = caretPos + emoji.length
                inputRef.current.setSelectionRange(newCaretPos, newCaretPos)
            }
        }, 50)
    }

    const jumpToMessage = (msgId: string) => {
        const element = document.getElementById(`msg-${msgId}`)
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setHighlightedMessageId(msgId)
            setTimeout(() => {
                setHighlightedMessageId(null)
            }, 1500)
        }
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSending) return
        if (!newMessage.trim() && !attachment) return

        setIsSending(true)
        setShowEmojiPicker(false)
        const optimisticId = 'temp-' + Date.now()
        
        // Truncate and format the reply text to store in DB
        const replyText = replyToMessage 
            ? (replyToMessage.attachment && (replyToMessage.attachment.startsWith('data:application/pdf') || replyToMessage.attachment.endsWith('.pdf'))
                ? "📄 PDF Belgesi" 
                : replyToMessage.attachment 
                    ? "📷 Görsel" 
                    : replyToMessage.text)
            : null

        const optimisticMessage = {
            id: optimisticId,
            text: newMessage,
            attachment: attachment,
            replyToId: replyToMessage ? replyToMessage.id : null,
            replyToText: replyText,
            replyToName: replyToMessage ? (replyToMessage.sender?.name || 'Bilinmeyen') : null,
            senderId: currentUser.id,
            createdAt: new Date(),
            sender: currentUser,
            isOptimistic: true
        }
        
        sendingMessageIdsRef.current.add(optimisticId)
        setMessages(prev => [...prev, optimisticMessage])
        setNewMessage("")
        setAttachment(null)
        setReplyToMessage(null) // Reset reply preview bar
        setTimeout(() => scrollToBottom(true), 50)

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: optimisticMessage.text,
                    attachment: optimisticMessage.attachment || undefined,
                    replyToId: optimisticMessage.replyToId || undefined,
                    replyToText: optimisticMessage.replyToText || undefined,
                    replyToName: optimisticMessage.replyToName || undefined
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
                // Replace the optimistic message directly with the server-saved message,
                // but ensure we don't introduce duplicates if it was already added by a background poll.
                setMessages(prev => {
                    const alreadyHasServerMsg = prev.some(m => m.id === res.message.id)
                    if (alreadyHasServerMsg) {
                        return prev.filter(m => m.id !== optimisticId)
                    }
                    return prev.map(m => m.id === optimisticId ? res.message : m)
                })
            }
        } catch (error: any) {
            sendingMessageIdsRef.current.delete(optimisticId)
            setMessages(prev => prev.filter(m => m.id !== optimisticId))
            alert("Mesaj gönderilirken bir hata oluştu: " + (error.message || error))
        } finally {
            setIsSending(false)
        }
    }
    const handleDeleteMessage = async (messageId: string) => {
        if (!confirm("Bu mesajı silmek istediğinize emin misiniz?")) return

        const previousMessages = [...messages]
        setMessages(prev => prev.filter(m => m.id !== messageId))

        // Update local cache immediately
        const updatedCache = previousMessages.filter(m => m.id !== messageId)
        localStorage.setItem('team_chat_messages', JSON.stringify(updatedCache))

        // If it's a temporary local message (not written to DB yet or cached locally with a temp ID), skip the API call
        if (messageId.startsWith('temp-')) {
            return
        }

        try {
            const response = await fetch(`/api/chat?messageId=${messageId}`, {
                method: 'DELETE'
            })
            const res = await response.json()
            if (!res.success) {
                setMessages(previousMessages)
                localStorage.setItem('team_chat_messages', JSON.stringify(previousMessages))
                alert("Mesaj silinemedi: " + res.error)
            }
        } catch (error: any) {
            setMessages(previousMessages)
            localStorage.setItem('team_chat_messages', JSON.stringify(previousMessages))
            alert("Mesaj silinirken bir hata oluştu: " + (error.message || error))
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
                                    <div key={msg.id || i} id={`msg-${msg.id}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className={`flex items-center gap-2 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                    <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                                                </div>
                                                <div className={`px-3 py-2 rounded-2xl max-w-[240px] text-sm break-words transition-all duration-300 ${
                                                    highlightedMessageId === msg.id 
                                                        ? 'ring-4 ring-amber-400 dark:ring-amber-500 scale-[1.03] shadow-md z-10' 
                                                        : ''
                                                } ${
                                                    isMe 
                                                        ? 'bg-emerald-600 text-white rounded-br-none' 
                                                        : 'bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-bl-none text-slate-800 dark:text-slate-200'
                                                } ${msg.isOptimistic ? 'opacity-70' : ''}`}>
                                                    <div className={`text-[10px] font-bold mb-1 ${isMe ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                        {msg.sender?.name || 'Bilinmeyen'}
                                                    </div>

                                                    {/* Quoted Message Render */}
                                                    {msg.replyToText && (() => {
                                                        const quotedMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
                                                        const quotedName = quotedMsg ? (quotedMsg.sender?.name || 'Bilinmeyen') : msg.replyToName;
                                                        
                                                        // Determine text to show
                                                        let quotedText = msg.replyToText;
                                                        if (quotedMsg) {
                                                            if (quotedMsg.attachment && (quotedMsg.attachment.startsWith('data:application/pdf') || quotedMsg.attachment.endsWith('.pdf'))) {
                                                                quotedText = `📄 PDF Belgesi`;
                                                            } else if (quotedMsg.attachment) {
                                                                quotedText = quotedMsg.text ? `📷 ${quotedMsg.text}` : `📷 Görsel`;
                                                            } else {
                                                                quotedText = quotedMsg.text;
                                                            }
                                                        }

                                                        // Check if quoted message has an image attachment for thumbnail
                                                        const hasImageThumbnail = quotedMsg && quotedMsg.attachment && 
                                                                                   !quotedMsg.attachment.startsWith('data:application/pdf') &&
                                                                                   !quotedMsg.attachment.endsWith('.pdf');

                                                        return (
                                                            <div 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (msg.replyToId) jumpToMessage(msg.replyToId);
                                                                }}
                                                                className={`p-2 rounded-lg text-left text-[11px] leading-tight mb-1.5 border-l-4 flex justify-between gap-2 items-center cursor-pointer transition-all hover:opacity-90 ${
                                                                    isMe 
                                                                        ? 'bg-emerald-700/40 border-emerald-300 text-emerald-100' 
                                                                        : 'bg-slate-100 dark:bg-slate-900 border-emerald-500 text-slate-600 dark:text-slate-400'
                                                                } max-w-full`}
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className={`font-bold text-[9px] mb-0.5 ${isMe ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                                        {quotedName}
                                                                    </div>
                                                                    <div className="truncate opacity-90">
                                                                        {quotedText}
                                                                    </div>
                                                                </div>
                                                                {hasImageThumbnail && (
                                                                    <img 
                                                                        src={quotedMsg.attachment} 
                                                                        alt="Quote thumbnail" 
                                                                        className="w-7 h-7 object-cover rounded border border-slate-200 dark:border-slate-700 flex-shrink-0"
                                                                    />
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

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
                                                                {msg.attachment === "placeholder-loading" ? (
                                                                    <div className="w-48 h-32 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-2 animate-pulse flex flex-col items-center justify-center text-[10px] text-slate-450">
                                                                        <span className="animate-spin mb-1 text-slate-400">⌛</span>
                                                                        Görsel yükleniyor...
                                                                    </div>
                                                                ) : (
                                                                    <img 
                                                                        src={msg.attachment} 
                                                                        alt="Attachment" 
                                                                        className="max-w-full rounded-lg mb-2 max-h-48 min-h-[120px] min-w-[150px] object-cover cursor-pointer hover:opacity-90 transition-opacity bg-slate-100 dark:bg-slate-700/50" 
                                                                        onClick={() => setActiveLightboxImage(msg.attachment)} 
                                                                    />
                                                                )}
                                                                {renderMessageText(msg.text, isMe)}
                                                            </>
                                                        )
                                                    )}
                                                    {!msg.attachment && renderMessageText(msg.text, isMe)}
                                                </div>
                                                {/* Action Buttons on Hover */}
                                                {!msg.isOptimistic && (
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0">
                                                        <button 
                                                            onClick={() => {
                                                                setReplyToMessage(msg)
                                                                inputRef.current?.focus()
                                                            }}
                                                            className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                                                            title="Yanıtla"
                                                        >
                                                            <CornerUpLeft className="w-3.5 h-3.5" />
                                                        </button>
                                                        {isMe && (
                                                            <button 
                                                                onClick={() => handleDeleteMessage(msg.id)}
                                                                className="p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                                                                title="Sil"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
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
                        {replyToMessage && (
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-lg border-l-4 border-emerald-500 text-xs animate-in slide-in-from-top-2 duration-100">
                                <div className="text-left min-w-0">
                                    <div className="font-bold text-[9px] text-emerald-600 dark:text-emerald-400">
                                        {replyToMessage.sender?.name || 'Bilinmeyen'} kullanıcısına yanıt veriliyor
                                    </div>
                                    <div className="text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                                        {replyToMessage.attachment && (replyToMessage.attachment.startsWith('data:application/pdf') || replyToMessage.attachment.endsWith('.pdf')) 
                                            ? "📄 PDF Belgesi" 
                                            : replyToMessage.attachment 
                                                ? "📷 Görsel" 
                                                : replyToMessage.text}
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setReplyToMessage(null)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
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
                            {/* Emoji Picker Dropdown */}
                            {showEmojiPicker && (
                                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 z-50 absolute bottom-12 left-0 right-0 grid grid-cols-10 gap-1.5 animate-in slide-in-from-bottom-2 duration-150">
                                    {['😀', '😂', '😊', '😍', '👍', '👏', '❤️', '🔥', '🎉', '🙌', '🤔', '👀', '🚀', '⚠️', '✅', '❌', '📦', '📷', '📄', '💬'].map((emoji) => (
                                        <button
                                            key={emoji}
                                            type="button"
                                            onClick={() => insertEmoji(emoji)}
                                            className="text-xl hover:scale-120 active:scale-95 transition-transform p-1 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer flex items-center justify-center"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Mentions Autocomplete dropdown */}
                            {showMentionList && allUsers.length > 0 && (() => {
                                const filtered = allUsers.filter(u => 
                                    u.name.toLowerCase().includes(mentionSearch.toLowerCase())
                                )
                                if (filtered.length === 0) return null
                                return (
                                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-40 overflow-y-auto flex flex-col divide-y divide-slate-100 dark:divide-slate-700/50 z-50 absolute bottom-12 left-0 right-0 animate-in slide-in-from-bottom-2 duration-150">
                                        {filtered.map((u: any) => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                onClick={() => selectMention(u.name)}
                                                className="px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-750 flex items-center gap-2 text-slate-700 dark:text-slate-200 transition-colors"
                                            >
                                                <div className="w-5 h-5 rounded-full bg-slate-250 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-650 dark:text-slate-300">
                                                    {u.name.substring(0, 1)}
                                                </div>
                                                <span className="font-semibold">{u.name}</span>
                                                <span className="text-[9px] text-slate-400">({u.role === 'admin' ? 'Yönetici' : 'Personel'})</span>
                                            </button>
                                        ))}
                                    </div>
                                )
                            })()}
                            
                            <label className={`text-slate-400 hover:text-emerald-600 transition-colors p-2 ${isSending ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>
                                <input 
                                    type="file" 
                                    disabled={isSending}
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
                                            if (file.size > 200 * 1024 * 1024) {
                                                alert("Dosya boyutu 200MB'dan büyük olamaz.")
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
                                                        setAttachment(reader.result as string)
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

                            <button
                                type="button"
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                className={`text-slate-400 hover:text-emerald-600 transition-colors p-2 cursor-pointer ${isSending ? 'opacity-50 pointer-events-none' : ''}`}
                                title="Emoji Ekle"
                            >
                                <Smile className="w-5 h-5" />
                            </button>

                            <input
                                ref={inputRef}
                                type="text"
                                disabled={isSending}
                                value={newMessage}
                                onChange={handleInputChange}
                                    onPaste={(e) => {
                                        const items = e.clipboardData.items
                                        for (let i = 0; i < items.length; i++) {
                                            // Ignore TIFF format from clipboard (macOS clipboards copy TIFF alongside PNG/JPEG)
                                            if (items[i].type.indexOf('image') !== -1 && !items[i].type.includes('tiff')) {
                                                const file = items[i].getAsFile()
                                                if (file) {
                                                    if (file.size > 200 * 1024 * 1024) {
                                                        alert("Dosya boyutu 200MB'dan büyük olamaz.")
                                                        return
                                                    }
                                                    const reader = new FileReader()
                                                    reader.onload = async () => {
                                                        try {
                                                            const compressed = await compressImage(reader.result as string)
                                                            setAttachment(compressed)
                                                        } catch (err: any) {
                                                            setAttachment(reader.result as string)
                                                        }
                                                    }
                                                    reader.readAsDataURL(file)
                                                }
                                            } else if (items[i].type === 'application/pdf') {
                                                const file = items[i].getAsFile()
                                                if (file) {
                                                    if (file.size > 200 * 1024 * 1024) {
                                                        alert("Dosya boyutu 200MB'dan büyük olamaz.")
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
                                disabled={isSending || (!newMessage.trim() && !attachment)}
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
                    <div className="absolute top-4 right-4 flex gap-2">
                        <a 
                            href={activeLightboxImage} 
                            download="gorsel.png"
                            className="text-white hover:text-slate-200 bg-slate-900/50 p-2.5 rounded-full backdrop-blur-md transition-colors flex items-center justify-center cursor-pointer"
                            title="Görseli İndir"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Download className="w-5 h-5" />
                        </a>
                        <button 
                            className="text-white hover:text-slate-200 bg-slate-900/50 p-2 rounded-full backdrop-blur-md transition-colors cursor-pointer"
                            onClick={() => setActiveLightboxImage(null)}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <img 
                        src={activeLightboxImage} 
                        alt="Görsel Detayı" 
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            {activeMentionAlert && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[99999] p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="p-6 flex-1 flex flex-col gap-4 text-center">
                            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-955/40 rounded-full flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                                <span className="text-3xl animate-bounce">🔔</span>
                            </div>
                            
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Yeni Bir Mesajda Etiketlendiniz!
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    {activeMentionAlert.sender?.name || 'Bir çalışma arkadaşınız'} sohbette sizden bahsetti:
                                </p>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border-l-4 border-amber-500 text-left text-sm text-slate-700 dark:text-slate-350 italic max-h-32 overflow-y-auto break-words">
                                "{activeMentionAlert.text}"
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-950 p-4 border-t border-slate-100 dark:border-slate-850 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setActiveMentionAlert(null)}
                                className="flex-1 px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                            >
                                Kapat
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const msgId = activeMentionAlert.id
                                    setActiveMentionAlert(null)
                                    setIsOpen(true)
                                    setTimeout(() => {
                                        jumpToMessage(msgId)
                                    }, 400)
                                }}
                                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer"
                            >
                                Sohbeti Aç
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
