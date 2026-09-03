import { describe, it, expect, beforeEach } from 'vitest'
import { loadConversation, saveConversation, clearConversation } from './conversation'
import { MESSAGE_ENTRY_MAX_LENGTH } from './limits'

// vitest's default node environment has no localStorage — this is a minimal,
// deterministic in-memory stand-in, not a mocking framework
function createLocalStorageStub() {
    let store = {}
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => {
            store[key] = String(value)
        },
        removeItem: (key) => {
            delete store[key]
        },
        clear: () => {
            store = {}
        },
    }
}

beforeEach(() => {
    globalThis.localStorage = createLocalStorageStub()
})

describe('conversation persistence — round trip', () => {
    it('returns null when nothing has been saved', () => {
        expect(loadConversation()).toBeNull()
    })

    it('round-trips a valid conversation, including recommendation movies and variant', () => {
        saveConversation({
            messages: [
                { id: 1, sender: 'user', text: 'something moody' },
                {
                    id: 2,
                    sender: 'bot',
                    text: 'Here you go',
                    movies: [{ id: 42, title: 'Heat', reason: 'tense and precise' }],
                    variant: 'recommendation',
                },
            ],
            history: [{ role: 'user', text: 'something moody' }],
            lastContext: { type: 'recommend', shownIds: [42] },
        })

        const restored = loadConversation()
        expect(restored.messages).toHaveLength(2)
        expect(restored.messages[1].variant).toBe('recommendation')
        expect(restored.messages[1].movies[0].title).toBe('Heat')
        expect(restored.lastContext).toEqual({ type: 'recommend', shownIds: [42] })
    })
})

describe('conversation persistence — malformed/outdated data fails safe', () => {
    it('clears and returns null on corrupted JSON', () => {
        localStorage.setItem('kino:conversation', 'not json{{{')
        expect(loadConversation()).toBeNull()
        expect(localStorage.getItem('kino:conversation')).toBeNull()
    })

    it('rejects data from an old/mismatched schema version', () => {
        localStorage.setItem(
            'kino:conversation',
            JSON.stringify({ version: 1, messages: [], history: [], lastContext: null })
        )
        expect(loadConversation()).toBeNull()
    })

    it('rejects a movies-bearing message with a missing/unknown variant rather than guessing one', () => {
        localStorage.setItem(
            'kino:conversation',
            JSON.stringify({
                version: 3,
                messages: [{ id: 1, sender: 'bot', text: 'x', movies: [{ id: 1, title: 'X' }] }],
                history: [],
                lastContext: null,
            })
        )
        expect(loadConversation()).toBeNull()
    })

    it('rejects a movie missing its id or title rather than dropping just that movie', () => {
        localStorage.setItem(
            'kino:conversation',
            JSON.stringify({
                version: 3,
                messages: [{ id: 1, sender: 'bot', text: 'x', movies: [{ title: 'No Id' }], variant: 'full' }],
                history: [],
                lastContext: null,
            })
        )
        expect(loadConversation()).toBeNull()
    })

    it('normalizes a bad release_date/vote_average/reason on an otherwise-valid movie instead of rejecting it', () => {
        localStorage.setItem(
            'kino:conversation',
            JSON.stringify({
                version: 3,
                messages: [
                    {
                        id: 1,
                        sender: 'bot',
                        text: 'x',
                        movies: [{ id: 1, title: 'Heat', release_date: 1995, vote_average: 'great', reason: {} }],
                        variant: 'full',
                    },
                ],
                history: [],
                lastContext: null,
            })
        )
        const restored = loadConversation()
        expect(restored).not.toBeNull()
        expect(restored.messages[0].movies[0]).toMatchObject({ id: 1, title: 'Heat', release_date: '' })
        expect(restored.messages[0].movies[0].vote_average).toBeUndefined()
        expect(restored.messages[0].movies[0].reason).toBeUndefined()
    })

    it('clears storage after rejecting malformed data (does not just return null and leave it)', () => {
        localStorage.setItem('kino:conversation', JSON.stringify({ version: 999 }))
        loadConversation()
        expect(localStorage.getItem('kino:conversation')).toBeNull()
    })
})

describe('conversation persistence — legacy oversized history entries', () => {
    // an older, validly-shaped version-3 conversation can contain a history string
    // longer than MESSAGE_ENTRY_MAX_LENGTH (that cap was added after some
    // conversations were already saved). Persistence itself has no per-string
    // length rule and shouldn't grow one just for this — restoring must keep
    // working so the user can carry on the conversation; MESSAGE_ENTRY_MAX_LENGTH
    // is enforced separately, only where outbound requests are built
    // (classifyIntent in src/services/gemini.js), not here.
    it('still restores successfully despite an oversized history entry', () => {
        localStorage.setItem(
            'kino:conversation',
            JSON.stringify({
                version: 3,
                messages: [{ id: 1, sender: 'user', text: 'hello' }],
                history: [
                    { role: 'user', text: 'hello' },
                    { role: 'bot', text: 'x'.repeat(MESSAGE_ENTRY_MAX_LENGTH + 500) },
                ],
                lastContext: null,
            })
        )

        const restored = loadConversation()
        expect(restored).not.toBeNull()
        expect(restored.history).toHaveLength(2)
        expect(restored.history[1].text.length).toBeGreaterThan(MESSAGE_ENTRY_MAX_LENGTH)
    })
})

describe('clearConversation', () => {
    it('removes any persisted conversation', () => {
        saveConversation({ messages: [], history: [], lastContext: null })
        clearConversation()
        expect(loadConversation()).toBeNull()
    })
})
