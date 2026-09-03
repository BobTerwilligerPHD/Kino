import { searchMovie, getTrending, getTopRated } from '../services/tmdb'

// pure, non-React reply-building logic — turns a validated Gemini intent into
// a bot message + next context. See docs/architecture.md ("Conversation
// flow", "TMDB title/year resolution") for the reasoning behind the less
// obvious parts of this file.

function normalizeTitleForMatch(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function releaseYearOf(movie) {
    const year = movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : NaN
    return Number.isInteger(year) ? year : null
}

// only an exact normalized-title match is ever a candidate — never a substring
function exactTitleCandidates(matches, title) {
    const target = normalizeTitleForMatch(title)
    if (!target) return []
    return matches.filter((m) => normalizeTitleForMatch(m.title ?? '') === target)
}

function yearDiff(movie, year) {
    const movieYear = releaseYearOf(movie)
    if (movieYear == null || year == null) return Infinity
    return Math.abs(movieYear - year)
}

// recommendation: exact title required, year tolerated within ±1 (metadata can
// be off by one); ties or no candidate within tolerance fail safe to null
export function findMatchingResultForRecommendation(matches, title, year) {
    const candidates = exactTitleCandidates(matches, title)
    if (candidates.length === 0) return null

    const withinTolerance = candidates
        .map((movie) => ({ movie, diff: yearDiff(movie, year) }))
        .filter(({ diff }) => diff <= 1)
        .sort((a, b) => a.diff - b.diff)

    return withinTolerance[0]?.movie ?? null
}

// title_search: stricter, no tolerance — exact year if supplied, otherwise
// exactly one unambiguous exact-title candidate, or fail safe
export function findMatchingResultForTitleSearch(matches, title, year) {
    const candidates = exactTitleCandidates(matches, title)
    if (candidates.length === 0) return null

    if (year) {
        return candidates.find((m) => releaseYearOf(m) === year) ?? null
    }

    return candidates.length === 1 ? candidates[0] : null
}

export function toRecommendedMovie(movie, reason) {
    return {
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date,
        vote_average: movie.vote_average,
        overview: movie.overview,
        reason,
    }
}

export async function buildReply(intent, trimmed, lastContext, signal) {
    if (intent.type === 'more' && lastContext?.type === 'recommend') {
        return {
            message: { sender: 'bot', text: "I didn't catch new titles for that — try telling me what kind of thing you're after." },
            context: lastContext,
        }
    }

    if (intent.type === 'more' && lastContext) {
        return buildMoreReply(lastContext, signal)
    }

    if (intent.type === 'more') {
        return {
            message: { sender: 'bot', text: "More of what? Tell me what you're in the mood for and I'll take it from there." },
            context: null,
        }
    }

    switch (intent.type) {
        case 'clarify': {
            return {
                message: { sender: 'bot', text: intent.replyText },
                context: { type: 'clarify' },
            }
        }

        case 'fallback': {
            return {
                message: { sender: 'bot', text: intent.replyText },
                context: null,
            }
        }

        case 'trending': {
            const movies = await getTrending(1, signal)
            const shown = movies.slice(0, 6)
            return {
                message: { sender: 'bot', text: intent.replyText || "Here's what's trending this week:", movies: shown, variant: 'full' },
                context: { type: 'trending', page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'top_rated': {
            const movies = await getTopRated(1, signal)
            const shown = movies.slice(0, 6)
            return {
                message: { sender: 'bot', text: intent.replyText || 'Some of the highest rated movies on TMDB:', movies: shown, variant: 'full' },
                context: { type: 'top_rated', page: 1, pool: movies.slice(6), shownIds: shown.map((m) => m.id) },
            }
        }

        case 'recommend': {
            const recommendations = (intent.recommendations ?? []).slice(0, 3)
            const resolved = await Promise.all(recommendations.map((r) => searchMovie(r.title, r.year, signal)))
            const bestMatches = resolved.map((matches, i) =>
                findMatchingResultForRecommendation(matches, recommendations[i].title, recommendations[i].year)
            )

            if (recommendations.length > 0 && bestMatches[0] == null) {
                return {
                    message: { sender: 'bot', text: "I couldn't verify that recommendation properly. Give me another shot." },
                    context: null,
                }
            }

            // every pick must resolve, to a distinct film, or the whole response is
            // discarded — replyText describes this exact set, so a silently-dropped
            // alternate would leave the surviving cards contradicting the text
            const seenIds = new Set()
            const allResolved = bestMatches.every((best) => {
                if (!best || seenIds.has(best.id)) return false
                seenIds.add(best.id)
                return true
            })
            if (!allResolved) {
                return {
                    message: { sender: 'bot', text: "I couldn't verify that recommendation properly. Give me another shot." },
                    context: null,
                }
            }

            const shown = bestMatches.map((best, i) => toRecommendedMovie(best, recommendations[i].reason))

            return {
                message: { sender: 'bot', text: intent.replyText || "Here's what I'd suggest:", movies: shown, variant: 'recommendation' },
                context: { type: 'recommend', shownIds: shown.map((m) => m.id) },
            }
        }

        case 'title_search': {
            const results = await searchMovie(intent.title, intent.year, signal)
            const best = findMatchingResultForTitleSearch(results, intent.title, intent.year)
            const shown = best ? [best] : []
            return {
                message: {
                    sender: 'bot',
                    text: shown.length ? (intent.replyText || `Here's ${shown[0].title}:`) : `Sorry, I couldn't find anything for "${trimmed}".`,
                    movies: shown,
                    variant: 'full',
                },
                context: null,
            }
        }

        default: {
            return {
                message: { sender: 'bot', text: "I didn't quite catch what you're after — try naming a mood, a genre, or a film you like." },
                context: null,
            }
        }
    }
}

export async function buildMoreReply(context, signal) {
    const pool = context.pool ?? []
    const unseenFromPool = pool.filter((m) => !context.shownIds.includes(m.id))

    let shown = unseenFromPool.slice(0, 6)
    let remainingPool = unseenFromPool.slice(6)
    let nextPage = context.page

    if (shown.length < 6) {
        nextPage = context.page + 1
        let freshMovies = []

        if (context.type === 'trending') {
            freshMovies = await getTrending(nextPage, signal)
        } else if (context.type === 'top_rated') {
            freshMovies = await getTopRated(nextPage, signal)
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
        message: { sender: 'bot', text: "Here's some more:", movies: shown, variant: 'full' },
        context: {
            ...context,
            page: nextPage,
            pool: remainingPool,
            shownIds: [...context.shownIds, ...shown.map((m) => m.id)],
        },
    }
}
