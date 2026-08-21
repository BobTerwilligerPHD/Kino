import { useState } from 'react'
import { getThemeOverride, setThemeOverride, getCountry, setCountry } from '../lib/settings'
import { COUNTRIES } from '../lib/countries'

const THEME_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
]

export default function SettingsControls() {
    const [theme, setTheme] = useState(getThemeOverride)
    const [country, setCountryState] = useState(getCountry)

    function handleThemeChange(value) {
        setTheme(value)
        setThemeOverride(value)
    }

    function handleCountryChange(e) {
        const code = e.target.value
        setCountryState(code)
        setCountry(code)
    }

    return (
        <>
            <div className="navbar__panel-group">
                <span className="navbar__panel-label" id="theme-toggle-label">Theme</span>
                <div className="theme-toggle" role="group" aria-labelledby="theme-toggle-label">
                    {THEME_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            className={theme === opt.value ? 'active' : ''}
                            aria-pressed={theme === opt.value}
                            onClick={() => handleThemeChange(opt.value)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="navbar__panel-group">
                <label className="navbar__panel-label" htmlFor="streaming-region">Streaming region</label>
                <select id="streaming-region" className="navbar__select" value={country} onChange={handleCountryChange}>
                    {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>
        </>
    )
}
