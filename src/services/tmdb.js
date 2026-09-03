const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const LOGO_BASE = 'https://image.tmdb.org/t/p/w45';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const REQUEST_TIMEOUT_MS = 10_000

async function tmdbFetch(path, params = {}, signal) {
    const url = new URL(BASE_URL + path)
    url.searchParams.set('api_key', API_KEY);
    url.searchParams.set('include_adult', 'false')
    Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value)
    })

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

    const res = await fetch(url.toString(), { signal: combinedSignal })
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
        watchProvidersCache.delete(cacheKey) // don't cache a failure — allow retry
        throw err
      })
    watchProvidersCache.set(cacheKey, request)
  }
  return watchProvidersCache.get(cacheKey)
}

export async function searchMovie(query, year, signal) {
  const data = await tmdbFetch('/search/movie', { query, primary_release_year: year }, signal)
  let results = data.results ?? []

  if (year && results.length === 0) {
    // year hint may be off by one — retry unfiltered, keep only results still close
    const fallback = await tmdbFetch('/search/movie', { query }, signal)
    results = (fallback.results ?? []).filter((m) => {
      const movieYear = m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : null
      return movieYear && Math.abs(movieYear - year) <= 1
    })
  }

  return results.sort((a, b) => b.popularity - a.popularity)
}

export async function getTrending(page = 1, signal){
    const data = await tmdbFetch('/trending/movie/week', { page }, signal)
    return data.results ?? []
}

export async function getTopRated(page = 1, signal) {
    const data = await tmdbFetch('/movie/top_rated', { page }, signal)
    return data.results ?? []
}
