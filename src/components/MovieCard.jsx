import { posterUrl } from '../services/tmdb'

export default function MovieCard({ movie }) {
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—'
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'

  return (
    <div className="movie-card">
      <div className="movie-card__poster-wrap">
        {movie.poster_path ? (
          <img src={posterUrl(movie.poster_path)} alt={movie.title} className="movie-card__poster" />
        ) : (
          <div className="movie-card__poster-fallback">{movie.title}</div>
        )}
        {movie.vote_average > 0 && <span className="movie-card__rating">★ {rating}</span>}
      </div>
      <div className="movie-card__info">
        <p className="movie-card__title">{movie.title}<span className="movie-card__year">{year}</span></p>
        <p className="movie-card__desc">{movie.overview || 'No description available.'}</p>
      </div>
    </div>
  )
}