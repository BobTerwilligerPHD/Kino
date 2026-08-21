import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import { searchMovie, getTrending, getTopRated } from '../services/tmdb'
import { classifyIntent } from '../services/gemini'
import EmptyState from './EmptyState'
import SkeletonCard from './SkeletonCard'

let idCounter = 0
const nextId = () => (idCounter += 1)

const MORE_PHRASES = ['more', 'another', 'more suggestions', 'give me more', 'show more', 'anything else']
function isObviouslyMore(text) {
    const normalized = text.toLowerCase().trim()
    return MORE_PHRASES.includes(normalized)
}

export default function ChatWindow() {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [lastContext, setLastContext] = useState(null)
    const [history, setHistory] = useState([])

    const messagesEndRef = useRef(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

async function handleSend(e) {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed) return

        const userMessage = { id: nextId(), sender: 'user', text: trimmed }
        setMessages((prev) => [...prev, userMessage])
        setInput('')
        setIsLoading(true)

        try {
            const canFastPathMore = isObviouslyMore(trimmed) && ['trending', 'top_rated'].includes(lastContext?.type)
            const intent = canFastPathMore ? { type: 'more' } : await classifyIntent(trimmed, history)
            const { message, context } = await buildReply(intent, trimmed, lastContext)
            setMessages((prev) => [...prev, { id: nextId(), ...message }])
            setLastContext(context)

            const movieTitles = message.movies?.map((m) => m.title).join(', ')
            setHistory((prev) => [
                ...prev,
                { role: 'user', text: trimmed },
                { role: 'bot', text: movieTitles ? `${message.text} ${movieTitles}` : message.text },
            ])
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                { id: nextId(), sender: 'bot', text: friendlyErrorMessage(err) },
            ])
        } finally {
            setIsLoading(false)
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
                    <div className="message message--bot">
                        <div className="skeleton-text" />
                        <div className="movie-grid">
                            <SkeletonCard delay={0} />
                            <SkeletonCard delay={0.15} />
                            <SkeletonCard delay={0.3} />
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <form className="chat-window__input" onSubmit={handleSend}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Kino"
                />
                <button type="submit">Send</button>
            </form>
        </div>
    )
}

function friendlyErrorMessage(err) {
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

async function buildReply(intent, trimmed, lastContext) {
    if (intent.type === 'more' && lastContext?.type === 'recommend') {
        return {
            message: { sender: 'bot', text: "I didn't catch new titles for that — try telling me what kind of thing you're after." },
            context: lastContext,
        }
    }

    if (intent.type === 'more' && lastContext) {
        return buildMoreReply(lastContext)
    }

    if (intent.type === 'more') {
        return {
            message: { sender: 'bot', text: "More of what? Tell me what you're in the mood for and I'll take it from there." },
            context: null,
        }
    }

    switch (intent.type) {
        case 'trending': {
            const movies = await getTrending(1)
            const shown = movies.slice(0, 6)
            return {
                message: { sender: 'bot', text: intent.replyText || "Here's what's trending this week:", movies: shown },
                context: { type: 'trending', page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'top_rated': {
            const movies = await getTopRated(1)
            const shown = movies.slice(0, 6)
            return {
                message: { sender: 'bot', text: intent.replyText || 'Some of the highest rated movies on TMDB:', movies: shown },
                context: { type: 'top_rated', page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'recommend': {
            const titles = intent.titles ?? []
            const resolved = await Promise.all(titles.map((t) => searchMovie(t.title, t.year)))

            const shown = []
            const seenIds = new Set()
            for (const matches of resolved) {
                const best = matches[0]
                if (best && !seenIds.has(best.id)) {
                    seenIds.add(best.id)
                    shown.push(best)
                }
            }

            if (shown.length === 0) {
                return {
                    message: { sender: 'bot', text: intent.replyText || "I had some titles in mind but couldn't find them on TMDB." },
                    context: null,
                }
            }

            return {
                message: { sender: 'bot', text: intent.replyText || "Here's what I'd suggest:", movies: shown.slice(0, 6) },
                context: { type: 'recommend', shownIds: shown.map((m) => m.id) },
            }
        }

        case 'title_search':
        default: {
            const results = await searchMovie(intent.title || trimmed)
            const shown = results.slice(0, 1)
            return {
                message: {
                    sender: 'bot',
                    text: shown.length ? (intent.replyText || `Here's ${shown[0].title}:`) : `Sorry, I couldn't find anything for "${trimmed}".`,
                    movies: shown,
                },
                context: null,
            }
        }
    }
}
async function buildMoreReply(context) {
    const pool = context.pool ?? []
    const unseenFromPool = pool.filter((m) => !context.shownIds.includes(m.id))

    let shown = unseenFromPool.slice(0, 6)
    let remainingPool = unseenFromPool.slice(6)
    let nextPage = context.page

    if (shown.length < 6) {
        nextPage = context.page + 1
        let freshMovies = []

        if (context.type === 'trending') {
            freshMovies = await getTrending(nextPage)
        } else if (context.type === 'top_rated') {
            freshMovies = await getTopRated(nextPage)
        }

        const newUnseen = freshMovies.filter(
            (m) => !context.shownIds.includes(m.id) && !shown.some((s) => s.id === m.id)
        )
        const needed = 6 - shown.length
        shown = [...shown, ...newUnseen.slice(0, needed)]
        remainingPool = newUnseen.slice(needed)
    }

    if (shown.length === 0) {
        return {
            message: { sender: 'bot', text: "I've run out of new suggestions for that one — try asking for something else!" },
            context: null,
        }
    }

    return {
        message: { sender: 'bot', text: "Here's some more:", movies: shown },
        context: {
            ...context,
            page: nextPage,
            pool: remainingPool,
            shownIds: [...context.shownIds, ...shown.map((m) => m.id)],
        },
    }
}
