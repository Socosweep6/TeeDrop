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
    let newTeeTimes = []; // Truly new records, with their DB ids for alert dedup

    // Filter out malformed records up front
    const valid = teeTimes.filter(tt => tt.course && tt.date && tt.time);
    skipped = teeTimes.length - valid.length;

    // Group by (course, date) so we can bulk-query each group
    const groups = new Map();
    for (const tt of valid) {
      const key = `${tt.course}|${tt.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tt);
    }

    for (const [, group] of groups) {
      const { course, date } = group[0];

      try {
        // 1 query: get all existing records for this course+date
        const existing = await prisma.teeTime.findMany({
          where: { course, date },
          select: { id: true, time: true },
        });
        const existingByTime = new Map(existing.map(r => [r.time, r.id]));

        const toCreate = group.filter(tt => !existingByTime.has(tt.time));
        const toUpdateIds = existing.map(r => r.id);

        // 1 query: bulk insert new records
        if (toCreate.length > 0) {
          await prisma.teeTime.createMany({
            data: toCreate.map(tt => ({
              course: tt.course,
              date: tt.date,
              time: tt.time,
              players: tt.players || 4,
              price: tt.price || null,
              holes: tt.holes || 18,
              bookingUrl: tt.booking_url || tt.bookingUrl || getBookingUrl(tt.course, tt.date) || null,
              source: tt.source || 'scraper',
              scrapedAt: new Date(),
            })),
            skipDuplicates: true,
          });
        }

        // 1 query: refresh scrapedAt on existing records
        if (toUpdateIds.length > 0) {
          await prisma.teeTime.updateMany({
            where: { id: { in: toUpdateIds } },
            data: { scrapedAt: new Date() },
          });
        }

        inserted += group.length;

        // Fetch newly created records (need DB ids for alert dedup)
        if (toCreate.length > 0) {
          const created = await prisma.teeTime.findMany({
            where: { course, date, time: { in: toCreate.map(t => t.time) } },
          });
          newTeeTimes = newTeeTimes.concat(created.map(r => ({
            ...toCreate.find(t => t.time === r.time),
            id: r.id,
            bookingUrl: r.bookingUrl,
          })));
        }
      } catch (e) {
        console.error(`Ingest bulk error for ${course} ${date}:`, e.message);
        skipped += group.length;
      }
    }

    // Send alerts for NEW tee times only
    let alertsSent = 0;
    if (newTeeTimes.length > 0) {
      try {
        const usersWithAlerts = await prisma.user.findMany({
          where: {
            settings: {
              OR: [{ alertEmail: true }, { alertSms: true }],
            },
          },
          include: { settings: true },
        });

        for (const user of usersWithAlerts) {
          if (!user.settings) continue;
          if (isQuietHours(user.settings)) continue;

          // Bug 6: skip non-instant frequency users
          // hourly/daily users will get batched alerts via a separate cron job (TODO)
          const freq = user.settings.alertFrequency || 'instant';
          if (freq !== 'instant') continue;

          const matching = newTeeTimes.filter(tt =>
            matchesUserPreferences(tt, user.settings)
          );
          if (matching.length === 0) continue;

          const teeTimeIds = matching.map(tt => tt.id);

          // Email alert
          if (user.settings.alertEmail) {
            const email = user.settings.alertEmailAddress || user.email;
            if (email) {
              // Bug 3: dedup — skip tee times already alerted via email
              const alreadySent = await prisma.alert.findMany({
                where: { userId: user.id, teeTimeId: { in: teeTimeIds }, method: 'email' },
                select: { teeTimeId: true },
              });
              const sentIds = new Set(alreadySent.map(a => a.teeTimeId));
              const toAlert = matching.filter(tt => !sentIds.has(tt.id));

              if (toAlert.length > 0) {
                const sent = await sendEmailAlert(email, toAlert.slice(0, 10));
                if (sent) {
                  alertsSent++;
                  // Bug 2: save alert records
                  await prisma.alert.createMany({
                    data: toAlert.slice(0, 10).map(tt => ({
                      userId: user.id,
                      teeTimeId: tt.id,
                      method: 'email',
                    })),
                  });
                }
              }
            }
          }

          // SMS alert (premium+ only)
          if (user.settings.alertSms && user.phone && user.tier !== 'free') {
            // Bug 3: dedup — skip tee times already alerted via SMS
            const alreadySent = await prisma.alert.findMany({
              where: { userId: user.id, teeTimeId: { in: teeTimeIds }, method: 'sms' },
              select: { teeTimeId: true },
            });
            const sentIds = new Set(alreadySent.map(a => a.teeTimeId));
            const toAlert = matching.filter(tt => !sentIds.has(tt.id));

            if (toAlert.length > 0) {
              const sent = await sendSmsAlert(user.phone, toAlert.slice(0, 5));
              if (sent) {
                alertsSent++;
                // Bug 2: save alert records
                await prisma.alert.createMany({
                  data: toAlert.slice(0, 5).map(tt => ({
                    userId: user.id,
                    teeTimeId: tt.id,
                    method: 'sms',
                  })),
                });
              }
            }
          }
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
