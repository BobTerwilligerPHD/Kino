// requests go to /api/gemini — the API key and system instruction are
// server-side only (see api/gemini.js). See docs/architecture.md ("Gemini
// boundary") for the validation philosophy this file implements.

import { TITLE_MAX_LENGTH, REASON_MAX_LENGTH, MESSAGE_ENTRY_MAX_LENGTH } from '../lib/limits'

const MIN_PLAUSIBLE_YEAR = 1878
const MAX_PLAUSIBLE_YEAR_AHEAD = 2

function isValidYear(value) {
    const year = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    return Number.isInteger(year) && year >= MIN_PLAUSIBLE_YEAR && year <= new Date().getFullYear() + MAX_PLAUSIBLE_YEAR_AHEAD
}

// oversized title/reason reject the entry rather than truncate it — see
// docs/architecture.md ("Input/output limits") for why
function isValidRecommendationEntry(r) {
    return (
        !!r &&
        typeof r.title === 'string' && r.title.trim() && r.title.trim().length <= TITLE_MAX_LENGTH &&
        typeof r.reason === 'string' && r.reason.trim() && r.reason.trim().length <= REASON_MAX_LENGTH &&
        isValidYear(r.year)
    )
}

function normalizeRecommendationEntry(r) {
    return {
        title: r.title.trim(),
        year: typeof r.year === 'number' ? r.year : Number(r.year),
        reason: r.reason.trim(),
    }
}

// a malformed lead invalidates the whole response — never promoted from/swapped
// with an alternate. Malformed alternates are simply dropped.
function normalizeRecommend(raw) {
    if (!Array.isArray(raw) || raw.length === 0 || !isValidRecommendationEntry(raw[0])) {
        return null
    }
    const alternates = raw.slice(1).filter(isValidRecommendationEntry).slice(0, 2)
    return [raw[0], ...alternates].map(normalizeRecommendationEntry)
}

const CLARIFY_MAX_LENGTH = 200
const REPLY_TEXT_MAX_LENGTH = 600

// deliberately mechanical, not a grammar parser: non-empty, within the length
// limit, exactly one '?', ending with it — rejects compound questions and
// trailing content without needing real parsing
function isValidClarifyText(text) {
    if (typeof text !== 'string') return false
    const trimmed = text.trim()
    if (!trimmed) return false
    if (trimmed.length > CLARIFY_MAX_LENGTH) return false
    if (!trimmed.endsWith('?')) return false
    return (trimmed.match(/\?/g) || []).length === 1
}

const CLARIFY_BLOCKED_NOTE =
    '\n\n(Do not respond with "clarify" this turn. Commit to a real recommend, trending, top_rated, or title_search decision using your best judgment on the information already given.)'

const FALLBACK_REPLY = "I didn't quite catch what you're after — try naming a mood, a genre, or a film you like, and I'll take a real shot at it."
const FALLBACK_INTENT = { type: 'fallback', replyText: FALLBACK_REPLY }

const KNOWN_INTENT_TYPES = ['recommend', 'trending', 'top_rated', 'more', 'title_search', 'clarify']

function normalizeReplyText(value) {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.length > REPLY_TEXT_MAX_LENGTH ? trimmed.slice(0, REPLY_TEXT_MAX_LENGTH) : trimmed
}

// the trust boundary every parsed Gemini response passes through — rebuilds an
// explicit object per known type rather than forwarding the parsed value, so
// no unrecognized type or field reaches ChatWindow/reply.js unvalidated.
// Exported so it can be unit-tested without mocking fetch.
export function normalizeIntent(parsed, allowClarify) {
    if (!parsed || typeof parsed !== 'object' || !KNOWN_INTENT_TYPES.includes(parsed.type)) {
        return FALLBACK_INTENT
    }

    switch (parsed.type) {
        case 'recommend': {
            const recommendations = normalizeRecommend(parsed.recommendations)
            if (recommendations === null) return FALLBACK_INTENT
            return {
                type: 'recommend',
                recommendations,
                replyText: normalizeReplyText(parsed.replyText),
            }
        }

        case 'clarify': {
            if (allowClarify && isValidClarifyText(parsed.replyText)) {
                return { type: 'clarify', replyText: parsed.replyText.trim() }
            }
            return FALLBACK_INTENT
        }

        case 'title_search': {
            const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
            if (!title || title.length > TITLE_MAX_LENGTH) return FALLBACK_INTENT

            // year is optional only if omitted entirely — a supplied-but-invalid
            // year fails the whole intent rather than silently becoming an
            // unqualified search
            let year
            if (parsed.year !== undefined && parsed.year !== null) {
                if (!isValidYear(parsed.year)) return FALLBACK_INTENT
                year = typeof parsed.year === 'number' ? parsed.year : Number(parsed.year)
            }

            return { type: 'title_search', title, year, replyText: normalizeReplyText(parsed.replyText) }
        }

        case 'trending':
        case 'top_rated':
        case 'more':
            return { type: parsed.type, replyText: normalizeReplyText(parsed.replyText) }

        default:
            return FALLBACK_INTENT
    }
}

export async function classifyIntent(message, history = [], { allowClarify = true, signal } = {}) {
    // excludes any entry over MESSAGE_ENTRY_MAX_LENGTH (e.g. from a conversation
    // saved before this cap existed) rather than failing the whole request
    const recentHistory = history.slice(-8).filter((entry) => entry.text.length <= MESSAGE_ENTRY_MAX_LENGTH)
    const messageText = allowClarify ? message : `${message}${CLARIFY_BLOCKED_NOTE}`
    const contents = [
        ...recentHistory.map((entry) => ({
            role: entry.role === 'user' ? 'user' : 'model',
            parts: [{ text: entry.text }],
        })),
        { role: 'user', parts: [{ text: messageText }] },
    ]

    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal,
    })

    if (!res.ok) {
        throw new Error(`Gemini request failed (${res.status})`)
    }

    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const cleaned = raw.replace(/```json|```/g, '').trim()

    try {
        const parsed = JSON.parse(cleaned)
        return normalizeIntent(parsed, allowClarify)
    } catch {
        return FALLBACK_INTENT
    }
}
