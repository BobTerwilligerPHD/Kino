import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import { searchMovie, discoverByGenre, getGenreMap, getRecommendations, getTrending, getTopRated, findKeywordId } from '../services/tmdb'
import { classifyIntent } from '../services/gemini'
import MotifIcon from './MotifIcon'
import { Loader2 } from 'lucide-react'

let idCounter = 0
const nextId = () => (idCounter += 1)

const MORE_PHRASES = ['more', 'another', 'more suggestions', 'give me more', 'show more', 'anything else']
function isObviouslyMore(text) {
    const normalized = text.toLowerCase().trim()
    return MORE_PHRASES.includes(normalized)
}

export default function ChatWindow() {
    const [messages, setMessages] = useState ([
        { id: nextId(), sender: 'bot', text: "Hey I'm MovieBot, Need a suggestion ?"}
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [lastContext, setLastContext] = useState(null)

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
            const intent = isObviouslyMore(trimmed) ? { type: 'more' } : await classifyIntent(trimmed)
            const { message, context } = await buildReply(intent, trimmed, lastContext)
            setMessages((prev) => [...prev, { id: nextId(), ...message }])
            setLastContext(context)
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
            <div className={`chat-window__messages ${messages.length > 1 ? 'chat-window__messages--active' : ''}`}>
                {messages.length === 1 && <MotifIcon />}
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                ))}
                {isLoading && (
                    <div className="message message--bot">
                        <Loader2 size={18} className="loading-spinner" />
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
    if (intent.type === 'more' && lastContext) {
        return buildMoreReply(lastContext)
    }

    switch (intent.type) {
        case 'trending': {
            const movies = await getTrending(1)
            const shown = movies.slice(0, 6)
            return {
                message: { sender: 'bot', text: "Here's what's trending this week:", movies: shown },
                context: { type: 'trending', page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'top_rated': {
            const movies = await getTopRated(1)
            const shown = movies.slice(0, 6)
            return {
                message: { sender: 'bot', text: 'Some of the highest rated movies on TMDB:', movies: shown },
                context: { type: 'top_rated', page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'genre': {
            const genreMap = await getGenreMap()
            const genreId = genreMap[intent.genre]
            if (!genreId) {
                return { message: { sender: 'bot', text: `I couldn't match "${intent.genre}" to a genre.` }, context: null }
            }

            let keywordId = null
            if (intent.keyword) {
                keywordId = await findKeywordId(intent.keyword)
            }

            const movies = await discoverByGenre(genreId, keywordId, 1)
            const shown = movies.slice(0, 6)
            const label = intent.keyword ? `${intent.keyword} ${intent.genre}` : intent.genre
            return {
                message: { sender: 'bot', text: `Here's some ${label} picks:`, movies: shown },
                context: { type: 'genre', genreId, keywordId, label, page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'similar': {
            const matches = await searchMovie(intent.title)
            if (matches.length === 0) {
                return { message: { sender: 'bot', text: `I couldn't find a movie called "${intent.title}".` }, context: null }
            }
            const base = matches[0]
            const movies = await getRecommendations(base.id, 1)
            const shown = movies.slice(0, 6)
            if (shown.length === 0) {
                return { message: { sender: 'bot', text: `Found "${base.title}", but no recommendations came back for it.` }, context: null }
            }
            return {
                message: { sender: 'bot', text: `If you liked "${base.title}", try these:`, movies: shown },
                context: { type: 'similar', movieId: base.id, label: base.title, page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'title_search':
        default: {
            const results = await searchMovie(intent.title || trimmed)
            const shown = results.slice(0, 6)
            return {
                message: {
                    sender: 'bot',
                    text: shown.length ? `Here's what I found for "${trimmed}":` : `Sorry, I couldn't find anything for "${trimmed}".`,
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
        } else if (context.type === 'genre') {
            freshMovies = await discoverByGenre(context.genreId, context.keywordId, nextPage)
        } else if (context.type === 'similar') {
            freshMovies = await getRecommendations(context.movieId, nextPage)
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
