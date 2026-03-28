# CLAUDE.md - Project Instructions for Claude Code

## Project Overview
TeeDrop is a tee time alert system for Seattle golf courses. The core value prop is ALERTS — notifying users the moment a matching tee time opens up so they can book it before anyone else.

## Tech Stack
- Next.js 14.2.35 (App Router)
- Tailwind CSS 3
- Prisma 5.22.0 with PostgreSQL (Supabase)
- NextAuth.js 4 (credentials provider)
- Twilio (SMS alerts)
- Resend (email alerts)
- Deployed on Vercel

## Key Commands
- `npm run dev` — local dev server
- `npm run build` — production build (runs prisma generate first)
- `vercel deploy --prod` — deploy to production

## Database
- Supabase PostgreSQL via transaction pooler (port 6543)
- Connection string uses URL-encoded password (%40%40 for @@)
- Schema is in prisma/schema.prisma
- Tables can be created/updated via /api/setup?key=teedrop-setup-2026

## Architecture Decisions
- Scraping happens on a separate Mini PC (not on Vercel) because GolfNow and Chronogolf block server-side requests
- The Mini PC scraper POSTs data to /api/ingest
- Alerts are sent from the ingest API when NEW tee times arrive
- Free tier = email alerts only, Premium+ = email + SMS
- Quiet hours prevent alerts during nighttime (Pacific timezone)

## File Structure
- app/page.js — Landing page
- app/onboarding/page.js — 4-step setup wizard for new users
- app/dashboard/page.js — Main view: tee times with Book Now links
- app/settings/page.js — Preferences: alerts, courses, dates, time, players
- app/account/page.js — Profile, password, alert history, test alerts
- lib/alerts.js — SMS (Twilio) + Email (Resend) alert functions
- lib/courses.js — Course config with booking URLs
- lib/prisma.js — Prisma singleton for serverless

## Important Notes
- Never commit .env files
- The Vercel deploy token for Chester is stored in .env.local as VERCEL_TOKEN
- Deployment Protection must be disabled in Vercel dashboard (Settings > Deployment Protection) — it re-enables on some deploys
- Course names in the ingest API must match exactly what's in lib/courses.js
- The Supabase password has @@ which must be URL-encoded as %40%40
