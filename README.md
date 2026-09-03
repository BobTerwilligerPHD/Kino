# Kino

A conversational movie recommendation companion. Kino talks like a
knowledgeable friend — opinionated, limited picks with a reason attached —
rather than presenting a search/database interface. It's a React + Vite
single-page app backed by TMDB (movie data), Gemini (conversational
reasoning), and Supabase (auth + watchlist).

## Stack

- **Frontend**: React 19, Vite, plain CSS (no component/CSS framework)
- **Conversation**: Google Gemini, proxied through a small Vercel serverless
  function (`api/gemini.js`) — the API key never reaches the browser
- **Movie data**: TMDB, called directly from the client
- **Auth / watchlist**: Supabase (Postgres + Auth + RLS)
- **Tests**: Vitest

See [`docs/architecture.md`](docs/architecture.md) for the reasoning behind
several non-obvious design decisions (conversation state, the Gemini
validation boundary, title/year matching, persistence versioning).

## Local development

Copy `.env.example` to `.env` and fill in your own keys (TMDB, Supabase, and
a server-only `GEMINI_API_KEY` — see the comments in `.env.example` for
which variables are client-exposed vs. server-only).

```bash
npm install
npm run dev
```

`npm run dev` runs `npx vercel dev`, which serves the frontend **and**
`/api/gemini` together — this is the command you want for anything that
involves chat, since plain Vite doesn't run serverless functions. It uses the
Vercel CLI via `npx` (not installed as a project dependency); the first run
may prompt you to log in and link the project.

If you only need to iterate on styling/layout and don't need a working chat
request, `npm run dev:vite` runs the plain Vite dev server and starts faster.

Other scripts:

```bash
npm test      # run the Vitest suite
npm run lint  # eslint
npm run build # production build
```

## Deployment

Deployed on Vercel. `api/gemini.js` requires a `GEMINI_API_KEY` environment
variable set in the Vercel project settings (server-side only — do not
prefix it with `VITE_`). `VITE_TMDB_API_KEY`, `VITE_SUPABASE_URL`, and
`VITE_SUPABASE_PUBLISHABLE_KEY` are client-side and safe to expose (the
Supabase key is a publishable key protected by row-level security; TMDB has
no meaningful per-request secrecy requirement for this use case).

## Database

Supabase migrations live in `supabase/migrations/`, applied in order. RLS is
enabled on every table; policies scope all access to `auth.uid()`.
