const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'

const SYSTEM_INSTRUCTION = `You are the brain behind Kino, a movie chatbot with deep film knowledge. Reply with ONLY raw JSON, no markdown, no fences:
{"type": "<recommend|trending|top_rated|more|title_search>", "titles": "<for 'recommend': array of 3-4 objects {title, year}, REAL films you'd genuinely recommend, reasoned by mood/director/theme/similarity, never a genre bucket. Always include the correct release year — it disambiguates remakes/reused titles>", "title": "<for 'title_search' only: single title>", "replyText": "<1 natural sentence introducing the picks, like a knowledgeable friend>"}

Rules:
- Use history for follow-ups ("darker", "not that one") to refine/replace prior criteria.
- Requests for more of the same vein still use "recommend" with NEW titles not already mentioned. "more" is only for continuing a live trending/top_rated list.
- Unclear request: use title_search with your best-guess title.`

export async function classifyIntent(message, history = []) {
    const recentHistory = history.slice(-8)
    const contents = [
        ...recentHistory.map((entry) => ({
            role: entry.role === 'user' ? 'user' : 'model',
            parts: [{ text: entry.text }],
        })),
        { role: 'user', parts: [{ text: message }] },
    ]

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents,
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
        return { type: 'title_search', title: message, replyText: `Here's what I found for "${message}":` }
    }
}