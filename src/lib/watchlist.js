const KEY = 'kino:watchlist'

function readAll() {
    try {
        return JSON.parse(localStorage.getItem(KEY)) ?? []
    } catch {
        return []
    }
}

function writeAll(items) {
    localStorage.setItem(KEY, JSON.stringify(items))
}

export function getWatchlist() {
    return readAll()
}

export function isSaved(movieId) {
    return readAll().some((m) => m.id === movieId)
}

export function addToWatchlist(movie) {
    const items = readAll()
    if (items.some((m) => m.id === movie.id)) return
    writeAll([
        ...items,
        {
            id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: movie.release_date,
            vote_average: movie.vote_average,
        },
    ])
    window.dispatchEvent(new CustomEvent('kino:watchlist-add'))
}

export function removeFromWatchlist(movieId) {
    writeAll(readAll().filter((m) => m.id !== movieId))
}

export function toggleWatchlist(movie) {
    if (isSaved(movie.id)) {
        removeFromWatchlist(movie.id)
        return false
    }
    addToWatchlist(movie)
    return true
}
