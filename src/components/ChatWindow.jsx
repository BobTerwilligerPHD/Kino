import { useState } from 'react'
import MessageBubble from './MessageBubble'
import { searchMovie } from '../services/tmdb'
import MotifIcon from './MotifIcon'

let idCounter = 0
const nextId = () => (idCounter += 1)

export default function ChatWindow() {
    const [messages, setMessages] = useState ([
        { id: nextId(), sender: 'bot', text: "Hey I'm MovieBot, Need a suggestion ?"}
    ])
    const [input, setInput] = useState('')

    async function handleSend(e) {
        e.preventDefault()
        const trimmed = input.trim()
        if (!trimmed) return

        const userMessage = { id: nextId(), sender: 'user', text: trimmed }
        setMessages(prev => [...prev, userMessage])
        setInput('')

        const results = await searchMovie(trimmed)
        const botMessage = {
            id: nextId(),
            sender: 'bot',
            text: results.length ? `Here is what I found for "${trimmed}":` : `Sorry, I couldn't find anything for "${trimmed}".`,
            movies: results.slice(0,6),
        }
        setMessages((prev) => [...prev, botMessage])
    }

    return (
        <div className="chat-window">
            <div className="chat-window__messages">
                {messages.length === 1 && <MotifIcon />}
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                ))}
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
