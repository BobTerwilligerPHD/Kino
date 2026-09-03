import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeIntent, classifyIntent } from './gemini'
import { TITLE_MAX_LENGTH, MESSAGE_ENTRY_MAX_LENGTH } from '../lib/limits'

describe('normalizeIntent — recommend', () => {
    it('accepts a valid lead with title, reason, and plausible year', () => {
        const result = normalizeIntent(
            { type: 'recommend', recommendations: [{ title: 'Heat', year: 1995, reason: 'a tense LA crime epic' }] },
            true
        )
        expect(result.type).toBe('recommend')
        expect(result.recommendations).toEqual([{ title: 'Heat', year: 1995, reason: 'a tense LA crime epic' }])
    })

    it('fails safe when the lead has no year at all', () => {
        const result = normalizeIntent(
            { type: 'recommend', recommendations: [{ title: 'Heat', reason: 'a tense LA crime epic' }] },
            true
        )
        expect(result.type).toBe('fallback')
    })

    it('fails safe when the lead year is implausible', () => {
        const result = normalizeIntent(
            { type: 'recommend', recommendations: [{ title: 'Heat', year: 1500, reason: 'a tense LA crime epic' }] },
            true
        )
        expect(result.type).toBe('fallback')
    })

    it('fails safe when the lead is malformed even if a valid alternate exists', () => {
        const result = normalizeIntent(
            {
                type: 'recommend',
                recommendations: [
                    { title: '', reason: 'bad' },
                    { title: 'Heat', year: 1995, reason: 'unlike the lead, this one...' },
                ],
            },
            true
        )
        expect(result.type).toBe('fallback')
    })

    it('drops a malformed alternate but keeps a valid lead', () => {
        const result = normalizeIntent(
            {
                type: 'recommend',
                recommendations: [
                    { title: 'Heat', year: 1995, reason: 'a tense LA crime epic' },
                    { title: '', reason: 'bad' },
                ],
            },
            true
        )
        expect(result.type).toBe('recommend')
        expect(result.recommendations).toHaveLength(1)
        expect(result.recommendations[0].title).toBe('Heat')
    })

    it('never returns type recommend with zero recommendations', () => {
        const result = normalizeIntent({ type: 'recommend', recommendations: [] }, true)
        expect(result.type).toBe('fallback')
    })

    it('caps recommendations at 3 (lead plus 2 alternates)', () => {
        const result = normalizeIntent(
            {
                type: 'recommend',
                recommendations: [
                    { title: 'A', year: 2000, reason: 'lead' },
                    { title: 'B', year: 2001, reason: 'alt1' },
                    { title: 'C', year: 2002, reason: 'alt2' },
                    { title: 'D', year: 2003, reason: 'alt3' },
                ],
            },
            true
        )
        expect(result.recommendations).toHaveLength(3)
        expect(result.recommendations.map((r) => r.title)).toEqual(['A', 'B', 'C'])
    })
})

describe('normalizeIntent — clarify enforcement', () => {
    it('accepts a valid single-question clarify when allowed', () => {
        const result = normalizeIntent({ type: 'clarify', replyText: 'What decade are you in the mood for?' }, true)
        expect(result).toEqual({ type: 'clarify', replyText: 'What decade are you in the mood for?' })
    })

    it('falls back when clarify is not allowed this turn, even if well-formed', () => {
        const result = normalizeIntent({ type: 'clarify', replyText: 'What decade are you in the mood for?' }, false)
        expect(result.type).toBe('fallback')
    })

    it('falls back on a compound (multi-question) clarify', () => {
        const result = normalizeIntent({ type: 'clarify', replyText: 'What genre? What era?' }, true)
        expect(result.type).toBe('fallback')
    })

    it('falls back on clarify text with no question mark', () => {
        const result = normalizeIntent({ type: 'clarify', replyText: 'Tell me more about what you want.' }, true)
        expect(result.type).toBe('fallback')
    })
})

