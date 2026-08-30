import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AuthContext } from './authContextInstance'
import { migrateLocalWatchlistToCloud } from '../lib/watchlist'

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null)
            if (event === 'SIGNED_IN' && session?.user) {
                migrateLocalWatchlistToCloud(session.user.id).catch((err) => {
                    console.error('Watchlist migration failed:', err)
                })
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    async function signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
    }

    async function signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
    }

    async function signOut() {
        await supabase.auth.signOut()
    }

    async function signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        })
        if (error) throw error
    }

    return (
        <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, signInWithGoogle }}>
            {children}
        </AuthContext.Provider>
    )
}
