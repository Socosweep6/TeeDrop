import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '../../../lib/prisma';
import { getBookingUrl } from '../../../lib/courses';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user and their settings
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { settings: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const settings = user.settings;

    // Build query filters based on user settings
    const where = {};

    // Filter by selected courses
    if (settings?.courses?.length > 0) {
      where.course = { in: settings.courses };
    }

    // Filter by selected specific dates OR date range
    if (settings?.selectedDates?.length > 0) {
      where.date = { in: settings.selectedDates };
    } else if (settings?.startDate || settings?.endDate) {
      where.date = {};
      if (settings.startDate) where.date.gte = settings.startDate;
      if (settings.endDate) where.date.lte = settings.endDate;
    } else {
      // Default: next 14 days
      const today = new Date().toISOString().split('T')[0];
      const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      where.date = { gte: today, lte: twoWeeks };
    }

    // Fetch from database
    let teeTimes = await prisma.teeTime.findMany({
      where,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      take: 100,
    });

    // Filter by time window in JS (since time is stored as string)
    if (settings?.startTime && settings?.endTime) {
      teeTimes = teeTimes.filter(tt => {
        const ttTime = convertTo24h(tt.time);
        if (!ttTime) return true;
        return ttTime >= settings.startTime && ttTime <= settings.endTime;
      });
    }

    // Filter by player count
    if (settings?.players) {
      teeTimes = teeTimes.filter(tt => tt.players >= settings.players);
    }

    // Format for frontend
    const formatted = teeTimes.map(tt => ({
      id: tt.id,
      course: tt.course,
      date: formatDate(tt.date),
      rawDate: tt.date,
      time: tt.time,
      players: tt.players,
      price: tt.price || 'N/A',
      holes: tt.holes || 18,
      bookingUrl: tt.bookingUrl || getBookingUrl(tt.course, tt.date),
      source: tt.source,
      scrapedAt: tt.scrapedAt,
      status: 'available',
    }));

    return NextResponse.json({ 
      teeTimes: formatted,
      lastScraped: teeTimes.length > 0 ? teeTimes[0].scrapedAt : null,
      total: formatted.length,
    });
  } catch (error) {
    console.error('Times fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch tee times' }, { status: 500 });
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { 
    weekday: 'short', month: 'short', day: 'numeric' 
  });
}

function convertTo24h(timeStr) {
  if (!timeStr) return null;
  if (!timeStr.includes('AM') && !timeStr.includes('PM')) return timeStr;
  
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  
  let [_, h, m, ampm] = match;
  h = parseInt(h);
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  
  return `${String(h).padStart(2, '0')}:${m}`;
}
