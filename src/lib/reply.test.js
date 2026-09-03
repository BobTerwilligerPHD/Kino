import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findMatchingResultForRecommendation, findMatchingResultForTitleSearch, buildReply } from './reply'
import { searchMovie } from '../services/tmdb'
import { normalizeIntent } from '../services/gemini'

vi.mock('../services/tmdb', () => ({
    searchMovie: vi.fn(),
    getTrending: vi.fn(),
    getTopRated: vi.fn(),
}))

// both policies share the same exact-title requirement and the same rejection of
// unrelated substring matches — these prove that shared floor before the two
// policies' year-handling tests diverge below
describe.each([
    ['findMatchingResultForRecommendation', findMatchingResultForRecommendation],
    ['findMatchingResultForTitleSearch', findMatchingResultForTitleSearch],
])('%s — shared exact-title floor', (_name, findMatchingResult) => {
    it('rejects an unrelated popular partial match ("Men" vs "The Menu")', () => {
        const matches = [{ id: 1, title: 'The Menu', popularity: 80, release_date: '2022-11-18' }]
        expect(findMatchingResult(matches, 'Men', 2022)).toBeNull()
    })

    it('rejects an unrelated popular partial match ("First Dates" vs "50 First Dates")', () => {
        const matches = [{ id: 2, title: '50 First Dates', popularity: 70, release_date: '2004-02-13' }]
        expect(findMatchingResult(matches, 'First Dates', 2004)).toBeNull()
    })

    it('resolves the correct exact title despite a more popular unrelated same-year result', () => {
        const matches = [
            { id: 3, title: '50 First Dates', popularity: 40, release_date: '2004-02-13' },
            { id: 4, title: 'Primer', popularity: 12, release_date: '2004-10-08' },
        ]
        expect(findMatchingResult(matches, 'Primer', 2004)).toEqual(matches[1])
    })

    it('returns null when nothing matches at all', () => {
        const matches = [{ id: 10, title: 'Completely Unrelated', release_date: '2004-01-01' }]
        expect(findMatchingResult(matches, 'Primer', 2004)).toBeNull()
    })

    it('returns null for an empty result set', () => {
        expect(findMatchingResult([], 'Primer', 2004)).toBeNull()
    })
})

describe('findMatchingResultForRecommendation — ±1 year tolerance', () => {
    it('resolves an exact year match', () => {
        const matches = [{ id: 4, title: 'Primer', popularity: 12, release_date: '2004-10-08' }]
        expect(findMatchingResultForRecommendation(matches, 'Primer', 2004)).toEqual(matches[0])
    })

    it('resolves a same-title candidate one year off the requested year (metadata discrepancy tolerance)', () => {
        const matches = [{ id: 4, title: 'Primer', popularity: 12, release_date: '2004-10-08' }]
        expect(findMatchingResultForRecommendation(matches, 'Primer', 2005)).toEqual(matches[0])
        expect(findMatchingResultForRecommendation(matches, 'Primer', 2003)).toEqual(matches[0])
    })

    it('fails safe when the closest exact-title candidate is more than 1 year off', () => {
        const matches = [{ id: 4, title: 'Primer', popularity: 12, release_date: '2004-10-08' }]
        expect(findMatchingResultForRecommendation(matches, 'Primer', 2007)).toBeNull()
    })

    it('prefers the exact-year candidate over a same-title candidate that is merely within tolerance', () => {
        const matches = [
            { id: 20, title: 'A Star Is Born', popularity: 10, release_date: '2019-01-01' }, // 1 year off
            { id: 21, title: 'A Star Is Born', popularity: 95, release_date: '2018-10-05' }, // exact
        ]
        expect(findMatchingResultForRecommendation(matches, 'A Star Is Born', 2018)).toEqual(matches[1])
    })

    it('does not resolve an ambiguous same-title case merely because both are within tolerance of different requested years — picks the closer one', () => {
        const matches = [
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' },
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' },
        ]
        // 2005 is within tolerance of 2004 only
        expect(findMatchingResultForRecommendation(matches, 'Crash', 2005)).toEqual(matches[0])
    })
})

