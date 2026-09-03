import MovieCard from './MovieCard'

export default function MessageBubble({ message }) {
    const isBot = message.sender === 'bot';
    // variant is set explicitly by whoever built the message — never inferred
    // here from movie fields (see docs/architecture.md, "Persistence")
    const variant = message.variant ?? 'full'

    return (
        <div className={isBot ? 'message message--bot' : 'message message--user'} role={message.error ? 'alert' : undefined}>
            <p>{message.text}</p>

            {message.movies && message.movies.length > 0 && (
                <div className="movie-grid">
                    {message.movies.map((movie) => (
                        <MovieCard key={movie.id} movie={movie} variant={variant} />
                    ))}
            </div>
            )}
        </div>
    )
}
