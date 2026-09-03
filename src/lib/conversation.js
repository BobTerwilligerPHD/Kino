const STORAGE_KEY = 'kino:conversation'
// bump on any persisted-shape change — old/mismatched data is discarded on load
// rather than migrated (see docs/architecture.md, "Persistence", for the history)
const SCHEMA_VERSION = 3

const KNOWN_VARIANTS = ['recommendation', 'full']

// id/title are load-bearing (reject the movie if missing); everything else is
// normalized to a safe default instead, since a bad value there is cosmetic
// until it hits React unnormalized
function sanitizeMovie(m) {
    if (!m || typeof m !== 'object') return null
    if (typeof m.id !== 'number' || !Number.isFinite(m.id)) return null
    if (typeof m.title !== 'string' || !m.title.trim()) return null

    return {
        id: m.id,
        title: m.title,
        poster_path: typeof m.poster_path === 'string' ? m.poster_path : null,
        release_date: typeof m.release_date === 'string' ? m.release_date : '',
        vote_average: typeof m.vote_average === 'number' && Number.isFinite(m.vote_average) ? m.vote_average : undefined,
        overview: typeof m.overview === 'string' ? m.overview : '',
        reason: typeof m.reason === 'string' ? m.reason : undefined,
    }
}

function sanitizeMovies(movies) {
    if (!Array.isArray(movies)) return null
    const sanitized = movies.map(sanitizeMovie)
    return sanitized.some((m) => m === null) ? null : sanitized
}

function sanitizeMessage(m) {
    if (!m || typeof m !== 'object') return null
    if (typeof m.id !== 'number') return null
    if (m.sender !== 'user' && m.sender !== 'bot') return null
    if (typeof m.text !== 'string') return null

    if (m.movies === undefined) {
        return { id: m.id, sender: m.sender, text: m.text }
    }
    const movies = sanitizeMovies(m.movies)
    if (movies === null) return null
    // variant is authoritative — never re-derived from movie data on restore
    if (!KNOWN_VARIANTS.includes(m.variant)) return null
    return { id: m.id, sender: m.sender, text: m.text, movies, variant: m.variant }
}

function isValidHistoryEntry(h) {
    return h && typeof h === 'object' && (h.role === 'user' || h.role === 'bot') && typeof h.text === 'string'
}

function sanitizeLastContext(ctx) {
    if (ctx === null || ctx === undefined) return null
    if (typeof ctx !== 'object') return null

    if (ctx.type === 'trending' || ctx.type === 'top_rated') {
        if (typeof ctx.page !== 'number' || !Array.isArray(ctx.pool) || !Array.isArray(ctx.shownIds)) return null
        const pool = sanitizeMovies(ctx.pool)
        if (pool === null) return null
        return { type: ctx.type, page: ctx.page, pool, shownIds: ctx.shownIds }
    }

    if (ctx.type === 'recommend') {
        if (!Array.isArray(ctx.shownIds)) return null
        return { type: 'recommend', shownIds: ctx.shownIds }
    }

    if (ctx.type === 'clarify') {
        return { type: 'clarify' }
    }

    return null
}

function readStorage() {
    try {
        return localStorage.getItem(STORAGE_KEY)
    } catch {
        return null
    }
}

export function loadConversation() {
    const raw = readStorage()
    if (!raw) return null

    let parsed
    try {
        parsed = JSON.parse(raw)
    } catch {
        clearConversation()
        return null
    }

    if (!parsed || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION) {
        clearConversation()
        return null
    }
    if (!Array.isArray(parsed.messages)) {
        clearConversation()
        return null
    }
    const messages = parsed.messages.map(sanitizeMessage)
    if (messages.some((m) => m === null)) {
        clearConversation()
        return null
    }
    if (!Array.isArray(parsed.history) || !parsed.history.every(isValidHistoryEntry)) {
        clearConversation()
        return null
    }

    const hadLastContext = parsed.lastContext !== null && parsed.lastContext !== undefined
    const lastContext = sanitizeLastContext(parsed.lastContext)
    if (hadLastContext && lastContext === null) {
        clearConversation()
        return null
    }

    return { messages, history: parsed.history, lastContext }
}

export function saveConversation({ messages, history, lastContext }) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, messages, history, lastContext }))
    } catch {
        // storage unavailable/full — degrade silently, don't break the app
    }
}

export function clearConversation() {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch {
        // storage unavailable — nothing to do
    }
}
