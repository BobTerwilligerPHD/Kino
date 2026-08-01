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

export async function searchMovie(query) {
  const data = await tmdbFetch('/search/movie', { query })
  const results = data.results ?? []
  return results.sort((a, b) => b.popularity - a.popularity)
}

let genreCache = null
export async function getGenreMap() {
    if (genreCache) return genreCache
    const data = await tmdbFetch('/genre/movie/list')
    genreCache = {}
    data.genres.forEach((g) => {
        genreCache[g.name.toLowerCase()] = g.id
    })
    return genreCache
}

export async function discoverByGenre(genreId){
    const data = await tmdbFetch('/discover/movie', {
        with_genres: genreId,
        sort_by: 'popularity.desc',
        'vote_count.gte': 100,
    })
    return data.results ?? []
}

export async function getRecommendations(movieId){
    const data = await tmdbFetch(`/movie/${movieId}/recommendations`)
    return data.results ?? []
}

export async function getTrending(){
    const data = await tmdbFetch('/trending/movie/week')
    return data.results ?? []
}

export async function getTopRated() {
    const data = await tmdbFetch('/movie/top_rated')
    return data.results ?? []
}
