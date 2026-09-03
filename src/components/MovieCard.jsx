import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Ticket } from 'lucide-react'
import { posterUrl, providerLogoUrl, getWatchProviders } from '../services/tmdb'
import { getCountry } from '../lib/settings'
import { isSaved, toggleWatchlist } from '../lib/watchlist'
import { isRecentRelease, showtimesSearchUrl } from '../lib/showtimes'
import { useAuth } from '../hooks/useAuth'

function providerList(result, keys) {
  if (!result) return []
  return keys.flatMap((key) => (Array.isArray(result[key]) ? result[key] : []))
}

// TMDB can return an empty array for a present category — that must not count
// as "available"
function hasAvailability(result) {
  return providerList(result, ['flatrate', 'free', 'ads', 'rent', 'buy']).length > 0
}

function ProviderRow({ label, list, link }) {
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="movie-card__providers">
      <span className="movie-card__providers-label">{label}</span>
      {list.slice(0, 4).map((p) => (
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
  )
}

export default function MovieCard({ movie, variant = 'full' }) {
  const { user } = useAuth()
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—'
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'
  const isCompact = variant === 'recommendation'

  const [saved, setSaved] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [providers, setProviders] = useState(null)
  // idle | loading | loaded | unavailable | failed
  const [providerState, setProviderState] = useState(isCompact ? 'idle' : 'loading')

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

  // guards against a stale (previous-region, or superseded) request resolving
  // late and overwriting a newer result — see docs/architecture.md
  const requestIdRef = useRef(0)

  const fetchProviders = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setProviderState('loading')
    setProviders(null)
    try {
      const result = await getWatchProviders(movie.id, getCountry())
      if (requestIdRef.current !== requestId) return
      setProviders(result)
      setProviderState(hasAvailability(result) ? 'loaded' : 'unavailable')
    } catch {
      if (requestIdRef.current === requestId) setProviderState('failed')
    }
  }, [movie.id])

  // full-detail cards fetch on mount; compact cards wait for "Where to watch"
  useEffect(() => {
    if (isCompact) return
    let cancelled = false
    const requestId = ++requestIdRef.current
    getWatchProviders(movie.id, getCountry())
      .then((result) => {
        if (cancelled || requestIdRef.current !== requestId) return
        setProviders(result)
        setProviderState(hasAvailability(result) ? 'loaded' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled && requestIdRef.current === requestId) setProviderState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [movie.id, isCompact])

  useEffect(() => {
    function handleCountryChange() {
      requestIdRef.current++
      if (providerState === 'idle') return
      setProviders(null)
      if (isCompact && providerState !== 'loading') {
        setProviderState('idle')
      } else {
        fetchProviders()
      }
    }
    window.addEventListener('kino:country-change', handleCountryChange)
    return () => window.removeEventListener('kino:country-change', handleCountryChange)
  }, [isCompact, providerState, fetchProviders])

  async function handleToggleSave() {
    setSaveError(false)
    try {
      const nowSaved = await toggleWatchlist(movie, user?.id)
      setSaved(nowSaved)
      if (nowSaved) {
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 400)
      }
    } catch (err) {
      console.error('Failed to update watchlist:', err)
      setSaveError(true)
    }
  }

  const streamOn = providerList(providers, ['flatrate', 'free', 'ads'])
  const rentOrBuy = streamOn.length === 0 ? providerList(providers, ['rent', 'buy']) : []

  // avoids an orphaned "At home" heading when a full-detail card hasn't
  // resolved to anything showable yet
  const showHomeSection = isCompact || providerState === 'loaded'

  return (
    <div className={`movie-card ${isCompact ? 'movie-card--compact' : ''}`}>
      <div className="movie-card__poster-wrap">
        {movie.poster_path ? (
          <img src={posterUrl(movie.poster_path)} alt={movie.title} className="movie-card__poster" />
        ) : (
          <div className="movie-card__poster-fallback">{movie.title}</div>
        )}
        {!isCompact && movie.vote_average > 0 && <span className="movie-card__rating">★ {rating}</span>}
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
        {saveError && (
          <p className="movie-card__save-error" role="alert">Couldn't save — try again.</p>
        )}
        {movie.reason && <p className="movie-card__reason">{movie.reason}</p>}
        {!isCompact && <p className="movie-card__desc">{movie.overview || 'No description available.'}</p>}

        {isRecentRelease(movie.release_date) && (
          <>
            <span className="movie-card__group-label">In cinemas</span>
            <a
              href={showtimesSearchUrl(movie.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="movie-card__showtimes"
            >
              <Ticket size={13} /> Find showtimes near you
            </a>
          </>
        )}

        {showHomeSection && <span className="movie-card__group-label">At home</span>}

        {isCompact && providerState === 'idle' && (
          <button type="button" className="movie-card__where-to-watch" onClick={fetchProviders}>
            Where to watch
          </button>
        )}
        {isCompact && providerState === 'loading' && <p className="movie-card__provider-status">Checking…</p>}
        {isCompact && providerState === 'failed' && (
          <button type="button" className="movie-card__where-to-watch" onClick={fetchProviders}>
            Couldn't check — try again
          </button>
        )}
        {isCompact && providerState === 'unavailable' && (
          <p className="movie-card__provider-status">Not currently available to stream.</p>
        )}

        {providerState === 'loaded' && streamOn.length > 0 && (
          <ProviderRow label="Streaming on" list={streamOn} link={providers.link} />
        )}
        {providerState === 'loaded' && rentOrBuy.length > 0 && (
          <ProviderRow label="Available to rent/buy" list={rentOrBuy} link={providers.link} />
        )}
      </div>
    </div>
  )
}
