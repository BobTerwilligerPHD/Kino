import { useState } from 'react'
import { X } from 'lucide-react'
import { posterUrl } from '../services/tmdb'
import { getWatchlist, removeFromWatchlist } from '../lib/watchlist'

export default function WatchlistContents() {
    const [items, setItems] = useState(getWatchlist)

    function handleRemove(id) {
        removeFromWatchlist(id)
        setItems(getWatchlist())
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
