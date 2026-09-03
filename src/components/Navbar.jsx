import { useEffect, useRef, useState } from 'react'
import { Settings, Bookmark, History, Lock, Menu, User, SquarePen } from 'lucide-react'
import SettingsPanel from './SettingsPanel'
import WatchlistPanel from './WatchlistPanel'
import AccountPanel from './AccountPanel'
import MobileMenu from './MobileMenu'
import { useAuth } from '../hooks/useAuth'

export default function Navbar() {
    const { user } = useAuth()
    const [openPanel, setOpenPanel] = useState(null)
    const [watchlistPop, setWatchlistPop] = useState(false)
    const navRef = useRef(null)

    useEffect(() => {
        function handleClickOutside(e) {
            if (navRef.current && !navRef.current.contains(e.target)) {
                setOpenPanel(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        function handleWatchlistAdd() {
            setWatchlistPop(true)
            setTimeout(() => setWatchlistPop(false), 400)
        }
        window.addEventListener('kino:watchlist-add', handleWatchlistAdd)
        return () => window.removeEventListener('kino:watchlist-add', handleWatchlistAdd)
    }, [])

    function toggle(panel) {
        setOpenPanel((prev) => (prev === panel ? null : panel))
    }

    function startNewChat() {
        window.dispatchEvent(new CustomEvent('kino:new-chat'))
        setOpenPanel(null)
    }

    return (
        <div className="navbar" ref={navRef}>
            <div className="app__header">
                <h1>Kino</h1>
                <p>Movie Suggestion Engine</p>
            </div>

            <div className="navbar__actions navbar__actions--desktop">
                <button
                    type="button"
                    className="navbar__icon-btn"
                    onClick={startNewChat}
                    aria-label="Start new conversation"
                >
                    <SquarePen size={18} />
                </button>

                <button
                    type="button"
                    className={`navbar__icon-btn ${openPanel === 'watchlist' ? 'navbar__icon-btn--active' : ''} ${watchlistPop ? 'navbar__icon-btn--pop' : ''}`}
                    onClick={() => toggle('watchlist')}
                    aria-label="Watchlist"
                >
                    <Bookmark size={18} fill={watchlistPop ? 'currentColor' : 'none'} />
                </button>

                <button
                    type="button"
                    className="navbar__icon-btn navbar__icon-btn--locked"
                    aria-label="Past chats (coming soon)"
                    aria-disabled="true"
                >
                    <History size={18} />
                    <span className="navbar__lock-badge">
                        <Lock size={10} />
                    </span>
                </button>

                <button
                    type="button"
                    className={`navbar__icon-btn ${openPanel === 'settings' ? 'navbar__icon-btn--active' : ''}`}
                    onClick={() => toggle('settings')}
                    aria-label="Settings"
                >
                    <Settings size={18} />
                </button>

                <button
                    type="button"
                    className={`navbar__icon-btn ${openPanel === 'account' ? 'navbar__icon-btn--active' : ''}`}
                    onClick={() => toggle('account')}
                    aria-label="Account"
                >
                    <User size={18} fill={user ? 'currentColor' : 'none'} />
                </button>

                {openPanel === 'watchlist' && <WatchlistPanel />}
                {openPanel === 'settings' && <SettingsPanel />}
                {openPanel === 'account' && <AccountPanel />}
            </div>

            <div className="navbar__actions navbar__actions--mobile">
                <button
                    type="button"
                    className="navbar__icon-btn"
                    onClick={startNewChat}
                    aria-label="Start new conversation"
                >
                    <SquarePen size={20} />
                </button>

                <button
                    type="button"
                    className={`navbar__icon-btn ${openPanel === 'mobile-menu' ? 'navbar__icon-btn--active' : ''} ${watchlistPop ? 'navbar__icon-btn--pop' : ''}`}
                    onClick={() => toggle('mobile-menu')}
                    aria-label="Menu"
                >
                    <Menu size={20} />
                </button>

                {openPanel === 'mobile-menu' && <MobileMenu />}
            </div>
        </div>
    )
}
