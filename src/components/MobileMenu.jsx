import { Bookmark, History, Lock } from 'lucide-react'
import SettingsControls from './SettingsControls'
import WatchlistContents from './WatchlistContents'
import AccountControls from './AccountControls'

export default function MobileMenu() {
    return (
        <div className="navbar__panel navbar__panel--mobile">
            <div className="mobile-menu__section">
                <AccountControls />
            </div>

            <div className="mobile-menu__section">
                <p className="navbar__panel-title">
                    <Bookmark size={16} /> Watchlist
                </p>
                <WatchlistContents />
            </div>

            <div className="mobile-menu__section mobile-menu__section--locked">
                <p className="navbar__panel-title">
                    <History size={16} /> Past chats <Lock size={12} />
                </p>
                <p className="watchlist-panel__empty">Coming soon.</p>
            </div>

            <div className="mobile-menu__section">
                <p className="navbar__panel-title">Settings</p>
                <SettingsControls />
            </div>
        </div>
    )
}
