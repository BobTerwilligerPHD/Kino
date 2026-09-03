import { supabase } from './supabaseClient'

const KEY = 'kino:watchlist'

function readLocal() {
    try {
        return JSON.parse(localStorage.getItem(KEY)) ?? []
    } catch {
        return []
    }
}

function writeLocal(items) {
    localStorage.setItem(KEY, JSON.stringify(items))
}

function toMovie(row) {
    return {
        id: row.movie_id,
        title: row.title,
        poster_path: row.poster_path,
        release_date: row.release_date,
        vote_average: row.vote_average,
    }
}

function toRow(movie, userId) {
    return {
        user_id: userId,
        movie_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path ?? null,
        release_date: movie.release_date ?? null,
        vote_average: movie.vote_average ?? null,
    }
}

export async function getWatchlist(userId) {
    if (!userId) return readLocal()

    const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .order('added_at', { ascending: false })
    if (error) throw error
    return data.map(toMovie)
}

export async function isSaved(movieId, userId) {
    if (!userId) return readLocal().some((m) => m.id === movieId)

    const { data, error } = await supabase
        .from('watchlist')
        .select('movie_id')
        .eq('movie_id', movieId)
        .maybeSingle()
    if (error) throw error
    return !!data
}

export async function addToWatchlist(movie, userId) {
    if (!userId) {
        const items = readLocal()
        if (!items.some((m) => m.id === movie.id)) {
            writeLocal([
                ...items,
                {
                    id: movie.id,
                    title: movie.title,
                    poster_path: movie.poster_path ?? null,
                    release_date: movie.release_date ?? null,
                    vote_average: movie.vote_average ?? null,
                },
            ])
        }
    } else {
        const { error } = await supabase.from('watchlist').insert(toRow(movie, userId))
        if (error && error.code !== '23505') throw error // 23505: unique violation — already saved, ignore
    }
    window.dispatchEvent(new CustomEvent('kino:watchlist-add'))
}

export async function removeFromWatchlist(movieId, userId) {
    if (!userId) {
        writeLocal(readLocal().filter((m) => m.id !== movieId))
        return
    }
    const { error } = await supabase.from('watchlist').delete().eq('movie_id', movieId)
    if (error) throw error
}

export async function toggleWatchlist(movie, userId) {
    const saved = await isSaved(movie.id, userId)
    if (saved) {
        await removeFromWatchlist(movie.id, userId)
        return false
    }
    await addToWatchlist(movie, userId)
    return true
}

export async function migrateLocalWatchlistToCloud(userId) {
    const local = readLocal()
    if (local.length === 0) return

    const { data: existing, error } = await supabase.from('watchlist').select('movie_id')
    if (error) throw error
    const existingIds = new Set((existing ?? []).map((r) => r.movie_id))

    const toInsert = local.filter((m) => !existingIds.has(m.id)).map((m) => toRow(m, userId))
    if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('watchlist').insert(toInsert)
        if (insertError) throw insertError
    }

    localStorage.removeItem(KEY)
}
