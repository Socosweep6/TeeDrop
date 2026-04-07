import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { sendSmsAlert, sendEmailAlert, matchesUserPreferences, isQuietHours } from '../../../../lib/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// POST /api/alerts/dispatch — dispatch alerts for a given set of new tee times
// Called fire-and-forget from /api/ingest, or directly from a cron job
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== (process.env.INGEST_SECRET || 'teedrop-ingest-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const newTeeTimes = body.teeTimes || [];

    if (newTeeTimes.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const allNewIds = newTeeTimes.map(tt => tt.id).filter(Boolean);

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

    const alreadySentSet = new Set(existingAlerts.map(a => `${a.userId}:${a.teeTimeId}:${a.method}`));
    const alertsToCreate = [];
    let alertsSent = 0;

    for (const user of usersWithAlerts) {
      if (!user.settings) continue;
      if (isQuietHours(user.settings)) continue;
      const freq = user.settings.alertFrequency || 'instant';
      if (freq !== 'instant') continue;

      const matching = newTeeTimes.filter(tt => matchesUserPreferences(tt, user.settings));
      if (matching.length === 0) continue;

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

    if (alertsToCreate.length > 0) {
      await prisma.alert.createMany({ data: alertsToCreate, skipDuplicates: true });
    }

    return NextResponse.json({ sent: alertsSent, dispatched: alertsToCreate.length });
  } catch (error) {
    console.error('Alert dispatch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
