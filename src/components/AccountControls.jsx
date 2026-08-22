import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import GoogleIcon from './GoogleIcon'

export default function AccountControls() {
    const { user, signIn, signUp, signOut, signInWithGoogle } = useAuth()
    const [mode, setMode] = useState('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setStatus('')
        setBusy(true)
        try {
            if (mode === 'signup') {
                await signUp(email, password)
                setStatus('Check your email to confirm your account.')
            } else {
                await signIn(email, password)
            }
        } catch (err) {
            setError(err.message || 'Something went wrong.')
        } finally {
            setBusy(false)
        }
    }

    async function handleGoogle() {
        setError('')
        try {
            await signInWithGoogle()
        } catch (err) {
            setError(err.message || 'Something went wrong.')
        }
    }

    function toggleMode() {
        setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
        setError('')
        setStatus('')
    }

    if (user) {
        return (
            <div className="navbar__panel-group">
                <span className="navbar__panel-label">Account</span>
                <p className="account-controls__email">{user.email}</p>
                <button type="button" className="account-controls__signout" onClick={signOut}>
                    Sign out
                </button>
            </div>
        )
    }

    return (
        <div className="navbar__panel-group">
            <span className="navbar__panel-label">{mode === 'signin' ? 'Sign in' : 'Create account'}</span>

            <button type="button" className="account-controls__oauth" onClick={handleGoogle}>
                <GoogleIcon size={16} /> Continue with Google
            </button>

            <div className="account-controls__divider">
                <span>or</span>
            </div>

            <form className="account-controls__form" onSubmit={handleSubmit}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="navbar__select"
                    required
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="navbar__select"
                    required
                    minLength={6}
                />
                {error && <p className="account-controls__error">{error}</p>}
                {status && <p className="account-controls__status">{status}</p>}
                <button type="submit" className="account-controls__submit" disabled={busy}>
                    {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
                </button>
            </form>
            <button type="button" className="account-controls__toggle-mode" onClick={toggleMode}>
                {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
        </div>
    )
}
