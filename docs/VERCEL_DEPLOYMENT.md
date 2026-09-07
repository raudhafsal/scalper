# Vercel Deployment

The Next.js app (everything at the repo root — `app/`, `lib/`, `components/`,
etc.) deploys to Vercel as-is. The trading engine does **not** go to Vercel
— see `docs/VPS_TRADING_ENGINE.md`.

## 1. Push the repo somewhere Vercel can see it

Vercel deploys from a Git provider (GitHub/GitLab/Bitbucket) or via the
Vercel CLI directly from your machine. Either works; this doc covers both.

### Option A — Git-connected project

1. Push this repository to a Git provider.
2. In the Vercel dashboard: **Add New → Project**, import the repo.
3. Framework preset should auto-detect as **Next.js**. Leave the root
   directory as `.` (the repo root) — do not point it at `trading-engine/`.

### Option B — CLI deploy without Git

```bash
npm install -g vercel
vercel login
vercel   # first run links/creates the project and deploys a preview
vercel --prod
```

## 2. Environment variables

In **Project Settings → Environment Variables**, add (for both
"Production" and "Preview" environments, and "Development" if you use
`vercel dev`):

| Variable | Value | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service-role key | **No — server only** |
| `TRADING_ENGINE_URL` | `https://your-vps-host:8088` (or behind your own reverse proxy) | No |
| `TRADING_ENGINE_API_KEY` | same shared secret as the engine's `ENGINE_API_KEY` | No |
| `MT5_BRIDGE_SIGNING_SECRET` | a long random string (`openssl rand -hex 32`) | No |
| `NEXT_PUBLIC_APP_URL` | your deployed app URL (used in emails/links) | Yes |

Only variables prefixed `NEXT_PUBLIC_` are ever bundled into
browser-shipped JavaScript — this is a Next.js guarantee, and it's why
`SUPABASE_SERVICE_ROLE_KEY`, `TRADING_ENGINE_API_KEY`, and
`MT5_BRIDGE_SIGNING_SECRET` deliberately do not have that prefix. Do not
rename them to add it.

Generate `MT5_BRIDGE_SIGNING_SECRET` once and use the **same value** in
both the Vercel env and nowhere else — it's used server-side only, to
verify bridge tokens (`lib/security/bridge-token.ts`).

## 3. Deploy

Push to your connected branch (Option A) or run `vercel --prod` (Option B).
Vercel runs `npm install` then `next build` automatically.

## 4. Post-deploy checklist

- Visit `/login`, sign up, confirm you land on `/dashboard` with a
  `⚪ STOPPED` badge and default (empty) account/signal/trade lists.
- Confirm `/manifest.json` and `/sw.js` are served (PWA install prompt
  should appear in supported browsers after a visit or two).
- In Supabase → Authentication → URL Configuration, make sure the Site URL
  and Redirect URLs point at your actual Vercel domain, not
  `localhost:3000`, or password-reset emails will link to the wrong place.
- Set `TRADING_ENGINE_URL` only once your VPS trading engine is actually
  running (`docs/VPS_TRADING_ENGINE.md`) — until then, Start/Stop buttons
  will still work (they write to Supabase, which is the source of truth)
  but the "engine health" ping in the preflight check will report the
  engine as unreachable, which is expected and safe.

## Known limitations on Vercel (documented, not hidden)

- **Rate limiting** (`lib/rate-limit.ts`) is an in-memory fixed window. On
  Vercel, each serverless invocation can land on a different underlying
  instance, so this limiter is a best-effort deterrent against accidental
  hot loops, not a hard multi-instance guarantee. For strict rate limiting
  at scale, put a real distributed limiter (e.g. Upstash Redis) in front —
  the interface in `lib/rate-limit.ts` is intentionally small to make that
  swap easy later.
- API routes that read the auth cookie or `request.url`
  (`/api/analytics`, `/api/ea/commands`, `/api/risk`, `/api/signals`,
  `/api/strategy`, `/api/trades`, etc.) are necessarily dynamic
  (server-rendered per request) — this is correct and expected; Next.js
  logs internal "Dynamic server usage" diagnostics for these during build,
  which are not build failures.
- Vercel functions have a max execution duration; nothing in this app's API
  routes does long-running work (the actual trading loop lives on your
  VPS), so this should never be a concern in normal operation.