describe('findMatchingResultForTitleSearch — strict, no tolerance', () => {
    it('requires the exact year when one is supplied — does not accept a ±1 candidate', () => {
        const matches = [{ id: 9, title: 'Primer', popularity: 12, release_date: '2004-10-08' }]
        expect(findMatchingResultForTitleSearch(matches, 'Primer', 2005)).toBeNull()
    })

    it('resolves a single confident exact-title match with no year supplied', () => {
        const matches = [{ id: 11, title: 'Heat', popularity: 50, release_date: '1995-12-15' }]
        expect(findMatchingResultForTitleSearch(matches, 'Heat', undefined)).toEqual(matches[0])
    })

    it('fails safe on an ambiguous same-title request with no year to disambiguate ("Crash")', () => {
        const matches = [
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' }, // Paul Haggis, 2004
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' }, // David Cronenberg, 1996
        ]
        expect(findMatchingResultForTitleSearch(matches, 'Crash', undefined)).toBeNull()
    })

    it('resolves the ambiguous same-title case once an exact year disambiguates it', () => {
        const matches = [
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' },
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' },
        ]
        expect(findMatchingResultForTitleSearch(matches, 'Crash', 1996)).toEqual(matches[1])
    })
})

describe('buildReply — recommend safe-failure', () => {
    beforeEach(() => {
        vi.mocked(searchMovie).mockReset()
    })

    it('discards the whole response when the lead cannot be resolved', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([]) // lead: no results at all
        const intent = { type: 'recommend', recommendations: [{ title: 'Primer', year: 2004, reason: 'a puzzle box' }] }
        const { message, context } = await buildReply(intent, 'something', null)
        expect(message.movies).toBeUndefined()
        expect(context).toBeNull()
    })

    it('discards the whole response when an alternate cannot be resolved, even though the lead is fine', async () => {
        vi.mocked(searchMovie)
            .mockResolvedValueOnce([{ id: 1, title: 'Heat', popularity: 50, release_date: '1995-12-15' }]) // lead resolves
            .mockResolvedValueOnce([]) // alternate: nothing found
        const intent = {
            type: 'recommend',
            recommendations: [
                { title: 'Heat', year: 1995, reason: 'lead reason' },
                { title: 'Collateral', year: 2004, reason: 'alt reason' },
            ],
        }
        const { message, context } = await buildReply(intent, 'something', null)
        expect(message.movies).toBeUndefined()
        expect(context).toBeNull()
    })

    it('discards the whole response when an alternate resolves to a duplicate of the lead', async () => {
        const heat = { id: 1, title: 'Heat', popularity: 50, release_date: '1995-12-15' }
        vi.mocked(searchMovie)
            .mockResolvedValueOnce([heat])
            .mockResolvedValueOnce([heat]) // "different" recommendation resolves to the same film
        const intent = {
            type: 'recommend',
            recommendations: [
                { title: 'Heat', year: 1995, reason: 'lead reason' },
                { title: 'Heat', year: 1995, reason: 'duplicate reason' },
            ],
        }
        const { message, context } = await buildReply(intent, 'something', null)
        expect(message.movies).toBeUndefined()
        expect(context).toBeNull()
    })

    it('shows the full set, with reasons attached to the right films, when everything resolves', async () => {
        vi.mocked(searchMovie)
            .mockResolvedValueOnce([{ id: 1, title: 'Heat', popularity: 50, release_date: '1995-12-15' }])
            .mockResolvedValueOnce([{ id: 2, title: 'Collateral', popularity: 30, release_date: '2004-08-06' }])
        const intent = {
            type: 'recommend',
            recommendations: [
                { title: 'Heat', year: 1995, reason: 'lead reason' },
                { title: 'Collateral', year: 2004, reason: 'alt reason' },
            ],
        }
        const { message, context } = await buildReply(intent, 'something', null)
        expect(message.variant).toBe('recommendation')
        expect(message.movies).toHaveLength(2)
        expect(message.movies[0]).toMatchObject({ title: 'Heat', reason: 'lead reason' })
        expect(message.movies[1]).toMatchObject({ title: 'Collateral', reason: 'alt reason' })
        expect(context).toEqual({ type: 'recommend', shownIds: [1, 2] })
    })

    it('resolves a recommendation whose TMDB metadata year is 1 off from what Gemini gave (Stage 7B tolerance preserved)', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([{ id: 1, title: 'Primer', popularity: 12, release_date: '2004-10-08' }])
        const intent = { type: 'recommend', recommendations: [{ title: 'Primer', year: 2005, reason: 'a puzzle box' }] }
        const { message } = await buildReply(intent, 'something', null)
        expect(message.movies).toHaveLength(1)
        expect(message.movies[0].id).toBe(1)
    })
})

