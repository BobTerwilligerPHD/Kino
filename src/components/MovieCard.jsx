import { useEffect, useState } from 'react'
import { Bookmark, Ticket } from 'lucide-react'
import { posterUrl, providerLogoUrl, getWatchProviders } from '../services/tmdb'
import { getCountry } from '../lib/settings'
import { isSaved, toggleWatchlist } from '../lib/watchlist'
import { isRecentRelease, showtimesSearchUrl } from '../lib/showtimes'
import { useAuth } from '../hooks/useAuth'

export default function MovieCard({ movie }) {
  const { user } = useAuth()
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—'
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'

  const [saved, setSaved] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [providers, setProviders] = useState(null)

  useEffect(() => {
    let cancelled = false
    isSaved(movie.id, user?.id)
      .then((result) => {
        if (!cancelled) setSaved(result)
      })
      .catch(() => {
        if (!cancelled) setSaved(false)
      })
    return () => {
      cancelled = true
    }
  }, [movie.id, user?.id])

  useEffect(() => {
    let cancelled = false
    getWatchProviders(movie.id, getCountry())
      .then((result) => {
        if (!cancelled) setProviders(result)
      })
      .catch(() => {
        if (!cancelled) setProviders(null)
      })
    return () => {
      cancelled = true
    }
  }, [movie.id])

  async function handleToggleSave() {
    try {
      const nowSaved = await toggleWatchlist(movie, user?.id)
      setSaved(nowSaved)
      if (nowSaved) {
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 400)
      }
    } catch (err) {
      console.error('Failed to update watchlist:', err)
    }
  }

  const streamOn = providers?.flatrate ?? null
  const rentOrBuy = !streamOn && (providers?.rent || providers?.buy)

  return (
    <div className="movie-card">
      <div className="movie-card__poster-wrap">
        {movie.poster_path ? (
          <img src={posterUrl(movie.poster_path)} alt={movie.title} className="movie-card__poster" />
        ) : (
          <div className="movie-card__poster-fallback">{movie.title}</div>
        )}
        {movie.vote_average > 0 && <span className="movie-card__rating">★ {rating}</span>}
        <button
          type="button"
          className={`movie-card__save ${saved ? 'movie-card__save--active' : ''} ${justSaved ? 'movie-card__save--pop' : ''}`}
          onClick={handleToggleSave}
          aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'}
          aria-pressed={saved}
        >
          <Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="movie-card__info">
        <p className="movie-card__title">{movie.title}<span className="movie-card__year">{year}</span></p>
        <p className="movie-card__desc">{movie.overview || 'No description available.'}</p>

        {isRecentRelease(movie.release_date) && (
          <a
            href={showtimesSearchUrl(movie.title)}
            target="_blank"
            rel="noopener noreferrer"
            className="movie-card__showtimes"
          >
            <Ticket size={13} /> Find showtimes near you
          </a>
        )}

        {streamOn && (
          <a
            href={providers.link}
            target="_blank"
            rel="noopener noreferrer"
            className="movie-card__providers"
          >
            <span className="movie-card__providers-label">Streaming on</span>
            {streamOn.slice(0, 4).map((p) => (
              <img
                key={p.provider_id}
                src={providerLogoUrl(p.logo_path)}
                alt={p.provider_name}
                title={p.provider_name}
                className="movie-card__provider-logo"
              />
            ))}
            <span className="movie-card__providers-attribution">via JustWatch</span>
          </a>
        )}
        {rentOrBuy && (
          <a
            href={providers.link}
            target="_blank"
            rel="noopener noreferrer"
            className="movie-card__providers"
          >
            <span className="movie-card__providers-label">Available to rent/buy</span>
            {rentOrBuy.slice(0, 4).map((p) => (
              <img
                key={p.provider_id}
                src={providerLogoUrl(p.logo_path)}
                alt={p.provider_name}
                title={p.provider_name}
                className="movie-card__provider-logo"
              />
            ))}
            <span className="movie-card__providers-attribution">via JustWatch</span>
          </a>
        )}
      </div>
    </div>
  )
}
