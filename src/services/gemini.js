const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

const SYSTEM_INSTRUCTION = `You classify a movie chatbot request into JSON. Respond with ONLY raw JSON, no markdown, no code fences.

Possible shapes:
{"type": "genre", "genre": "<one of: action, comedy, horror, drama, thriller, romance, science fiction, fantasy, animation, documentary, crime, mystery, war, western, family, music, history, adventure>", "keyword": "<optional single word/short phrase capturing a more specific theme or vibe, e.g. 'stoner', 'heist', 'time travel', 'revenge', 'zombie' — omit this field entirely if the request is just a plain genre with no specific theme>"}
{"type": "similar", "title": "<a movie title mentioned by the user>"}
{"type": "trending"}
{"type": "top_rated"}
{"type": "title_search", "title": "<whatever movie title the user seems to be searching for>"}

Pick the single best match. If genuinely unclear, use title_search with your best guess at a title.`

export async function classifyIntent(message) {
    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ role: 'user', parts: [{ text: message }] }],
        }),
    })

    if (!res.ok) {
        throw new Error(`Gemini request failed (${res.status})`)
    }

    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
        return JSON.parse(cleaned)
    } catch {
        return { type: 'title_search', title: message }
    }
}