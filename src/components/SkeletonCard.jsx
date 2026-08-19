export default function SkeletonCard({ delay = 0 }) {
    const style = { animationDelay: `${delay}s` }

    return (
        <div className="skeleton-card">
            <div className="skeleton-card__poster" style={style} />
            <div className="skeleton-card__lines">
                <div className="skeleton-card__line skeleton-card__line--title" style={style} />
                <div className="skeleton-card__line skeleton-card__line--w1" style={style} />
                <div className="skeleton-card__line skeleton-card__line--w2" style={style} />
                <div className="skeleton-card__line skeleton-card__line--w3" style={style} />
            </div>
        </div>
    )
}