describe('buildReply — title_search deterministic resolution', () => {
    beforeEach(() => {
        vi.mocked(searchMovie).mockReset()
    })

    it('rejects an unrelated popular partial match rather than showing it', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([{ id: 1, title: 'The Menu', popularity: 80, release_date: '2022-11-18' }])
        const { message } = await buildReply({ type: 'title_search', title: 'Men' }, 'Men', null)
        expect(message.movies).toEqual([])
        expect(message.text).toMatch(/couldn't find/i)
    })

    it('resolves an exact title match', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([{ id: 2, title: 'Heat', popularity: 50, release_date: '1995-12-15' }])
        const { message } = await buildReply({ type: 'title_search', title: 'Heat' }, 'Heat', null)
        expect(message.movies).toHaveLength(1)
        expect(message.movies[0].title).toBe('Heat')
        expect(message.variant).toBe('full')
    })

    it('fails safe on an ambiguous same-title request with no year supplied, rather than picking the most popular one', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' },
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' },
        ])
        const { message } = await buildReply({ type: 'title_search', title: 'Crash' }, 'Crash', null)
        expect(message.movies).toEqual([])
    })

    it('resolves the exact title+year when a year is supplied and disambiguates', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' },
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' },
        ])
        const { message } = await buildReply({ type: 'title_search', title: 'Crash', year: 1996 }, 'Crash 1996', null)
        expect(message.movies).toHaveLength(1)
        expect(message.movies[0].id).toBe(13)
    })

    it('does not accept a ±1-year TMDB result the way recommend would — strict rejects it', async () => {
        vi.mocked(searchMovie).mockResolvedValueOnce([{ id: 4, title: 'Primer', popularity: 12, release_date: '2004-10-08' }])
        const { message } = await buildReply({ type: 'title_search', title: 'Primer', year: 2005 }, 'Primer 2005', null)
        expect(message.movies).toEqual([])
    })
})

describe('end to end — raw Gemini output through normalizeIntent into buildReply', () => {
    beforeEach(() => {
        vi.mocked(searchMovie).mockReset()
    })

    it('disambiguates a same-title search by year, selecting the intended film', async () => {
        const rawGeminiOutput = { type: 'title_search', title: 'Crash', year: 1996, replyText: 'Here you go:' }
        const intent = normalizeIntent(rawGeminiOutput, true)
        expect(intent).toMatchObject({ type: 'title_search', title: 'Crash', year: 1996 })

        vi.mocked(searchMovie).mockResolvedValueOnce([
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' },
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' },
        ])
        const { message } = await buildReply(intent, 'Crash 1996', null)
        expect(message.movies).toHaveLength(1)
        expect(message.movies[0].id).toBe(13)
    })

    it('safely fails an ambiguous same-title search with no year, end to end', async () => {
        const rawGeminiOutput = { type: 'title_search', title: 'Crash', replyText: 'Here you go:' }
        const intent = normalizeIntent(rawGeminiOutput, true)
        expect(intent.year).toBeUndefined()

        vi.mocked(searchMovie).mockResolvedValueOnce([
            { id: 12, title: 'Crash', popularity: 40, release_date: '2004-05-06' },
            { id: 13, title: 'Crash', popularity: 15, release_date: '1996-09-13' },
        ])
        const { message } = await buildReply(intent, 'Crash', null)
        expect(message.movies).toEqual([])
    })
})
