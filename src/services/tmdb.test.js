import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchMovie } from './tmdb'

beforeEach(() => {
    vi.unstubAllGlobals()
})

describe('tmdb — request cancellation wiring', () => {
    it('passes an AbortSignal to fetch on every call, even with no caller signal', async () => {
        // a non-empty result avoids searchMovie's own no-year-match fallback
        // making a second call — this test is only about the signal being present
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ results: [{ id: 1, title: 'Heat', popularity: 1, release_date: '1995-12-15' }] }),
        })
        vi.stubGlobal('fetch', fetchMock)

        await searchMovie('Heat', 1995)

        expect(fetchMock).toHaveBeenCalledOnce()
        const [, options] = fetchMock.mock.calls[0]
        expect(options.signal).toBeInstanceOf(AbortSignal)
    })

    it('rejects if the caller-supplied signal is already aborted, without needing a real timer', async () => {
        const fetchMock = vi.fn((url, options) => {
            if (options.signal.aborted) {
                return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            }
            return Promise.resolve({ ok: true, json: async () => ({ results: [] }) })
        })
        vi.stubGlobal('fetch', fetchMock)

        const controller = new AbortController()
        controller.abort()

        await expect(searchMovie('Heat', 1995, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    })
})
