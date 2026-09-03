const THEME_KEY = 'kino:theme'
const COUNTRY_KEY = 'kino:country'

export function getThemeOverride() {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

export function setThemeOverride(value) {
    if (value === 'auto') {
        localStorage.removeItem(THEME_KEY)
    } else {
        localStorage.setItem(THEME_KEY, value)
    }
    applyTheme()
}

export function applyTheme() {
    const override = getThemeOverride()
    const theme = override === 'auto' ? autoTheme() : override
    document.documentElement.setAttribute('data-theme', theme)
}

function autoTheme() {
    const hour = new Date().getHours()
    return hour >= 6 && hour < 18 ? 'light' : 'dark'
}

export function detectCountry() {
    try {
        const region = new Intl.Locale(navigator.language).maximize().region
        if (region) return region
    } catch {
        // Intl.Locale unsupported/unparsable — fall through to the manual parse
    }
    const parts = (navigator.language || 'en-US').split('-')
    return parts[1] ? parts[1].toUpperCase() : 'US'
}

export function getCountry() {
    return localStorage.getItem(COUNTRY_KEY) || detectCountry()
}

export function setCountry(code) {
    localStorage.setItem(COUNTRY_KEY, code)
    window.dispatchEvent(new CustomEvent('kino:country-change'))
}
