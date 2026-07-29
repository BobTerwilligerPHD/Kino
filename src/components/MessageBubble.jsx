import MovieCard from './MovieCard'

export default function MessageBubble({ message }) {
    const isBot = message.sender === 'bot';

    return (
        <div className={isBot ? 'message message--bot' : 'message message--user'}>
            <p>{message.text}</p>

            {message.movies && message.movies.length > 0 && (
                <div className="movie-grid">
                    {message.movies.map((movie) => (
                        <MovieCard key={movie.id} movie={movie} />
                    ))}
            </div>
            )}
        </div>
    )
}



