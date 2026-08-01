import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import { searchMovie, discoverByGenre, getGenreMap, getRecommendations, getTrending, getTopRated } from '../services/tmdb'
import { classifyIntent } from '../services/gemini'
import MotifIcon from './MotifIcon'

let idCounter = 0
const nextId = () => (idCounter += 1)

export default function ChatWindow() {
    const [messages, setMessages] = useState ([
        { id: nextId(), sender: 'bot', text: "Hey I'm MovieBot, Need a suggestion ?"}
    ])
    const [input, setInput] = useState('')

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

        try {
            const intent = await classifyIntent(trimmed)
            const botMessage = await buildReply(intent, trimmed)
            setMessages((prev) => [...prev, { id: nextId(), ...botMessage }])
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                { id: nextId(), sender: 'bot', text: `Something went wrong: ${err.message}` },
            ])
        }
    }

    return (
        <div className="chat-window">
            <div className={`chat-window__messages ${messages.length > 1 ? 'chat-window__messages--active' : ''}`}>
                {messages.length === 1 && <MotifIcon />}
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                ))}
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

async function buildReply(intent, trimmed) {
    switch (intent.type) {
        case 'trending': {
            const movies = await getTrending()
            return { sender: 'bot', text: "Here's what's trending this week:", movies: movies.slice(0, 6) }
        }

        case 'top_rated': {
            const movies = await getTopRated()
            return { sender: 'bot', text: 'Some of the highest rated movies on TMDB:', movies: movies.slice(0, 6) }
        }

        case 'genre': {
            const genreMap = await getGenreMap()
            const genreId = genreMap[intent.genre]
            if (!genreId) {
                return { sender: 'bot', text: `I couldn't match "${intent.genre}" to a genre.` }
            }
            const movies = await discoverByGenre(genreId)
            return { sender: 'bot', text: `Here's some ${intent.genre} picks:`, movies: movies.slice(0, 6) }
        }

        case 'similar': {
            const matches = await searchMovie(intent.title)
            if (matches.length === 0) {
                return { sender: 'bot', text: `I couldn't find a movie called "${intent.title}".` }
            }
            const base = matches[0]
            const movies = await getRecommendations(base.id)
            if (movies.length === 0) {
                return { sender: 'bot', text: `Found "${base.title}", but no recommendations came back for it.` }
            }
            return { sender: 'bot', text: `If you liked "${base.title}", try these:`, movies: movies.slice(0, 6) }
        }

        case 'title_search':
        default: {
            const results = await searchMovie(intent.title || trimmed)
            return {
                sender: 'bot',
                text: results.length ? `Here's what I found for "${trimmed}":` : `Sorry, I couldn't find anything for "${trimmed}".`,
                movies: results.slice(0, 6),
            }
        }
    }
}
