import WatchlistContents from './WatchlistContents'

export default function WatchlistPanel() {
    return (
        <div className="navbar__panel">
            <p className="navbar__panel-title">Watchlist</p>
            <WatchlistContents />
        </div>
    )
}
