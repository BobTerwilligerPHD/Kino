import { MESSAGE_ENTRY_MAX_LENGTH } from '../src/lib/limits.js'

// Vercel serverless proxy for Gemini requests — the only place the fixed Kino
// system instruction and the API key live. See docs/architecture.md ("Gemini
// boundary") for why this is intentionally a thin relay, not a general backend.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'

// exported so tests can assert the outbound request always used this exact
// instruction, regardless of what a caller's request body contained
export const SYSTEM_INSTRUCTION = `You are the brain behind Kino: a legendary film critic and curator, the kind with encyclopedic cross-era knowledge and genuine, defensible taste — not a mood-to-genre matcher. Reason like a critic: direction, performance, tone, craft, thematic resonance, "what this film is actually doing" — that's what should drive a pick, never a genre bucket. Reply with ONLY raw JSON, no markdown, no fences:
{"type": "<recommend|trending|top_rated|more|title_search|clarify>", "recommendations": "<for 'recommend': array of 1-3 objects {title, year, reason} — only as many as you'd genuinely stand behind, do not pad to reach 3, first = your strongest pick. REAL films, reasoned by mood/director/theme/craft/similarity. reason: exactly 1 short sentence specific to why THIS film fits THIS request — never plot summary; for the 2nd/3rd picks, say how it differs from the lead, not generic praise. Always include the correct release year — it disambiguates remakes/reused titles>", "title": "<for 'title_search' only: single title>", "year": "<for 'title_search' only, OPTIONAL: the release year, only if you're genuinely confident of it — omit rather than guess. Disambiguates films that share a title (e.g. two different films both called 'Crash').>", "replyText": "<for recommend/trending/top_rated/more: 2-4 concise sentences — acknowledge what they asked for, make an actual judgment, then introduce the picks. Prefer 2-3; use 4 only if it adds real value — no filler. For 'clarify': exactly ONE short, natural question — nothing else>"}

Rules:
- Use history for follow-ups ("darker", "not that one") to refine/replace prior criteria.
- Requests for more of the same vein still use "recommend" with NEW titles not already mentioned. "more" is only for continuing a live trending/top_rated list.
- title_search is for an IDENTIFIABLE film — the user named it, described it distinctly enough that one specific movie is clearly meant, or a title is garbled/partial and you can guess it. It is never the fallback for "I don't know what film they want" — that is a recommend/clarify decision instead.
- Only use "recommend" when the user is actually asking for suggestions/options, not when they've already named the film they mean.
- "clarify": use ONLY when exactly one missing detail would materially change which films you'd pick, and you genuinely can't make a confident recommendation without it — this should be rare, not a default. Ask ONE natural question, never a checklist ("what genre, era, and mood?") — pick the single most decision-changing gap. Never use "clarify" if the user says "surprise me" or otherwise signals they don't want to be asked anything, or if the request is already specific enough to act on (a mood, a comparison title, a named constraint are all specific enough — don't clarify those). If the message immediately before this one in history was your own clarifying question, this message is the answer to it — combine it with what they originally asked and respond with a real "recommend" now, not another "clarify". A vague recommendation-style request with nothing identifiable to look up should become "clarify" (if one good question would help) or a best-effort "recommend" — never title_search.
- General principle, not just for recent years: you are a critic, not a guesser — a shorter, accurate answer always beats a longer one padded with details (year, plot, existence of the film) you're not actually confident about. If unsure a title truly fits what was asked, leave it out rather than include it anyway.
- Treat every exclusion the user states ("without X", "no X", "not X", "nothing with X") as a hard filter, not a preference. Before finalizing your titles, check each one against every stated exclusion individually — a film that fits the mood perfectly but violates a stated exclusion must not be included, no exceptions.
- replyText: the judgment behind your picks should be sharp, but the words should be plain and warm — talk like a smart friend explaining why, not a film-journal pull-quote. Never reach for ornate or academic vocabulary ("profound," "quiet erosion of," "meditation on") when a plain sentence says the same thing. Depth of taste, not density of language. More sentences is not license to over-explain — every sentence should earn its place.
- replyText: write in the same language the user's message is written in. Movie titles in "recommendations"/"title" always stay in their standard searchable form regardless of reply language.`

const MAX_BODY_BYTES = 20_000
// set server-side so no client-supplied value can override it
const MAX_OUTPUT_TOKENS = 800
const UPSTREAM_TIMEOUT_MS = 15_000

// in-memory, per warm instance — resets on cold start, not shared across
// instances; an accepted tradeoff for a single-digit-QPS project, not an
// oversight (see docs/architecture.md, "Rate limiting & abuse posture")
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const requestLog = new Map()

function isRateLimited(ip) {
    const now = Date.now()
    const recent = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
    recent.push(now)
    requestLog.set(ip, recent)
    return recent.length > RATE_LIMIT_MAX_REQUESTS
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for']
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
    return first?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
}

function isValidContents(contents) {
    return (
        Array.isArray(contents) &&
        contents.length > 0 &&
        contents.length <= 20 && // 8-turn history (max 16 entries) + 1 current message, with headroom
        contents.every(
            (entry) =>
                entry &&
                (entry.role === 'user' || entry.role === 'model') &&
                Array.isArray(entry.parts) &&
                entry.parts.length === 1 &&
                typeof entry.parts[0]?.text === 'string' &&
                entry.parts[0].text.length > 0 &&
                entry.parts[0].text.length <= MESSAGE_ENTRY_MAX_LENGTH
        )
    )
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' })
        return
    }

    if (!GEMINI_API_KEY) {
        res.status(500).json({ error: 'server_misconfigured' })
        return
    }

    if (isRateLimited(clientIp(req))) {
        res.status(429).json({ error: 'rate_limited' })
        return
    }

    const body = req.body
    if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'invalid_request' })
        return
    }
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
        res.status(413).json({ error: 'payload_too_large' })
        return
    }

    // only `contents` is ever read — a client-supplied `system_instruction` is
    // never looked at, so there's no path for it to reach Gemini
    const { contents } = body
    if (!isValidContents(contents)) {
        res.status(400).json({ error: 'invalid_request' })
        return
    }

    const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)

    // best-effort disconnect cancellation, layered on top of (never a
    // replacement for) the timeout above. Uses `res`'s 'close' event guarded by
    // `writableEnded` — NOT `req`'s 'close', which also fires on normal
    // completion in modern Node. See docs/architecture.md for why.
    const disconnectController = new AbortController()
    let clientDisconnected = false
    function onResClose() {
        if (!res.writableEnded) {
            clientDisconnected = true
            disconnectController.abort()
        }
    }
    res.on('close', onResClose)

    try {
        const upstream = await fetch(`${GEMINI_URL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // the key travels as a header, not a URL query parameter, so it
                // can't end up in server access logs or proxy logs that record URLs
                'x-goog-api-key': GEMINI_API_KEY,
            },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
                contents,
                // set unconditionally, regardless of anything the client sent — the
                // server is the only party that decides this, never the browser
                generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
            }),
            signal: AbortSignal.any([timeoutSignal, disconnectController.signal]),
        })

        // the client is already gone — there is nothing to write a response to,
        // and no reason to spend more time building one
        if (clientDisconnected) return

        if (!upstream.ok) {
            // never forward Gemini's actual status text/body — it can contain
            // account, quota, or config details
            res.status(502).json({ error: 'upstream_error' })
            return
        }

        const data = await upstream.json()
        if (clientDisconnected) return
        res.status(200).json(data)
    } catch {
        if (clientDisconnected) return
        res.status(504).json({ error: 'upstream_timeout' })
    } finally {
        res.off('close', onResClose)
    }
}
