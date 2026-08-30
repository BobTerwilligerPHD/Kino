import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { posterUrl } from '../services/tmdb'
import { getWatchlist, removeFromWatchlist } from '../lib/watchlist'
import { useAuth } from '../hooks/useAuth'

export default function WatchlistContents() {
    const { user } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        getWatchlist(user?.id)
            .then((result) => {
                if (!cancelled) {
                    setItems(result)
                    setLoading(false)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setItems([])
                    setLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [user?.id])

    async function handleRemove(id) {
        await removeFromWatchlist(id, user?.id)
        setItems((prev) => prev.filter((m) => m.id !== id))
    }

    if (loading) {
        return <p className="watchlist-panel__empty">Loading…</p>
    }

    if (items.length === 0) {
        return <p className="watchlist-panel__empty">Nothing saved yet — save a movie to build your watchlist.</p>
    }

    return (
        <ul className="watchlist-list">
            {items.map((movie) => (
                <li key={movie.id} className="watchlist-list__item">
                    {movie.poster_path ? (
                        <img src={posterUrl(movie.poster_path)} alt={movie.title} className="watchlist-list__poster" />
                    ) : (
                        <div className="watchlist-list__poster watchlist-list__poster--fallback" />
                    )}
                    <span className="watchlist-list__title">
                        {movie.title}
                        {movie.release_date && <span className="movie-card__year">{movie.release_date.slice(0, 4)}</span>}
                    </span>
                    <button
                        type="button"
                        className="watchlist-list__remove"
                        onClick={() => handleRemove(movie.id)}
                        aria-label={`Remove ${movie.title} from watchlist`}
                    >
                        <X size={14} />
                    </button>
                </li>
            ))}
        </ul>
    )
}