describe('normalizeIntent — title_search', () => {
    it('accepts a non-empty title', () => {
        const result = normalizeIntent({ type: 'title_search', title: 'Heat' }, true)
        expect(result).toEqual({ type: 'title_search', title: 'Heat', replyText: undefined })
    })

    it('fails safe on an empty/missing title', () => {
        expect(normalizeIntent({ type: 'title_search', title: '' }, true).type).toBe('fallback')
        expect(normalizeIntent({ type: 'title_search' }, true).type).toBe('fallback')
    })

    it('accepts a valid title with no year (year stays optional)', () => {
        const result = normalizeIntent({ type: 'title_search', title: 'Heat' }, true)
        expect(result.type).toBe('title_search')
        expect(result.year).toBeUndefined()
    })

    it('accepts a valid title with a valid year, and carries it through', () => {
        const result = normalizeIntent({ type: 'title_search', title: 'Crash', year: 2004 }, true)
        expect(result.type).toBe('title_search')
        expect(result.year).toBe(2004)
    })

    it('rejects a title over the length cap', () => {
        const result = normalizeIntent({ type: 'title_search', title: 'x'.repeat(TITLE_MAX_LENGTH + 1) }, true)
        expect(result.type).toBe('fallback')
    })

    it('rejects the whole intent on a malformed (non-numeric) supplied year — does not silently drop it and search unqualified', () => {
        const result = normalizeIntent({ type: 'title_search', title: 'Crash', year: 'not-a-year' }, true)
        expect(result.type).toBe('fallback')
    })

    it('rejects the whole intent on an out-of-range supplied year', () => {
        expect(normalizeIntent({ type: 'title_search', title: 'Crash', year: 1500 }, true).type).toBe('fallback')
        expect(normalizeIntent({ type: 'title_search', title: 'Crash', year: 3000 }, true).type).toBe('fallback')
    })
})

describe('normalizeIntent — recommendation title/reason length caps', () => {
    it('rejects a lead with an oversized title', () => {
        const result = normalizeIntent(
            { type: 'recommend', recommendations: [{ title: 'x'.repeat(300), year: 2000, reason: 'fine' }] },
            true
        )
        expect(result.type).toBe('fallback')
    })

    it('rejects a lead with an oversized reason', () => {
        const result = normalizeIntent(
            { type: 'recommend', recommendations: [{ title: 'Heat', year: 1995, reason: 'x'.repeat(300) }] },
            true
        )
        expect(result.type).toBe('fallback')
    })

    it('drops (rather than truncates) an oversized alternate, keeping a valid lead', () => {
        const result = normalizeIntent(
            {
                type: 'recommend',
                recommendations: [
                    { title: 'Heat', year: 1995, reason: 'a tense LA crime epic' },
                    { title: 'x'.repeat(300), year: 2000, reason: 'fine' },
                ],
            },
            true
        )
        expect(result.type).toBe('recommend')
        expect(result.recommendations).toHaveLength(1)
    })
})

describe('normalizeIntent — malformed/unknown input', () => {
    it('fails safe on an unrecognized type', () => {
        expect(normalizeIntent({ type: 'banana' }, true).type).toBe('fallback')
    })

    it('fails safe on null or non-object input', () => {
        expect(normalizeIntent(null, true).type).toBe('fallback')
        expect(normalizeIntent('a string', true).type).toBe('fallback')
    })

    it('rebuilds trending/top_rated/more explicitly, dropping stray fields', () => {
        const result = normalizeIntent({ type: 'trending', replyText: 'here', recommendations: [{ evil: true }] }, true)
        expect(result).toEqual({ type: 'trending', replyText: 'here' })
    })

    it('drops a non-string replyText rather than passing it through', () => {
        const result = normalizeIntent({ type: 'trending', replyText: 42 }, true)
        expect(result.replyText).toBeUndefined()
    })
})

describe('classifyIntent — bounds outbound history to MESSAGE_ENTRY_MAX_LENGTH', () => {
    beforeEach(() => {
        vi.unstubAllGlobals()
    })

    it('excludes an oversized legacy history entry from the outbound request, but keeps the rest', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ candidates: [{ content: { parts: [{ text: '{"type":"fallback"}' }] } }] }),
        })
        vi.stubGlobal('fetch', fetchMock)

        const history = [
            { role: 'user', text: 'a normal earlier message' },
            { role: 'bot', text: 'x'.repeat(MESSAGE_ENTRY_MAX_LENGTH + 500) }, // simulates an old, now-oversized entry
        ]
        await classifyIntent('something new', history)

        expect(fetchMock).toHaveBeenCalledOnce()
        const [, options] = fetchMock.mock.calls[0]
        const sentBody = JSON.parse(options.body)
        const texts = sentBody.contents.map((c) => c.parts[0].text)
        expect(texts).toContain('a normal earlier message')
        expect(texts.some((t) => t.length > MESSAGE_ENTRY_MAX_LENGTH)).toBe(false)
        expect(texts).toContain('something new')
    })
})
