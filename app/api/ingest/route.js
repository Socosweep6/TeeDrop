import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { sendSmsAlert, sendEmailAlert, matchesUserPreferences, isQuietHours } from '../../../lib/alerts';
import { getBookingUrl } from '../../../lib/courses';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/ingest - Chester's scraper pushes tee times here
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== (process.env.INGEST_SECRET || 'teedrop-ingest-2026')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const teeTimes = body.teeTimes || body.tee_times || body.results || body;

    if (!Array.isArray(teeTimes) || teeTimes.length === 0) {
      return NextResponse.json({ error: 'No tee times provided. Send { teeTimes: [...] }' }, { status: 400 });
    }

    let inserted = 0;
    let skipped = 0;
    const newTeeTimes = []; // Truly new records, with their DB ids for alert dedup

    for (const tt of teeTimes) {
      if (!tt.course || !tt.date || !tt.time) {
        skipped++;
        continue;
      }

      const bookingUrl = tt.booking_url || tt.bookingUrl || getBookingUrl(tt.course, tt.date);

      try {
        const existing = await prisma.teeTime.findFirst({
          where: { course: tt.course, date: tt.date, time: tt.time },
        });

        if (existing) {
          await prisma.teeTime.update({
            where: { id: existing.id },
            data: {
              players: tt.players || existing.players,
              price: tt.price || existing.price,
              holes: tt.holes || existing.holes,
              bookingUrl: bookingUrl || existing.bookingUrl,
              source: tt.source || existing.source,
              scrapedAt: new Date(),
            },
          });
          inserted++;
        } else {
          const created = await prisma.teeTime.create({
            data: {
              course: tt.course,
              date: tt.date,
              time: tt.time,
              players: tt.players || 4,
              price: tt.price || null,
              holes: tt.holes || 18,
              bookingUrl: bookingUrl || null,
              source: tt.source || 'scraper',
              scrapedAt: new Date(),
            },
          });
          inserted++;
          // Track new tee times with their DB id for alert deduplication
          newTeeTimes.push({ ...tt, bookingUrl, id: created.id });
        }
      } catch (e) {
        console.error(`Ingest error for ${tt.course} ${tt.date} ${tt.time}:`, e.message);
        skipped++;
      }
    }

    // Send alerts for NEW tee times only
    let alertsSent = 0;
    if (newTeeTimes.length > 0) {
      try {
        const allNewIds = newTeeTimes.map(tt => tt.id).filter(Boolean);

        // Batch queries: users + existing alerts in parallel (2 queries, not 2N)
        const [usersWithAlerts, existingAlerts] = await Promise.all([
          prisma.user.findMany({
            where: { settings: { OR: [{ alertEmail: true }, { alertSms: true }] } },
            include: { settings: true },
          }),
          allNewIds.length > 0
            ? prisma.alert.findMany({
                where: { teeTimeId: { in: allNewIds } },
                select: { userId: true, teeTimeId: true, method: true },
              })
            : Promise.resolve([]),
        ]);

        // Build dedup set for O(1) lookups
        const alreadySentSet = new Set(existingAlerts.map(a => `${a.userId}:${a.teeTimeId}:${a.method}`));
        const alertsToCreate = [];

        for (const user of usersWithAlerts) {
          if (!user.settings) continue;
          if (isQuietHours(user.settings)) continue;
          const freq = user.settings.alertFrequency || 'instant';
          if (freq !== 'instant') continue;

          const matching = newTeeTimes.filter(tt => matchesUserPreferences(tt, user.settings));
          if (matching.length === 0) continue;

          // Email alert
          if (user.settings.alertEmail) {
            const email = user.settings.alertEmailAddress || user.email;
            if (email) {
              const toAlert = matching
                .filter(tt => tt.id && !alreadySentSet.has(`${user.id}:${tt.id}:email`))
                .slice(0, 10);
              if (toAlert.length > 0) {
                const ok = await sendEmailAlert(email, toAlert);
                if (ok) {
                  alertsSent++;
                  toAlert.forEach(tt => alertsToCreate.push({ userId: user.id, teeTimeId: tt.id, method: 'email' }));
                }
              }
            }
          }

          // SMS alert (premium+ only)
          if (user.settings.alertSms && user.phone && user.tier !== 'free') {
            const toAlert = matching
              .filter(tt => tt.id && !alreadySentSet.has(`${user.id}:${tt.id}:sms`))
              .slice(0, 5);
            if (toAlert.length > 0) {
              const ok = await sendSmsAlert(user.phone, toAlert);
              if (ok) {
                alertsSent++;
                toAlert.forEach(tt => alertsToCreate.push({ userId: user.id, teeTimeId: tt.id, method: 'sms' }));
              }
            }
          }
        }

        // Batch save all alert records in one query
        if (alertsToCreate.length > 0) {
          await prisma.alert.createMany({ data: alertsToCreate, skipDuplicates: true });
        }
      } catch (e) {
        console.error('Alert check error:', e.message);
      }
    }

    return NextResponse.json({
      message: 'Ingest complete',
      received: teeTimes.length,
      inserted,
      newForAlerts: newTeeTimes.length,
      skipped,
      alertsSent,
    });
  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json(
      { error: 'Ingest failed', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/ingest - clear old tee times
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== (process.env.INGEST_SECRET || 'teedrop-ingest-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await prisma.teeTime.deleteMany({
      where: { date: { lt: today } },
    });
    return NextResponse.json({ message: 'Cleanup complete', deleted: result.count });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/ingest - show expected format
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== (process.env.INGEST_SECRET || 'teedrop-ingest-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const count = await prisma.teeTime.count();

  return NextResponse.json({
    message: 'TeeDrop Ingest API',
    teeTimesInDb: count,
    usage: 'POST /api/ingest?secret=<secret>',
    format: {
      teeTimes: [{
        course: 'Jackson Park Golf Course',
        date: '2026-04-05',
        time: '7:30 AM',
        players: 4,
        price: '$45.00',
        holes: 18,
        booking_url: 'https://...',
        source: 'chronogolf',
      }],
    },
  });
}
