const RECENT_WINDOW_DAYS = 60

export function isRecentRelease(releaseDate) {
    if (!releaseDate) return false
    const released = new Date(releaseDate)
    const daysSince = (Date.now() - released.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince >= 0 && daysSince <= RECENT_WINDOW_DAYS
}

export function showtimesSearchUrl(title) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${title} showtimes near me`)}`
}
