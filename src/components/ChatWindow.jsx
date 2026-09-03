import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import { classifyIntent } from '../services/gemini'
import { loadConversation, saveConversation, clearConversation } from '../lib/conversation'
import { buildReply } from '../lib/reply'
import { USER_INPUT_MAX_LENGTH } from '../lib/limits'
import EmptyState from './EmptyState'

let idCounter = 0
const nextId = () => (idCounter += 1)

const REQUEST_TIMEOUT_MS = 20_000

const MORE_PHRASES = ['more', 'another', 'more suggestions', 'give me more', 'show more', 'anything else']
function isObviouslyMore(text) {
    const normalized = text.toLowerCase().trim()
    return MORE_PHRASES.includes(normalized)
}

const NO_CLARIFY_PATTERN =
    /\b(surprise me|(don'?t|do not) ask( me)?( any| more)? questions?|(don'?t|do not) ask\b|no questions?|just (pick|recommend|choose)|stop asking)\b/i

function normalizeApostrophes(text) {
    return text.replace(/[‘’ʼ´`]/g, "'")
}

function initConversation() {
    const restored = loadConversation()
    if (restored && restored.messages.length > 0) {
        idCounter = Math.max(idCounter, ...restored.messages.map((m) => m.id))
    }
    return restored ?? { messages: [], history: [], lastContext: null }
}

export default function ChatWindow() {
    const [initial] = useState(initConversation)
    const [messages, setMessages] = useState(initial.messages)
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [lastContext, setLastContext] = useState(initial.lastContext)
    const [history, setHistory] = useState(initial.history)

    const messagesEndRef = useRef(null)

    const requestIdRef = useRef(0)

    const abortControllerRef = useRef(null)

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    }, [messages])

    useEffect(() => {
        function handleNewChat() {
            if (messages.length > 0 && !window.confirm('Start a new conversation? This will clear your current chat.')) {
                return
            }
            requestIdRef.current += 1
            abortControllerRef.current?.abort()
            clearConversation()
            setMessages([])
            setHistory([])
            setLastContext(null)
            setIsLoading(false)
            setInput('')
        }
        window.addEventListener('kino:new-chat', handleNewChat)
        return () => window.removeEventListener('kino:new-chat', handleNewChat)
    }, [messages.length])

async function handleSend(e) {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed) return
        if (isLoading) return

        const requestId = requestIdRef.current
        const userMessage = { id: nextId(), sender: 'user', text: trimmed }
        const messagesWithUser = [...messages, userMessage]
        const historyWithUser = [...history, { role: 'user', text: trimmed }]
        setMessages(messagesWithUser)
        setInput('')
        setIsLoading(true)
        setHistory(historyWithUser)

        const controller = new AbortController()
        abortControllerRef.current = controller
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

        try {
            const canFastPathMore = isObviouslyMore(trimmed) && ['trending', 'top_rated'].includes(lastContext?.type)
            const allowClarify = !NO_CLARIFY_PATTERN.test(normalizeApostrophes(trimmed)) && lastContext?.type !== 'clarify'
            const intent = canFastPathMore
                ? { type: 'more' }
                : await classifyIntent(trimmed, history, { allowClarify, signal: controller.signal })
            const { message, context } = await buildReply(intent, trimmed, lastContext, controller.signal)

            if (requestIdRef.current !== requestId) return

            const movieSummaries = message.movies
                ?.map((m) => (m.reason ? `${m.title} (${m.reason})` : m.title))
                .join('; ')
            const finalMessages = [...messagesWithUser, { id: nextId(), ...message }]
            const finalHistory = [
                ...historyWithUser,
                { role: 'bot', text: movieSummaries ? `${message.text} ${movieSummaries}` : message.text },
            ]

            setMessages(finalMessages)
            setLastContext(context)
            setHistory(finalHistory)
            saveConversation({
                messages: finalMessages.filter((m) => !m.error),
                history: finalHistory,
                lastContext: context,
            })
        } catch (err) {
            if (requestIdRef.current !== requestId) return
            setMessages((prev) => [
                ...prev,
                { id: nextId(), sender: 'bot', text: friendlyErrorMessage(err), error: true },
            ])
        } finally {
            clearTimeout(timeoutId)
            if (abortControllerRef.current === controller) abortControllerRef.current = null
            if (requestIdRef.current === requestId) setIsLoading(false)
        }
    }
    return (
        <div className="chat-window">
            <div className={`chat-window__messages ${messages.length > 0 ? 'chat-window__messages--active' : ''}`}>
                {messages.length === 0 && <EmptyState />}
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                ))}
                {isLoading && (
                    <div className="message message--bot" role="status" aria-live="polite">
                        <p className="loading-indicator">
                            Kino is thinking
                            <span className="loading-indicator__dots" aria-hidden="true">
                                <span></span><span></span><span></span>
                            </span>
                        </p>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form className="chat-window__input" onSubmit={handleSend} aria-busy={isLoading}>
                <label htmlFor="kino-chat-input" className="sr-only">Message Kino</label>
                <input
                    id="kino-chat-input"
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Kino"
                    maxLength={USER_INPUT_MAX_LENGTH}
                    disabled={isLoading}
                />
                <button type="submit" disabled={isLoading}>Send</button>
            </form>
        </div>
    )
}

function friendlyErrorMessage(err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return "That took a bit too long — please try again."
    }

    const msg = err.message || ''

    if (msg.includes('429')) {
        return "I'm getting a lot of requests right now. Please try again in a few seconds."
    }
    if (msg.includes('Gemini')) {
        return "I'm having trouble classifying your request. Please try again in a moment."
    }

    if (msg.includes('TMDB')) {
        return "I'm having trouble fetching movie data. Please try again in a moment."
    }
    return "Something went wrong. Please try again in a moment."
}
