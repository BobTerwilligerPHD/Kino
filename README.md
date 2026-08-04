# Kino

A movie suggestion chatbot that understands natural language instead of just being a search box with extra steps. Ask for a genre, describe a vibe, say "something like Memento," ask what's trending, or say "more" — it figures out what you're asking for and pulls real results from TMDB.

**Live: https://kino-ten-wheat.vercel.app/**

## How it works

Every message goes to Gemini first, which classifies it — genre, "similar to X," trending, top rated, "more," or a plain title search. Once it knows the type, it hits the right TMDB endpoint and builds a reply. TMDB always supplies the actual movie data; Gemini's only job is figuring out intent.

A few specifics:

- Genre requests also try to catch a more specific vibe (like "stoner comedy" or "heist thriller") using TMDB's keyword system, not just the broad genre
- "More" remembers what's already been shown and won't repeat results
- Light/dark theme switches automatically based on local time — no toggle, just checks the clock on load

## Tech stack

- **React + Vite** — frontend
- **TMDB API** — movie data, posters, genres, keywords, recommendations
- **Gemini API** (`gemini-3.5-flash-lite`) — intent classification
- **Lucide React** — icons
- Deployed on **Vercel**

## Running it locally

```bash
git clone https://github.com/BobTerwilligerPHD/Kino.git
cd Kino
npm install
```

You'll need your own API keys (both free):

- TMDB: https://www.themoviedb.org/settings/api
- Gemini: https://aistudio.google.com/apikey

Create a `.env` file in the root:
VITE_TMDB_API_KEY=your_key_here
VITE_GEMINI_API_KEY=your_key_here

Then:

```bash
npm run dev
```

## Known limitations

- No accounts or saved history — every session starts fresh
- Runs entirely client-side, so both API keys are visible in the browser bundle
- Free-tier Gemini rate limits mean heavy testing can trip a 429

## What's next

Considering optional accounts with a preference survey to bias suggestions, and letting people upload a Letterboxd export to factor in watch history (their live API isn't open to projects like this). Would need real backend/auth work, so it's parked for now.
