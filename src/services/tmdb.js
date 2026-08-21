const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const LOGO_BASE = 'https://image.tmdb.org/t/p/w45';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

async function tmdbFetch(path, params = {}) {
    const url = new URL(BASE_URL + path)
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('include_adult', 'false')
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value)

 })

    const res = await fetch(url.toString())
    if (!res.ok){
        throw new Error(`TMDB request failed (${res.status}): ${path}`)
    }
    return res.json()
}

export function posterUrl(path){
    return path ? `${IMG_BASE}${path}` : null
}

export function providerLogoUrl(path){
    return path ? `${LOGO_BASE}${path}` : null
}

const watchProvidersCache = new Map()

export function getWatchProviders(movieId, countryCode) {
  const cacheKey = `${movieId}:${countryCode}`
  if (!watchProvidersCache.has(cacheKey)) {
    const request = tmdbFetch(`/movie/${movieId}/watch/providers`)
      .then((data) => data.results?.[countryCode] ?? null)
      .catch((err) => {
        watchProvidersCache.delete(cacheKey) // don't cache failures — allow retry on next mount
        throw err
      })
    watchProvidersCache.set(cacheKey, request)
  }
  return watchProvidersCache.get(cacheKey)
}

export async function searchMovie(query, year) {
  const data = await tmdbFetch('/search/movie', { query, primary_release_year: year })
  let results = data.results ?? []

  if (year && results.length === 0) {
    // the year hint may be slightly off (Gemini misremembering by a year) — retry without
    // the filter, but only trust results still close to the requested year. Without this
    // check a hallucinated/wrong year would silently fall through to an unrelated film.
    const fallback = await tmdbFetch('/search/movie', { query })
    results = (fallback.results ?? []).filter((m) => {
      const movieYear = m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : null
      return movieYear && Math.abs(movieYear - year) <= 1
    })
  }

  return results.sort((a, b) => b.popularity - a.popularity)
}

export async function getTrending(page = 1){
    const data = await tmdbFetch('/trending/movie/week', { page })
    return data.results ?? []
}

export async function getTopRated(page = 1) {
    const data = await tmdbFetch('/movie/top_rated', { page })
    return data.results ?? []
}
