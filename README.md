# TeeDrop - Tee Time Alert System

Mobile-first web app that monitors Seattle-area golf course booking sites and alerts users when matching tee times become available.

## Architecture

```
Mini PC Scraper → POST /api/ingest → Supabase DB → Dashboard + Alerts (Email/SMS)
```

- **Frontend**: Next.js 14 + Tailwind CSS, deployed on Vercel
- **Database**: Supabase (PostgreSQL via transaction pooler)
- **Auth**: NextAuth.js with credentials provider
- **SMS**: Twilio
- **Email**: Resend
- **Scraper**: Runs on Mini PC (separate from this repo), pushes data via ingest API

## Key URLs

- **Production**: https://teedrop-bryceclausen-3337s-projects.vercel.app
- **Vercel Project**: prj_X5i27CtxQBvcspL3wj9ixjBU6OyW
- **Team**: team_W855tVrNvgHBxfd2f5h7szyq

## Environment Variables (Vercel)

Required:
- `DATABASE_URL` - Supabase transaction pooler connection string (port 6543)
- `NEXTAUTH_SECRET` - Session encryption key

Optional (for alerts):
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - SMS alerts
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` - Email alerts
- `CRON_SECRET` - Protects the cron endpoint (default: teedrop-cron-2026)
- `INGEST_SECRET` - Protects the ingest endpoint (default: teedrop-ingest-2026)

## Routes

### Pages
- `/` - Landing page with tier pricing
- `/signup` - Account creation (confirm password)
- `/login` - Sign in
- `/onboarding` - 4-step wizard (courses → dates → time → alerts)
- `/dashboard` - View matching tee times, grouped by date
- `/settings` - Configure courses, dates, time, players, alert preferences
- `/account` - Profile, password change, alert history, test alerts

### API
- `POST /api/signup` - Create account
- `GET/POST /api/auth/[...nextauth]` - NextAuth
- `GET/PUT /api/settings` - User preferences
- `GET/PUT/DELETE /api/account` - Profile management
- `GET /api/times` - Filtered tee times for dashboard
- `POST /api/ingest?secret=...` - Scraper pushes tee time data
- `GET /api/cron/scrape?secret=...` - Cleanup + seed (runs every 30 min)
- `GET /api/alerts` - Alert history
- `POST /api/alerts/test` - Send test email/SMS
- `GET /api/setup?key=teedrop-setup-2026` - Create DB tables

## Tier System

| Feature | Free | Premium ($4.99/mo) | All Access ($9.99/mo) |
|---------|------|-------------------|----------------------|
| Courses | 1 | 3 | 10 |
| Alerts | Email only | Email + SMS | Email + SMS |
| Time window | 2hr | 4hr | 24hr |

## Courses Monitored

City of Seattle (Chronogolf): Jackson Park, Jefferson Park, West Seattle, Interbay
Eastside (GolfNow): Bellevue, Willows Run, Newcastle
South Sound (GolfNow/Chronogolf): Druids Glen, Washington National, Chambers Bay

## Deploy

```bash
npm install
vercel deploy --prod --token=<TOKEN>
```

After deploy, hit `/api/setup?key=teedrop-setup-2026` to create/update DB tables.

## Development

```bash
npm install
npm run dev
```

Requires `DATABASE_URL` in a `.env.local` file.
