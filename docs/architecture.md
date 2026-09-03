# Kino — architecture notes

Context that's useful for understanding *why* the code is shaped the way it is,
but doesn't belong as inline comments. If you're changing one of these areas,
read the relevant section first — several of these decisions look like they
could be simplified, and weren't, for a specific reason.

## Conversation flow

`ChatWindow` owns UI state (`messages`, `history`, `lastContext`, `isLoading`)
and the request lifecycle. `src/lib/reply.js` is pure, non-React logic that
turns a validated Gemini intent into a bot message + next context — it has no
React dependency and returns plain data only.

**Two parallel logs.** `messages` is what's rendered; `history` is the
compact, Gemini-facing turn log sent back on the next request. They're kept in
sync by hand at each call site rather than derived from one another, because a
transient error message must appear in `messages` (for the user) but must
**never** enter `history` (so a real assistant reply that happens to mention
"error" isn't confused with one). Each message carries an `error: true` flag
for exactly this purpose; `saveConversation` filters those out before
persisting.

**Request cancellation.** `ChatWindow` holds one `AbortController` per
in-flight request (`abortControllerRef`), aborted on both a 20s timeout and a
new-conversation reset. A separate `requestIdRef` counter guards against a
*resolved* stale request re-applying its result after a reset — the abort
stops the network work, the id check stops a late-arriving result from being
applied. Both exist because they solve different races: abort can't reach a
request that already resolved, and the id check alone would leave the
network call running uselessly in the background.

## Gemini boundary (`src/services/gemini.js`, `api/gemini.js`)

`classifyIntent` sends only `{ contents }` to `/api/gemini`. The fixed system
instruction and the Gemini API key both live server-side in `api/gemini.js`
— a client-supplied `system_instruction` field is simply never read, so
`/api/gemini` can't be used as a general-purpose relay for arbitrary prompts.
The API key is sent to Google via the `x-goog-api-key` header rather than a
URL query parameter, specifically so it can't end up in access/proxy logs
that record URLs.

**`normalizeIntent` is the trust boundary.** Every parsed Gemini response
passes through it before anything else sees it. It reconstructs an explicit
object per known intent type rather than forwarding whatever came back, so a
hallucinated field or unrecognized `type` can never reach `ChatWindow`/`reply.js`
unvalidated. This is deliberately handwritten rather than schema-library-based:
the set of shapes is small and fixed.

**Fail-safe over clever recovery**, applied consistently:
- A malformed `recommend` lead discards the *entire* response (never promotes
  an alternate into the lead slot, never fabricates a lead).
- If any alternate can't be resolved on TMDB or turns out to be a duplicate of
  another pick, the whole response is discarded too — a recommendation's
  `replyText` is written describing the *specific set* of picks (e.g. "unlike
  the lead..."), so silently dropping one alternate while keeping that prose
  would leave the surviving cards contradicting text that no longer matches
  what's shown.
- `title_search` uses the same discard-not-guess philosophy: an invalid
  supplied `year` fails the whole intent rather than being dropped in favor of
  an unqualified search.

None of this involves a second Gemini call or a repair/parsing pass — it's all
mechanical validation of the one response already received.

## TMDB title/year resolution (`src/lib/reply.js`)

TMDB's `/search/movie` results are popularity-sorted by `searchMovie()`, which
is appropriate for an ambiguous `title_search` typed by a user, but was
originally also used to pick recommendation matches — meaning a more popular,
*unrelated* film with a loosely-overlapping title could outrank the actual
film Gemini named. (This was a real, reproduced bug — see the recommendation
resolution tests in `src/lib/reply.test.js`, several of which name it
directly.) The fix was to require an **exact** normalized-title match — never
a substring — before a candidate is even considered.

Recommendation and `title_search` deliberately use *different* matching
policies past that point, because they have different trust levels:

- **Recommendation** (`findMatchingResultForRecommendation`): year is a hint,
  not a hard boundary — Gemini/TMDB release-year metadata can be off by one
  (festival premiere vs. wide release, regional dates) — so a ±1-year window is
  tolerated, and the closest year wins. If multiple exact-title candidates are
  equally close, that's genuine ambiguity and resolves to `null` rather than
  picking one via array order/popularity.
- **`title_search`** (`findMatchingResultForTitleSearch`): stricter, no
  tolerance. A supplied year must match exactly; with no year, exactly one
  exact-title candidate must exist or it fails safe (e.g. two different films
  both titled "Crash" — resolvable only once a year disambiguates them).

Both funnel through `exactTitleCandidates()` for the shared exact-title floor,
so the divergence is only in how each policy narrows candidates down from
there — not two independent implementations of title matching.

## Persistence (`src/lib/conversation.js`)

`localStorage`-only, versioned (`SCHEMA_VERSION`), and validated on every
load — malformed or outdated data is discarded (`clearConversation()` +
`null`) rather than partially repaired, so the app always starts from either a
fully-trusted conversation or a clean slate.

The version has been bumped twice for reasons worth knowing if you're
touching this file again:
- v1 → v2: v1 could contain transient error messages that had mistakenly
  become persist-eligible, with no reliable way to distinguish those from
  genuine assistant text after the fact.
- v2 → v3: v2 either omitted a message's `variant` (recommendation vs.
  full-detail card) entirely, or wrote one that restoration then silently
  *re-derived* from movie data instead of trusting. v3's contract is that
  `variant` is authoritative — a movies-bearing message with no valid
  `variant` on record is rejected outright rather than guessed at.

`sanitizeMovie` treats `id`/`title` as load-bearing (reject the movie if
either is missing) but normalizes everything else (`release_date`,
`vote_average`, `overview`, `reason`) to a safe default instead of rejecting —
a bad value there is cosmetic until it hits React unnormalized (`.slice` on a
non-string `release_date`, `.toFixed` on a non-number `vote_average`, a
non-string `reason` rendered as a child), which does crash.

## Input/output limits (`src/lib/limits.js`)

One shared constants file, imported by both the browser (composer, response
normalization) and the serverless function, so the two sides of the request
boundary can't silently drift apart.

`USER_INPUT_MAX_LENGTH` (the composer's `maxLength`) is deliberately smaller
than the server's real per-message ceiling (`MESSAGE_ENTRY_MAX_LENGTH`) — it
reserves room for `CLARIFY_BLOCKED_NOTE`, a string `classifyIntent` appends to
the *current* message when a clarifying question isn't allowed this turn. The
composer can't know in advance whether a given turn will need that note, so it
reserves the space on every message.

`TITLE_MAX_LENGTH`/`REASON_MAX_LENGTH` exist so a *valid-shaped* but oversized
model response can't produce a next-turn history entry that exceeds
`MESSAGE_ENTRY_MAX_LENGTH` and gets rejected by the server on a later request.
An oversized title/reason fails that recommendation entry the same way a
missing one does — rejected, not truncated, since cutting a title or reason
down could change what it means, not just how long it displays. For the same
reason, `classifyIntent` filters any outbound history entry (including old
ones restored from a conversation saved before these caps existed) that
exceeds `MESSAGE_ENTRY_MAX_LENGTH`, rather than letting one oversized legacy
entry break every future request in that conversation.

## Provider fetching (`src/components/MovieCard.jsx`)

Two presentation modes, driven by an explicit `variant` prop (never inferred
from movie data — see the persistence note above for why that specifically
matters after a refresh): full-detail cards (trending/top-rated/title-search)
auto-fetch providers on mount; compact recommendation cards fetch lazily, on
a "Where to watch" click.

Every provider fetch is guarded by a `requestIdRef` counter, bumped on both a
new fetch attempt and a country change — a response is only applied if the id
still matches what it was issued under. This stops a slow, previous-region
request from resolving late and overwriting a newer, correct result. On a
country change, any in-flight request is invalidated immediately and whatever
was on screen is cleared right away too, so stale-region data never lingers.

The "In cinemas" / "At home" labels are a structural slot, not real showtime
data — they exist so streaming and (future) theatrical availability are never
read as one undifferentiated list of provider actions. "At home" is only
rendered once there's something to show under it, so a full-detail card never
displays an orphaned heading while its provider fetch is still pending.

## Disconnect cancellation (`api/gemini.js`)

The serverless function cancels its upstream Gemini call if the client
disconnects before it's finished responding, layered on top of (never a
replacement for) a hard 15s timeout. This uses `res`'s `'close'` event, guarded
by `res.writableEnded` — **not** `req`'s `'close'`, which in modern Node also
fires on ordinary, successful completion, not only a premature disconnect.
`writableEnded` is what actually distinguishes "the client left early" from
"we already finished." Vercel's Node runtime doesn't expose a more explicit
disconnect signal than this — it's the underlying Node response lifecycle,
used correctly, not a shortcut.

## Rate limiting & abuse posture (`api/gemini.js`)

The rate limiter is an in-memory sliding window, per warm serverless
instance — it resets on cold start and isn't shared across concurrent
instances. That's an accepted tradeoff, not an oversight: Redis or a queue
would be real infrastructure for a single-digit-QPS hobby project. It still
stops the obvious case (one client hammering the endpoint in a tight loop).

## Local development

`npm run dev` runs `npx vercel dev`, which serves the frontend *and*
`/api/gemini` together — required for chat to actually work locally, since
plain Vite doesn't run serverless functions. `npm run dev:vite` remains
available for frontend-only iteration (styling, layout) where you don't need
a working chat request. See `README.md` for environment variable setup.
