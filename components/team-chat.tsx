'use client'

import { useState, useEffect, useRef, useMemo } from "react"
import { MessageCircle, X, Send, User as UserIcon, Paperclip, Download, CornerUpLeft, Trash2, Smile, FolderOpen, ChevronLeft, ChevronRight, Image as ImageIcon, Link, FileText, Calendar, Pin, MessageSquare } from "lucide-react"
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
    const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null)

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
    const [attachments, setAttachments] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [hasUnread, setHasUnread] = useState(false)
    const [showMediaGallery, setShowMediaGallery] = useState(false)
    const [activeGalleryTab, setActiveGalleryTab] = useState<'media' | 'links' | 'docs'>('media')
    const [activePinIndex, setActivePinIndex] = useState(0)
    const [hasMoreOlder, setHasMoreOlder] = useState(true)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
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
            
            let url = `/api/chat?t=${Date.now()}`
            // Use incremental fetch on subsequent polls if we have a last message timestamp
            if (!isFirstFetchRef.current && lastMessage && lastMessage.createdAt) {
                const timestamp = new Date(lastMessage.createdAt).getTime()
                url = `/api/chat?since=${timestamp}&t=${Date.now()}`
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
                    
                    // 1. Update any existing messages that got updated (e.g. reactions added/removed)
                    const updatedMessages = latestMessages.map(m => {
                        const updated = res.messages.find((nm: any) => nm.id === m.id)
                        return updated ? updated : m
                    })

                    // 2. Filter out new messages that are not yet in our local list
                    const newUniqueMessages = res.messages.filter((newMsg: any) => 
                        !latestMessages.some(m => m.id === newMsg.id)
                    )
                    
                    // Identify new incoming messages from other users (for sound/unread notification)
                    const newOtherMessages = newUniqueMessages.filter((newMsg: any) => 
                        newMsg.senderId !== currentUser.id
                    )
                    
                    // Only update state if something actually changed (to prevent unnecessary re-renders)
                    const hasNewOrUpdates = newUniqueMessages.length > 0 || res.messages.some((nm: any) => 
                        latestMessages.some(m => m.id === nm.id && m.reactions !== nm.reactions)
                    )

                    if (hasNewOrUpdates) {
                        setMessages([...updatedMessages, ...newUniqueMessages])
                    }
                    
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
                    setHasMoreOlder(res.messages.length >= 150)
                    
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

    const loadOlderMessages = async () => {
        if (isLoadingOlder || !hasMoreOlder || messages.length === 0) return
        setIsLoadingOlder(true)

        const container = scrollContainerRef.current
        const previousScrollHeight = container ? container.scrollHeight : 0
        const previousScrollTop = container ? container.scrollTop : 0

        try {
            const oldestMessage = messages[0]
            if (!oldestMessage || !oldestMessage.createdAt) return

            const timestamp = new Date(oldestMessage.createdAt).getTime()
            const response = await fetch(`/api/chat?before=${timestamp}&t=${Date.now()}`)
            const res = await response.json()

            if (res.success && res.messages) {
                if (res.messages.length === 0) {
                    setHasMoreOlder(false)
                } else {
                    setMessages(prev => [...res.messages, ...prev])
                    
                    if (res.messages.length < 100) {
                        setHasMoreOlder(false)
                    }

                    // Restore scroll position to prevent jump
                    setTimeout(() => {
                        if (container) {
                            const newScrollHeight = container.scrollHeight
                            container.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight)
                        }
                    }, 50)
                }
            }
        } catch (error) {
            console.error("Error loading older messages:", error)
        } finally {
            setIsLoadingOlder(false)
        }
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

    const handleReact = async (messageId: string, emoji: string) => {
        setActiveReactionPickerId(null)

        // Optimistic update of local messages reactions list
        setMessages(prev => prev.map(m => {
            if (m.id !== messageId) return m

            let currentReactions = []
            try {
                currentReactions = m.reactions ? JSON.parse(m.reactions) : []
            } catch (e) {}

            const existingIndex = currentReactions.findIndex((r: any) => r.userId === currentUser.id)
            if (existingIndex > -1) {
                const existing = currentReactions[existingIndex]
                if (existing.emoji === emoji) {
                    currentReactions.splice(existingIndex, 1)
                } else {
                    currentReactions[existingIndex].emoji = emoji
                }
            } else {
                currentReactions.push({
                    emoji,
                    userId: currentUser.id,
                    userName: currentUser.name
                })
            }

            return {
                ...m,
                reactions: JSON.stringify(currentReactions)
            }
        }))

        try {
            const response = await fetch('/api/chat', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messageId,
                    emoji
                })
            })
            const res = await response.json()
            if (!res.success) {
                console.error("Failed to save reaction:", res.error)
            }
        } catch (err) {
            console.error("Error reacting to message:", err)
        }
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
        if (!newMessage.trim() && attachments.length === 0) return

        setIsSending(true)
        setShowEmojiPicker(false)

        const textToSend = newMessage
        const attachmentsToSend = [...attachments]
        const replyToSend = replyToMessage

        setNewMessage("")
        setAttachments([])
        setReplyToMessage(null)

        try {
            if (attachmentsToSend.length === 0) {
                await sendMessageItem(textToSend, null, replyToSend)
            } else {
                for (let i = 0; i < attachmentsToSend.length; i++) {
                    const text = i === 0 ? textToSend : ""
                    const reply = i === 0 ? replyToSend : null
                    await sendMessageItem(text, attachmentsToSend[i], reply)
                }
            }
        } finally {
            setIsSending(false)
        }
    }

    const sendMessageItem = async (text: string, att: string | null, reply: any) => {
        const optimisticId = 'temp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
        
        const replyText = reply 
            ? (reply.attachment && (reply.attachment.startsWith('data:application/pdf') || reply.attachment.endsWith('.pdf'))
                ? "📄 PDF Belgesi" 
                : reply.attachment 
                    ? "📷 Görsel" 
                    : reply.text)
            : null

        const optimisticMessage = {
            id: optimisticId,
            text: text,
            attachment: att,
            replyToId: reply ? reply.id : null,
            replyToText: replyText,
            replyToName: reply ? (reply.sender?.name || 'Bilinmeyen') : null,
            senderId: currentUser.id,
            createdAt: new Date(),
            sender: currentUser,
            isOptimistic: true
        }
        
        sendingMessageIdsRef.current.add(optimisticId)
        setMessages(prev => [...prev, optimisticMessage])
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
                setMessages(prev => prev.filter(m => m.id !== optimisticId))
                alert("Mesaj gönderilemedi: " + res.error)
            } else {
                sendingMessageIdsRef.current.delete(optimisticId)
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
        }
    }

    const handleTogglePin = async (messageId: string) => {
        // Optimistic update
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: !m.isPinned } : m))

        try {
            const response = await fetch('/api/chat', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId, action: 'pin' })
            })
            const res = await response.json()
            if (res.success && res.message) {
                setMessages(prev => prev.map(m => m.id === messageId ? res.message : m))
            }
        } catch (error: any) {
            console.error("Failed to toggle pin:", error)
        }
    }
    // Media, Links and Docs Extraction
    const galleryItems = useMemo(() => {
        const media: any[] = []
        const links: any[] = []
        const docs: any[] = []

        const urlRegex = /(https?:\/\/[^\s]+)/g

        messages.forEach(msg => {
            if (msg.attachment) {
                const isPdf = msg.attachment.startsWith('data:application/pdf') || 
                              (msg.text && msg.text.toLowerCase().endsWith('.pdf')) || 
                              msg.attachment.includes('ext=.pdf')
                if (isPdf) {
                    docs.push({
                        id: msg.id,
                        name: msg.text || 'Belge.pdf',
                        url: msg.attachment,
                        createdAt: msg.createdAt,
                        senderName: msg.sender?.name || 'Bilinmeyen'
                    })
                } else {
                    media.push({
                        id: msg.id,
                        url: msg.attachment,
                        createdAt: msg.createdAt,
                        senderName: msg.sender?.name || 'Bilinmeyen'
                    })
                }
            }

            if (msg.text) {
                const foundUrls = msg.text.match(urlRegex)
                if (foundUrls) {
                    foundUrls.forEach(url => {
                        links.push({
                            id: msg.id,
                            url: url,
                            text: msg.text,
                            createdAt: msg.createdAt,
                            senderName: msg.sender?.name || 'Bilinmeyen'
                        })
                    })
                }
            }
        })

        return {
            media: [...media].reverse(),
            links: [...links].reverse(),
            docs: [...docs].reverse()
        }
    }, [messages])

    const pinnedMessages = useMemo(() => {
        return messages.filter(m => m.isPinned)
    }, [messages])

    const currentPinnedMessage = useMemo(() => {
        if (pinnedMessages.length === 0) return null
        const safeIndex = activePinIndex % pinnedMessages.length
        return pinnedMessages[safeIndex] || pinnedMessages[0]
    }, [pinnedMessages, activePinIndex])

    const handleNextPin = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        if (pinnedMessages.length <= 1) return
        const nextIndex = (activePinIndex + 1) % pinnedMessages.length
        setActivePinIndex(nextIndex)
        const nextMsg = pinnedMessages[nextIndex]
        if (nextMsg) {
            scrollToMessage(nextMsg.id)
        }
    }

    const handlePrevPin = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation()
        if (pinnedMessages.length <= 1) return
        const prevIndex = (activePinIndex - 1 + pinnedMessages.length) % pinnedMessages.length
        setActivePinIndex(prevIndex)
        const prevMsg = pinnedMessages[prevIndex]
        if (prevMsg) {
            scrollToMessage(prevMsg.id)
        }
    }

    const scrollToMessage = (messageId: string) => {
        const el = document.getElementById(`msg-${messageId}`)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setHighlightedMessageId(messageId)
            setTimeout(() => setHighlightedMessageId(null), 3000)
        }
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="bg-white dark:bg-slate-900 w-[92vw] sm:w-[480px] h-[760px] max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden mb-4 animate-in slide-in-from-bottom-5">
                    {/* Header */}
                    <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {showMediaGallery ? (
                                <button 
                                    onClick={() => setShowMediaGallery(false)} 
                                    className="hover:bg-slate-800 p-1 rounded-full transition-colors mr-1 cursor-pointer flex items-center justify-center"
                                    title="Sohbete Geri Dön"
                                >
                                    <ChevronLeft className="w-5 h-5 text-emerald-400" />
                                </button>
                            ) : (
                                <MessageCircle className="w-5 h-5 text-emerald-400" />
                            )}
                            <h3 className="font-bold">
                                {showMediaGallery ? 'Medya, Bağlantı ve Belgeler' : 'Takım Sohbeti'}
                            </h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {!showMediaGallery && (
                                <button 
                                    onClick={() => {
                                        setShowMediaGallery(true)
                                        setActiveReactionPickerId(null)
                                    }} 
                                    className="hover:bg-slate-800 p-1.5 rounded-full transition-colors cursor-pointer flex items-center justify-center"
                                    title="Medya, Bağlantılar ve Belgeler"
                                >
                                    <FolderOpen className="w-5 h-5 text-slate-300 hover:text-emerald-400" />
                                </button>
                            )}
                            <button onClick={() => setIsOpen(false)} className="hover:bg-slate-800 p-1 rounded-full transition-colors cursor-pointer flex items-center justify-center">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {!showMediaGallery && pinnedMessages.length > 0 && currentPinnedMessage && (
                        <div 
                            onClick={() => {
                                scrollToMessage(currentPinnedMessage.id)
                                if (pinnedMessages.length > 1) {
                                    setActivePinIndex(prev => (prev + 1) % pinnedMessages.length)
                                }
                            }}
                            className="bg-amber-50 dark:bg-slate-800/90 border-b border-amber-200/80 dark:border-slate-700/60 px-3 py-2 flex items-center justify-between text-xs cursor-pointer group hover:bg-amber-100/70 dark:hover:bg-slate-750 transition-colors z-20 shadow-sm"
                        >
                            <div className="flex items-center gap-2 min-w-0 text-left">
                                <Pin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 fill-amber-500/30 rotate-45" />
                                <span className="font-bold text-amber-700 dark:text-amber-300 flex-shrink-0">
                                    Sabitlenen {pinnedMessages.length > 1 ? `(${activePinIndex + 1}/${pinnedMessages.length})` : ''}:
                                </span>
                                <span className="text-slate-700 dark:text-slate-200 truncate font-medium">
                                    {currentPinnedMessage.attachment 
                                        ? (currentPinnedMessage.attachment.includes('.pdf') ? "📄 PDF Belgesi" : "📷 Görsel") 
                                        : currentPinnedMessage.text}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                {pinnedMessages.length > 1 && (
                                    <div className="flex items-center gap-0.5 mr-1 bg-amber-100/80 dark:bg-slate-700/80 rounded-md p-0.5 text-amber-800 dark:text-amber-200">
                                        <button 
                                            type="button"
                                            onClick={handlePrevPin} 
                                            className="p-0.5 hover:bg-amber-200/80 dark:hover:bg-slate-600 rounded transition-colors"
                                            title="Önceki Sabitlenen"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5" />
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={handleNextPin} 
                                            className="p-0.5 hover:bg-amber-200/80 dark:hover:bg-slate-600 rounded transition-colors"
                                            title="Sonraki Sabitlenen"
                                        >
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                                <button 
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleTogglePin(currentPinnedMessage.id)
                                    }}
                                    className="text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-amber-200/50 dark:hover:bg-slate-700 transition-colors"
                                    title="Sabitlemeyi Kaldır"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}

                    {showMediaGallery ? (
                        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950/50">
                            {/* Tab Selectors */}
                            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                <button 
                                    onClick={() => setActiveGalleryTab('media')}
                                    className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeGalleryTab === 'media' 
                                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    <ImageIcon className="w-3.5 h-3.5" /> Medya ({galleryItems.media.length})
                                </button>
                                <button 
                                    onClick={() => setActiveGalleryTab('links')}
                                    className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeGalleryTab === 'links' 
                                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    <Link className="w-3.5 h-3.5" /> Bağlantılar ({galleryItems.links.length})
                                </button>
                                <button 
                                    onClick={() => setActiveGalleryTab('docs')}
                                    className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
                                        activeGalleryTab === 'docs' 
                                            ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    <FileText className="w-3.5 h-3.5" /> Belgeler ({galleryItems.docs.length})
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {activeGalleryTab === 'media' && (
                                    galleryItems.media.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-450 dark:text-slate-500 text-sm py-12">
                                            <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                                            <span>Henüz yüklü görsel yok.</span>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-2.5">
                                            {galleryItems.media.map(item => (
                                                <div 
                                                    key={item.id}
                                                    onClick={() => setActiveLightboxImage(item.url)}
                                                    className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800/80 bg-slate-200 dark:bg-slate-850 cursor-pointer group hover:scale-[1.03] transition-all duration-200 shadow-sm hover:shadow"
                                                >
                                                    <img 
                                                        src={item.url} 
                                                        alt="Galeri Görseli" 
                                                        className="w-full h-full object-cover group-hover:brightness-75 transition-all"
                                                    />
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setShowMediaGallery(false)
                                                            setTimeout(() => {
                                                                scrollToMessage(item.id)
                                                            }, 100)
                                                        }}
                                                        className="absolute top-1.5 right-1.5 p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-md cursor-pointer flex items-center justify-center z-10"
                                                        title="Sohbetteki Mesaja Git"
                                                    >
                                                        <MessageSquare className="w-3.5 h-3.5" />
                                                    </button>
                                                    <div className="absolute inset-x-0 bottom-0 bg-black/45 p-1 text-[8px] text-white text-center font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {item.senderName}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                )}

                                {activeGalleryTab === 'links' && (
                                    galleryItems.links.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-450 dark:text-slate-500 text-sm py-12">
                                            <Link className="w-8 h-8 mb-2 opacity-50" />
                                            <span>Henüz paylaşılan bağlantı yok.</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {galleryItems.links.map((item, idx) => (
                                                <div key={`${item.id}-${idx}`} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-3 rounded-xl flex gap-3 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center flex-shrink-0 text-emerald-600 dark:text-emerald-400">
                                                        <Link className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <a 
                                                            href={item.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline break-all block text-left"
                                                        >
                                                            {item.url}
                                                        </a>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 italic text-left">
                                                            "{item.text}"
                                                        </p>
                                                        <div className="flex justify-between items-center mt-2 text-[9px] text-slate-400">
                                                            <span className="font-semibold">{item.senderName}</span>
                                                            <div className="flex items-center gap-2">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setShowMediaGallery(false)
                                                                        setTimeout(() => {
                                                                            scrollToMessage(item.id)
                                                                        }, 100)
                                                                    }}
                                                                    className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                                                                >
                                                                    Mesaja Git
                                                                </button>
                                                                <span>•</span>
                                                                <div className="flex items-center gap-1">
                                                                    <Calendar className="w-3 h-3" />
                                                                    {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                )}

                                {activeGalleryTab === 'docs' && (
                                    galleryItems.docs.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-450 dark:text-slate-500 text-sm py-12">
                                            <FileText className="w-8 h-8 mb-2 opacity-50" />
                                            <span>Henüz paylaşılan belge yok.</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {galleryItems.docs.map(item => (
                                                <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 p-3 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
                                                            <FileText className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0 flex-1 text-left">
                                                            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={item.name}>
                                                                {item.name}
                                                            </h4>
                                                            <div className="flex gap-2 items-center mt-1 text-[9px] text-slate-400">
                                                                <span className="font-semibold">{item.senderName}</span>
                                                                <span>•</span>
                                                                <span>{new Date(item.createdAt).toLocaleDateString('tr-TR')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <button 
                                                            type="button"
                                                            onClick={() => {
                                                                setShowMediaGallery(false)
                                                                setTimeout(() => {
                                                                    scrollToMessage(item.id)
                                                                }, 100)
                                                            }}
                                                            className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                                                            title="Sohbetteki Mesaja Git"
                                                        >
                                                            <MessageSquare className="w-4 h-4" />
                                                        </button>
                                                        <a 
                                                            href={item.url} 
                                                            download={item.name} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                                                            title="İndir"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Messages */}
                    <div 
                        ref={scrollContainerRef} 
                        onClick={() => setActiveReactionPickerId(null)}
                        className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50"
                    >
                        {isLoading && messages.length === 0 ? (
                            <div className="flex justify-center items-center h-full">
                                <span className="animate-pulse text-slate-400">Yükleniyor...</span>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex justify-center items-center h-full text-slate-400 text-sm text-center">
                                Henüz mesaj yok.<br/>İlk mesajı siz gönderin!
                            </div>
                        ) : (
                            <>
                                {hasMoreOlder && (
                                    <div className="flex justify-center py-2">
                                        <button
                                            type="button"
                                            onClick={loadOlderMessages}
                                            disabled={isLoadingOlder}
                                            className="px-4 py-1.5 bg-slate-150 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-650 dark:text-slate-350 rounded-full text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm border border-slate-200 dark:border-slate-800"
                                        >
                                            {isLoadingOlder ? (
                                                <span className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
                                            ) : null}
                                            Daha Eski Mesajları Yükle
                                        </button>
                                    </div>
                                )}
                                {messages.map((msg, i) => {
                                const isMe = msg.senderId === currentUser.id
                                return (
                                    <div key={msg.id || i} id={`msg-${msg.id}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        <div className={`flex items-center gap-2 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                                    <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                                                </div>
                                                <div className={`relative px-3 py-2 rounded-2xl max-w-[340px] text-sm break-words transition-all duration-300 ${
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

                                                    {/* Reactions Picker Dropdown */}
                                                    {activeReactionPickerId === msg.id && (
                                                        <div className={`absolute z-30 -top-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-lg px-2 py-1 flex items-center gap-1 animate-in zoom-in-95 duration-100 ${isMe ? 'right-0' : 'left-0'}`}>
                                                            {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                                                                <button
                                                                    key={emoji}
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleReact(msg.id, emoji)
                                                                    }}
                                                                    className="text-base hover:scale-130 active:scale-95 transition-transform p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full cursor-pointer w-6.5 h-6.5 flex items-center justify-center"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Render Reactions Pill */}
                                                    {msg.reactions && (() => {
                                                        let parsedReactions: any[] = []
                                                        try {
                                                            parsedReactions = JSON.parse(msg.reactions)
                                                        } catch (e) {}
                                                        if (parsedReactions.length === 0) return null

                                                        const emojiCounts = parsedReactions.reduce((acc: any, cur: any) => {
                                                            acc[cur.emoji] = (acc[cur.emoji] || 0) + 1
                                                            return acc
                                                        }, {})

                                                        const userReaction = parsedReactions.find((r: any) => r.userId === currentUser.id)

                                                        return (
                                                            <div className={`absolute -bottom-3 flex gap-1 items-center z-20 ${isMe ? 'right-2' : 'left-2'}`}>
                                                                <div 
                                                                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full py-0.5 px-1.5 shadow-sm flex items-center gap-1 text-[9px] font-semibold text-slate-650 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors select-none"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        if (userReaction) {
                                                                            handleReact(msg.id, userReaction.emoji)
                                                                        } else {
                                                                            handleReact(msg.id, '👍')
                                                                        }
                                                                    }}
                                                                    title={parsedReactions.map((r: any) => `${r.userName}: ${r.emoji}`).join('\n')}
                                                                >
                                                                    <span className="flex items-center gap-0.5">
                                                                        {Object.keys(emojiCounts).map(emoji => (
                                                                            <span key={emoji}>{emoji}</span>
                                                                        ))}
                                                                    </span>
                                                                    {parsedReactions.length > 1 && (
                                                                        <span className="text-[7.5px] text-slate-400 dark:text-slate-500 font-bold ml-0.5">
                                                                            {parsedReactions.length}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}
                                                </div>
                                                {/* Action Buttons on Hover */}
                                                {!msg.isOptimistic && (
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setActiveReactionPickerId(activeReactionPickerId === msg.id ? null : msg.id)
                                                            }}
                                                            className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 cursor-pointer"
                                                            title="Tepki Ver"
                                                        >
                                                            <Smile className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setReplyToMessage(msg)
                                                                inputRef.current?.focus()
                                                            }}
                                                            className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 cursor-pointer"
                                                            title="Yanıtla"
                                                        >
                                                            <CornerUpLeft className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleTogglePin(msg.id)} 
                                                            className={`p-1 rounded-full transition-colors cursor-pointer ${msg.isPinned ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30' : 'text-slate-400 hover:text-slate-650 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-850'}`}
                                                            title={msg.isPinned ? "Sabitlemeyi Kaldır" : "Mesajı Sabitle"}
                                                        >
                                                            <Pin className={`w-3.5 h-3.5 ${msg.isPinned ? 'fill-amber-500 rotate-45' : ''}`} />
                                                        </button>
                                                        {isMe && (
                                                            <button 
                                                                onClick={() => handleDeleteMessage(msg.id)}
                                                                className="p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-400 hover:text-red-650 dark:hover:text-red-400 cursor-pointer"
                                                                title="Sil"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 mx-8">
                                            <span className="text-[9px] text-slate-400">
                                                {new Date(msg.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {msg.isPinned && (
                                                <span className="text-[9px] font-bold text-amber-500 flex items-center gap-0.5 ml-1" title="Sabitlenmiş Mesaj">
                                                    <Pin className="w-2.5 h-2.5 fill-amber-500 rotate-45" /> Sabitlendi
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            </>
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
                                    <div className="text-slate-500 dark:text-slate-400 truncate max-w-[340px]">
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
                        {attachments.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-1 max-w-full items-center">
                                {attachments.map((att, idx) => (
                                    <div key={idx} className="relative inline-block flex-shrink-0 group">
                                        {att.startsWith('data:application/pdf') ? (
                                            <div className="h-16 px-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400 font-bold">
                                                📄 PDF Belgesi
                                            </div>
                                        ) : (
                                            <img src={att} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" />
                                        )}
                                        <button 
                                            type="button"
                                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} 
                                            className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors shadow cursor-pointer flex items-center justify-center"
                                            title="Kaldır"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {attachments.length > 1 && (
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap px-1">
                                        ({attachments.length} dosya)
                                    </span>
                                )}
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
                                    multiple
                                    disabled={isSending}
                                    accept="image/*,.pdf,application/pdf" 
                                    className="hidden" 
                                    onChange={async (e) => {
                                        const files = Array.from(e.target.files || [])
                                        if (files.length === 0) return
                                        for (const file of files) {
                                            if (file.type.includes('tiff') || file.name.endsWith('.tiff') || file.name.endsWith('.tif')) {
                                                alert("TIFF formatındaki görseller tarayıcılar tarafından doğrudan gösterilemez. Lütfen PNG/JPG formatında yükleyin.")
                                                continue
                                            }
                                            if (file.size > 200 * 1024 * 1024) {
                                                alert(`"${file.name}" dosya boyutu 200MB'dan büyük olamaz.`)
                                                continue
                                            }
                                            const reader = new FileReader()
                                            reader.onload = async () => {
                                                const rawResult = reader.result as string
                                                if (file.type === 'application/pdf') {
                                                    setAttachments(prev => [...prev, rawResult])
                                                    if (!newMessage.trim()) setNewMessage(file.name)
                                                } else {
                                                    try {
                                                        const compressed = await compressImage(rawResult)
                                                        setAttachments(prev => [...prev, compressed])
                                                    } catch (err: any) {
                                                        setAttachments(prev => [...prev, rawResult])
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
                                                            setAttachments(prev => [...prev, compressed])
                                                        } catch (err: any) {
                                                            setAttachments(prev => [...prev, reader.result as string])
                                                        }
                                                    }
                                                    reader.readAsDataURL(file)
                                                }
                                            } else if (items[i].type === 'application/pdf') {
                                                const file = items[i].getAsFile()
                                                if (file) {
                                                    const reader = new FileReader()
                                                    reader.onload = () => {
                                                        setAttachments(prev => [...prev, reader.result as string])
                                                        if (!newMessage.trim()) {
                                                            setNewMessage(file.name)
                                                        }
                                                    }
                                                    reader.readAsDataURL(file)
                                                }
                                            }
                                        }
                                    }}
                                placeholder="Mesaj yazın... (Birden fazla görsel yapıştırabilirsiniz)"
                                className="flex-1 bg-slate-100 dark:bg-slate-800 border-0 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                            <button 
                                type="submit" 
                                disabled={isSending || (!newMessage.trim() && attachments.length === 0)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </form>
                    </div>
                </>
            )}
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
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                const relatedMsg = messages.find(m => m.attachment === activeLightboxImage)
                                if (relatedMsg) {
                                    setActiveLightboxImage(null)
                                    setShowMediaGallery(false)
                                    setTimeout(() => {
                                        scrollToMessage(relatedMsg.id)
                                    }, 100)
                                }
                            }}
                            className="text-white hover:text-slate-200 bg-slate-900/50 px-3.5 py-2.5 rounded-full backdrop-blur-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs font-semibold"
                            title="Sohbetteki Mesaja Git"
                        >
                            <MessageSquare className="w-4 h-4 text-emerald-400" />
                            <span>Mesaja Git</span>
                        </button>
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
