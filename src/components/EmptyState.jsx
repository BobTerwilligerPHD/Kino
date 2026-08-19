import { useState } from 'react'
import MotifIcon from './MotifIcon'

const PROMPTS = [
    { prompt: 'What are you in the mood for tonight?', hint: 'Try a mood, a genre, a director, or "something like Heat".' },
    { prompt: 'Looking for something to watch?', hint: 'Describe the vibe — slow and melancholic, tense and paranoid, whatever fits.' },
    { prompt: 'Tell me what you’re after.', hint: 'A director, an era, a feeling — or just say "surprise me".' },
    { prompt: 'What kind of film sounds good right now?', hint: 'Comfort watch, something bleak, a heist, a slow-burn romance — anything.' },
    { prompt: 'Need a recommendation?', hint: 'Ask for trending, top rated, or something in the vein of a film you love.' },
]

export default function EmptyState() {
    const [{ prompt, hint }] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)])

    return (
        <div className="empty-state">
            <MotifIcon />
            <p className="empty-state__prompt">{prompt}</p>
            <p className="empty-state__hint">{hint}</p>
        </div>
    )
}
