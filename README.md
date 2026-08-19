# Kino

A movie suggestion chatbot that recommends films the way a knowledgeable friend would, instead of just filtering a database. Describe a vibe, say "something like Memento," ask what's trending, or say "more" — Gemini reasons about actual titles to suggest, and TMDB supplies the real data behind them.

**Live: https://kino-ten-wheat.vercel.app/**

## How it works

Every message goes to Gemini first. For a recommendation-style request, Gemini doesn't pick a genre bucket — it names real films it would actually suggest (with a release year, to disambiguate remakes/reused titles), reasoning from mood, director, theme, or "if you liked X." The app then looks each title up on TMDB for the real poster, synopsis, and rating. Trending and top-rated requests skip Gemini's title-picking and just hit TMDB's live lists directly, since those are inherently data, not opinion.

A few specifics:

- Gemini only ever supplies title suggestions — TMDB is the sole source of factual movie data (poster, synopsis, rating)
- "More" asks Gemini for new titles in the same vein rather than repeating a prior list, using conversation history so it knows what's already been shown
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

Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

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
