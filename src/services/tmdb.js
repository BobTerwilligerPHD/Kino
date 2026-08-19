const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';

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

export async function searchMovie(query, year) {
  const data = await tmdbFetch('/search/movie', { query, primary_release_year: year })
  let results = data.results ?? []

  if (year && results.length === 0) {
    // the year hint may be slightly off (Gemini misremembering) — retry without it
    const fallback = await tmdbFetch('/search/movie', { query })
    results = fallback.results ?? []
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
